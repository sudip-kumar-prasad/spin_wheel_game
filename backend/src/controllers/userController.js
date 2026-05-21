import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import SpinWheel from '../models/SpinWheel.js';

export const createUser = async (req, res) => {
  try {
    const { username, role } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      // Mock login: just return the existing user
      return res.status(200).json(existingUser);
    }

    const user = new User({
      username,
      role: role || 'user',
      coinBalance: 1000
    });

    await user.save();
    return res.status(201).json(user);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const getUserStats = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find all transactions for this user, sorted by date descending
    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 });

    const entries = transactions.filter(t => t.description === 'Spin Wheel Entry Fee');
    const refunds = transactions.filter(t => t.description === 'Refund: Wheel aborted');
    const refundedWheelIds = new Set(refunds.map(r => r.spinWheelId?.toString()));
    
    const actualPlayedTransactions = entries.filter(e => !refundedWheelIds.has(e.spinWheelId?.toString()));
    const gamesPlayed = actualPlayedTransactions.length;

    const wins = transactions.filter(t => t.description === 'Spin Wheel Winner Payout');
    const gamesWon = wins.length;
    const totalEarned = wins.reduce((sum, t) => sum + t.amount, 0);
    const totalSpent = actualPlayedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const netProfitLoss = totalEarned - totalSpent;

    return res.status(200).json({
      gamesPlayed,
      gamesWon,
      totalEarned,
      totalSpent,
      netProfitLoss,
      transactions: transactions.slice(0, 20)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const getAdminStats = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get all wheels created by this admin
    const allWheels = await SpinWheel.find({ adminId: userId });
    const completedWheels = allWheels.filter(w => w.status === 'completed');
    const abortedWheels = allWheels.filter(w => w.status === 'aborted');

    const totalGamesHosted = allWheels.length;
    const completedGames = completedWheels.length;
    const abortedGames = abortedWheels.length;
    const activeGames = allWheels.filter(w => w.status === 'waiting' || w.status === 'in_progress').length;

    const totalWinnerPoolDistributed = completedWheels.reduce((sum, w) => sum + w.winnerPool, 0);
    const totalAdminPoolEarned = completedWheels.reduce((sum, w) => sum + w.adminPool, 0);
    const totalAppPoolCollected = completedWheels.reduce((sum, w) => sum + w.appPool, 0);
    const totalPlayersServed = completedWheels.reduce((sum, w) => sum + w.participants.length, 0);
    const totalEntryFeesCollected = completedWheels.reduce((sum, w) => sum + (w.entryFee * w.participants.length), 0);

    // Get admin transactions for the audit ledger
    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 });

    return res.status(200).json({
      totalGamesHosted,
      completedGames,
      abortedGames,
      activeGames,
      totalWinnerPoolDistributed,
      totalAdminPoolEarned,
      totalAppPoolCollected,
      totalPlayersServed,
      totalEntryFeesCollected,
      coinBalance: user.coinBalance,
      transactions: transactions.slice(0, 30)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};
