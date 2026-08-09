import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://ioxnqjskpqvvzpgdjqhl.supabase.co';
const supabaseAnonKey = 'sb_publishable_7w_XAXuyqpL6KQFt8jg01g_GGw5aQON';
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

async function renderPage(page, params = {}) {
    const content = document.getElementById('page-content');
    const topBar = document.getElementById('top-bar');
    if (topBar) topBar.style.display = 'flex';
    
    content.innerHTML = '';

    switch (page) {
        case 'discover':
            await renderDiscoverPage(content);
            break;
        case 'communities':
            await renderCommunitiesPage(content);
            break;
        case 'community':
            await renderCommunityPage(content, params.id);
            break;
        case 'messages':
            await renderChatPage(content, params.communityId);
            break;
        case 'notifications':
            await renderNotificationsPage(content);
            break;
        case 'profile':
            await renderProfilePage(content);
            break;
        case 'settings':
            await renderSettingsPage(content);
            break;
        case 'createCommunity':
            await renderCreateCommunityPage(content);
            break;
    }
}

async function renderDiscoverPage(container) {
    container.innerHTML = `
        <div class="page">
            <div class="search-bar">
                <input type="text" class="search-input" id="discover-search" placeholder="Search communities...">
                <button class="btn btn-primary" id="create-community-btn">Create Community</button>
            </div>
            <div class="grid grid-3" id="communities-grid">
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card"></div>
            </div>
        </div>
    `;

    document.getElementById('create-community-btn').addEventListener('click', () => {
        navigateTo('createCommunity');
    });

    const searchInput = document.getElementById('discover-search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadDiscoverCommunities(searchInput.value), 300);
    });

    await loadDiscoverCommunities('');
}

