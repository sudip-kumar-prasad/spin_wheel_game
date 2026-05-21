// High-Fidelity Frontend Orchestration Logic (Aligned with Assessment Requirements)
const BACKEND_URL = '';
const socket = io();

// Local Session State
let currentUser = null;
let activeWheel = null;
let currentTab = 'dashboard'; // 'dashboard' | 'spin'
let simulatedLobbyTime = 180; // auto-start countdown (3 mins)
let lobbyTimerInterval = null;
let eliminationCountInterval = null;

// DOM Elements
const authModal = document.getElementById('auth-modal');
const usernameInput = document.getElementById('username-input');
const roleInput = document.getElementById('role-input');
const btnCreateUser = document.getElementById('btn-create-user');
const btnLogout = document.getElementById('btn-logout');

const navTabs = document.querySelectorAll('.nav-tab');
const viewDashboard = document.getElementById('view-dashboard');
const viewSpin = document.getElementById('view-spin');

const currentCoinsLabel = document.getElementById('current-coins');

// Dashboard UI
const dashWinnerPool = document.getElementById('dash-winner-pool');
const dashAdminPool = document.getElementById('dash-admin-pool');
const dashAppPool = document.getElementById('dash-app-pool');
const dashWheelId = document.getElementById('dash-wheel-id');
const dashWheelStatus = document.getElementById('dash-wheel-status');
const dashWheelTimer = document.getElementById('dash-wheel-timer');
const dashBtnStart = document.getElementById('dash-btn-start');
const dashBtnAbort = document.getElementById('dash-btn-abort');
const dashInputFee = document.getElementById('dash-input-fee');
const dashSliderWinner = document.getElementById('dash-slider-winner');
const dashLabelWinner = document.getElementById('dash-label-winner');
const dashInputAdmin = document.getElementById('dash-input-admin');
const dashInputApp = document.getElementById('dash-input-app');
const dashBtnDeploy = document.getElementById('dash-btn-deploy');
const dashLogsBody = document.getElementById('dash-logs-body');

// Lobby Subview
const lobbySubview = document.getElementById('lobby-subview');
const lobbyWinnerPool = document.getElementById('lobby-winner-pool');
const lobbyAdminPool = document.getElementById('lobby-admin-pool');
const lobbyEntryFee = document.getElementById('lobby-entry-fee');
const lobbyTimerClock = document.getElementById('lobby-timer-clock');
const lobbyBtnJoin = document.getElementById('lobby-btn-join');
const lobbyBtnFeeVal = document.getElementById('lobby-btn-fee-val');
const lobbyPlayersCount = document.getElementById('lobby-players-count');
const lobbyParticipantsBox = document.getElementById('lobby-participants-box');
const playWheelSector = document.getElementById('play-wheel-sector');

// Elimination Subview
const eliminationSubview = document.getElementById('elimination-subview');
const gameAliveHeader = document.getElementById('game-alive-header');
const gamePrizeBadge = document.getElementById('game-prize-badge');
const gameAliveScroller = document.getElementById('game-alive-scroller');
const gameWheelSector = document.getElementById('game-wheel-sector');
const gameProtocolOverlay = document.getElementById('game-protocol-overlay');
const protocolStatusText = document.getElementById('protocol-status-text');
const protocolUsername = document.getElementById('protocol-username');
const gameLastEliminated = document.getElementById('game-last-eliminated');
const gameNextSec = document.getElementById('game-next-sec');
const gameTickerFill = document.getElementById('game-ticker-fill');

const headerAvatarImg = document.getElementById('header-avatar-img');

// Init application
document.addEventListener('DOMContentLoaded', () => {
    setupTabRouter();
    setupAuthFlow();
    setupAdminControls();
    setupPlayerControls();
    startMockLobbyTimer();
    // Always show login modal first by clearing previous roxstar session
    localStorage.removeItem('roxstar_session');
});

