/* ============================================
   Authentication Module
   Client-side auth for SSPL Cloud Server
   ============================================ */

// --- Configuration ---
// Credentials (in production, this would be server-side)
const VALID_CREDENTIALS = {
    username: 'admin',
    password: 'sspl@2024'
};

const AUTH_KEY = 'sspl_auth_token';
const AUTH_EXPIRY_KEY = 'sspl_auth_expiry';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

// --- Core Auth Functions ---

function authenticate(username, password) {
    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
        const expiry = Date.now() + SESSION_DURATION;
        sessionStorage.setItem(AUTH_KEY, btoa(username + ':' + Date.now()));
        sessionStorage.setItem(AUTH_EXPIRY_KEY, expiry.toString());
        return true;
    }
    return false;
}

function isAuthenticated() {
    const token = sessionStorage.getItem(AUTH_KEY);
    const expiry = sessionStorage.getItem(AUTH_EXPIRY_KEY);

    if (!token || !expiry) return false;

    if (Date.now() > parseInt(expiry)) {
        logout();
        return false;
    }

    return true;
}

function logout() {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_EXPIRY_KEY);
    window.location.href = 'index.html';
}

function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

function checkAuth(page) {
    if (isAuthenticated()) {
        window.location.href = page;
    } else {
        // Flash the login form if on login page
        const loginCard = document.getElementById('loginCard');
        if (loginCard) {
            loginCard.classList.add('shake');
            setTimeout(() => loginCard.classList.remove('shake'), 600);

            // Focus on username input
            const usernameInput = document.getElementById('username');
            if (usernameInput) usernameInput.focus();
        } else {
            window.location.href = 'index.html';
        }
    }
}

// --- UI Helpers ---

function updateNavStatus(loggedIn) {
    const statusEl = document.getElementById('navStatus');
    if (!statusEl) return;

    if (loggedIn) {
        statusEl.innerHTML = `
            <span class="status-dot online"></span>
            <span class="status-text">Authenticated</span>
        `;

        // Unlock nav links
        document.querySelectorAll('.nav-link.locked').forEach(link => {
            link.classList.remove('locked');
            link.classList.add('unlocked');
        });
    } else {
        statusEl.innerHTML = `
            <span class="status-dot offline"></span>
            <span class="status-text">Not Authenticated</span>
        `;
    }
}

function showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${type === 'success'
            ? '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
            : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
            </svg>
        </span>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// --- Session Management ---
// Refresh session on activity
document.addEventListener('click', () => {
    if (isAuthenticated()) {
        const newExpiry = Date.now() + SESSION_DURATION;
        sessionStorage.setItem(AUTH_EXPIRY_KEY, newExpiry.toString());
    }
});