async function loadDiscoverCommunities(search = '') {
    const grid = document.getElementById('communities-grid');
    
    try {
        const response = await fetch(`${API_BASE}/communities?search=${encodeURIComponent(search)}&limit=20`);
        const result = await response.json();
        
        if (!result.success) {
            grid.innerHTML = '<div class="empty-state"><p>Failed to load communities</p></div>';
            return;
        }

        if (result.data.communities.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-title">No communities found</div>
                    <div class="empty-state-description">
                        ${search ? 'Try a different search term' : 'Be the first to create a community!'}
                    </div>
                    ${!search ? '<button class="btn btn-primary" onclick="this.closest(\'#page-content\').querySelector(\'#create-community-btn\').click()">Create Community</button>' : ''}
                </div>
            `;
            return;
        }

        grid.innerHTML = result.data.communities.map(community => `
            <div class="community-card" onclick="window.navigateTo('community', { id: '${community.id}' })">
                <div class="community-card-header">
                    <div class="community-icon">${community.name[0].toUpperCase()}</div>
                    <div class="community-info">
                        <div class="community-name">${escapeHtml(community.name)}</div>
                        <div class="community-meta">${community.community_members?.[0]?.count || 0} members</div>
                    </div>
                </div>
                <div class="community-description">${escapeHtml(community.description || 'No description')}</div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = '<div class="empty-state"><p>Failed to load communities</p></div>';
    }
}

async function renderCommunitiesPage(container) {
    container.innerHTML = `
        <div class="page">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2>My Communities</h2>
                <button class="btn btn-primary" id="create-community-btn">Create New</button>
            </div>
            <div class="grid grid-2" id="my-communities-grid">
                <div class="skeleton skeleton-card"></div>
                <div class="skeleton skeleton-card"></div>
            </div>
        </div>
    `;

    document.getElementById('create-community-btn').addEventListener('click', () => {
        navigateTo('createCommunity');
    });

    await loadMyCommunities();
}

async function loadMyCommunities() {
    const grid = document.getElementById('my-communities-grid');
    
    try {
        const response = await fetch(`${API_BASE}/communities?my=true`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (!result.success || !result.data.communities.length) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">👥</div>
                    <div class="empty-state-title">No communities yet</div>
                    <div class="empty-state-description">Join or create your first community</div>
                    <button class="btn btn-primary" onclick="navigateTo('discover')">Discover Communities</button>
                </div>
            `;
            return;
        }

        grid.innerHTML = result.data.communities.map(community => `
            <div class="community-card" onclick="navigateTo('community', { id: '${community.id}' })">
                <div class="community-card-header">
                    <div class="community-icon">${community.name[0].toUpperCase()}</div>
                    <div class="community-info">
                        <div class="community-name">${escapeHtml(community.name)}</div>
                        <div class="community-meta">${community.community_members?.[0]?.count || 0} members</div>
                    </div>
                </div>
                <div class="community-description">${escapeHtml(community.description || 'No description')}</div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = '<div class="empty-state"><p>Failed to load communities</p></div>';
    }
}

async function renderCommunityPage(container, communityId) {
    try {
        const response = await fetch(`${API_BASE}/communities/${communityId}`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (!result.success) {
            container.innerHTML = '<div class="empty-state"><p>Community not found</p></div>';
            return;
        }

        currentCommunity = result.data;

        container.innerHTML = `
            <div class="page">
                <div class="community-card" style="margin-bottom: 20px;">
                    <div class="community-card-header">
                        <div class="community-icon" style="width: 64px; height: 64px; font-size: 32px;">
                            ${currentCommunity.name[0].toUpperCase()}
                        </div>
                        <div class="community-info">
                            <div class="community-name" style="font-size: 24px;">${escapeHtml(currentCommunity.name)}</div>
                            <div class="community-meta">
                                ${currentCommunity.community_members?.[0]?.count || 0} members • 
                                ${currentCommunity.privacy}
                            </div>
                        </div>
                    </div>
                    <p style="margin-top: 12px; color: var(--text-secondary);">${escapeHtml(currentCommunity.description || 'No description')}</p>
                    <div style="margin-top: 16px; display: flex; gap: 8px;" id="community-actions"></div>
                </div>
                
                <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                    <button class="btn btn-secondary active" data-tab="chat" id="tab-chat">Chat</button>
                    <button class="btn btn-secondary" data-tab="feed" id="tab-feed">Feed</button>
                    <button class="btn btn-secondary" data-tab="polls" id="tab-polls">Polls</button>
                </div>
                
                <div id="community-tab-content"></div>
            </div>
        `;

        await setupCommunityActions();
        setupCommunityTabs();
        switchCommunityTab('chat');
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load community</p></div>';
    }
}

async function setupCommunityActions() {
    const actionsContainer = document.getElementById('community-actions');
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/members`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        const membership = result.data?.members?.find(m => m.user_id === currentUser.id);
        
        if (!membership) {
            actionsContainer.innerHTML = `
                <button class="btn btn-primary" id="join-community-btn">Join Community</button>
            `;
            document.getElementById('join-community-btn').addEventListener('click', joinCommunity);
        } else {
            actionsContainer.innerHTML = `
                <button class="btn btn-secondary" onclick="navigateTo('messages', { communityId: '${currentCommunity.id}' })">Open Chat</button>
                ${membership.role !== 'owner' ? `<button class="btn btn-secondary" id="leave-community-btn">Leave</button>` : ''}
                ${['owner', 'admin'].includes(membership.role) ? `<button class="btn btn-secondary" onclick="openCommunitySettings()">Settings</button>` : ''}
            `;
            
            const leaveBtn = document.getElementById('leave-community-btn');
            if (leaveBtn) {
                leaveBtn.addEventListener('click', leaveCommunity);
            }
        }
    } catch (err) {
        console.error('Failed to load membership:', err);
    }
}

async function joinCommunity() {
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/join`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Welcome to the community!', 'success');
            await navigateTo('community', { id: currentCommunity.id });
        } else {
            showToast(result.error.message, 'error');
        }
    } catch (err) {
        showToast('Failed to join community', 'error');
    }
}

async function leaveCommunity() {
    if (!confirm('Are you sure you want to leave this community?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/leave`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Left the community', 'success');
            navigateTo('communities');
        } else {
            showToast(result.error.message, 'error');
        }
    } catch (err) {
        showToast('Failed to leave community', 'error');
    }
}

