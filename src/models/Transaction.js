import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  spinWheelId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpinWheel' },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['debit', 'credit'], required: true },
  description: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('Transaction', TransactionSchema);
