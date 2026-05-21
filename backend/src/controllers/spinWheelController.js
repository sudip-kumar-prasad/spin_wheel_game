import SpinWheel from '../models/SpinWheel.js';
import User from '../models/User.js';
import Config from '../models/Config.js';
import Transaction from '../models/Transaction.js';

export const initializeWheel = async (req, res) => {
  try {
    const { adminId, entryFee } = req.body;

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create a spin wheel' });
    }

    const activeWheel = await SpinWheel.findOne({
      status: { $in: ['waiting', 'in_progress'] }
    });

    if (activeWheel) {
      return res.status(400).json({ message: 'Only ONE active spin wheel at a time is allowed' });
    }

    const newWheel = new SpinWheel({
      adminId,
      entryFee,
      status: 'waiting',
      participants: [],
      eliminationSequence: [],
      winnerPool: 0,
      adminPool: 0,
      appPool: 0
    });

    await newWheel.save();

    let config = await Config.findOne();
    if (!config) {
      config = new Config();
      await config.save();
    }

    const gameEngine = req.app.get('gameEngine');
    gameEngine.scheduleWheelStart(newWheel.id);

    // Notify all clients that a new wheel has been deployed
    const io = req.app.get('io');
    if (io) {
      io.emit('wheelDeployed', { wheelId: newWheel.id });
    }

    return res.status(201).json(newWheel);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const getActiveWheel = async (req, res) => {
  try {
    const activeWheel = await SpinWheel.findOne({
      status: { $in: ['waiting', 'in_progress'] }
    }).populate('participants.userId');
    
    if (!activeWheel) {
      return res.status(404).json({ message: 'No active wheel found' });
    }
    
    return res.status(200).json(activeWheel);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const startWheelManually = async (req, res) => {
  try {
    const { wheelId, adminId } = req.body;
    
    const wheel = await SpinWheel.findById(wheelId);
    if (!wheel) return res.status(404).json({ message: 'Wheel not found' });
    
    if (wheel.adminId.toString() !== adminId) {
      return res.status(403).json({ message: 'Only the admin who created the wheel can start it manually' });
    }

    if (wheel.status !== 'waiting') {
      return res.status(400).json({ message: 'Wheel is already started or finished' });
    }

    const gameEngine = req.app.get('gameEngine');
    const io = req.app.get('io');
    
    await gameEngine.startWheel(wheel.id, io);
    
    return res.status(200).json({ message: 'Wheel start triggered manually' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const abortWheel = async (req, res) => {
  try {
    const { wheelId, adminId } = req.body;
    const wheel = await SpinWheel.findById(wheelId);
    if (!wheel) return res.status(404).json({ message: 'Wheel not found' });
    if (wheel.adminId.toString() !== adminId) {
      return res.status(403).json({ message: 'Only admin can abort' });
    }
    // Refund participants
    for (const p of wheel.participants) {
      await User.findOneAndUpdate({ _id: p.userId }, { $inc: { coinBalance: wheel.entryFee } }, { returnDocument: 'after' });
      await Transaction.create({ userId: p.userId, spinWheelId: wheel.id, amount: wheel.entryFee, type: 'credit', description: 'Refund: Wheel aborted' });
    }
    wheel.status = 'aborted';
    await wheel.save();
    
    const gameEngine = req.app.get('gameEngine');
    gameEngine.abortWheel(wheel.id);

    const io = req.app.get('io');
    io.emit(`wheelAborted-${wheelId}`, { message: 'Wheel aborted by admin, fees refunded' });
    return res.status(200).json({ message: 'Wheel aborted' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const startWheel = async (req, res) => {
  try {
    const { wheelId, adminId } = req.body;
    const wheel = await SpinWheel.findById(wheelId);
    if (!wheel) return res.status(404).json({ message: 'Wheel not found' });
    if (wheel.adminId.toString() !== adminId) {
      return res.status(403).json({ message: 'Only admin can start' });
    }
    const gameEngine = req.app.get('gameEngine');
    const io = req.app.get('io');
    await gameEngine.startWheel(wheel.id, io);
    return res.status(200).json({ message: 'Wheel started manually' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const joinWheel = async (req, res) => {
  try {
    const { wheelId, userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const wheel = await SpinWheel.findById(wheelId);
    if (!wheel) return res.status(404).json({ message: 'Spin wheel not found' });

    if (wheel.status !== 'waiting') {
      return res.status(400).json({ message: 'Spin wheel is not accepting participants' });
    }

    const alreadyJoined = wheel.participants.some(p => p.userId.toString() === userId);
    if (alreadyJoined) {
      return res.status(400).json({ message: 'User already joined this spin wheel' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, coinBalance: { $gte: wheel.entryFee } },
      { $inc: { coinBalance: -wheel.entryFee } },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return res.status(400).json({ message: 'Insufficient coin balance or concurrent update failed' });
    }

    await Transaction.create({
      userId: user.id,
      spinWheelId: wheel.id,
      amount: wheel.entryFee,
      type: 'debit',
      description: 'Spin Wheel Entry Fee',
    });

    let config = await Config.findOne();
    if (!config) {
      config = new Config();
      await config.save();
    }

    const winnerShare = (wheel.entryFee * config.winnerPoolPercentage) / 100;
    const adminShare = (wheel.entryFee * config.adminPoolPercentage) / 100;
    const appShare = (wheel.entryFee * config.appPoolPercentage) / 100;

    wheel.winnerPool += winnerShare;
    wheel.adminPool += adminShare;
    wheel.appPool += appShare;

    wheel.participants.push({ userId: user.id, status: 'active' });
    await wheel.save();

    const populatedWheel = await SpinWheel.findById(wheel._id).populate('participants.userId');

    // Broadcast lobby update to ALL connected clients so the participant list
    // refreshes in real-time with the joined player's real username
    const io = req.app.get('io');
    if (io) {
      io.emit(`lobbyUpdated-${wheel._id}`, {
        participants: populatedWheel.participants,
        winnerPool: populatedWheel.winnerPool,
        adminPool: populatedWheel.adminPool,
        appPool: populatedWheel.appPool,
      });
    }

    return res.status(200).json({ message: 'Successfully joined spin wheel', wheel: populatedWheel });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const getConfig = async (req, res) => {
  try {
    let config = await Config.findOne();
    if (!config) {
      config = new Config();
      await config.save();
    }
    return res.status(200).json(config);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
  }
};

export const updateConfig = async (req, res) => {
  try {
    const { winnerPoolPercentage, adminPoolPercentage, appPoolPercentage } = req.body;
    let config = await Config.findOne();
    if (!config) {
      config = new Config();
    }
    config.winnerPoolPercentage = Number(winnerPoolPercentage);
    config.adminPoolPercentage = Number(adminPoolPercentage);
    config.appPoolPercentage = Number(appPoolPercentage);
    
    await config.save();
    return res.status(200).json(config);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Validation failed', error });
  }
};