function setupCommunityTabs() {
    const tabs = ['chat', 'feed', 'polls'];
    tabs.forEach(tab => {
        document.getElementById(`tab-${tab}`).addEventListener('click', () => {
            document.querySelectorAll('#tab-chat, #tab-feed, #tab-polls').forEach(t => {
                t.classList.remove('active');
            });
            document.getElementById(`tab-${tab}`).classList.add('active');
            switchCommunityTab(tab);
        });
    });
}

function switchCommunityTab(tab) {
    const content = document.getElementById('community-tab-content');
    
    switch (tab) {
        case 'chat':
            renderCommunityChat(content);
            break;
        case 'feed':
            renderCommunityFeed(content);
            break;
        case 'polls':
            renderCommunityPolls(content);
            break;
    }
}

async function renderCommunityChat(container) {
    container.innerHTML = `
        <div class="chat-container">
            <div class="chat-messages" id="chat-messages">
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <div class="empty-state-title">No messages yet</div>
                    <div class="empty-state-description">Start the conversation!</div>
                </div>
            </div>
            <div class="chat-composer">
                <div class="composer-wrapper">
                    <textarea class="composer-input" id="message-input" placeholder="Type a message..." rows="1"></textarea>
                    <button class="composer-send" id="send-message-btn">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    await loadChatMessages();
    setupMessageComposer();
}

async function loadChatMessages(before = null) {
    const messagesContainer = document.getElementById('chat-messages');
    
    try {
        const url = `${API_BASE}/communities/${currentCommunity.id}/messages?limit=50${before ? `&before=${before}` : ''}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (!result.success || !result.data.length) {
            if (!before) {
                messagesContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💬</div>
                        <div class="empty-state-title">No messages yet</div>
                        <div class="empty-state-description">Start the conversation!</div>
                    </div>
                `;
            }
            return;
        }

        const messagesHtml = result.data.map(msg => renderMessage(msg)).join('');
        
        if (before) {
            messagesContainer.insertAdjacentHTML('afterbegin', messagesHtml);
        } else {
            messagesContainer.innerHTML = messagesHtml;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        setupMessageActions();
    } catch (err) {
        console.error('Failed to load messages:', err);
    }
}

function renderMessage(message) {
    const identity = message.community_identities;
    const reactions = groupReactions(message.message_reactions || []);
    
    return `
        <div class="message" data-message-id="${message.id}">
            <div class="message-avatar">${identity.anonymous_name[0].toUpperCase()}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${escapeHtml(identity.anonymous_name)}</span>
                    <span class="message-time">${formatTime(message.created_at)}</span>
                </div>
                ${message.reply_to ? `<div class="reply-preview" style="font-size: 12px; color: var(--text-tertiary); margin-bottom: 4px;">Replying to a message</div>` : ''}
                <div class="message-text">${escapeHtml(message.content)}</div>
                ${reactions.length ? `
                    <div class="message-reactions">
                        ${reactions.map(r => `
                            <span class="reaction-badge ${r.users.includes(currentUser.id) ? 'active' : ''}" data-reaction="${r.reaction}">
                                ${r.reaction} ${r.count}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
                ${message.updated_at && message.updated_at !== message.created_at ? '<span style="font-size: 11px; color: var(--text-tertiary);">(edited)</span>' : ''}
            </div>
            <div class="message-actions">
                <button class="message-action-btn" data-action="reply" title="Reply">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                </button>
                <button class="message-action-btn" data-action="react" title="React">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clip-rule="evenodd"/>
                    </svg>
                </button>
                ${message.sender_id === currentUser.id ? `
                    <button class="message-action-btn" data-action="edit" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                        </svg>
                    </button>
                    <button class="message-action-btn" data-action="delete" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </button>
                ` : ''}
                <button class="message-action-btn" data-action="report" title="Report">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function groupReactions(reactions) {
    const grouped = {};
    reactions.forEach(r => {
        if (!grouped[r.reaction]) {
            grouped[r.reaction] = { reaction: r.reaction, count: 0, users: [] };
        }
        grouped[r.reaction].count++;
        grouped[r.reaction].users.push(r.user_id);
    });
    return Object.values(grouped);
}

function setupMessageActions() {
    document.querySelectorAll('.message-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const messageEl = btn.closest('.message');
            const messageId = messageEl.dataset.messageId;
            const action = btn.dataset.action;
            
            switch (action) {
                case 'reply':
                    openThread(messageId);
                    break;
                case 'react':
                    await toggleReaction(messageId, '👍');
                    break;
                case 'edit':
                    await editMessage(messageId);
                    break;
                case 'delete':
                    await deleteMessage(messageId);
                    break;
                case 'report':
                    await reportContent('message', messageId);
                    break;
            }
        });
    });

    document.querySelectorAll('.reaction-badge').forEach(badge => {
        badge.addEventListener('click', async (e) => {
            e.stopPropagation();
            const messageEl = badge.closest('.message');
            const messageId = messageEl.dataset.messageId;
            const reaction = badge.dataset.reaction;
            await toggleReaction(messageId, reaction);
        });
    });
}

function setupMessageComposer() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message-btn');

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            await sendMessage();
        }
    });

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    sendBtn.addEventListener('click', sendMessage);
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content) return;
    
    input.value = '';
    input.style.height = 'auto';
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ content })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            showToast(result.error.message, 'error');
            input.value = content;
        }
    } catch (err) {
        showToast('Failed to send message', 'error');
        input.value = content;
    }
}

