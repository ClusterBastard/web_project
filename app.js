// Конфигурация Supabase 
const SUPABASE_URL = 'https://pukfphzdgcdnwjdtqrjr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2ZwaHpkZ2NkbndqZHRxcmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTM0NzksImV4cCI6MjA3MzY4OTQ3OX0.zKnWq9akgm8SBD2JJ0u_fjXU07ZEXbhLpTZzoSsQOck'

// Инициализация Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentUser = null
let currentVideos = []
let currentVideoIndex = 0
let userLikes = new Set()
let currentCommentsVideoId = null

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
    
    try {
        const { data: likes, error } = await supabase
            .from('likes')
            .select('video_id')
            .eq('user_id', currentUser.id)
        
        if (!error && likes) {
            userLikes = new Set(likes.map(like => like.video_id))
        }
    } catch (error) {
        console.error('Ошибка загрузки лайков:', error)
    }
}

// Регистрация
async function signup() {
    const email = document.getElementById('emailField').value
    const password = document.getElementById('passwordField').value
    const errorElement = document.getElementById('loginError')

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    })

    if (error) {
        errorElement.textContent = 'Ошибка регистрации: ' + error.message
    } else {
        errorElement.textContent = 'Проверьте email для подтверждения!'
    }
}

// Вход
async function login() {
    const email = document.getElementById('emailField').value
    const password = document.getElementById('passwordField').value
    const errorElement = document.getElementById('loginError')

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    })

    if (error) {
        errorElement.textContent = 'Ошибка входа: ' + error.message
    } else {
        currentUser = data.user
        await loadUserLikes()
        showMainScreen()
        loadVideos()
    }
}

// Выход
async function logout() {
    await supabase.auth.signOut()
    currentUser = null
    userLikes.clear()
    showLoginScreen()
}

// Функция для проверки ориентации видео
function checkVideoOrientation(videoElement) {
    return new Promise((resolve) => {
        if (videoElement.videoWidth && videoElement.videoHeight) {
            const isPortrait = videoElement.videoHeight > videoElement.videoWidth
            resolve(isPortrait ? 'portrait' : 'landscape')
            return
        }

        videoElement.addEventListener('loadedmetadata', function() {
            const isPortrait = videoElement.videoHeight > videoElement.videoWidth
            resolve(isPortrait ? 'portrait' : 'landscape')
        })

        videoElement.addEventListener('error', function() {
            resolve('landscape')
        })
    })
}

// Функция для调整 размера видео
function adjustVideoSize(videoElement) {
    const container = videoElement.parentElement
    if (!container) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    const isPortrait = videoElement.classList.contains('portrait')
    
    if (isPortrait) {
        videoElement.style.height = Math.min(containerHeight * 0.7, window.innerHeight * 0.7) + 'px'
        videoElement.style.width = 'auto'
    } else {
        videoElement.style.width = Math.min(containerWidth * 0.9, window.innerWidth * 0.9) + 'px'
        videoElement.style.height = 'auto'
    }
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
                likes_count: 0,
                comments_count: 0
            }])

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
// Загрузка и отображение видео (без колонки comments_count)
async function loadVideos() {
    const videoContainer = document.getElementById('videoContainer');
    videoContainer.innerHTML = '<p>Загрузка...</p>';

    try {
        // Сначала загружаем видео
        const { data: videos, error: videosError } = await supabase
            .from('videos')
            .select(`
                *,
                profiles:owner_id (username),
                likes_count:likes(count)
            `)
            .order('created_at', { ascending: false });

        if (videosError) throw videosError;

        // Затем загружаем количество комментариев для каждого видео
        const videoIds = videos.map(v => v.id);
        const { data: commentsCounts, error: commentsError } = await supabase
            .from('comments')
            .select('video_id, count')
            .in('video_id', videoIds);

        if (commentsError) console.error('Ошибка загрузки комментариев:', commentsError);

        // Создаем карту для быстрого доступа к количеству комментариев
        const commentsMap = {};
        if (commentsCounts) {
            commentsCounts.forEach(item => {
                commentsMap[item.video_id] = item.count;
            });
        }

        currentVideos = videos;
        currentVideoIndex = 0;
        videoContainer.innerHTML = '';

        if (videos.length === 0) {
            videoContainer.innerHTML = '<p>Пока нет видео. Будьте первым!</p>';
            return;
        }

        // Создаем видео элементы
        for (const [index, video] of videos.entries()) {
            const videoItem = document.createElement('div');
            videoItem.className = 'video-item';
            videoItem.dataset.index = index;
            
            if (index === 0) videoItem.classList.add('active');
            
            const likesCount = video.likes_count?.[0]?.count || 0;
            const commentsCount = commentsMap[video.id] || 0;
            const isLiked = userLikes.has(video.id);
            const authorName = video.profiles?.username || video.owner_id;

            videoItem.innerHTML = `
                <div class="video-card">
                    <video controls playsinline>
                        <source src="${video.video_url}" type="video/mp4">
                        Ваш браузер не поддерживает видео.
                    </video>
                    <div class="video-info">
                        <p class="video-caption"><strong>${authorName}:</strong> ${video.caption || ''}</p>
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
            `;
            
            videoContainer.appendChild(videoItem);
        }

        // Настраиваем размеры видео
        setTimeout(() => {
            setupVideoSizing();
            initSwipeEvents();
        }, 100);

    } catch (error) {
        console.error('Ошибка загрузки видео:', error);
        videoContainer.innerHTML = '<p>Ошибка загрузки ленты.</p>';
    }
}

