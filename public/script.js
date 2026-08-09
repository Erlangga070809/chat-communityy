import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://ioxnqjskpqvvzpgdjqhl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlveG5xanNrcHF2dnpwZ2RqcWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY0MDAwMDAsImV4cCI6MjAyMTk3NjAwMH0.placeholder';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const API_BASE = '/api';
let currentUser = null;
let currentSession = null;
let currentPage = 'discover';
let currentCommunity = null;
let realtimeChannel = null;
let notificationSubscription = null;
let unreadNotifications = 0;

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    setupNavigation();
    setupModals();
});

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        currentSession = session;
        currentUser = session.user;
        await loadProfile();
        showApp();
        setupRealtime();
        navigateTo('discover');
    } else {
        showAuth();
    }

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentSession = session;
            currentUser = session.user;
            loadProfile();
            showApp();
            setupRealtime();
            navigateTo('discover');
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentSession = null;
            currentCommunity = null;
            cleanupRealtime();
            showAuth();
        }
    });
}

async function loadProfile() {
    try {
        const response = await fetch(`${API_BASE}/auth/profile`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const { data } = await response.json();
        if (data) {
            currentUser.profile = data;
        }
    } catch (err) {
        console.error('Failed to load profile:', err);
    }
}

function showApp() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    
    if (window.innerWidth <= 1024) {
        document.getElementById('mobile-nav').style.display = 'flex';
        document.getElementById('sidebar').classList.remove('open');
    } else {
        document.getElementById('mobile-nav').style.display = 'none';
    }
}

function showAuth() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('mobile-nav').style.display = 'none';
    renderAuthPage();
}

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });

    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });

    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.getElementById('page-content').addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });
}

function setupModals() {
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-overlay')) {
            closeModal();
        }
    });
}

async function navigateTo(page, params = {}) {
    if (!currentUser && page !== 'login' && page !== 'register') {
        showAuth();
        return;
    }

    currentPage = page;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });
    
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    const titles = {
        discover: 'Discover',
        communities: 'My Communities',
        notifications: 'Notifications',
        profile: 'Profile',
        settings: 'Settings',
        messages: 'Chat',
        community: 'Community',
        createCommunity: 'Create Community'
    };
    
    document.getElementById('top-bar-title').textContent = titles[page] || page;
    
    const contextPanel = document.getElementById('context-panel');
    if (page === 'community' && window.innerWidth > 1024) {
        contextPanel.style.display = 'flex';
    } else {
        contextPanel.style.display = 'none';
    }

    await renderPage(page, params);
}

function renderAuthPage() {
    const mainContent = document.getElementById('page-content');
    const topBar = document.getElementById('top-bar');
    if (topBar) topBar.style.display = 'none';
    
    mainContent.innerHTML = `
        <div class="auth-page">
            <div class="auth-form" id="auth-form">
                <div style="text-align: center; margin-bottom: 24px;">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="margin-bottom: 16px;">
                        <rect width="48" height="48" rx="12" fill="#6366f1"/>
                        <path d="M14 24C14 18.477 18.477 14 24 14C29.523 14 34 18.477 34 24C34 29.523 29.523 34 24 34" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                        <path d="M24 18V30M18 24H30" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                    <h1 id="auth-title">Welcome Back</h1>
                    <p id="auth-subtitle">Sign in to your account</p>
                </div>
                <form id="login-form">
                    <div class="form-group">
                        <label class="form-label" for="email">Email</label>
                        <input type="email" class="form-input" id="email" placeholder="you@example.com" required>
                        <div class="form-error" id="email-error"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="password">Password</label>
                        <input type="password" class="form-input" id="password" placeholder="Enter your password" required>
                        <div class="form-error" id="password-error"></div>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block" id="auth-submit-btn">Sign In</button>
                </form>
                <form id="register-form" style="display: none;">
                    <div class="form-group">
                        <label class="form-label" for="reg-username">Username</label>
                        <input type="text" class="form-input" id="reg-username" placeholder="Choose a username" required>
                        <div class="form-error" id="username-error"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="reg-email">Email</label>
                        <input type="email" class="form-input" id="reg-email" placeholder="you@example.com" required>
                        <div class="form-error" id="reg-email-error"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="reg-password">Password</label>
                        <input type="password" class="form-input" id="reg-password" placeholder="At least 8 characters" required>
                        <div class="form-error" id="reg-password-error"></div>
                    </div>
                    <button type="submit" class="btn btn-primary btn-block" id="reg-submit-btn">Create Account</button>
                </form>
                <div style="text-align: center; margin-top: 20px;">
                    <button class="btn btn-secondary btn-sm" id="toggle-auth-btn">Create an account</button>
                </div>
            </div>
        </div>
    `;

    setupAuthForms();
}

function setupAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toggleBtn = document.getElementById('toggle-auth-btn');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');

    toggleBtn.addEventListener('click', () => {
        if (loginForm.style.display === 'none') {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            authTitle.textContent = 'Welcome Back';
            authSubtitle.textContent = 'Sign in to your account';
            toggleBtn.textContent = 'Create an account';
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            authTitle.textContent = 'Create Account';
            authSubtitle.textContent = 'Join the community';
            toggleBtn.textContent = 'Sign in instead';
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        clearErrors();
        
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                showError('email-error', result.error.message);
                return;
            }

            await supabase.auth.setSession(result.data.session);
        } catch (err) {
            showError('email-error', 'Login failed. Please try again.');
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        
        clearErrors();
        
        if (password.length < 8) {
            showError('reg-password-error', 'Password must be at least 8 characters');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, username })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                showError('reg-email-error', result.error.message);
                return;
            }
            
            showToast('Account created! Please sign in.', 'success');
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            authTitle.textContent = 'Welcome Back';
            authSubtitle.textContent = 'Sign in to your account';
            toggleBtn.textContent = 'Create an account';
        } catch (err) {
            showError('reg-email-error', 'Registration failed. Please try again.');
        }
    });
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        await supabase.auth.signOut();
    } catch (err) {
        console.error('Logout error:', err);
        await supabase.auth.signOut();
    }
      }
