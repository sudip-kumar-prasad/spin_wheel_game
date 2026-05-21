const socket = io();

// State
let currentUser = null;
let activeWheel = null;

// DOM Elements
const authBox = document.getElementById('auth-box');
const userInfo = document.getElementById('user-info');
const currentUsername = document.getElementById('current-username');
const currentRole = document.getElementById('current-role');
const currentCoins = document.getElementById('current-coins');

const adminControls = document.getElementById('admin-controls');
const playerControls = document.getElementById('player-controls');
const displayFee = document.getElementById('display-fee');

const wheelStatusBadge = document.getElementById('wheel-status-badge');
const wheel = document.getElementById('wheel');
const wheelCenterText = document.getElementById('wheel-center-text');
const participantList = document.getElementById('participant-list');
const participantCount = document.getElementById('participant-count');

const eventLogs = document.getElementById('event-logs');

// Helper to log events
function addLog(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = `log-item ${type}`;
    
    const time = new Date().toLocaleTimeString();
    logItem.innerHTML = `<span class="log-time">${time}</span>${message}`;
    
    eventLogs.prepend(logItem);
}

// User Auth Flow
document.getElementById('btn-create-user').addEventListener('click', async () => {
    const username = document.getElementById('username-input').value;
    const role = document.getElementById('role-input').value;

    if (!username) return alert('Enter a username');

    try {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, role })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message);

        currentUser = data;
        updateUI();
        addLog(`Successfully logged in as ${username} (${role})`, 'success');
    } catch (err) {
        // If user already exists, let's just pretend to login by not handling proper auth
        addLog(`Login error: ${err.message}`, 'error');
        if (err.message === 'User already exists') {
            alert('User exists! For testing, try a different username.');
        }
    }
});

function updateUI() {
    if (currentUser) {
        authBox.classList.add('hidden');
        userInfo.classList.remove('hidden');
        
        currentUsername.textContent = currentUser.username;
        currentRole.textContent = currentUser.role;
        currentRole.className = `badge ${currentUser.role}`;
        currentCoins.textContent = currentUser.coinBalance.toFixed(2);

        const statsBox = document.getElementById('player-stats-box');
        if (currentUser.role === 'admin') {
            adminControls.classList.remove('hidden');
            playerControls.classList.add('hidden');
            if (statsBox) statsBox.classList.add('hidden');
        } else {
            adminControls.classList.add('hidden');
            playerControls.classList.remove('hidden');
            if (statsBox) statsBox.classList.remove('hidden');
            fetchPlayerStats();
        }

        fetchActiveWheel();
    }
}

async function fetchPlayerStats() {
    if (!currentUser || currentUser.role !== 'user') return;
    try {
        const res = await fetch(`/api/users/${currentUser._id}/stats`);
        if (!res.ok) throw new Error('Failed to fetch player stats');
        
        const stats = await res.json();
        
        const playedEl = document.getElementById('player-stats-played');
        const wonEl = document.getElementById('player-stats-won');
        const earnedEl = document.getElementById('player-stats-earned');
        const profitEl = document.getElementById('player-stats-profit');
        const logsList = document.getElementById('player-logs-list');
        
        if (playedEl) playedEl.textContent = stats.gamesPlayed;
        if (wonEl) wonEl.textContent = stats.gamesWon;
        if (earnedEl) earnedEl.textContent = stats.totalEarned.toFixed(2);
        
        if (profitEl) {
            const val = stats.netProfitLoss;
            profitEl.textContent = (val >= 0 ? '+' : '') + val.toFixed(2);
            profitEl.style.color = val > 0 ? '#00e676' : val < 0 ? '#ff1744' : '';
        }
        
        if (logsList) {
            logsList.innerHTML = '';
            if (!stats.transactions || stats.transactions.length === 0) {
                logsList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 1rem;">No transactions yet.</div>';
            } else {
                stats.transactions.forEach(t => {
                    const div = document.createElement('div');
                    div.style.padding = '0.4rem 0';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    
                    const isCredit = t.type === 'credit';
                    const amountText = (isCredit ? '+' : '-') + t.amount.toFixed(2);
                    const color = isCredit ? '#00e676' : '#ff1744';
                    
                    div.innerHTML = `
                        <span style="color: var(--text-main);">${t.description}</span>
                        <span style="color: ${color}; font-weight: bold;">${amountText}</span>
                    `;
                    logsList.appendChild(div);
                });
            }
        }
    } catch (e) {
        console.error('Error fetching player stats:', e);
    }
}

async function fetchActiveWheel() {
    try {
        const res = await fetch('/api/spin-wheels/active');
        if (res.ok) {
            const data = await res.json();
            activeWheel = data;
            updateWheelUI();
        } else {
            activeWheel = null;
            updateWheelUI();
        }
    } catch (error) {
        console.error('Error fetching active wheel', error);
    }
}