async function toggleReaction(messageId, reaction) {
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ reaction })
        });
    } catch (err) {
        showToast('Failed to update reaction', 'error');
    }
}

async function editMessage(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    const textEl = messageEl.querySelector('.message-text');
    const currentContent = textEl.textContent;
    
    const newContent = prompt('Edit message:', currentContent);
    if (!newContent || newContent === currentContent) return;
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/messages/${messageId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ content: newContent })
        });
        
        const result = await response.json();
        if (result.success) {
            textEl.textContent = newContent;
        }
    } catch (err) {
        showToast('Failed to edit message', 'error');
    }
}

async function deleteMessage(messageId) {
    if (!confirm('Delete this message?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/messages/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        
        const result = await response.json();
        if (result.success) {
            document.querySelector(`[data-message-id="${messageId}"]`).remove();
        }
    } catch (err) {
        showToast('Failed to delete message', 'error');
    }
}

async function openThread(messageId) {
    const panel = document.getElementById('context-panel');
    panel.style.display = 'flex';
    
    const content = document.getElementById('context-panel-content');
    content.innerHTML = `
        <div class="thread-header">
            <h3>Thread</h3>
            <button class="btn-icon" id="close-thread">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            </button>
        </div>
        <div class="thread-messages" id="thread-messages"></div>
        <div class="thread-composer">
            <div class="composer-wrapper">
                <input type="text" class="composer-input" id="thread-input" placeholder="Reply to thread...">
                <button class="composer-send" id="send-thread-btn">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    document.getElementById('close-thread').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    await loadThreadMessages(messageId);

    document.getElementById('send-thread-btn').addEventListener('click', () => sendThreadReply(messageId));
    document.getElementById('thread-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendThreadReply(messageId);
    });
}

async function loadThreadMessages(messageId) {
    const container = document.getElementById('thread-messages');
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/threads/${messageId}`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (result.data.messages.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No replies yet</p></div>';
            return;
        }

        container.innerHTML = result.data.messages.map(msg => `
            <div class="message">
                <div class="message-avatar">${msg.community_identities.anonymous_name[0].toUpperCase()}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-author">${escapeHtml(msg.community_identities.anonymous_name)}</span>
                        <span class="message-time">${formatTime(msg.created_at)}</span>
                    </div>
                    <div class="message-text">${escapeHtml(msg.content)}</div>
                </div>
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error('Failed to load thread:', err);
    }
}

async function sendThreadReply(messageId) {
    const input = document.getElementById('thread-input');
    const content = input.value.trim();
    
    if (!content) return;
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/threads/${messageId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ content })
        });
        
        const result = await response.json();
        
        if (result.success) {
            input.value = '';
            await loadThreadMessages(messageId);
        }
    } catch (err) {
        showToast('Failed to send reply', 'error');
    }
}

async function renderCommunityFeed(container) {
    container.innerHTML = `
        <div>
            <div style="margin-bottom: 16px;">
                <button class="btn btn-primary" id="create-post-btn">Create Post</button>
            </div>
            <div id="feed-posts"></div>
        </div>
    `;

    document.getElementById('create-post-btn').addEventListener('click', showCreatePostModal);
    await loadFeedPosts();
}

async function loadFeedPosts() {
    const container = document.getElementById('feed-posts');
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/posts`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (!result.data.posts.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📝</div>
                    <div class="empty-state-title">No posts yet</div>
                    <div class="empty-state-description">Create the first post in this community</div>
                </div>
            `;
            return;
        }

        container.innerHTML = result.data.posts.map(post => `
            <div class="community-card" style="margin-bottom: 12px;">
                <div class="community-card-header">
                    <div class="community-icon" style="width: 40px; height: 40px; font-size: 18px;">
                        ${post.community_identities.anonymous_name[0].toUpperCase()}
                    </div>
                    <div class="community-info">
                        <div class="community-name">${escapeHtml(post.community_identities.anonymous_name)}</div>
                        <div class="community-meta">${formatTime(post.created_at)}</div>
                    </div>
                </div>
                <p style="margin: 12px 0;">${escapeHtml(post.content)}</p>
                ${post.media_url ? `<img src="${post.media_url}" style="max-width: 100%; border-radius: var(--radius-md); margin-bottom: 12px;" alt="Post media">` : ''}
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-sm" onclick="likePost('${post.id}')">
                        ❤️ ${post.post_reactions?.length || 0}
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="commentOnPost('${post.id}')">
                        💬 ${post.post_comments?.[0]?.count || 0}
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load posts:', err);
    }
}

async function showCreatePostModal() {
    openModal('Create Post', `
        <form id="create-post-form">
            <div class="form-group">
                <label class="form-label">Content</label>
                <textarea class="form-input" id="post-content" rows="4" placeholder="What's on your mind?" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Post</button>
        </form>
    `);

    document.getElementById('create-post-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = document.getElementById('post-content').value;
        
        try {
            const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentSession.access_token}`
                },
                body: JSON.stringify({ content, type: 'text' })
            });
            
            const result = await response.json();
            
            if (result.success) {
                closeModal();
                showToast('Post created!', 'success');
                await loadFeedPosts();
            } else {
                showToast(result.error.message, 'error');
            }
        } catch (err) {
            showToast('Failed to create post', 'error');
        }
    });
}

async function likePost(postId) {
    try {
        await fetch(`${API_BASE}/communities/${currentCommunity.id}/posts/${postId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ reaction: '❤️' })
        });
        await loadFeedPosts();
    } catch (err) {
        console.error('Failed to like post:', err);
    }
}

