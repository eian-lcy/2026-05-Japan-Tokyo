// --- 0. Supabase 初始化 ---
const SUPABASE_URL = 'https://vkcehceiivgdrvnucgsb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrY2VoY2VpaXZnZHJ2bnVjZ3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjgzMTksImV4cCI6MjA5MDMwNDMxOX0.cKpR-FzgYe3AT3kjqUb6z_RX0UvrlI7xb8pI97pwfpU';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 1. 🔐 驗證守門員 ---
async function checkUser(onSuccess) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateUI(session, onSuccess);
}

// 監聽登入狀態改變
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('驗證狀態改變:', event);

    // ✅ 移除 location.reload() 避免無限刷新循環
    if (event === 'SIGNED_IN') {
        updateUI(session);
    } else if (event === 'SIGNED_OUT') {
        window.location.href = "index.html";
    }
});

function updateUI(session, onSuccess) {
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const userDisplay = document.getElementById('user-display');

    if (session) {
        if (authContainer) authContainer.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        if (userDisplay) userDisplay.textContent = session.user.email;
        // 執行頁面專屬的初始化 (例如載入購物清單)
        if (typeof onSuccess === 'function') onSuccess(session);
    } else {
        if (authContainer) authContainer.classList.remove('hidden');
        if (mainContent) mainContent.classList.add('hidden');
    }
}

async function handleLogout() {
    if (confirm("確定要登出系統嗎？")) {
        await supabaseClient.auth.signOut();
        location.reload();
    }
}

// --- 2. 🖼️ Lightbox 功能 ---
function openLightbox(url, desc = '') {
    if (!url) return;
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-desc').innerHTML = desc;
    document.getElementById('lightbox').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeLightbox() {
    document.getElementById('lightbox').classList.add('hidden');
    document.body.style.overflow = '';
}

// --- 3. 處理登入表單提交 ---
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // 防止表單預設的重新整理行為
            
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            const btnLogin = document.getElementById('btn-login');

            // 改變按鈕狀態，提示正在登入中
            btnLogin.textContent = '登入中...';
            btnLogin.disabled = true;

            // 呼叫 Supabase 進行信箱密碼登入
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                // 顯示錯誤訊息
                errorEl.textContent = '登入失敗：' + error.message;
                errorEl.classList.remove('hidden');
                btnLogin.textContent = '登入系統';
                btnLogin.disabled = false;
            } else {
                // 登入成功
                errorEl.classList.add('hidden');
                btnLogin.textContent = '登入成功！';
                // 註：登入成功後，common.js 裡的 onAuthStateChange 會自動觸發並切換畫面
            }
        });
    }
});