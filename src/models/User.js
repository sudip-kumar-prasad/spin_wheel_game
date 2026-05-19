import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  coinBalance: { type: Number, default: 1000 },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