async function commentOnPost(postId) {
    const comment = prompt('Add a comment:');
    if (!comment) return;
    
    try {
        await fetch(`${API_BASE}/communities/${currentCommunity.id}/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({ content: comment })
        });
        await loadFeedPosts();
    } catch (err) {
        showToast('Failed to add comment', 'error');
    }
}

async function renderCommunityPolls(container) {
    container.innerHTML = `
        <div>
            <div style="margin-bottom: 16px;">
                <button class="btn btn-primary" id="create-poll-btn">Create Poll</button>
            </div>
            <div id="polls-list"></div>
        </div>
    `;

    document.getElementById('create-poll-btn').addEventListener('click', showCreatePollModal);
    await loadPolls();
}

async function showCreatePollModal() {
    openModal('Create Poll', `
        <form id="create-poll-form">
            <div class="form-group">
                <label class="form-label">Question</label>
                <input type="text" class="form-input" id="poll-question" placeholder="Ask a question..." required>
            </div>
            <div class="form-group">
                <label class="form-label">Options</label>
                <div id="poll-options">
                    <input type="text" class="form-input" placeholder="Option 1" required style="margin-bottom: 8px;">
                    <input type="text" class="form-input" placeholder="Option 2" required style="margin-bottom: 8px;">
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="add-option-btn">+ Add Option</button>
            </div>
            <div class="form-group">
                <label class="form-label">
                    <input type="checkbox" id="allow-multiple"> Allow multiple choices
                </label>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Create Poll</button>
        </form>
    `);

    document.getElementById('add-option-btn').addEventListener('click', () => {
        const container = document.getElementById('poll-options');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-input';
        input.placeholder = `Option ${container.children.length + 1}`;
        input.style.marginBottom = '8px';
        container.appendChild(input);
    });

    document.getElementById('create-poll-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = document.getElementById('poll-question').value;
        const allowMultiple = document.getElementById('allow-multiple').checked;
        const options = Array.from(document.querySelectorAll('#poll-options input'))
            .map(input => input.value)
            .filter(v => v.trim());

        if (options.length < 2) {
            showToast('At least 2 options required', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/polls`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentSession.access_token}`
                },
                body: JSON.stringify({ question, options, allow_multiple: allowMultiple })
            });
            
            const result = await response.json();
            
            if (result.success) {
                closeModal();
                showToast('Poll created!', 'success');
                await loadPolls();
            }
        } catch (err) {
            showToast('Failed to create poll', 'error');
        }
    });
}

async function loadPolls() {
    const container = document.getElementById('polls-list');
    
    try {
        const response = await fetch(`${API_BASE}/communities/${currentCommunity.id}/polls`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (!result.data?.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-title">No polls yet</div>
                    <div class="empty-state-description">Create a poll to engage the community</div>
                </div>
            `;
            return;
        }
    } catch (err) {
        console.error('Failed to load polls:', err);
    }
}

