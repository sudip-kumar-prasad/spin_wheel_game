import SpinWheel from '../models/SpinWheel.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Config from '../models/Config.js';

const MIN_PARTICIPANTS = 3;

const wheelTimeouts = {};
const eliminationIntervals = {};

export const startGameEngine = (io) => {
  return {
    async scheduleWheelStart(wheelId) {
      if (wheelTimeouts[wheelId]) return;

      let config = await Config.findOne();
      if (!config) {
        config = new Config();
        await config.save();
      }
      const timeoutMs = config.autoStartTimeoutSec * 1000;

      wheelTimeouts[wheelId] = setTimeout(async () => {
        await this.startWheel(wheelId, io);
      }, timeoutMs);
    },

    async startWheel(wheelId, io) {
      if (wheelTimeouts[wheelId]) {
        clearTimeout(wheelTimeouts[wheelId]);
        delete wheelTimeouts[wheelId];
      }
      
      const wheel = await SpinWheel.findById(wheelId).populate('participants.userId');
      if (!wheel || wheel.status !== 'waiting') return;

      if (wheel.participants.length < MIN_PARTICIPANTS) {
        wheel.status = 'aborted';
        await wheel.save();
        
        for (const p of wheel.participants) {
          const pUserId = (p.userId && typeof p.userId === 'object') ? (p.userId._id || p.userId.id) : p.userId;
          const user = await User.findOneAndUpdate(
            { _id: pUserId },
            { $inc: { coinBalance: wheel.entryFee } },
            { returnDocument: 'after' }
          );
          if (user) {
            await Transaction.create({
              userId: user.id,
              spinWheelId: wheel.id,
              amount: wheel.entryFee,
              type: 'credit',
              description: 'Refund: Wheel aborted'
            });
          }
        }
        
        io.emit(`wheelAborted-${wheelId}`, { message: 'Not enough participants. Entry fees refunded.' });
        return;
      }

      wheel.status = 'in_progress';
      wheel.startTime = new Date();
      
      const shuffledParticipants = wheel.participants.map(p => p.userId).sort(() => 0.5 - Math.random());
      wheel.eliminationSequence = shuffledParticipants;
      
      await wheel.save();
      io.emit(`wheelStarted-${wheelId}`, { message: 'Wheel has started!', participants: wheel.participants });

      this.startEliminationProcess(wheel.id, io);
    },

    async startEliminationProcess(wheelId, io) {
      if (eliminationIntervals[wheelId]) return;

      let config = await Config.findOne();
      if (!config) {
        config = new Config();
        await config.save();
      }
      const intervalMs = config.eliminationIntervalSec * 1000;

      eliminationIntervals[wheelId] = setInterval(async () => {
        const wheel = await SpinWheel.findById(wheelId);
        if (!wheel || wheel.status !== 'in_progress') {
          clearInterval(eliminationIntervals[wheelId]);
          delete eliminationIntervals[wheelId];
          return;
        }

        const activeParticipants = wheel.participants.filter(p => p.status === 'active');
        
        if (activeParticipants.length <= 1) {
          clearInterval(eliminationIntervals[wheelId]);
          delete eliminationIntervals[wheelId];
          await this.finishWheel(wheelId, io);
          return;
        }

        const eliminatedUserId = wheel.eliminationSequence[wheel.participants.length - activeParticipants.length];
        
        const participant = wheel.participants.find(p => p.userId.toString() === eliminatedUserId.toString());
        if (participant) {
          participant.status = 'eliminated';
        }
        
        await wheel.save();
        const eliminatedUserIdStr = eliminatedUserId.toString();
        io.emit(`userEliminated-${wheelId}`, { eliminatedUserId: eliminatedUserIdStr, remaining: activeParticipants.length - 1 });

      }, intervalMs);
    },

    async finishWheel(wheelId, io) {
      const wheel = await SpinWheel.findById(wheelId);
      if (!wheel) {
        console.error(`[GameEngine] finishWheel error: wheel ${wheelId} not found`);
        return;
      }

      const winner = wheel.participants.find(p => p.status === 'active');
      if (!winner) {
        console.error(`[GameEngine] finishWheel error: no active winner found for wheel ${wheelId}`);
        return;
      }

      const winnerUserId = (winner.userId && typeof winner.userId === 'object') ? (winner.userId._id || winner.userId.id) : winner.userId;
      const winnerUserIdStr = winnerUserId.toString();
      
      const adminUserId = (wheel.adminId && typeof wheel.adminId === 'object') ? (wheel.adminId._id || wheel.adminId.id) : wheel.adminId;
      const adminUserIdStr = adminUserId.toString();

      console.log(`[GameEngine] Declaring winner! WheelId: ${wheelId}, WinnerUserId: ${winnerUserIdStr}, WinnerPool: ${wheel.winnerPool}, AdminUserId: ${adminUserIdStr}, AdminPool: ${wheel.adminPool}`);

      wheel.status = 'completed';
      wheel.winnerId = winnerUserId;
      await wheel.save();

      const winnerUser = await User.findOneAndUpdate(
        { _id: winnerUserId },
        { $inc: { coinBalance: wheel.winnerPool } },
        { returnDocument: 'after' }
      );
      const adminUser = await User.findOneAndUpdate(
        { _id: adminUserId },
        { $inc: { coinBalance: wheel.adminPool } },
        { returnDocument: 'after' }
      );

      if (winnerUser) {
        console.log(`[GameEngine] Winner coinBalance updated to ${winnerUser.coinBalance}`);
        await Transaction.create({
          userId: winnerUser.id,
          spinWheelId: wheel.id,
          amount: wheel.winnerPool,
          type: 'credit',
          description: 'Spin Wheel Winner Payout'
        });
      } else {
        console.error(`[GameEngine] Failed to update winner coin balance for ${winnerUserIdStr}`);
      }

      if (adminUser) {
        console.log(`[GameEngine] Admin coinBalance updated to ${adminUser.coinBalance}`);
        await Transaction.create({
          userId: adminUser.id,
          spinWheelId: wheel.id,
          amount: wheel.adminPool,
          type: 'credit',
          description: 'Spin Wheel Admin Payout'
        });
      } else {
        console.error(`[GameEngine] Failed to update admin coin balance for ${adminUserIdStr}`);
      }

      io.emit(`wheelCompleted-${wheelId}`, { winnerId: winnerUserIdStr, winnerPool: wheel.winnerPool });
    },

    abortWheel(wheelId) {
      if (wheelTimeouts[wheelId]) {
        clearTimeout(wheelTimeouts[wheelId]);
        delete wheelTimeouts[wheelId];
      }
      if (eliminationIntervals[wheelId]) {
        clearInterval(eliminationIntervals[wheelId]);
        delete eliminationIntervals[wheelId];
      }
    }
  };
};
