// Конфигурация Supabase - ЗАМЕНИТЕ НА СВОИ ДАННЫЕ!
const SUPABASE_URL = 'https://pukfphzdgcdnwjdtqrjr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1a2ZwaHpkZ2NkbndqZHRxcmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMTM0NzksImV4cCI6MjA3MzY4OTQ3OX0.zKnWq9akgm8SBD2JJ0u_fjXU07ZEXbhLpTZzoSsQOck'

// Инициализация Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentUser = null
let currentVideos = []
let currentVideoIndex = 0

// Проверяем состояние аутентификации
async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (session?.user) {
        currentUser = session.user
        showMainScreen()
        loadVideos()
    } else {
        showLoginScreen()
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
        showMainScreen()
        loadVideos()
    }
}

// Выход
async function logout() {
    await supabase.auth.signOut()
    currentUser = null
    showLoginScreen()
}
// функция для проверки ориенатции видео
function checkVideoOrientation(videoElement) {
    return new Promise((resolve) => {
        if (videoElement.videoWidth && videoElement.videoHeight) {
            const isPortrait = videoElement.videoHeight > videoElement.videoWidth;
            resolve(isPortrait ? 'portrait' : 'landscape');
            return;
        }

        videoElement.addEventListener('loadedmetadata', function() {
            const isPortrait = videoElement.videoHeight > videoElement.videoWidth;
            resolve(isPortrait ? 'portrait' : 'landscape');
        });

        videoElement.addEventListener('error', function() {
            resolve('landscape');
        });
    });
}

// Функция для调整 размера видео
function adjustVideoSize(videoElement) {
    const container = videoElement.parentElement;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Определяем ориентацию
    const isPortrait = videoElement.classList.contains('portrait');
    
    if (isPortrait) {
        // Для вертикальных видео - ограничиваем по высоте
        videoElement.style.height = Math.min(containerHeight * 0.85, window.innerHeight * 0.85) + 'px';
        videoElement.style.width = 'auto';
    } else {
        // Для горизонтальных видео - ограничиваем по ширине
        videoElement.style.width = Math.min(containerWidth * 0.95, window.innerWidth * 0.95) + 'px';
        videoElement.style.height = 'auto';
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

        // Создаем уникальное имя файла
        const fileExt = file.name.split('.').pop()
        const fileName = `videos/${currentUser.id}/${Date.now()}.${fileExt}`

        // Загружаем файл в Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('videos')
            .upload(fileName, file)

        if (uploadError) throw uploadError

        // Получаем публичную ссылку
        const { data: urlData } = supabase.storage
            .from('videos')
            .getPublicUrl(fileName)

        // Сохраняем информацию о видео в базу данных
        const { data: dbData, error: dbError } = await supabase
            .from('videos')
            .insert([
                {
                    owner_id: currentUser.id,
                    caption: caption,
                    video_url: urlData.publicUrl,
                    file_path: fileName
                }
            ])

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

        // Загружаем количество лайков и комментариев
        const videoIds = videos.map(v => v.id);
        
        const { data: likesData } = await supabase
            .from('likes')
            .select('video_id')
            .in('video_id', videoIds);
            
        const { data: commentsData } = await supabase
            .from('comments')
            .select('video_id')
            .in('video_id', videoIds);
        // Создаем видео элементы
        for (const [index, video] of videos.entries()) {
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
        }
        // После создания всех видео, настраиваем их размер
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
    const videos = document.querySelectorAll('.video-item video');
    
    videos.forEach(video => {
        // Определяем ориентацию и добавляем класс
        checkVideoOrientation(video).then(orientation => {
            video.classList.add(orientation);
            adjustVideoSize(video);
        });

        // Обработчик изменения размера видео
        video.addEventListener('loadedmetadata', () => {
            checkVideoOrientation(video).then(orientation => {
                video.classList.add(orientation);
                adjustVideoSize(video);
            });
        });

        // Обработчик изменения размера окна
        const resizeHandler = () => adjustVideoSize(video);
        window.addEventListener('resize', resizeHandler);
        
        // Сохраняем обработчик для последующей очистки
        video._resizeHandler = resizeHandler;
    });
}

        // Создаем контейнер для видео с свайпом
        videos.forEach((video, index) => {
            const videoItem = document.createElement('div')
            videoItem.className = 'video-item'
            videoItem.dataset.index = index
            
            if (index === 0) {
                videoItem.classList.add('active')
            }
            
            videoItem.innerHTML = `
                <div class="video-card">
                    <video controls playsinline>
                        <source src="${video.video_url}" type="video/mp4">
                        Ваш браузер не поддерживает видео.
                    </video>
                    <div class="video-info">
                        <p class="video-caption">${video.caption || ''}</p>
                        <div class="video-actions">
                            <button class="action-btn" onclick="toggleLike('${video.id}')">
                                <span class="material-icons">favorite</span>
                                <span>${video.likes_count || 0}</span>
                            </button>
                            <button class="action-btn" onclick="showComments('${video.id}')">
                                <span class="material-icons">chat_bubble</span>
                            </button>
                        </div>
                    </div>
                </div>
            `
            videoContainer.appendChild(videoItem)
        })

        // Инициализируем свайпы
        initSwipeEvents()

    } catch (error) {
        console.error('Ошибка загрузки видео:', error)
        videoContainer.innerHTML = '<p>Ошибка загрузки ленты.</p>'
    }
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
            // Настраиваем размер перед воспроизведением
            adjustVideoSize(video);
            video.play().catch(e => console.log('Auto-play prevented:', e));
        }
    }
}

// Добавляем обработчик изменения размера окна
function initResizeHandler() {
    let resizeTimeout;
    
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const activeVideo = document.querySelector('.video-item.active video');
            if (activeVideo) {
                adjustVideoSize(activeVideo);
            }
        }, 250);
    });
}

// Инициализируем обработчик изменения размера при загрузке
document.addEventListener('DOMContentLoaded', () => {
    console.log('Приложение загружено');
    checkAuth();
    initResizeHandler();
    
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

// Очистка обработчиков при размонтировании
function cleanupVideoListeners() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        if (video._resizeHandler) {
            window.removeEventListener('resize', video._resizeHandler);
        }
    });
}

// Вызываем очистку при выходе
async function logout() {
    try {
        cleanupVideoListeners();
        await supabase.auth.signOut();
        currentUser = null;
        userLikes.clear();
        showLoginScreen();
    } catch (error) {
        console.error('Ошибка выхода:', error);
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
        
        if (Math.abs(diffY) > 50) { // Минимальное расстояние свайпа
            if (diffY > 0) {
                nextVideo() // Свайп вверх
            } else {
                prevVideo() // Свайп вниз
            }
        }
        
        isSwiping = false
    })

    // Добавляем обработчики для клавиатуры
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

// Функция лайка
async function toggleLike(videoId) {
    // Реализуйте логику лайков по необходимости
    console.log('Like video:', videoId)
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

// Модальное окно загрузки
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
    checkAuth()
    
    // Слушаем изменения аутентификации
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
            currentUser = session.user
            showMainScreen()
            loadVideos()
        } else if (event === 'SIGNED_OUT') {
            currentUser = null
            showLoginScreen()
        }
    })
})


