import mongoose from 'mongoose';

const SpinWheelSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  entryFee: { type: Number, required: true },
  status: { type: String, enum: ['waiting', 'in_progress', 'completed', 'aborted'], default: 'waiting' },
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'eliminated'], default: 'active' }
  }],
  eliminationSequence: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  startTime: { type: Date },
  winnerPool: { type: Number, default: 0 },
  adminPool: { type: Number, default: 0 },
  appPool: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('SpinWheel', SpinWheelSchema);