// Admin Initialize Wheel
document.getElementById('btn-init-wheel').addEventListener('click', async () => {
    const fee = document.getElementById('entry-fee').value;
    
    try {
        const res = await fetch('/api/spin-wheels/initialize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId: currentUser._id, entryFee: Number(fee) })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message);
        
        activeWheel = data;
        addLog(`Spin wheel initialized. Entry fee: ${fee} coins.`, 'success');
        updateWheelUI();
    } catch (err) {
        addLog(err.message, 'error');
    }
});

// Manual start button (admin)
document.getElementById('dash-btn-start')?.addEventListener('click', async () => {
    if (!activeWheel) return alert('No wheel to start');
    try {
        const res = await fetch('/api/spin-wheels/startManual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wheelId: activeWheel._id, adminId: currentUser._id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        addLog('Wheel manually started.', 'success');
    } catch (err) {
        addLog(err.message, 'error');
    }
});

// Abort button (admin)
document.getElementById('dash-btn-abort')?.addEventListener('click', async () => {
    if (!activeWheel) return alert('No wheel to abort');
    try {
        const res = await fetch('/api/spin-wheels/abort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wheelId: activeWheel._id, adminId: currentUser._id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        addLog('Wheel aborted.', 'success');
    } catch (err) {
        addLog(err.message, 'error');
    }
});

// Player Join Wheel
document.getElementById('btn-join-wheel').addEventListener('click', async () => {
    if (!activeWheel) return alert('No active wheel to join');
    
    try {
        const res = await fetch('/api/spin-wheels/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wheelId: activeWheel._id, userId: currentUser._id })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.message);
        
        activeWheel = data.wheel;
        currentUser.coinBalance -= activeWheel.entryFee;
        updateUI();
        
        addLog(`Joined spin wheel for ${activeWheel.entryFee} coins.`, 'success');
    } catch (err) {
        addLog(err.message, 'error');
    }
});

function updateWheelUI() {
    if (!activeWheel) return;

    displayFee.textContent = activeWheel.entryFee;
    
    if (activeWheel.status === 'waiting') {
        wheelStatusBadge.textContent = 'Waiting for Players...';
        wheelStatusBadge.className = 'badge warning';
        wheel.classList.remove('spinning');
        wheelCenterText.textContent = 'Join Now';
    } else if (activeWheel.status === 'in_progress') {
        wheelStatusBadge.textContent = 'In Progress';
        wheelStatusBadge.className = 'badge primary';
        wheel.classList.add('spinning');
        wheelCenterText.textContent = 'Spinning...';
    } else if (activeWheel.status === 'completed') {
        wheelStatusBadge.textContent = 'Completed';
        wheelStatusBadge.className = 'badge success';
        wheel.classList.remove('spinning');
        wheelCenterText.textContent = 'Winner!';
    } else if (activeWheel.status === 'aborted') {
        wheelStatusBadge.textContent = 'Aborted (Refunded)';
        wheelStatusBadge.className = 'badge danger';
        wheel.classList.remove('spinning');
        wheelCenterText.textContent = 'Aborted';
    }

    renderParticipants();
}

function renderParticipants() {
    participantList.innerHTML = '';
    const participants = activeWheel?.participants || [];
    participantCount.textContent = participants.length;

    participants.forEach(p => {
        const li = document.createElement('li');
        li.className = `participant-card ${p.status === 'eliminated' ? 'eliminated' : ''}`;
        
        // Since we don't have username populated in all responses in the basic API, 
        // we'll display ID or 'You' if it's the current user.
        const pUserIdStr = (p.userId && typeof p.userId === 'object') ? (p.userId._id || p.userId.id) : p.userId;
        const isMe = currentUser && String(pUserIdStr) === String(currentUser._id);
        
        let displayName = 'Player';
        if (isMe) {
            displayName = 'You';
        } else if (p.userId && typeof p.userId === 'object' && p.userId.username) {
            displayName = p.userId.username;
        } else if (pUserIdStr) {
            displayName = String(pUserIdStr).slice(-6);
        }

        li.innerHTML = `<span>👤 ${displayName}</span>`;
        
        participantList.appendChild(li);
    });
}

// Socket Events
// Fetch configuration from backend and initialize UI elements
async function loadConfig() {
  try {
    const res = await fetch('http://localhost:3000/api/config');
    if (!res.ok) throw new Error('Failed to load config');
    const cfg = await res.json();
    // Set entry fee default
    const feeInput = document.getElementById('dash-input-fee');
    if (feeInput) feeInput.value = cfg.entryFeeDefault;
    // Set winner split slider and label
    const winnerSlider = document.getElementById('dash-slider-winner');
    const winnerLabel = document.getElementById('dash-label-winner');
    if (winnerSlider && winnerLabel) {
      winnerSlider.min = 50; // keep logical min
      winnerSlider.max = 85; // keep logical max
      winnerSlider.value = cfg.winnerPoolPercentage;
      winnerLabel.textContent = `${cfg.winnerPoolPercentage}%`;
    }
    // Set admin and app split (readonly inputs)
    const adminInput = document.getElementById('dash-input-admin');
    const appInput = document.getElementById('dash-input-app');
    if (adminInput) adminInput.value = cfg.adminPoolPercentage;
    if (appInput) appInput.value = cfg.appPoolPercentage;
    // Set auto‑start timer display (convert seconds to mm:ss)
    const timerDisplay = document.getElementById('lobby-timer-clock');
    if (timerDisplay) {
      const mins = String(Math.floor(cfg.autoStartTimeoutSec / 60)).padStart(2, '0');
      const secs = String(cfg.autoStartTimeoutSec % 60).padStart(2, '0');
      timerDisplay.textContent = `${mins}:${secs}`;
    }
    // Store elimination interval for later use (if needed elsewhere)
    window.ELIMINATION_INTERVAL_MS = cfg.eliminationIntervalSec * 1000;
  } catch (e) {
    console.error('Config load error:', e);
  }
}

// Call loadConfig after establishing socket
socket.on('connect', () => {
  console.log('Socket connected');
  loadConfig();
});

socket.on('wheelStarted-undefined', () => { /* ignore */ });

// To receive events, we normally would join a room based on the wheel ID, but for simplicity we broadcast generically in this app.
// We need to dynamically listen to the active wheel's events.
// Instead of modifying the backend to send standard broadcast events without ID, we can intercept any event in socket.io client.
socket.onAny((eventName, ...args) => {
    const data = args[0];

    // ── wheelDeployed — new wheel created by admin ──
    if (eventName === 'wheelDeployed') {
        fetchActiveWheel();
        addLog('A new spin wheel has been deployed!', 'success');
        return;
    }

    // ── lobbyUpdated — player joined, pools changed ──
    if (activeWheel && eventName === `lobbyUpdated-${activeWheel._id}`) {
        activeWheel.participants = data.participants;
        activeWheel.winnerPool  = data.winnerPool;
        activeWheel.adminPool   = data.adminPool;
        activeWheel.appPool     = data.appPool;
        addLog(`Player joined! ${data.participants.length} now in lobby. Winner Pool: ${Math.round(data.winnerPool)}`, 'info');
        updateWheelUI();
        return;
    }

    if (!activeWheel) return;
    const wid = activeWheel._id;

    if (eventName === `wheelStarted-${wid}`) {
        activeWheel.status = 'in_progress';
        activeWheel.participants = data.participants;
        addLog('Spin Wheel Started! Eliminations beginning...', 'warning');
        updateWheelUI();
        // Refresh balance (entry fees already deducted)
        if (currentUser) {
            fetch(`/api/users/${currentUser._id}`)
                .then(res => res.ok ? res.json() : null)
                .then(u => { if (u) { currentUser = u; updateUI(); } })
                .catch(() => {});
        }
    }
    
    if (eventName === `userEliminated-${wid}`) {
        const p = activeWheel.participants.find(part => {
            const uid = (part.userId && typeof part.userId === 'object') ? (part.userId._id || part.userId.id) : part.userId;
            return uid && uid.toString() === data.eliminatedUserId.toString();
        });
        if (p) {
            p.status = 'eliminated';
            const pUserIdStr = (p.userId && typeof p.userId === 'object') ? (p.userId._id || p.userId.id) : p.userId;
            const isMe = currentUser && String(pUserIdStr) === String(currentUser._id);
            addLog(`User ${isMe ? 'YOU' : String(pUserIdStr).slice(-6)} was eliminated! Remaining: ${data.remaining}`, 'danger');
        }
        updateWheelUI();
    }
    
    if (eventName === `wheelCompleted-${wid}`) {
        activeWheel.status = 'completed';
        const isMe = currentUser && String(data.winnerId) === String(currentUser._id);
        addLog(`Wheel Completed! Winner: ${isMe ? 'YOU' : String(data.winnerId).slice(-6)}. Prize: ${data.winnerPool.toFixed(2)} coins`, 'success');
        
        // Refresh balance from backend DB for the current user
        if (currentUser) {
            fetch(`/api/users/${currentUser._id}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Sync failed');
                })
                .then(freshUser => {
                    if (freshUser) {
                        currentUser = freshUser;
                        updateUI();
                    }
                })
                .catch(err => console.warn('[Sync Error] Failed to refresh user profile:', err));
        }

        if (isMe) {
            wheelCenterText.textContent = 'YOU WIN!';
        } else {
            wheelCenterText.textContent = 'Game Over';
        }
        wheel.classList.remove('spinning');
        updateWheelUI();
    }
    
    if (eventName === `wheelAborted-${wid}`) {
        activeWheel.status = 'aborted';
        addLog(data.message, 'danger');
        
        // Refresh balance from backend DB for the current user
        if (currentUser) {
            fetch(`/api/users/${currentUser._id}`)
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Sync failed');
                })
                .then(freshUser => {
                    if (freshUser) {
                        currentUser = freshUser;
                        updateUI();
                    }
                })
                .catch(err => console.warn('[Sync Error] Failed to refresh user profile:', err));
        }
        updateWheelUI();
    }
});

// Initial greeting
addLog('System ready. Please login to continue.');
