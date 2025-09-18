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
    const videoContainer = document.getElementById('videoContainer')
    videoContainer.innerHTML = '<p>Загрузка...</p>'

    try {
        // Получаем видео из базы данных
        const { data: videos, error } = await supabase
            .from('videos')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        currentVideos = videos
        currentVideoIndex = 0

        videoContainer.innerHTML = ''

        if (videos.length === 0) {
            videoContainer.innerHTML = '<p>Пока нет видео. Будьте первым!</p>'
            return
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
    if (index < 0 || index >= currentVideos.length) return
    
    // Скрываем текущее видео
    const currentVideo = document.querySelector('.video-item.active')
    if (currentVideo) {
        const video = currentVideo.querySelector('video')
        if (video) {
            video.pause()
            video.currentTime = 0
        }
        currentVideo.classList.remove('active')
    }
    
    // Показываем новое видео
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