// Tab Router Orchestration
function setupTabRouter() {
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const selectedTab = tab.getAttribute('data-tab');
            currentTab = selectedTab;
            
            // Toggle Views
            viewDashboard.classList.add('hidden');
            viewSpin.classList.add('hidden');
            
            if (selectedTab === 'dashboard') {
                viewDashboard.classList.remove('hidden');
                if (currentUser) {
                    const adminView = document.getElementById('admin-dashboard-view');
                    const playerView = document.getElementById('player-dashboard-view');
                    if (currentUser.role === 'admin') {
                        if (adminView) adminView.classList.remove('hidden');
                        if (playerView) playerView.classList.add('hidden');
                    } else {
                        if (adminView) adminView.classList.add('hidden');
                        if (playerView) playerView.classList.remove('hidden');
                        fetchPlayerStats();
                    }
                }
            } else if (selectedTab === 'spin') {
                viewSpin.classList.remove('hidden');
                syncSpinSubview();
            }
        });
    });
}

// Fetch Player Statistics & History Ledger
async function fetchPlayerStats() {
    if (!currentUser || currentUser.role !== 'user') return;
    try {
        const userId = currentUser._id || currentUser.id;
        const res = await fetch(`${BACKEND_URL}/api/users/${userId}/stats`);
        if (!res.ok) throw new Error('Failed to fetch player stats');
        
        const stats = await res.json();
        
        const gamesPlayedEl = document.getElementById('player-games-played');
        const gamesWonEl = document.getElementById('player-games-won');
        const coinsEarnedEl = document.getElementById('player-coins-earned');
        const profitLossEl = document.getElementById('player-profit-loss');
        const profitLossCard = document.getElementById('player-profit-loss-card');
        const profitLossBadge = document.getElementById('player-profit-loss-badge');
        const logsBody = document.getElementById('player-logs-body');
        
        if (gamesPlayedEl) gamesPlayedEl.textContent = stats.gamesPlayed;
        if (gamesWonEl) gamesWonEl.textContent = stats.gamesWon;
        if (coinsEarnedEl) coinsEarnedEl.textContent = Math.round(stats.totalEarned).toLocaleString();
        
        if (profitLossEl) {
            const val = Math.round(stats.netProfitLoss);
            profitLossEl.textContent = (val >= 0 ? '+' : '') + val.toLocaleString();
            
            if (val > 0) {
                profitLossEl.className = 'pool-metric-value profit-green';
                if (profitLossCard) {
                    profitLossCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                    profitLossCard.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.05)';
                }
                if (profitLossBadge) {
                    profitLossBadge.textContent = 'PROFIT';
                    profitLossBadge.className = 'status-badge';
                    profitLossBadge.style.background = 'rgba(16, 185, 129, 0.1)';
                    profitLossBadge.style.color = '#10b981';
                }
            } else if (val < 0) {
                profitLossEl.className = 'pool-metric-value loss-red';
                if (profitLossCard) {
                    profitLossCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    profitLossCard.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.05)';
                }
                if (profitLossBadge) {
                    profitLossBadge.textContent = 'LOSS';
                    profitLossBadge.className = 'status-badge';
                    profitLossBadge.style.background = 'rgba(239, 68, 68, 0.1)';
                    profitLossBadge.style.color = '#ef4444';
                }
            } else {
                profitLossEl.className = 'pool-metric-value';
                if (profitLossCard) {
                    profitLossCard.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    profitLossCard.style.boxShadow = 'none';
                }
                if (profitLossBadge) {
                    profitLossBadge.textContent = 'BREAKEVEN';
                    profitLossBadge.className = 'status-badge staged';
                    profitLossBadge.style.background = '';
                    profitLossBadge.style.color = '';
                }
            }
        }
        
        if (logsBody) {
            logsBody.innerHTML = '';
            if (!stats.transactions || stats.transactions.length === 0) {
                logsBody.innerHTML = `
                    <tr>
                        <td class="time-col">--:--:--</td>
                        <td>No transactions logged yet. Play a game to view ledger updates!</td>
                        <td>--</td>
                        <td class="impact-col positive">--</td>
                    </tr>
                `;
            } else {
                stats.transactions.forEach(t => {
                    const row = document.createElement('tr');
                    const time = new Date(t.createdAt).toISOString().replace('T', ' ').substring(0, 19);
                    const isCredit = t.type === 'credit';
                    const sign = isCredit ? '+' : '-';
                    const impactClass = isCredit ? 'positive' : 'negative';
                    const typeBadge = `<span class="status-badge ${isCredit ? '' : 'staged'}">${t.type.toUpperCase()}</span>`;
                    
                    row.innerHTML = `
                        <td class="time-col">${time}</td>
                        <td>${t.description}</td>
                        <td>${typeBadge}</td>
                        <td class="impact-col ${impactClass}">${sign}${Math.round(t.amount)} Coins</td>
                    `;
                    logsBody.appendChild(row);
                });
            }
        }
    } catch (e) {
        console.error('[Stats Error] Failed to refresh player stats:', e);
    }
}