// Функция для настройки размеров видео
function setupVideoSizing() {
    const videos = document.querySelectorAll('.video-item video')
    
    videos.forEach(video => {
        checkVideoOrientation(video).then(orientation => {
            video.classList.add(orientation)
            adjustVideoSize(video)
        })

        video.addEventListener('loadedmetadata', () => {
            checkVideoOrientation(video).then(orientation => {
                video.classList.add(orientation)
                adjustVideoSize(video)
            })
        })

        const resizeHandler = () => adjustVideoSize(video)
        window.addEventListener('resize', resizeHandler)
        
        video._resizeHandler = resizeHandler
    })
}

// Функция лайка
async function toggleLike(videoId, currentLikes, buttonElement) {
    if (!currentUser) {
        alert('Войдите чтобы ставить лайки')
        return
    }

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
                    user_id: currentUser.id,
                    created_at: new Date().toISOString()
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
        alert('Ошибка при установке лайка')
    }
}

// Комментарии
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
            const username = comment.profiles?.username || 'Аноним'
            const canDelete = currentUser && (currentUser.id === comment.user_id || currentUser.id === comment.video.owner_id)

            commentElement.innerHTML = `
                <div class="comment-author">${username}:</div>
                <div class="comment-text">${comment.text}</div>
                <div class="comment-time">${time}</div>
                ${canDelete ? `
                    <div class="comment-actions">
                        <button class="delete-comment" onclick="deleteComment(${comment.id})">
                            удалить
                        </button>
                    </div>
                ` : ''}
            `
            commentsList.appendChild(commentElement)
        })

    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error)
        commentsList.innerHTML = '<p>Ошибка загрузки комментариев</p>'
    }
}

async function addComment() {
    if (!currentCommentsVideoId || !currentUser) {
        alert('Войдите чтобы комментировать');
        return;
    }

    const commentText = document.getElementById('commentText').value.trim();
    if (!commentText) return;

    try {
        const { error } = await supabase
            .from('comments')
            .insert([{
                video_id: currentCommentsVideoId,
                user_id: currentUser.id,
                text: commentText,
                created_at: new Date().toISOString()
            }]);

        if (error) throw error;

        document.getElementById('commentText').value = '';
        await loadComments(currentCommentsVideoId);
        
        // Перезагружаем видео чтобы обновить счетчик
        loadVideos();

    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        alert('Ошибка при добавлении комментария');
    }
}

async function deleteComment(commentId) {
    if (!currentUser) return;

    try {
        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;

        await loadComments(currentCommentsVideoId);
        loadVideos(); // Обновляем ленту

    } catch (error) {
        console.error('Ошибка удаления комментария:', error);
        alert('Ошибка при удалении комментария');
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
            adjustVideoSize(video)
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

// Обработчик изменения размера окна
function initResizeHandler() {
    let resizeTimeout
    
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout)
        resizeTimeout = setTimeout(() => {
            const activeVideo = document.querySelector('.video-item.active video')
            if (activeVideo) {
                adjustVideoSize(activeVideo)
            }
        }, 250)
    })
}

// Переключение между экранами
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden')
    document.getElementById('mainScreen').classList.add('hidden')
}

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

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('Приложение загружено')
    checkAuth()
    initResizeHandler()
    
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

// Делаем функции глобальными
window.login = login
window.signup = signup
window.logout = logout
window.showUploadForm = showUploadForm
window.closeUploadForm = closeUploadForm
window.toggleLike = toggleLike
window.showComments = showComments
window.addComment = addComment
window.deleteComment = deleteComment
window.closeCommentsModal = closeCommentsModal
window.prevVideo = prevVideo
window.nextVideo = nextVideo