async function reportContent(type, id) {
    const reason = prompt('Why are you reporting this content?');
    if (!reason) return;
    
    try {
        const response = await fetch(`${API_BASE}/moderation/reports`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentSession.access_token}`
            },
            body: JSON.stringify({
                target_type: type,
                target_id: id,
                reason,
                description: reason
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Report submitted', 'success');
        } else {
            showToast(result.error.message, 'error');
        }
    } catch (err) {
        showToast('Failed to submit report', 'error');
    }
}

async function renderNotificationsPage(container) {
    container.innerHTML = `
        <div class="page">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2>Notifications</h2>
                <button class="btn btn-secondary btn-sm" id="mark-all-read">Mark All Read</button>
            </div>
            <div id="notifications-list">
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text"></div>
            </div>
        </div>
    `;

    document.getElementById('mark-all-read').addEventListener('click', markAllNotificationsRead);
    await loadNotifications();
}

async function loadNotifications() {
    const container = document.getElementById('notifications-list');
    
    try {
        const response = await fetch(`${API_BASE}/notifications`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        if (!result.data?.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔔</div>
                    <div class="empty-state-title">No notifications</div>
                    <div class="empty-state-description">You're all caught up!</div>
                </div>
            `;
            return;
        }

        container.innerHTML = result.data.map(notif => `
            <div class="community-card" style="margin-bottom: 8px; ${!notif.read ? 'border-left: 3px solid var(--accent);' : ''}">
                <p style="font-size: 14px; margin-bottom: 4px;">${escapeHtml(notif.message)}</p>
                <span style="font-size: 12px; color: var(--text-tertiary);">${formatTime(notif.created_at)}</span>
            </div>
        `).join('');
        
        updateNotificationBadge();
    } catch (err) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load notifications</p></div>';
    }
}