// Sync subviews in Spin tab
function syncSpinSubview() {
    if (activeWheel && (activeWheel.status === 'in_progress')) {
        lobbySubview.classList.add('hidden');
        eliminationSubview.classList.remove('hidden');
    } else {
        lobbySubview.classList.remove('hidden');
        eliminationSubview.classList.add('hidden');
    }
}

// User Auth Flow
function setupAuthFlow() {
    btnCreateUser.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const role = roleInput.value;
        if (!username) return alert('Enter a valid username');

        try {
            const res = await fetch(`${BACKEND_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, role })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Login failed');
            
            currentUser = data;
            localStorage.setItem('roxstar_session', JSON.stringify(currentUser));
            
            // Dismiss Modal
            authModal.style.display = 'none';
            
            // Load User Stats & Info
            updateUserBalanceUI();
            addSystemLog('Session initialized successfully', 'Executed', 'SYSTEM_AUTO', '+0.0');
            
            // Fetch live wheels
            await fetchActiveWheel();
            
        } catch (err) {
            console.error('Auth error:', err);
            alert(`Authentication error: ${err.message}`);
        }
    });

    // Switch User / Logout button to test multiplayer concurrent states easily!
    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('roxstar_session');
        currentUser = null;
        authModal.style.display = 'flex';
        resetWheelUIElements();
        addSystemLog('Session terminated', 'Idle', 'USER_ACTION', '--');
        const gmTab = document.querySelector('[data-tab="dashboard"]');
        if (gmTab) {
            gmTab.style.display = '';
            gmTab.textContent = 'Game Master';
        }
    });
}

function restoreSession() {
    const saved = localStorage.getItem('roxstar_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            authModal.style.display = 'none';
            updateUserBalanceUI();
            fetchActiveWheel();

            // Refresh session from database asynchronously to maintain latest coin balance
            const userId = currentUser._id || currentUser.id;
            fetch(`${BACKEND_URL}/api/users/${userId}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Sync failed');
                })
                .then(freshUser => {
                    if (freshUser) {
                        currentUser = freshUser;
                        localStorage.setItem('roxstar_session', JSON.stringify(currentUser));
                        updateUserBalanceUI();
                    }
                })
                .catch(err => {
                    console.warn('[Session Sync] Failed to refresh user profile from backend:', err);
                });
        } catch (e) {
            localStorage.removeItem('roxstar_session');
        }
    }
}

function updateUserBalanceUI() {
    if (!currentUser) return;
    currentCoinsLabel.textContent = Math.round(currentUser.coinBalance).toLocaleString();
    
    // Set avatars based on username hash
    const gender = currentUser.username.toLowerCase().includes('luna') ? 'women' : 'men';
    const avatarIndex = Math.abs(currentUser.username.charCodeAt(0) % 99);
    headerAvatarImg.src = `https://randomuser.me/api/portraits/${gender}/${avatarIndex}.jpg`;

    // Sync tab visibility based on role
    const gmTab = document.querySelector('[data-tab="dashboard"]');
    if (gmTab) {
        gmTab.style.display = '';
        gmTab.textContent = currentUser.role === 'admin' ? 'Game Master' : 'Dashboard';
    }

    if (currentTab === 'dashboard') {
        const adminView = document.getElementById('admin-dashboard-view');
        const playerView = document.getElementById('player-dashboard-view');
        if (currentUser.role === 'admin') {
            if (adminView) adminView.classList.remove('hidden');
            if (playerView) playerView.classList.add('hidden');
        } else {
            if (adminView) adminView.classList.add('hidden');
            if (playerView) playerView.classList.remove('hidden');
            fetchPlayerStats();
        }
    }
}

