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

        if (currentUser.role === 'admin') {
            adminControls.classList.remove('hidden');
            playerControls.classList.add('hidden');
        } else {
            adminControls.classList.add('hidden');
            playerControls.classList.remove('hidden');
        }
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
        const isMe = currentUser && p.userId === currentUser._id;
        li.innerHTML = `<span>👤 ${isMe ? 'You' : p.userId.toString().slice(-6)}</span>`;
        
        participantList.appendChild(li);
    });
}

// Socket Events
socket.on('wheelStarted-undefined', () => { /* ignore */ });

// To receive events, we normally would join a room based on the wheel ID, but for simplicity we broadcast generically in this app.
// We need to dynamically listen to the active wheel's events.
// Instead of modifying the backend to send standard broadcast events without ID, we can intercept any event in socket.io client.
socket.onAny((eventName, ...args) => {
    if (!activeWheel) return;
    const wid = activeWheel._id;

    const data = args[0];

    if (eventName === `wheelStarted-${wid}`) {
        activeWheel.status = 'in_progress';
        activeWheel.participants = data.participants;
        addLog('Spin Wheel Started! Eliminations beginning...', 'warning');
        updateWheelUI();
    }
    
    if (eventName === `userEliminated-${wid}`) {
        const p = activeWheel.participants.find(part => part.userId === data.eliminatedUserId);
        if (p) {
            p.status = 'eliminated';
            const isMe = currentUser && p.userId === currentUser._id;
            addLog(`User ${isMe ? 'YOU' : p.userId.slice(-6)} was eliminated! Remaining: ${data.remaining}`, 'danger');
        }
        updateWheelUI();
    }
    
    if (eventName === `wheelCompleted-${wid}`) {
        activeWheel.status = 'completed';
        const isMe = currentUser && data.winnerId === currentUser._id;
        addLog(`Wheel Completed! Winner: ${isMe ? 'YOU' : data.winnerId.slice(-6)}. Prize: ${data.winnerPool.toFixed(2)} coins`, 'success');
        
        if (isMe) {
            currentUser.coinBalance += data.winnerPool;
            updateUI();
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
        
        // Return entry fee to user
        const p = activeWheel.participants.find(part => part.userId === currentUser?._id);
        if (p && currentUser) {
            currentUser.coinBalance += activeWheel.entryFee;
            updateUI();
        }
        updateWheelUI();
    }
});

// Initial greeting
addLog('System ready. Please login to continue.');
