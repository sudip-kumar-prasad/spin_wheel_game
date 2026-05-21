import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import User from '../models/User.js';
import SpinWheel from '../models/SpinWheel.js';
import Config from '../models/Config.js';
import Transaction from '../models/Transaction.js';

import {
  initializeWheel,
  joinWheel,
  startWheelManually,
  getActiveWheel,
  getConfig,
  updateConfig
} from '../controllers/spinWheelController.js';
import { getUserStats } from '../controllers/userController.js';

dotenv.config();

// Standard Request/Response Mock helper
const mockResponse = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

describe('Spin Wheel Game System Tests', () => {
  let adminUser;
  let standardUser1;
  let standardUser2;
  let standardUser3;

  before(async () => {
    // Connect to MongoDB Atlas (using a separate test database name inside the connection string if needed,
    // or appending/replacing database name)
    const originalUri = process.env.MONGO_URI || 'mongodb://localhost:27017/spin_wheel_game';
    let testUri = originalUri;
    
    // Replace the database name with spin_wheel_game_test to ensure isolation
    if (originalUri.includes('/spin_wheel_game?')) {
      testUri = originalUri.replace('/spin_wheel_game?', '/spin_wheel_game_test?');
    } else if (originalUri.includes('/spin_wheel_game')) {
      testUri = originalUri.replace('/spin_wheel_game', '/spin_wheel_game_test');
    }
    
    await mongoose.connect(testUri);
  });

  after(async () => {
    // Drop test database and close connection
    await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await SpinWheel.deleteMany({});
    await Config.deleteMany({});
    await Transaction.deleteMany({});

    // Seed test users
    adminUser = await User.create({
      username: 'TestAdmin',
      role: 'admin',
      coinBalance: 5000
    });

    standardUser1 = await User.create({
      username: 'Player1',
      role: 'user',
      coinBalance: 100
    });

    standardUser2 = await User.create({
      username: 'Player2',
      role: 'user',
      coinBalance: 20
    }); // low balance for test

    standardUser3 = await User.create({
      username: 'Player3',
      role: 'user',
      coinBalance: 1000
    });

    // Seed default config
    await Config.create({
      winnerPoolPercentage: 80,
      adminPoolPercentage: 10,
      appPoolPercentage: 10
    });
  });

  describe('2.1 Spin Wheel Lifecycle Tests', () => {
    
    test('Initialize Wheel: Only admins can create a spin wheel', async () => {
      // 1. Non-admin attempt
      const reqNonAdmin = {
        body: { adminId: standardUser1._id.toString(), entryFee: 50 }
      };
      const resNonAdmin = mockResponse();
      await initializeWheel(reqNonAdmin, resNonAdmin);
      
      assert.strictEqual(resNonAdmin.statusCode, 403);
      assert.strictEqual(resNonAdmin.body.message, 'Only admins can create a spin wheel');

      // 2. Admin attempt
      const mockIo = { emit: () => {} };
      const mockGameEngine = { scheduleWheelStart: () => {} };
      const reqAdmin = {
        body: { adminId: adminUser._id.toString(), entryFee: 50 },
        app: { get: (key) => key === 'io' ? mockIo : mockGameEngine }
      };
      const resAdmin = mockResponse();
      await initializeWheel(reqAdmin, resAdmin);
      
      assert.strictEqual(resAdmin.statusCode, 201);
      assert.strictEqual(resAdmin.body.status, 'waiting');
      assert.strictEqual(resAdmin.body.entryFee, 50);
    });

    test('Initialize Wheel: Only ONE active spin wheel at a time', async () => {
      // Create first wheel
      const mockIo = { emit: () => {} };
      const mockGameEngine = { scheduleWheelStart: () => {} };
      const req1 = {
        body: { adminId: adminUser._id.toString(), entryFee: 50 },
        app: { get: (key) => key === 'io' ? mockIo : mockGameEngine }
      };
      const res1 = mockResponse();
      await initializeWheel(req1, res1);
      assert.strictEqual(res1.statusCode, 201);

      // Try creating second wheel while first is active (status: waiting)
      const req2 = {
        body: { adminId: adminUser._id.toString(), entryFee: 100 }
      };
      const res2 = mockResponse();
      await initializeWheel(req2, res2);

      assert.strictEqual(res2.statusCode, 400);
      assert.strictEqual(res2.body.message, 'Only ONE active spin wheel at a time is allowed');
    });

    test('Join Wheel: Users pay entry fee to join', async () => {
      // Create wheel
      const wheel = await SpinWheel.create({
        adminId: adminUser._id,
        entryFee: 50,
        status: 'waiting'
      });

      const mockIo = { emit: () => {} };
      const reqJoin = {
        body: { wheelId: wheel._id.toString(), userId: standardUser1._id.toString() },
        app: { get: (key) => key === 'io' ? mockIo : null }
      };
      const resJoin = mockResponse();
      await joinWheel(reqJoin, resJoin);

      assert.strictEqual(resJoin.statusCode, 200);
      
      // Verify user coin balance reduced
      const updatedUser = await User.findById(standardUser1._id);
      assert.strictEqual(updatedUser.coinBalance, 50); // 100 - 50 = 50

      // Verify Transaction logged in database
      const tx = await Transaction.findOne({ userId: standardUser1._id });
      assert.ok(tx);
      assert.strictEqual(tx.amount, 50);
      assert.strictEqual(tx.type, 'debit');
      assert.strictEqual(tx.description, 'Spin Wheel Entry Fee');

      // Verify SpinWheel document pools updated
      const updatedWheel = await SpinWheel.findById(wheel._id);
      assert.strictEqual(updatedWheel.participants.length, 1);
      assert.strictEqual(updatedWheel.participants[0].userId.toString(), standardUser1._id.toString());
      assert.strictEqual(updatedWheel.winnerPool, 40); // 80% of 50
      assert.strictEqual(updatedWheel.adminPool, 5);  // 10% of 50
      assert.strictEqual(updatedWheel.appPool, 5);    // 10% of 50
    });

    test('Join Wheel: Block join if insufficient balance', async () => {
      const wheel = await SpinWheel.create({
        adminId: adminUser._id,
        entryFee: 50,
        status: 'waiting'
      });

      // User 2 only has 20 coins
      const reqJoin = {
        body: { wheelId: wheel._id.toString(), userId: standardUser2._id.toString() }
      };
      const resJoin = mockResponse();
      await joinWheel(reqJoin, resJoin);

      assert.strictEqual(resJoin.statusCode, 400);
      assert.strictEqual(resJoin.body.message, 'Insufficient coin balance or concurrent update failed');

      // Check balance is untouched
      const user = await User.findById(standardUser2._id);
      assert.strictEqual(user.coinBalance, 20);
    });

    test('Join Wheel: Block join if wheel in_progress or completed', async () => {
      const wheel = await SpinWheel.create({
        adminId: adminUser._id,
        entryFee: 50,
        status: 'in_progress'
      });

      const reqJoin = {
        body: { wheelId: wheel._id.toString(), userId: standardUser1._id.toString() }
      };
      const resJoin = mockResponse();
      await joinWheel(reqJoin, resJoin);

      assert.strictEqual(resJoin.statusCode, 400);
      assert.strictEqual(resJoin.body.message, 'Spin wheel is not accepting participants');
    });
  });

  describe('2.2 Coin Distribution System Tests', () => {

    test('Adjustable database-driven configuration splits must sum to 100', async () => {
      // 1. Get config
      const reqGet = {};
      const resGet = mockResponse();
      await getConfig(reqGet, resGet);
      assert.strictEqual(resGet.statusCode, 200);
      assert.strictEqual(resGet.body.winnerPoolPercentage, 80);

      // 2. Try invalid update config (sum !== 100)
      const reqInvalid = {
        body: {
          winnerPoolPercentage: 70,
          adminPoolPercentage: 10,
          appPoolPercentage: 10
        }
      };
      const resInvalid = mockResponse();
      await updateConfig(reqInvalid, resInvalid);
      assert.strictEqual(resInvalid.statusCode, 400); // throws validation error in save

      // 3. Valid update config (sum === 100)
      const reqValid = {
        body: {
          winnerPoolPercentage: 75,
          adminPoolPercentage: 15,
          appPoolPercentage: 10
        }
      };
      const resValid = mockResponse();
      await updateConfig(reqValid, resValid);
      assert.strictEqual(resValid.statusCode, 200);
      assert.strictEqual(resValid.body.winnerPoolPercentage, 75);
    });

    test('Entry Fee Split obeys Config', async () => {
      // Update config first
      await Config.findOneAndUpdate({}, {
        winnerPoolPercentage: 70,
        adminPoolPercentage: 20,
        appPoolPercentage: 10
      });

      const wheel = await SpinWheel.create({
        adminId: adminUser._id,
        entryFee: 100,
        status: 'waiting'
      });

      const reqJoin = {
        body: { wheelId: wheel._id.toString(), userId: standardUser1._id.toString() }
      };
      const resJoin = mockResponse();
      await joinWheel(reqJoin, resJoin);

      const updatedWheel = await SpinWheel.findById(wheel._id);
      assert.strictEqual(updatedWheel.winnerPool, 70); // 70% of 100
      assert.strictEqual(updatedWheel.adminPool, 20);  // 20% of 100
      assert.strictEqual(updatedWheel.appPool, 10);    // 10% of 100
    });

    test('Final Payout: Credit winner and admin correctly', async () => {
      const wheel = await SpinWheel.create({
        adminId: adminUser._id,
        entryFee: 100,
        status: 'in_progress',
        winnerPool: 80,
        adminPool: 10,
        appPool: 10,
        participants: [
          { userId: standardUser1._id, status: 'active' },
          { userId: standardUser2._id, status: 'eliminated' },
          { userId: standardUser3._id, status: 'eliminated' }
        ]
      });

      const mockIo = {
        emit: (eventName, data) => {
          assert.strictEqual(eventName, `wheelCompleted-${wheel._id}`);
          assert.strictEqual(data.winnerId.toString(), standardUser1._id.toString());
          assert.strictEqual(data.winnerPool, 80);
        }
      };

      const { startGameEngine } = await import('../socket/gameEngine.js');
      const gameEngine = startGameEngine(mockIo);
      await gameEngine.finishWheel(wheel._id, mockIo);

      // Verify winner coins increased
      const winner = await User.findById(standardUser1._id);
      assert.strictEqual(winner.coinBalance, 180); // 100 + 80 = 180

      // Verify admin coins increased
      const admin = await User.findById(adminUser._id);
      assert.strictEqual(admin.coinBalance, 5010); // 5000 + 10 = 5010

      // Verify Transactions are logged
      const txWinner = await Transaction.findOne({ userId: standardUser1._id, type: 'credit' });
      assert.ok(txWinner);
      assert.strictEqual(txWinner.amount, 80);
      assert.strictEqual(txWinner.description, 'Spin Wheel Winner Payout');

      const txAdmin = await Transaction.findOne({ userId: adminUser._id, type: 'credit' });
      assert.ok(txAdmin);
      assert.strictEqual(txAdmin.amount, 10);
      assert.strictEqual(txAdmin.description, 'Spin Wheel Admin Payout');

      // Verify wheel status updated to completed
      const updatedWheel = await SpinWheel.findById(wheel._id);
      assert.strictEqual(updatedWheel.status, 'completed');
      assert.strictEqual(updatedWheel.winnerId.toString(), standardUser1._id.toString());
    });
  });

  describe('2.4 Player Dashboard Stats Tests', () => {
    test('Get User Stats: calculate played, won, earned, spent, profit/loss correctly', async () => {
      // 1. Initial state (no games played)
      const reqInit = { params: { id: standardUser1._id.toString() } };
      const resInit = mockResponse();
      await getUserStats(reqInit, resInit);
      
      assert.strictEqual(resInit.statusCode, 200);
      assert.strictEqual(resInit.body.gamesPlayed, 0);
      assert.strictEqual(resInit.body.gamesWon, 0);
      assert.strictEqual(resInit.body.totalEarned, 0);
      assert.strictEqual(resInit.body.totalSpent, 0);
      assert.strictEqual(resInit.body.netProfitLoss, 0);
      assert.strictEqual(resInit.body.transactions.length, 0);

      // 2. Mock a game play entry fee transaction
      const dummyWheelId = new mongoose.Types.ObjectId();
      await Transaction.create({
        userId: standardUser1._id,
        spinWheelId: dummyWheelId,
        amount: 50,
        type: 'debit',
        description: 'Spin Wheel Entry Fee'
      });

      const reqPlayed = { params: { id: standardUser1._id.toString() } };
      const resPlayed = mockResponse();
      await getUserStats(reqPlayed, resPlayed);

      assert.strictEqual(resPlayed.statusCode, 200);
      assert.strictEqual(resPlayed.body.gamesPlayed, 1);
      assert.strictEqual(resPlayed.body.gamesWon, 0);
      assert.strictEqual(resPlayed.body.totalSpent, 50);
      assert.strictEqual(resPlayed.body.netProfitLoss, -50);
      assert.strictEqual(resPlayed.body.transactions.length, 1);

      // 3. Mock a refund (aborted wheel) for that same wheel
      await Transaction.create({
        userId: standardUser1._id,
        spinWheelId: dummyWheelId,
        amount: 50,
        type: 'credit',
        description: 'Refund: Wheel aborted'
      });

      const reqRefunded = { params: { id: standardUser1._id.toString() } };
      const resRefunded = mockResponse();
      await getUserStats(reqRefunded, resRefunded);

      // Since it was refunded, gamesPlayed should go back to 0, spent back to 0, netProfitLoss to 0
      assert.strictEqual(resRefunded.statusCode, 200);
      assert.strictEqual(resRefunded.body.gamesPlayed, 0);
      assert.strictEqual(resRefunded.body.totalSpent, 0);
      assert.strictEqual(resRefunded.body.netProfitLoss, 0);
      assert.strictEqual(resRefunded.body.transactions.length, 2);

      // 4. Mock a new game played + payout
      const secondWheelId = new mongoose.Types.ObjectId();
      await Transaction.create({
        userId: standardUser1._id,
        spinWheelId: secondWheelId,
        amount: 100,
        type: 'debit',
        description: 'Spin Wheel Entry Fee'
      });

      await Transaction.create({
        userId: standardUser1._id,
        spinWheelId: secondWheelId,
        amount: 250,
        type: 'credit',
        description: 'Spin Wheel Winner Payout'
      });

      const reqFinal = { params: { id: standardUser1._id.toString() } };
      const resFinal = mockResponse();
      await getUserStats(reqFinal, resFinal);

      assert.strictEqual(resFinal.statusCode, 200);
      assert.strictEqual(resFinal.body.gamesPlayed, 1); // 1 active game (second wheel), first wheel was refunded/ignored
      assert.strictEqual(resFinal.body.gamesWon, 1);
      assert.strictEqual(resFinal.body.totalEarned, 250);
      assert.strictEqual(resFinal.body.totalSpent, 100);
      assert.strictEqual(resFinal.body.netProfitLoss, 150); // 250 - 100
      assert.strictEqual(resFinal.body.transactions.length, 4);
    });

    test('Get User Stats: return 404 for non-existent user', async () => {
      const reqNotFound = { params: { id: new mongoose.Types.ObjectId().toString() } };
      const resNotFound = mockResponse();
      await getUserStats(reqNotFound, resNotFound);
      assert.strictEqual(resNotFound.statusCode, 404);
      assert.strictEqual(resNotFound.body.message, 'User not found');
    });
  });
});