// Fetch active wheel from DB
async function fetchActiveWheel() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/spin-wheels/active`);
        if (res.ok) {
            activeWheel = await res.json();
            syncWheelDataToUI();
        } else {
            activeWheel = null;
            resetWheelUIElements();
        }
    } catch (err) {
        console.error('Active wheel fetch error:', err);
    }
}

// Reset UI state when no wheel is active
function resetWheelUIElements() {
    dashWheelId.textContent = 'None';
    dashWheelStatus.textContent = 'INACTIVE';
    dashWheelTimer.textContent = '00:00:00';
    
    lobbyWinnerPool.textContent = '0';
    lobbyAdminPool.textContent = '0';
    lobbyEntryFee.textContent = '0 Coins';
    lobbyBtnFeeVal.textContent = '0';
    lobbyPlayersCount.textContent = '0';
    lobbyParticipantsBox.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:2rem 0;">No active spin wheel. Deploy one from Game Master panel.</div>';
    
    dashWinnerPool.textContent = '0.0k';
    dashAdminPool.textContent = '0.0k';
    dashAppPool.textContent = '0.0k';
    
    simulatedLobbyTime = 180;
}

// Sync current wheel data state into components
function syncWheelDataToUI() {
    if (!activeWheel) return;
    
    // Dashboard status mapping
    dashWheelId.textContent = `#WXL-${activeWheel._id.slice(-4).toUpperCase()}`;
    dashWheelStatus.textContent = activeWheel.status.toUpperCase();
    
    dashWinnerPool.textContent = `${(activeWheel.winnerPool / 1000).toFixed(1)}k`;
    dashAdminPool.textContent = `${(activeWheel.adminPool / 1000).toFixed(1)}k`;
    dashAppPool.textContent = `${(activeWheel.appPool / 1000).toFixed(1)}k`;
    
    // Lobby panel mapping
    lobbyWinnerPool.textContent = Math.round(activeWheel.winnerPool).toLocaleString();
    lobbyAdminPool.textContent = Math.round(activeWheel.adminPool).toLocaleString();
    lobbyEntryFee.textContent = `${activeWheel.entryFee} Coins`;
    lobbyBtnFeeVal.textContent = activeWheel.entryFee;
    lobbyPlayersCount.textContent = activeWheel.participants.length;
    
    // Bind buttons
    lobbyBtnJoin.innerHTML = `Join Game <i class="fa-solid fa-bolt"></i> ${activeWheel.entryFee} Coins`;
    
    renderParticipantsList();
    syncSpinSubview();
}

// Render Lobby Active participants scroller
// participants: array from the server (userId may be populated object OR string)
function renderParticipantsList(participants) {
    const list = participants || (activeWheel ? activeWheel.participants : []);
    if (!lobbyParticipantsBox) return;
    lobbyParticipantsBox.innerHTML = '';
    
    if (!list || list.length === 0) {
        lobbyParticipantsBox.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:2rem 0;">No participants yet. Be the first to join!</div>';
        return;
    }
    
    list.forEach(p => {
        // userId may be a populated User object (with ._id & .username) or a raw string ID
        const isPopulated = p.userId && typeof p.userId === 'object';
        const userIdStr = isPopulated ? (p.userId._id || p.userId.id || '') : (p.userId || '');
        const isCurrent = currentUser && (userIdStr === currentUser._id || userIdStr === currentUser.id);
        
        let displayName;
        if (isCurrent) {
            displayName = 'You';
        } else if (isPopulated && p.userId.username) {
            // Populated — use real username from DB
            displayName = p.userId.username;
        } else if (userIdStr) {
            // Fallback: short ID slice (only if not populated)
            displayName = `User_${userIdStr.slice(-5)}`;
        } else {
            displayName = 'Player';
        }

        const levelSeed = userIdStr ? userIdStr.charCodeAt(userIdStr.length - 1) : 0;
        const userLevel = Math.abs(levelSeed % 80) + 5;
        const rankTag = userLevel > 60 ? 'Legend' : userLevel > 30 ? 'Pro' : 'Novice';
        const displayLvl = `Lvl ${userLevel} ${rankTag}`;
        
        // Deterministic avatar index (0–98) from the userIdStr sum
        const avatarSum = userIdStr ? userIdStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 1;
        const avatarIdx = Math.abs(avatarSum % 99);
        const avatarGender = avatarIdx % 2 === 0 ? 'men' : 'women';
        
        const card = document.createElement('div');
        card.className = 'participant-card-item';
        const entryFee = activeWheel ? activeWheel.entryFee : 0;
        card.innerHTML = `
            <div class="part-card-left">
                <div class="part-avatar-container">
                    <img src="https://randomuser.me/api/portraits/${avatarGender}/${avatarIdx}.jpg" alt="avatar" onerror="this.src='https://randomuser.me/api/portraits/men/2.jpg'">
                    <span class="status-green-dot"></span>
                </div>
                <div class="part-card-name-box">
                    <span class="part-username">${displayName}</span>
                    <span class="part-rank-lvl">${displayLvl}</span>
                </div>
            </div>
            <span class="part-card-right-val">${entryFee}c</span>
        `;
        lobbyParticipantsBox.appendChild(card);
    });
}

