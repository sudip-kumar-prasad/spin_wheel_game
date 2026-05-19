# Spin Wheel Game System - Roxstar Assessment Test

## 1. Overview
Design and implement a real-time multiplayer spin wheel game system. Users can create spin wheels, join them by paying an entry fee, and compete for prize pools. The system must handle concurrent users, ensure fair coin distribution, and provide real-time updates to all participants.

## 2. Core Functionality Requirements

### 2.1 Spin Wheel Lifecycle
**Initialize Spin Wheel**
* Only admins can create a spin wheel
* Only ONE active spin wheel at a time

**Join Spin Wheel**
* Users pay an entry fee in coins to join

**Start Spin Wheel**
* Auto-start after 3 minutes OR manual start by admin
* Minimum participants required: 3 users
* If < 3 participants after 3 minutes: auto-abort and refund
* Generate random elimination sequence

**Process Eliminations**
* Eliminate one user every 7 seconds
* Last remaining user wins
* Distribute coins to winner and admin

### 2.2 Coin Distribution System
**Entry Fee Distribution**
* When a user joins, distribute the entry fee according to configuration:
    * Winner Pool: X%
    * Admin Pool: Y%
    * App Pool: Z%
* Configuration should be database-driven and adjustable
* Track cumulative amounts in separate columns

**Final Payout**
* Credit winner with accumulated winner pool
* Credit admin with accumulated owner pool
* Record all transactions in database
* Ensure atomic coin operations (no partial credits/debits)
* Handle concurrent coin updates safely

### 2.3 Real-Time Communication
*(Requirements to be detailed)*

## 3. Deliverables

**Mandatory**
1. **Source Code**: Complete, runnable implementation on a Git Repository
2. **README.md**: Setup instructions and how to run
3. **Database Schema**: SQL migration scripts or schema definition
4. **Configuration**: Environment variables and config files

**Recommended**
5. **Architecture Diagram**: High-level system design
6. **Test Cases**: At least critical path coverage
7. **Edge Case Documentation**: List of edge cases handled
8. **Performance Considerations**: Document optimization decisions

## 4. Evaluation Criteria
**Code Quality**
* Clean, readable, maintainable code
* Proper error handling and logging
* Appropriate use of design patterns

**Problem Solving**
* Identification of edge cases
* Creative solutions to complex problems

## 5. Submission Guidelines
* Create a Git repository (GitHub)
* Commit regularly with meaningful messages
* Include comprehensive README
* Be prepared to:
    * Walk through code in a review session
    * Explain architectural decisions
    * Discuss alternative approaches considered
    * Defend edge case handling

## 6. Assumptions & Clarifications
* **Tech Stack**: Switched to modern ES6 Javascript (Node.js), Express, Mongoose, Socket.io.
* **Authentication**: A simplified User model is used without passwords. You simply provide `userId` to endpoints for ease of testing the core feature. In production, JWT auth would be standard.
* **Atomicity**: We utilized basic `$inc` MongoDB operations which offer document-level atomicity. For multi-document strict atomicity, MongoDB Replica Set sessions (`session.startTransaction()`) would be necessary, but this requires specific local setup, so we opted for document-level changes.
* **Real-time communication**: We use Socket.io to broadcast generic events (`wheelStarted`, `userEliminated`, `wheelCompleted`, `wheelAborted`) to all clients.

## 7. Setup & Run Instructions

### Prerequisites
* Node.js (v16+)
* MongoDB instance (Local or Atlas)

### Setup
1. Clone the repository and navigate into the folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and configure your `MONGO_URI`.
   ```bash
   cp .env.example .env
   ```

### Running the System
**Development mode**:
```bash
npm run dev
```

**Production start**:
```bash
npm start
```
