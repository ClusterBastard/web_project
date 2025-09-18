// Конфигурация Supabase
const SUPABASE_URL = 'https://pukfphzdgcdnwjdtqrjr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2ZwaHpkZ2NkbndqZHRxcmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTM0NzksImV4cCI6MjA3MzY4OTQ3OX0.zKnWq9akgm8SBD2JJ0u_fjXU07ZEXbhLpTZzoSsQOck'

// Инициализация Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentVideos = [];
let currentVideoIndex = 0;
let userLikes = new Set();
let currentCommentsVideoId = null;

// Проверяем состояние аутентификации
async function checkAuth() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session?.user) {
            console.log('Найдена сессия:', session.user);
            currentUser = session.user;
            await loadUserLikes();
            showMainScreen();
            loadVideos();
        } else {
            console.log('Сессия не найдена');
            showLoginScreen();
        }
    } catch (error) {
        console.error('Ошибка проверки аутентификации:', error);
        showLoginScreen();
    }
}

// Загрузка лайков пользователя
async function loadUserLikes() {
    if (!currentUser) return;
    
    try {
        const { data: likes, error } = await supabase
            .from('likes')
            .select('video_id')
            .eq('user_id', currentUser.id);
        
        if (!error && likes) {
            userLikes = new Set(likes.map(like => like.video_id));
            console.log('Загружены лайки пользователя:', userLikes);
        }
    } catch (error) {
        console.error('Ошибка загрузки лайков:', error);
    }
}

