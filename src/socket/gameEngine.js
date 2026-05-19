import SpinWheel from '../models/SpinWheel.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

const SPIN_START_TIMEOUT = 3 * 60 * 1000;
const ELIMINATION_INTERVAL = 7 * 1000;
const MIN_PARTICIPANTS = 3;

const wheelTimeouts = {};
const eliminationIntervals = {};

export const startGameEngine = (io) => {
  return {
    async scheduleWheelStart(wheelId) {
      if (wheelTimeouts[wheelId]) return;

      wheelTimeouts[wheelId] = setTimeout(async () => {
        await this.startWheel(wheelId, io);
      }, SPIN_START_TIMEOUT);
    },

    async startWheel(wheelId, io) {
      clearTimeout(wheelTimeouts[wheelId]);
      
      const wheel = await SpinWheel.findById(wheelId).populate('participants.userId');
      if (!wheel || wheel.status !== 'waiting') return;

      if (wheel.participants.length < MIN_PARTICIPANTS) {
        wheel.status = 'aborted';
        await wheel.save();
        
        for (const p of wheel.participants) {
          const user = await User.findOneAndUpdate(
            { _id: p.userId },
            { $inc: { coinBalance: wheel.entryFee } },
            { new: true }
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

      eliminationIntervals[wheelId] = setInterval(async () => {
        const wheel = await SpinWheel.findById(wheelId);
        if (!wheel || wheel.status !== 'in_progress') {
          clearInterval(eliminationIntervals[wheelId]);
          return;
        }

        const activeParticipants = wheel.participants.filter(p => p.status === 'active');
        
        if (activeParticipants.length <= 1) {
          clearInterval(eliminationIntervals[wheelId]);
          await this.finishWheel(wheelId, io);
          return;
        }

        const eliminatedUserId = wheel.eliminationSequence[wheel.participants.length - activeParticipants.length];
        
        const participant = wheel.participants.find(p => p.userId.toString() === eliminatedUserId.toString());
        if (participant) {
          participant.status = 'eliminated';
        }
        
        await wheel.save();
        io.emit(`userEliminated-${wheelId}`, { eliminatedUserId, remaining: activeParticipants.length - 1 });

      }, ELIMINATION_INTERVAL);
    },

    async finishWheel(wheelId, io) {
      const wheel = await SpinWheel.findById(wheelId);
      if (!wheel) return;

      const winner = wheel.participants.find(p => p.status === 'active');
      if (!winner) return;

      wheel.status = 'completed';
      wheel.winnerId = winner.userId;
      await wheel.save();

      const winnerUser = await User.findOneAndUpdate(
        { _id: winner.userId },
        { $inc: { coinBalance: wheel.winnerPool } },
        { new: true }
      );
      const adminUser = await User.findOneAndUpdate(
        { _id: wheel.adminId },
        { $inc: { coinBalance: wheel.adminPool } },
        { new: true }
      );

      if (winnerUser) {
        await Transaction.create({
          userId: winnerUser.id,
          spinWheelId: wheel.id,
          amount: wheel.winnerPool,
          type: 'credit',
          description: 'Spin Wheel Winner Payout'
        });
      }

      if (adminUser) {
        await Transaction.create({
          userId: adminUser.id,
          spinWheelId: wheel.id,
          amount: wheel.adminPool,
          type: 'credit',
          description: 'Spin Wheel Admin Payout'
        });
      }

      io.emit(`wheelCompleted-${wheelId}`, { winnerId: winner.userId, winnerPool: wheel.winnerPool });
    }
  };
};
