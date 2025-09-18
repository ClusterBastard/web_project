const SUPABASE_URL = 'https://pukfphzdgcdnwjdtqrjr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2ZwaHpkZ2NkbndqZHRxcmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTM0NzksImV4cCI6MjA3MzY4OTQ3OX0.zKnWq9akgm8SBD2JJ0u_fjXU07ZEXbhLpTZzoSsQOck'

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentUser = null
let currentVideos = []
let currentVideoIndex = 0
let currentVideoId = null
let userLikes = new Set()

// Проверяем состояние аутентификации
async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (session?.user) {
        currentUser = session.user
        await loadUserLikes()
        showMainScreen()
        loadVideos()
    } else {
        showLoginScreen()
    }
}

// Загрузка лайков пользователя
async function loadUserLikes() {
    if (!currentUser) return
    
    const { data: likes, error } = await supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', currentUser.id)
    
    if (!error && likes) {
        userLikes = new Set(likes.map(like => like.video_id))
    }
}
// Вход
async function login() {
    const email = document.getElementById('emailField').value;
    const password = document.getElementById('passwordField').value;
    const errorElement = document.getElementById('loginError');

    // Простая валидация
    if (!email || !password) {
        errorElement.textContent = 'Заполните все поля';
        return;
    }

    try {
        console.log('Попытка входа:', email);
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error('Ошибка входа:', error);
            errorElement.textContent = 'Ошибка: ' + error.message;
            
            // Попробуем зарегистрировать, если пользователь не существует
            if (error.message.includes('Invalid login credentials')) {
                errorElement.textContent += '. Пробуем зарегистрировать...';
                await signup();
            }
        } else {
            console.log('Успешный вход:', data.user);
            currentUser = data.user;
            showMainScreen();
            loadVideos();
        }
    } catch (error) {
        console.error('Неожиданная ошибка:', error);
        errorElement.textContent = 'Ошибка соединения';
    }
}

// Упрощенная функция регистрации
async function signup() {
    const email = document.getElementById('emailField').value;
    const password = document.getElementById('passwordField').value;
    const errorElement = document.getElementById('loginError');

    if (!email || !password) {
        errorElement.textContent = 'Заполните все поля';
        return;
    }

    try {
        console.log('Попытка регистрации:', email);
        
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (error) {
            console.error('Ошибка регистрации:', error);
            errorElement.textContent = 'Ошибка регистрации: ' + error.message;
        } else {
            console.log('Успешная регистрация:', data.user);
            errorElement.textContent = 'Регистрация успешна! Проверьте email для подтверждения.';
            
            // Автоматически входим после регистрации
            if (data.user) {
                currentUser = data.user;
                showMainScreen();
                loadVideos();
            }
        }
    } catch (error) {
        console.error('Неожиданная ошибка:', error);
        errorElement.textContent = 'Ошибка соединения';
    }
}

// Выход
async function logout() {
    await supabase.auth.signOut()
    currentUser = null
    userLikes.clear()
    showLoginScreen()
}

// Загрузка видео
async function uploadVideo() {
    const file = document.getElementById('videoFile').files[0]
    const caption = document.getElementById('videoCaption').value
    const statusElement = document.getElementById('uploadStatus')

    if (!file) {
        statusElement.textContent = 'Выберите видеофайл!'
        return
    }

    try {
        statusElement.textContent = 'Загрузка...'

        const fileExt = file.name.split('.').pop()
        const fileName = `videos/${currentUser.id}/${Date.now()}.${fileExt}`

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(fileName, file)

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
            .from('videos')
            .getPublicUrl(fileName)

        const { data: dbData, error: dbError } = await supabase
            .from('videos')
            .insert([{
                owner_id: currentUser.id,
                caption: caption,
                video_url: urlData.publicUrl,
                file_path: fileName,
                likes_count: 0
            }])
            .select()

        if (dbError) throw dbError

        statusElement.textContent = '✅ Видео загружено успешно!'
        setTimeout(() => {
            closeUploadForm()
            loadVideos()
        }, 1500)

    } catch (error) {
        console.error('Ошибка загрузки:', error)
        statusElement.textContent = 'Ошибка: ' + error.message
    }
}

