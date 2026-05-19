import User from '../models/User.js';

export const createUser = async (req, res) => {
  try {
    const { username, role } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
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