// Fetch DB Config and sync to UI
async function fetchConfig() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/spin-wheels/config`);
        if (res.ok) {
            const config = await res.json();
            dashSliderWinner.value = config.winnerPoolPercentage;
            dashLabelWinner.textContent = `${config.winnerPoolPercentage}%`;
            dashInputAdmin.value = config.adminPoolPercentage;
            dashInputApp.value = config.appPoolPercentage;
        }
    } catch (err) {
        console.error('Error fetching config:', err);
    }
}

// Save DB Config
async function saveConfig() {
    const winnerPoolPercentage = parseInt(dashSliderWinner.value);
    const adminPoolPercentage = parseInt(dashInputAdmin.value);
    const appPoolPercentage = parseInt(dashInputApp.value);

    try {
        const res = await fetch(`${BACKEND_URL}/api/spin-wheels/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                winnerPoolPercentage,
                adminPoolPercentage,
                appPoolPercentage
            })
        });
        if (res.ok) {
            addSystemLog(`Updated DB Config: W:${winnerPoolPercentage}% A:${adminPoolPercentage}% App:${appPoolPercentage}%`, 'Executed', 'ADMIN', 'Config Synced');
        } else {
            const data = await res.json();
            console.error('Failed to save config:', data.message);
        }
    } catch (err) {
        console.error('Error saving config:', err);
    }
}