// Загрузка и отображение видео
async function loadVideos() {
    const videoContainer = document.getElementById('videoContainer')
    videoContainer.innerHTML = '<p>Загрузка...</p>'

    try {
        const { data: videos, error } = await supabase
            .from('videos')
            .select(`
                *,
                likes_count:likes(count),
                comments_count:comments(count)
            `)
            .order('created_at', { ascending: false })

        if (error) throw error

        currentVideos = videos
        currentVideoIndex = 0

        videoContainer.innerHTML = ''

        if (videos.length === 0) {
            videoContainer.innerHTML = '<p>Пока нет видео. Будьте первым!</p>'
            return
        }

        videos.forEach((video, index) => {
            const videoItem = document.createElement('div')
            videoItem.className = 'video-item'
            videoItem.dataset.index = index
            
            if (index === 0) videoItem.classList.add('active')
            
            const isLiked = userLikes.has(video.id)
            const likesCount = video.likes_count?.[0]?.count || 0
            const commentsCount = video.comments_count?.[0]?.count || 0

            videoItem.innerHTML = `
                <div class="video-card">
                    <video controls playsinline>
                        <source src="${video.video_url}" type="video/mp4">
                    </video>
                    <div class="video-info">
                        <p class="video-caption">${video.caption || ''}</p>
                        <div class="video-actions">
                            <button class="action-btn ${isLiked ? 'liked' : ''}" 
                                    onclick="toggleLike(${video.id}, ${likesCount}, this)">
                                <span class="material-icons">favorite</span>
                                <span class="likes-count">${likesCount}</span>
                            </button>
                            <button class="action-btn" onclick="showComments(${video.id})">
                                <span class="material-icons">chat_bubble</span>
                                <span>${commentsCount}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `
            videoContainer.appendChild(videoItem)
        })

        initSwipeEvents()

    } catch (error) {
        console.error('Ошибка загрузки видео:', error)
        videoContainer.innerHTML = '<p>Ошибка загрузки ленты.</p>'
    }
}

// Функция лайка
async function toggleLike(videoId, currentLikes, buttonElement) {
    if (!currentUser) return

    try {
        const isLiked = userLikes.has(videoId)

        if (isLiked) {
            // Удаляем лайк
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('video_id', videoId)
                .eq('user_id', currentUser.id)

            if (!error) {
                userLikes.delete(videoId)
                buttonElement.classList.remove('liked')
                const newLikes = currentLikes - 1
                buttonElement.querySelector('.likes-count').textContent = newLikes
                
                // Обновляем счетчик в базе
                await supabase
                    .from('videos')
                    .update({ likes_count: newLikes })
                    .eq('id', videoId)
            }
        } else {
            // Добавляем лайк
            const { error } = await supabase
                .from('likes')
                .insert([{
                    video_id: videoId,
                    user_id: currentUser.id
                }])

            if (!error) {
                userLikes.add(videoId)
                buttonElement.classList.add('liked')
                const newLikes = currentLikes + 1
                buttonElement.querySelector('.likes-count').textContent = newLikes
                
                // Обновляем счетчик в базе
                await supabase
                    .from('videos')
                    .update({ likes_count: newLikes })
                    .eq('id', videoId)
            }
        }
    } catch (error) {
        console.error('Ошибка лайка:', error)
    }
}

// Комментарии
let currentCommentsVideoId = null

async function showComments(videoId) {
    currentCommentsVideoId = videoId
    const modal = document.getElementById('commentsModal')
    const commentsList = document.getElementById('commentsList')
    
    commentsList.innerHTML = '<p>Загрузка комментариев...</p>'
    modal.classList.remove('hidden')
    
    await loadComments(videoId)
}

