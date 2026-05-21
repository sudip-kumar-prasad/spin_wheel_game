# 🎡 Spin Wheel Game System — ROXSTAR Assessment

A **real-time multiplayer spin wheel game** built with Node.js, Express, Socket.io, MongoDB, and Vite. Players join by paying an entry fee in coins, compete in live elimination rounds, and the last standing player wins the prize pool.

---

## 📋 Table of Contents
1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Setup & Run Instructions](#setup--run-instructions)
4. [Environment Variables](#environment-variables)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [Real-Time Socket Events](#real-time-socket-events)
8. [Edge Cases Handled](#edge-cases-handled)
9. [Performance Considerations](#performance-considerations)
10. [Assumptions & Clarifications](#assumptions--clarifications)
11. [Test Coverage](#test-coverage)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                        │
│   Vite Dev Server :5173 — HTML + Vanilla CSS + app.js       │
│   Socket.io Client ←→ proxied to :3000 via Vite config      │
└───────────────────┬─────────────────────────────────────────┘
                    │  HTTP REST + WebSocket (proxied)
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND API  (Node.js / Express :3000)         │
│                                                             │
│  Routes: /api/users  /api/spin-wheels                       │
│                                                             │
│  ┌───────────────┐   ┌───────────────────────────────────┐ │
│  │  Controllers  │   │   Game Engine (Socket.io module)  │ │
│  │  - initWheel  │   │   - scheduleWheelStart (3 min)    │ │
│  │  - joinWheel  │   │   - startEliminationProcess (7s)  │ │
│  │  - startWheel │   │   - finishWheel                   │ │
│  │  - abortWheel │   │   - abortWheel                    │ │
│  │  - getConfig  │   └───────────────────────────────────┘ │
│  └───────────────┘                                          │
│                                                             │
│  Socket.io Server — broadcasts to ALL connected clients:    │
│   wheelDeployed | lobbyUpdated | wheelStarted               │
│   userEliminated | wheelCompleted | wheelAborted            │
└───────────────────┬─────────────────────────────────────────┘
                    │  Mongoose ODM
                    ▼
┌─────────────────────────────────────────────────────────────┐
│               MongoDB Atlas                                  │
│  Collections: users, spinwheels, transactions, configs      │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions
- **Separate Frontend & Backend servers** — Vite proxies `/api/*` and `/socket.io/*` to the Express server so the frontend always uses relative URLs (no hardcoded host:port).
- **Game Engine module** — All timed operations (3-min countdown, 7-sec elimination) live in `gameEngine.js` with per-wheel timeout/interval maps so timers are isolated and fully clearable on abort.
- **Config-driven parameters** — `autoStartTimeoutSec`, `eliminationIntervalSec`, and pool percentages are stored in MongoDB `Config` collection, never hardcoded. Any runtime change takes effect for the next wheel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (ES6 modules) |
| Dev Server | Vite 5 (proxy to backend) |
| Backend | Node.js 18+, Express 5 |
| Real-time | Socket.io 4 |
| Database | MongoDB Atlas via Mongoose 9 |
| Testing | Node.js built-in `node:test` runner |
| Process Mgmt | Nodemon (dev) |

---

## Setup & Run Instructions

### Prerequisites
- **Node.js v18+**
- **MongoDB Atlas** account (or local MongoDB instance)
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/sudip-kumar-prasad/spin_wheel_game.git
cd spin_wheel_game
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```
Edit `.env` and set your MongoDB connection string:
```env
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.xxx.mongodb.net/spin_wheel_game?retryWrites=true&w=majority
FRONTEND_ORIGIN=http://localhost:5173
```

### 3. Install All Dependencies
```bash
# Root/backend dependencies
npm install

# Frontend dependencies
cd frontend && npm install && cd ..
```

### 4. Run Both Servers (Development)

**Option A — Run separately (recommended for logs):**

Terminal 1 — Backend:
```bash
npm run dev
```
> Backend starts at `http://localhost:3000`

Terminal 2 — Frontend:
```bash
cd frontend && npm run dev
```
> Frontend starts at `http://localhost:5173`

**Option B — Run concurrently:**
```bash
npm run dev:full
```

### 5. Open the App
Navigate to **http://localhost:5173** in your browser.

#### Quick Multiplayer Test
1. Open **3 browser tabs** at `http://localhost:5173`
2. **Tab 1** → Login as `Admin` with role `Administrator (GM)` → Deploy a Spin Wheel
3. **Tab 2** → Login as `Alice` → Join the wheel
4. **Tab 3** → Login as `Bob` → Join the wheel
5. **Tab 1** → Login as `Charlie` → Join the wheel (or wait for a 4th tab)
6. Click **Start Wheel** or wait 3 minutes for auto-start

### 6. Run Tests
```bash
npm test
```
> Tests run against a separate `spin_wheel_game_test` database and self-cleanup after completion.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | ✅ | — | MongoDB connection string |
| `FRONTEND_ORIGIN` | ❌ | `*` | CORS allowed origin for Socket.io |
| `PORT` | ❌ | `3000` | Backend server port |

---

## Database Schema

### `users` Collection
```js
{
  _id:         ObjectId,
  username:    String (unique, required),
  role:        String (enum: ['admin', 'user'], default: 'user'),
  coinBalance: Number (default: 1000),
  createdAt:   Date,
  updatedAt:   Date
}
```

### `spinwheels` Collection
```js
{
  _id:                  ObjectId,
  adminId:              ObjectId → users,
  entryFee:             Number (required),
  status:               String (enum: ['waiting', 'in_progress', 'completed', 'aborted']),
  participants: [{
    userId:   ObjectId → users,
    status:   String (enum: ['active', 'eliminated'])
  }],
  eliminationSequence:  [ObjectId → users],   // shuffled order for eliminations
  winnerId:             ObjectId → users,
  startTime:            Date,
  winnerPool:           Number (cumulative, default: 0),
  adminPool:            Number (cumulative, default: 0),
  appPool:              Number (cumulative, default: 0),
  createdAt:            Date,
  updatedAt:            Date
}
```

### `transactions` Collection
```js
{
  _id:         ObjectId,
  userId:      ObjectId → users,
  spinWheelId: ObjectId → spinwheels,
  amount:      Number (required),
  type:        String (enum: ['debit', 'credit'], required),
  description: String (required),   // e.g. 'Spin Wheel Entry Fee', 'Spin Wheel Winner Payout'
  createdAt:   Date,
  updatedAt:   Date
}
```

### `configs` Collection
```js
{
  _id:                    ObjectId,
  winnerPoolPercentage:   Number (default: 80),   // % of each entry fee → winner pool
  adminPoolPercentage:    Number (default: 10),   // % of each entry fee → admin pool
  appPoolPercentage:      Number (default: 10),   // % of each entry fee → app pool
  entryFeeDefault:        Number (default: 50),   // suggested default for UI
  autoStartTimeoutSec:    Number (default: 180),  // 3 minutes
  eliminationIntervalSec: Number (default: 7),    // 7 seconds
  // Pre-save validation: winnerPool + adminPool + appPool MUST equal 100
  createdAt:              Date,
  updatedAt:              Date
}
```

---

## API Reference

### Users

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/users` | `{ username, role }` | Create or login a user |
| `GET` | `/api/users/:id` | — | Fetch user by ID |

### Spin Wheels

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/spin-wheels/initialize` | `{ adminId, entryFee }` | Admin creates a new spin wheel |
| `GET` | `/api/spin-wheels/active` | — | Get active wheel with populated participants |
| `POST` | `/api/spin-wheels/join` | `{ wheelId, userId }` | User pays entry fee and joins |
| `POST` | `/api/spin-wheels/start` | `{ wheelId, adminId }` | Admin manually starts the wheel |
| `POST` | `/api/spin-wheels/abort` | `{ wheelId, adminId }` | Admin aborts + auto-refunds all participants |
| `GET` | `/api/spin-wheels/config` | — | Get current pool split configuration |
| `POST` | `/api/spin-wheels/config` | `{ winnerPoolPercentage, adminPoolPercentage, appPoolPercentage }` | Update config (must sum to 100) |

---

## Real-Time Socket Events

All events are broadcast to **all connected clients** via Socket.io.

| Event Name | Direction | Payload | When |
|---|---|---|---|
| `wheelDeployed` | Server → All | `{ wheelId }` | New wheel created by admin |
| `lobbyUpdated-{wheelId}` | Server → All | `{ participants[], winnerPool, adminPool, appPool }` | A player joins the lobby |
| `wheelStarted-{wheelId}` | Server → All | `{ participants[] }` | Wheel starts (auto or manual) |
| `userEliminated-{wheelId}` | Server → All | `{ eliminatedUserId, remaining }` | Every 7 seconds during game |
| `wheelCompleted-{wheelId}` | Server → All | `{ winnerId, winnerPool }` | Last player wins |
| `wheelAborted-{wheelId}` | Server → All | `{ message }` | Wheel aborted (insufficient players or admin) |

---

## Edge Cases Handled

| # | Edge Case | Handling |
|---|---|---|
| 1 | **< 3 participants at auto-start** | Wheel auto-aborts, all entry fees refunded via `$inc` credit transactions |
| 2 | **Concurrent join race condition** | Coin deduction uses atomic `findOneAndUpdate` with `{ coinBalance: { $gte: entryFee } }` condition — if two users join simultaneously, only one will succeed if balance is marginal |
| 3 | **User joins with insufficient balance** | `findOneAndUpdate` returns `null` if balance < entryFee; returns `400` without modifying DB |
| 4 | **Admin tries to create second wheel while one is active** | `findOne({ status: { $in: ['waiting', 'in_progress'] } })` blocks creation with `400` |
| 5 | **User tries to join in-progress/completed wheel** | Status check blocks join with `400` |
| 6 | **User tries to join same wheel twice** | `participants.some()` check returns `400` |
| 7 | **Non-admin tries to start/abort/create wheel** | Role and ownership checks at every endpoint |
| 8 | **Wheel timer cleanup on abort** | `gameEngine.abortWheel()` clears both the `setTimeout` (auto-start) and `setInterval` (eliminations) for that wheel |
| 9 | **Config percentages don't sum to 100** | Mongoose pre-save hook throws validation error, API returns `400` |
| 10 | **No config in DB** | All endpoints auto-create default config if none exists |
| 11 | **Frontend disconnects during game** | On reconnect/refresh, `fetchActiveWheel()` restores state; socket re-subscribes automatically |
| 12 | **Winner/eliminated shown by real username** | Backend populates `participants.userId` before broadcasting `lobbyUpdated`, ensuring all clients always see real usernames |

---

## Performance Considerations

### 1. Atomic Coin Operations
All coin mutations use MongoDB's `$inc` operator with conditional filters — this is document-level atomic and prevents partial debit/credit. For strict multi-document ACID transactions, a MongoDB Replica Set with `session.startTransaction()` would be the production upgrade.

### 2. Indexed Queries
- `spinwheels.status` is queried on every join/initialize to check for active wheels. In production, adding `{ status: 1 }` index would optimize this.
- `users._id` and `spinwheels._id` are already indexed via MongoDB's default `_id` index.

### 3. Per-Wheel Timer Isolation
The game engine maintains separate `wheelTimeouts[wheelId]` and `eliminationIntervals[wheelId]` maps — so multiple historical wheels don't interfere, and aborting cleanly cancels only the target wheel's timers.

### 4. Populate on Demand
`participants.userId` is only populated (JOINed) when needed (active wheel fetch, join response, lobby broadcast) — not on every DB read, keeping default reads lean.

### 5. Socket.io Event Namespacing
Events are namespaced by `wheelId` (e.g. `userEliminated-{id}`) so clients only process events relevant to their active wheel. This avoids cross-wheel interference and reduces unnecessary UI re-renders.

### 6. Frontend Proxy Architecture
The Vite dev server proxies all API and socket calls to localhost:3000 — eliminating CORS preflight overhead and allowing zero-config absolute URL changes in production (just update the proxy target).

---

## Assumptions & Clarifications

| Topic | Assumption |
|---|---|
| **Authentication** | Simplified username-only auth (no password/JWT) for testing core game logic. In production, JWT middleware would be added to every protected route. |
| **Admin creation** | Users self-select their role at creation time. In production, admin role would be assigned by a super-admin or seeded. |
| **One wheel at a time** | The system enforces exactly one active (`waiting` or `in_progress`) wheel at any given time globally. |
| **Entry fee default** | The `entryFeeDefault` in Config is a UI suggestion only — admin can set any fee when deploying. |
| **Coin balance** | New users start with **1,000 coins** by default. |
| **Elimination sequence** | Generated once at wheel start using `Array.sort(() => 0.5 - Math.random())` — sufficient for a game of this scale. Production would use Fisher-Yates shuffle. |
| **App Pool** | The `appPool` accumulates in the SpinWheel document for accounting purposes but is not credited to any user — it represents platform revenue retained by the app. |
| **Frontend served separately** | The `public/` folder contains a legacy standalone version. The production frontend lives in `frontend/` and is served by Vite (dev) or a static host (prod). |

---

## Test Coverage

Tests use Node.js built-in `node:test` runner with a dedicated Atlas test database.

```bash
npm test
```

### Critical Path Tests

| Test | What's Verified |
|---|---|
| Only admins can create a wheel | 403 for non-admin, 201 for admin |
| Only ONE active wheel at a time | 400 on second create attempt |
| Users pay entry fee to join | Balance deducted, transaction logged, pool updated |
| Block join — insufficient balance | 400, balance untouched |
| Block join — wheel in_progress | 400 |
| Config percentages must sum to 100 | 400 on invalid split, 200 on valid |
| Entry fee split obeys config | Pool amounts match configured percentages |