// Admin Panel Events Setup
function setupAdminControls() {
    // Fetch initial DB config
    fetchConfig();

    // Winner pool percentage slider logic
    dashSliderWinner.addEventListener('input', () => {
        const val = parseInt(dashSliderWinner.value);
        dashLabelWinner.textContent = `${val}%`;
        
        // Dynamic balance split estimation
        const rem = 100 - val;
        const adminShare = Math.floor(rem * 0.5);
        const appShare = rem - adminShare;
        dashInputAdmin.value = adminShare;
        dashInputApp.value = appShare;
    });

    dashSliderWinner.addEventListener('change', saveConfig);
    
    // Deploy wheel
    dashBtnDeploy.addEventListener('click', async () => {
        if (!currentUser) return alert('Initialize session first');
        if (currentUser.role !== 'admin') return alert('Only administrators can deploy wheels');
        
        const entryFee = Number(dashInputFee.value);
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/spin-wheels/initialize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId: currentUser._id, entryFee })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.message || 'Deployment error');
            activeWheel = data;
            
            addSystemLog(`Deployed Spin Wheel ${dashWheelId.textContent}`, 'Executed', 'ADMIN', `+${entryFee} Fee`);
            syncWheelDataToUI();
            
            alert('Spin wheel deployed successfully!');
            // Auto route to lobby view
            document.querySelector('[data-tab="spin"]').click();
            
        } catch (err) {
            alert(err.message);
        }
    });

    // Start active wheel manually
    dashBtnStart.addEventListener('click', async () => {
        if (!activeWheel) return alert('No active deployed wheel');
        if (currentUser.role !== 'admin') return alert('Only administrators can start wheels manually');
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/spin-wheels/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wheelId: activeWheel._id, adminId: currentUser._id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Trigger start failed');
            
            addSystemLog('Spin Wheel Started manually', 'Executed', 'ADMIN', 'Active');
        } catch (err) {
            alert(err.message);
        }
    });
    
    // Abort active wheel — calls real backend endpoint so fees are refunded
    dashBtnAbort.addEventListener('click', async () => {
        if (!activeWheel) return alert('No active wheel running');
        if (currentUser.role !== 'admin') return alert('Only administrators can abort wheels');
        if (!confirm('Abort the active wheel? All entry fees will be refunded.')) return;
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/spin-wheels/abort`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wheelId: activeWheel._id, adminId: currentUser._id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Abort failed');
            
            addSystemLog('Aborted Wheel Deployment', 'Refunded', 'ADMIN', 'Restored');
            // UI reset will be triggered by the wheelAborted socket event
        } catch (err) {
            alert(err.message);
        }
    });
}

// Player Events Setup
function setupPlayerControls() {
    lobbyBtnJoin.addEventListener('click', async () => {
        if (!activeWheel) return alert('No active wheel available');
        if (!currentUser) return alert('Initialize session first');
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/spin-wheels/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wheelId: activeWheel._id, userId: currentUser._id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Join failed');
            
            activeWheel = data.wheel;
            // Update user balance locally
            currentUser.coinBalance -= activeWheel.entryFee;
            localStorage.setItem('roxstar_session', JSON.stringify(currentUser));
            
            updateUserBalanceUI();
            syncWheelDataToUI();
            addSystemLog('Player joined spin wheel', 'Executed', currentUser.username, `-${activeWheel.entryFee} Coins`);
            
        } catch (err) {
            alert(err.message);
        }
    });
}

// System Logs Appender helper
function addSystemLog(eventDesc, statusText, actorLabel, impactDesc) {
    const row = document.createElement('tr');
    const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Clear initial row if exists
    if (dashLogsBody.children[0] && dashLogsBody.children[0].innerText.includes('No events logged yet')) {
        dashLogsBody.innerHTML = '';
    }
    
    row.innerHTML = `
        <td class="time-col">${time}</td>
        <td>${eventDesc}</td>
        <td class="origin-col">${actorLabel}</td>
        <td class="impact-col positive">${impactDesc}</td>
        <td><span class="status-badge">${statusText}</span></td>
    `;
    dashLogsBody.prepend(row);
}

// 3-Minute auto start ticking countdown
function startMockLobbyTimer() {
    clearInterval(lobbyTimerInterval);
    lobbyTimerInterval = setInterval(() => {
        if (activeWheel && activeWheel.status === 'waiting') {
            if (simulatedLobbyTime > 0) {
                simulatedLobbyTime--;
                const mins = Math.floor(simulatedLobbyTime / 60).toString().padStart(2, '0');
                const secs = (simulatedLobbyTime % 60).toString().padStart(2, '0');
                lobbyTimerClock.textContent = `${mins}:${secs}`;
            } else {
                // Auto reset/refresh wheel state
                fetchActiveWheel();
            }
        } else {
            lobbyTimerClock.textContent = '03:00';
            simulatedLobbyTime = 180;
        }
        
        // Randomly simulate elapsed game master timer
        if (activeWheel && activeWheel.status === 'in_progress') {
            const currentSec = new Date().getSeconds();
            const randMin = new Date().getMinutes();
            dashWheelTimer.textContent = `00:${randMin.toString().padStart(2, '0')}:${currentSec.toString().padStart(2, '0')}`;
        } else {
            dashWheelTimer.textContent = '00:00:00';
        }
        
    }, 1000);
}

// Render active elimination status layout
// pList entries: { userId: <populated User object or string>, status: 'active'|'eliminated' }
function renderActiveEliminationScreen(pList) {
    gameAliveScroller.innerHTML = '';
    
    // Filter active and eliminated
    const aliveList = pList.filter(p => p.status === 'active');
    gameAliveHeader.textContent = `Alive (${aliveList.length})`;
    gamePrizeBadge.textContent = `Prize: ${Math.round(activeWheel.winnerPool)} Coins`;
    
    pList.forEach(p => {
        const isPopulated = p.userId && typeof p.userId === 'object';
        const userIdStr = isPopulated ? (p.userId._id || p.userId.id || '') : (p.userId || '');
        const isCurrent = currentUser && (userIdStr === currentUser._id || userIdStr === currentUser.id);
        
        let displayName;
        if (isCurrent) {
            displayName = 'You';
        } else if (isPopulated && p.userId.username) {
            displayName = p.userId.username;
        } else if (userIdStr) {
            displayName = `User_${userIdStr.slice(-5)}`;
        } else {
            displayName = 'Player';
        }
        
        const card = document.createElement('div');
        
        if (p.status === 'eliminated') {
            card.className = 'alive-card-item is-eliminated';
            card.innerHTML = `
                <div class="alive-left-box">
                    <div class="alive-user-avatar" style="background:#1e293b; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.75rem; font-weight:700;">
                        ${displayName.charAt(0).toUpperCase()}
                    </div>
                    <div class="part-card-name-box">
                        <span class="alive-username-lbl">${displayName}</span>
                        <span class="alive-level-lbl"><i class="fa-solid fa-skull"></i></span>
                    </div>
                </div>
                <span class="alive-eliminated-skull"><i class="fa-solid fa-skull"></i></span>
            `;
        } else {
            card.className = 'alive-card-item';
            card.innerHTML = `
                <div class="alive-left-box">
                    <div class="alive-user-avatar" style="background:#06b6d4; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.75rem; font-weight:700;">
                        ${displayName.charAt(0).toUpperCase()}
                    </div>
                    <div class="part-card-name-box">
                        <span class="alive-username-lbl">${displayName}</span>
                        <span class="alive-level-lbl">Active</span>
                    </div>
                </div>
                <span class="alive-active-indicator-dot"></span>
            `;
        }
        gameAliveScroller.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Live Socket Events Listener Orchestration
// -----------------------------------------------------------------------------

// ── Global events (no active wheel needed) ──────────────────────────────────
// New wheel deployed by admin → auto-fetch so all players see the lobby
socket.on('wheelDeployed', async () => {
    await fetchActiveWheel();
    // Switch standard players to Play Arena tab automatically
    if (currentUser && currentUser.role !== 'admin') {
        const playTab = document.querySelector('[data-tab="spin"]');
        if (playTab) playTab.click();
    }
});

socket.onAny((eventName, ...args) => {
    const data = args[0];

    // ── Lobby participant update (real-time, with populated usernames) ──────
    // Fires for ALL clients when anyone joins, so the list stays in sync
    if (activeWheel && eventName === `lobbyUpdated-${activeWheel._id}`) {
        activeWheel.participants = data.participants;
        activeWheel.winnerPool  = data.winnerPool;
        activeWheel.adminPool   = data.adminPool;
        activeWheel.appPool     = data.appPool;
        lobbyPlayersCount.textContent = data.participants.length;
        lobbyWinnerPool.textContent = Math.round(data.winnerPool).toLocaleString();
        lobbyAdminPool.textContent  = Math.round(data.adminPool).toLocaleString();
        renderParticipantsList(data.participants);

        // ── Also update Admin Dashboard pool cards in real-time ──
        dashWinnerPool.textContent = `${(data.winnerPool / 1000).toFixed(1)}k`;
        dashAdminPool.textContent  = `${(data.adminPool / 1000).toFixed(1)}k`;
        dashAppPool.textContent    = `${(data.appPool / 1000).toFixed(1)}k`;
        return;
    }

    if (!activeWheel) return;
    const wid = activeWheel._id;
    
    // Wheel Started event
    if (eventName === `wheelStarted-${wid}`) {
        activeWheel.status = 'in_progress';
        activeWheel.participants = data.participants;
        
        syncWheelDataToUI();
        syncSpinSubview();
        
        // Render elimination items
        renderActiveEliminationScreen(activeWheel.participants);
        addSystemLog('Protocol: Wheel Started!', 'Executed', 'SYSTEM_ENGINE', 'Active');
        
        // Center Alert protocol popup animation
        protocolStatusText.textContent = 'PROTOCOL INITIATED';
        protocolUsername.textContent = 'COMPILING PLAYERS';
        
        // Spin sector
        gameWheelSector.classList.add('is-spinning');
        
        // Start ticking 7s countdown simulation
        let nextSecCount = 7;
        clearInterval(eliminationCountInterval);
        eliminationCountInterval = setInterval(() => {
            if (nextSecCount > 0) {
                nextSecCount--;
                gameNextSec.textContent = `${nextSecCount}s`;
                gameTickerFill.style.width = `${(nextSecCount / 7) * 100}%`;
            } else {
                nextSecCount = 7; // reset
            }
        }, 1000);
    }
    
    // Participant Eliminated event
    if (eventName === `userEliminated-${wid}`) {
        const eliminatedId = data.eliminatedUserId;
        const matchPart = activeWheel.participants.find(p => {
            const uid = (p.userId && typeof p.userId === 'object') ? (p.userId._id || p.userId.id) : p.userId;
            return uid && uid.toString() === eliminatedId.toString();
        });
        
        if (matchPart) {
            matchPart.status = 'eliminated';
        }
        
        const isCurrent = currentUser && eliminatedId === (currentUser._id || currentUser.id);
        // Try to get real username from cached participants
        let displayName;
        if (isCurrent) {
            displayName = 'You';
        } else if (matchPart && matchPart.userId && typeof matchPart.userId === 'object' && matchPart.userId.username) {
            displayName = matchPart.userId.username;
        } else {
            displayName = `User_${eliminatedId.slice(-5)}`;
        }
        
        // Trigger center glass protocol warning notification box in Screen 3 exact layout!
        protocolStatusText.textContent = 'ELIMINATING:';
        protocolUsername.textContent = displayName.toUpperCase();
        gameLastEliminated.textContent = displayName;
        
        // Re-render scroller lists
        renderActiveEliminationScreen(activeWheel.participants);
        addSystemLog(`User ${displayName} Eliminated`, 'Executed', 'SYSTEM_ENGINE', `Remaining: ${data.remaining}`);
    }
    
    // Wheel Finished/Completed event
    if (eventName === `wheelCompleted-${wid}`) {
        clearInterval(eliminationCountInterval);
        activeWheel.status = 'completed';
        gameWheelSector.classList.remove('is-spinning');
        
        const winnerId = data.winnerId;
        const isWinner = currentUser && (
            String(winnerId) === String(currentUser._id) || 
            String(winnerId) === String(currentUser.id)
        );
        
        // Look up winner's real username from cached participants
        let displayName;
        if (isWinner) {
            displayName = 'YOU';
        } else {
            const winnerPart = activeWheel.participants.find(p => {
                const uid = (p.userId && typeof p.userId === 'object') ? (p.userId._id || p.userId.id) : p.userId;
                return uid && uid.toString() === winnerId.toString();
            });
            if (winnerPart && winnerPart.userId && typeof winnerPart.userId === 'object' && winnerPart.userId.username) {
                displayName = winnerPart.userId.username.toUpperCase();
            } else {
                displayName = `USER_${winnerId.slice(-5)}`;
            }
        }
        
        protocolStatusText.textContent = 'WINNER DECLARED:';
        protocolUsername.textContent = displayName;
        
        // ── Update Admin Dashboard status immediately ──
        dashWheelStatus.textContent = 'COMPLETED';
        dashWinnerPool.textContent = `${(activeWheel.winnerPool / 1000).toFixed(1)}k`;
        dashAdminPool.textContent  = `${(activeWheel.adminPool / 1000).toFixed(1)}k`;
        dashAppPool.textContent    = `${(activeWheel.appPool / 1000).toFixed(1)}k`;
        
        // Refresh balance from backend DB for the current user (winner, admin, or standard player)
        if (currentUser) {
            const userId = currentUser._id || currentUser.id;
            fetch(`${BACKEND_URL}/api/users/${userId}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Sync failed');
                })
                .then(freshUser => {
                    if (freshUser) {
                        currentUser = freshUser;
                        localStorage.setItem('roxstar_session', JSON.stringify(currentUser));
                        updateUserBalanceUI();
                    }
                })
                .catch(err => {
                    console.warn('[Sync Error] Failed to refresh user profile on wheel completion:', err);
                });
        }
        
        addSystemLog(`Winner declared: ${displayName}`, 'Executed', 'SYSTEM_ENGINE', `+${data.winnerPool.toFixed(0)} Coins`);
        
        // Clean active state timeout
        setTimeout(() => {
            resetWheelUIElements();
            activeWheel = null;
            syncSpinSubview();
        }, 8000);
    }
    
    if (eventName === `wheelAborted-${wid}`) {
        clearInterval(eliminationCountInterval);
        resetWheelUIElements();
        activeWheel = null;
        syncSpinSubview();
        addSystemLog('Wheel aborted (Insufficient participants)', 'Refunded', 'SYSTEM_ENGINE', 'Restored');
        
        // Refresh balance from backend DB for the current user
        if (currentUser) {
            const userId = currentUser._id || currentUser.id;
            fetch(`${BACKEND_URL}/api/users/${userId}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Sync failed');
                })
                .then(freshUser => {
                    if (freshUser) {
                        currentUser = freshUser;
                        localStorage.setItem('roxstar_session', JSON.stringify(currentUser));
                        updateUserBalanceUI();
                    }
                })
                .catch(err => {
                    console.warn('[Sync Error] Failed to refresh user profile on wheel abort:', err);
                });
        }

        alert('Active wheel aborted due to insufficient players (< 3). All entry fees have been refunded.');
    }
});