async function loadComments(videoId) {
    const commentsList = document.getElementById('commentsList')
    
    try {
        const { data: comments, error } = await supabase
            .from('comments')
            .select(`
                *,
                profiles:user_id (username)
            `)
            .eq('video_id', videoId)
            .order('created_at', { ascending: true })

        if (error) throw error

        commentsList.innerHTML = ''

        if (comments.length === 0) {
            commentsList.innerHTML = '<p>Пока нет комментариев</p>'
            return
        }

        comments.forEach(comment => {
            const commentElement = document.createElement('div')
            commentElement.className = 'comment'
            
            const time = new Date(comment.created_at).toLocaleString('ru-RU')
            
            commentElement.innerHTML = `
                <div class="comment-author">${comment.profiles.username}:</div>
                <div class="comment-text">${comment.text}</div>
                <div class="comment-time">${time}</div>
            `
            commentsList.appendChild(commentElement)
        })

    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error)
        commentsList.innerHTML = '<p>Ошибка загрузки комментариев</p>'
    }
}

async function addComment() {
    if (!currentCommentsVideoId || !currentUser) return

    const commentText = document.getElementById('commentText').value.trim()
    if (!commentText) return

    try {
        const { error } = await supabase
            .from('comments')
            .insert([{
                video_id: currentCommentsVideoId,
                user_id: currentUser.id,
                text: commentText
            }])

        if (error) throw error

        document.getElementById('commentText').value = ''
        await loadComments(currentCommentsVideoId)
        
        // Обновляем счетчик комментариев в ленте
        loadVideos()

    } catch (error) {
        console.error('Ошибка добавления комментария:', error)
        alert('Ошибка при добавлении комментария')
    }
}

function closeCommentsModal() {
    document.getElementById('commentsModal').classList.add('hidden')
    currentCommentsVideoId = null
}

// Навигация по видео
function showVideo(index) {
    if (index < 0 || index >= currentVideos.length) return
    
    const currentVideo = document.querySelector('.video-item.active')
    if (currentVideo) {
        const video = currentVideo.querySelector('video')
        if (video) {
            video.pause()
            video.currentTime = 0
        }
        currentVideo.classList.remove('active')
    }
    
    currentVideoIndex = index
    const newVideo = document.querySelector(`.video-item[data-index="${index}"]`)
    if (newVideo) {
        newVideo.classList.add('active')
        const video = newVideo.querySelector('video')
        if (video) {
            video.play().catch(e => console.log('Auto-play prevented:', e))
        }
    }
}

function nextVideo() {
    showVideo(currentVideoIndex + 1)
}

function prevVideo() {
    showVideo(currentVideoIndex - 1)
}

// Инициализация свайпов
function initSwipeEvents() {
    const videoContainer = document.getElementById('videoContainer')
    let startY = 0
    let isSwiping = false

    videoContainer.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY
        isSwiping = true
    })

    videoContainer.addEventListener('touchmove', (e) => {
        if (!isSwiping) return
        e.preventDefault()
    })

    videoContainer.addEventListener('touchend', (e) => {
        if (!isSwiping) return
        
        const endY = e.changedTouches[0].clientY
        const diffY = startY - endY
        
        if (Math.abs(diffY) > 50) {
            if (diffY > 0) {
                nextVideo()
            } else {
                prevVideo()
            }
        }
        
        isSwiping = false
    })

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            nextVideo()
            e.preventDefault()
        } else if (e.key === 'ArrowUp') {
            prevVideo()
            e.preventDefault()
        }
    })
}

// Переключение между экранами
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden')
    document.getElementById('mainScreen').classList.add

function showMainScreen() {
    document.getElementById('loginScreen').classList.add('hidden')
    document.getElementById('mainScreen').classList.remove('hidden')
}

function showUploadForm() {
    document.getElementById('uploadForm').classList.remove('hidden')
}

function closeUploadForm() {
    document.getElementById('uploadForm').classList.add('hidden')
    document.getElementById('videoFile').value = ''
    document.getElementById('videoCaption').value = ''
    document.getElementById('uploadStatus').textContent = ''
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkAuth()
    
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
            currentUser = session.user
            await loadUserLikes()
            showMainScreen()
            loadVideos()
        } else if (event === 'SIGNED_OUT') {
            currentUser = null
            userLikes.clear()
            showLoginScreen()
        }
    })
})