async function markAllNotificationsRead() {
    try {
        await fetch(`${API_BASE}/notifications/mark-all-read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        await loadNotifications();
        updateNotificationBadge();
    } catch (err) {
        showToast('Failed to mark notifications as read', 'error');
    }
}

async function updateNotificationBadge() {
    try {
        const response = await fetch(`${API_BASE}/notifications/unread-count`, {
            headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
        });
        const result = await response.json();
        
        unreadNotifications = result.data?.count || 0;
        
        const badge = document.getElementById('notification-badge');
        const mobileBadge = document.getElementById('mobile-notification-badge');
        
        if (unreadNotifications > 0) {
            badge.style.display = 'inline';
            badge.textContent = unreadNotifications;
            mobileBadge.style.display = 'inline';
            mobileBadge.textContent = unreadNotifications;
        } else {
            badge.style.display = 'none';
            mobileBadge.style.display = 'none';
        }
    } catch (err) {
        console.error('Failed to update notification badge:', err);
    }
}

async function renderProfilePage(container) {
    const profile = currentUser.profile || {};
    
    container.innerHTML = `
        <div class="page">
            <div class="community-card" style="max-width: 600px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div class="community-icon" style="width: 80px; height: 80px; font-size: 36px; margin: 0 auto;">
                        ${(profile.display_name || profile.username || '?')[0].toUpperCase()}
                    </div>
                    <h2 style="margin-top: 12px;">${escapeHtml(profile.display_name || profile.username || 'Unknown')}</h2>
                    <p style="color: var(--text-secondary);">@${escapeHtml(profile.username || 'unknown')}</p>
                    ${profile.bio ? `<p style="margin-top: 8px;">${escapeHtml(profile.bio)}</p>` : ''}
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
                    <div>
                        <div style="font-size: 20px; font-weight: 700;">${profile.reputation || 0}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Reputation</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: 700;">${profile.level || 1}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Level</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: 700;">--</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Communities</div>
                    </div>
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn btn-primary" onclick="navigateTo('settings')">Edit Profile</button>
                </div>
            </div>
        </div>
    `;
}

async function renderSettingsPage(container) {
    container.innerHTML = `
        <div class="page" style="max-width: 600px;">
            <form id="settings-form">
                <div class="form-group">
                    <label class="form-label">Username</label>
                    <input type="text" class="form-input" id="settings-username" value="${escapeHtml(currentUser.profile?.username || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Display Name</label>
                    <input type="text" class="form-input" id="settings-display-name" value="${escapeHtml(currentUser.profile?.display_name || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Bio</label>
                    <textarea class="form-input" id="settings-bio" rows="3">${escapeHtml(currentUser.profile?.bio || '')}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Theme</label>
                    <select class="form-input" id="settings-theme">
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                        <option value="system">System</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Save Changes</button>
            </form>
        </div>
    `;

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const updates = {
            username: document.getElementById('settings-username').value,
            display_name: document.getElementById('settings-display-name').value,
            bio: document.getElementById('settings-bio').value
        };
        
        try {
            const response = await fetch(`${API_BASE}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentSession.access_token}`
                },
                body: JSON.stringify(updates)
            });
            
            const result = await response.json();
            
            if (result.success) {
                currentUser.profile = result.data;
                showToast('Profile updated!', 'success');
            } else {
                showToast(result.error.message, 'error');
            }
        } catch (err) {
            showToast('Failed to update profile', 'error');
        }
    });
}

async function renderCreateCommunityPage(container) {
    container.innerHTML = `
        <div class="page" style="max-width: 500px;">
            <h2 style="margin-bottom: 20px;">Create Community</h2>
            <form id="create-community-form">
                <div class="form-group">
                    <label class="form-label">Community Name</label>
                    <input type="text" class="form-input" id="community-name" placeholder="Enter community name" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea class="form-input" id="community-description" rows="3" placeholder="What's this community about?"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Privacy</label>
                    <select class="form-input" id="community-privacy">
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Create Community</button>
            </form>
        </div>
    `;

    document.getElementById('create-community-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('community-name').value;
        const description = document.getElementById('community-description').value;
        const privacy = document.getElementById('community-privacy').value;
        
        try {
            const response = await fetch(`${API_BASE}/communities`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentSession.access_token}`
                },
                body: JSON.stringify({ name, description, privacy })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showToast('Community created!', 'success');
                navigateTo('community', { id: result.data.id });
            } else {
                showToast(result.error.message, 'error');
            }
        } catch (err) {
            showToast('Failed to create community', 'error');
        }
    });
}

function setupRealtime() {
    cleanupRealtime();

    realtimeChannel = supabase.channel('app-realtime');

    notificationSubscription = supabase
        .channel('notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUser.id}`
        }, () => {
            updateNotificationBadge();
        })
        .subscribe();
}

function cleanupRealtime() {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    
    if (notificationSubscription) {
        supabase.removeChannel(notificationSubscription);
        notificationSubscription = null;
    }
}

function openModal(title, content) {
    document.getElementById('modal-header').innerHTML = `
        <div class="modal-title">${title}</div>
        <button class="modal-close" onclick="closeModal()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
        </button>
    `;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
            </svg>
        </button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
    }
}

function clearErrors() {
    document.querySelectorAll('.form-error').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

window.navigateTo = navigateTo;
window.closeModal = closeModal;
window.showToast = showToast;