// Регистрация
async function signup() {
    const email = document.getElementById('emailField').value;
    const password = document.getElementById('passwordField').value;
    const errorElement = document.getElementById('loginError');

    if (!email || !password) {
        errorElement.textContent = 'Заполните все поля';
        return;
    }

    try {
        errorElement.textContent = 'Регистрация...';
        
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (error) {
            console.error('Ошибка регистрации:', error);
            errorElement.textContent = 'Ошибка регистрации: ' + error.message;
        } else {
            console.log('Успешная регистрация:', data.user);
            errorElement.textContent = 'Регистрация успешна! Проверьте email.';
            
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

// Вход
async function login() {
    const email = document.getElementById('emailField').value;
    const password = document.getElementById('passwordField').value;
    const errorElement = document.getElementById('loginError');

    if (!email || !password) {
        errorElement.textContent = 'Заполните все поля';
        return;
    }

    try {
        errorElement.textContent = 'Вход...';
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error('Ошибка входа:', error);
            errorElement.textContent = 'Ошибка: ' + error.message;
        } else {
            console.log('Успешный вход:', data.user);
            currentUser = data.user;
            await loadUserLikes();
            showMainScreen();
            loadVideos();
        }
    } catch (error) {
        console.error('Неожиданная ошибка:', error);
        errorElement.textContent = 'Ошибка соединения';
    }
}

// Выход
async function logout() {
    try {
        await supabase.auth.signOut();
        currentUser = null;
        userLikes.clear();
        showLoginScreen();
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

// Загрузка видео
async function uploadVideo() {
    const file = document.getElementById('videoFile').files[0];
    const caption = document.getElementById('videoCaption').value;
    const statusElement = document.getElementById('uploadStatus');

    if (!file) {
        statusElement.textContent = 'Выберите видеофайл!';
        return;
    }

    try {
        statusElement.textContent = 'Загрузка...';

        const fileExt = file.name.split('.').pop();
        const fileName = `videos/${currentUser.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(fileName, file);

        if (uploadError) {
            console.error('Ошибка загрузки в storage:', uploadError);
            throw uploadError;
        }

        const { data: urlData } = supabase.storage
            .from('videos')
            .getPublicUrl(fileName);

        const { data: dbData, error: dbError } = await supabase
            .from('videos')
            .insert([{
                owner_id: currentUser.id,
                caption: caption,
                video_url: urlData.publicUrl,
                file_path: fileName,
                likes_count: 0
            }])
            .select();

        if (dbError) {
            console.error('Ошибка сохранения в базу:', dbError);
            throw dbError;
        }

        statusElement.textContent = '✅ Видео загружено успешно!';
        setTimeout(() => {
            closeUploadForm();
            loadVideos();
        }, 1500);

    } catch (error) {
        console.error('Ошибка загрузки:', error);
        statusElement.textContent = 'Ошибка: ' + error.message;
    }
}

// Загрузка и отображение видео
async function loadVideos() {
    const videoContainer = document.getElementById('videoContainer');
    videoContainer.innerHTML = '<p>Загрузка...</p>';

    try {
        const { data: videos, error } = await supabase
            .from('videos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Ошибка загрузки видео:', error);
            throw error;
        }

        currentVideos = videos;
        currentVideoIndex = 0;
        videoContainer.innerHTML = '';

        if (videos.length === 0) {
            videoContainer.innerHTML = '<p>Пока нет видео. Будьте первым!</p>';
            return;
        }

        // Загружаем количество лайков и комментариев для каждого видео
        const videoIds = videos.map(v => v.id);
        
        const { data: likesData } = await supabase
            .from('likes')
            .select('video_id, count')
            .in('video_id', videoIds);
            
        const { data: commentsData } = await supabase
            .from('comments')
            .select('video_id, count')
            .in('video_id', videoIds);

        videos.forEach((video, index) => {
            const videoItem = document.createElement('div');
            videoItem.className = 'video-item';
            videoItem.dataset.index = index;
            
            if (index === 0) videoItem.classList.add('active');
            
            const likesCount = likesData?.filter(like => like.video_id === video.id).length || 0;
            const commentsCount = commentsData?.filter(comment => comment.video_id === video.id).length || 0;
            const isLiked = userLikes.has(video.id);

            videoItem.innerHTML = `
                <div class="video-card">
                    <video controls playsinline>
                        <source src="${video.video_url}" type="video/mp4">
                        Ваш браузер не поддерживает видео.
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
            `;
            videoContainer.appendChild(videoItem);
        });

        initSwipeEvents();

    } catch (error) {
        console.error('Ошибка загрузки видео:', error);
        videoContainer.innerHTML = '<p>Ошибка загрузки ленты.</p>';
    }
}

// Функция лайка
async function toggleLike(videoId, currentLikes, buttonElement) {
    if (!currentUser) {
        alert('Войдите чтобы ставить лайки');
        return;
    }

    try {
        const isLiked = userLikes.has(videoId);

        if (isLiked) {
            // Удаляем лайк
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('video_id', videoId)
                .eq('user_id', currentUser.id);

            if (!error) {
                userLikes.delete(videoId);
                buttonElement.classList.remove('liked');
                const newLikes = currentLikes - 1;
                buttonElement.querySelector('.likes-count').textContent = newLikes;
                
                // Обновляем счетчик в базе
                await supabase
                    .from('videos')
                    .update({ likes_count: newLikes })
                    .eq('id', videoId);
            }
        } else {
            // Добавляем лайк
            const { error } = await supabase
                .from('likes')
                .insert([{
                    video_id: videoId,
                    user_id: currentUser.id,
                    created_at: new Date().toISOString()
                }]);

            if (!error) {
                userLikes.add(videoId);
                buttonElement.classList.add('liked');
                const newLikes = currentLikes + 1;
                buttonElement.querySelector('.likes-count').textContent = newLikes;
                
                // Обновляем счетчик в базе
                await supabase
                    .from('videos')
                    .update({ likes_count: newLikes })
                    .eq('id', videoId);
            }
        }
    } catch (error) {
        console.error('Ошибка лайка:', error);
        alert('Ошибка при установке лайка');
    }
}

// Комментарии
async function showComments(videoId) {
    currentCommentsVideoId = videoId;
    const modal = document.getElementById('commentsModal');
    const commentsList = document.getElementById('commentsList');
    
    commentsList.innerHTML = '<p>Загрузка комментариев...</p>';
    modal.classList.remove('hidden');
    
    await loadComments(videoId);
}

async function loadComments(videoId) {
    const commentsList = document.getElementById('commentsList');
    
    try {
        const { data: comments, error } = await supabase
            .from('comments')
            .select(`
                *,
                profiles:user_id (username)
            `)
            .eq('video_id', videoId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        commentsList.innerHTML = '';

        if (comments.length === 0) {
            commentsList.innerHTML = '<p>Пока нет комментариев</p>';
            return;
        }

        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            
            const time = new Date(comment.created_at).toLocaleString('ru-RU');
            const username = comment.profiles?.username || 'Аноним';
            
            commentElement.innerHTML = `
                <div class="comment-author">${username}:</div>
                <div class="comment-text">${comment.text}</div>
                <div class="comment-time">${time}</div>
            `;
            commentsList.appendChild(commentElement);
        });

    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
        commentsList.innerHTML = '<p>Ошибка загрузки комментариев</p>';
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
        
        // Обновляем ленту чтобы обновить счетчик комментариев
        loadVideos();

    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        alert('Ошибка при добавлении комментария');
    }
}

function closeCommentsModal() {
    document.getElementById('commentsModal').classList.add('hidden');
    currentCommentsVideoId = null;
}

// Навигация по видео
function showVideo(index) {
    if (index < 0 || index >= currentVideos.length) return;
    
    // Скрываем текущее видео
    const currentVideo = document.querySelector('.video-item.active');
    if (currentVideo) {
        const video = currentVideo.querySelector('video');
        if (video) {
            video.pause();
            video.currentTime = 0;
        }
        currentVideo.classList.remove('active');
    }
    
    // Показываем новое видео
    currentVideoIndex = index;
    const newVideo = document.querySelector(`.video-item[data-index="${index}"]`);
    if (newVideo) {
        newVideo.classList.add('active');
        const video = newVideo.querySelector('video');
        if (video) {
            video.play().catch(e => console.log('Auto-play prevented:', e));
        }
    }
}

function nextVideo() {
    showVideo(currentVideoIndex + 1);
}

function prevVideo() {
    showVideo(currentVideoIndex - 1);
}

// Инициализация свайпов
function initSwipeEvents() {
    const videoContainer = document.getElementById('videoContainer');
    let startY = 0;
    let isSwiping = false;

    videoContainer.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isSwiping = true;
    });

    videoContainer.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        e.preventDefault();
    });

    videoContainer.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        
        const endY = e.changedTouches[0].clientY;
        const diffY = startY - endY;
        
        if (Math.abs(diffY) > 50) {
            if (diffY > 0) {
                nextVideo();
            } else {
                prevVideo();
            }
        }
        
        isSwiping = false;
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            nextVideo();
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            prevVideo();
            e.preventDefault();
        }
    });
}

// Переключение между экранами
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainScreen').classList.add('hidden');
}

function showMainScreen() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
}

function showUploadForm() {
    document.getElementById('uploadForm').classList.remove('hidden');
}

function closeUploadForm() {
    document.getElementById('uploadForm').classList.add('hidden');
    document.getElementById('videoFile').value = '';
    document.getElementById('videoCaption').value = '';
    document.getElementById('uploadStatus').textContent = '';
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('Приложение загружено');
    checkAuth();
    
    // Слушаем изменения аутентификации
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);
        if (event === 'SIGNED_IN' && session?.user) {
            currentUser = session.user;
            await loadUserLikes();
            showMainScreen();
            loadVideos();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            userLikes.clear();
            showLoginScreen();
        }
    });
});

// Делаем функции глобальными
window.login = login;
window.signup = signup;
window.logout = logout;
window.showUploadForm = showUploadForm;
window.closeUploadForm = closeUploadForm;
window.toggleLike = toggleLike;
window.showComments = showComments;
window.addComment = addComment;
window.closeCommentsModal = closeCommentsModal;
window.prevVideo = prevVideo;
window.nextVideo = nextVideo;


