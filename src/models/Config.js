import mongoose from 'mongoose';

const ConfigSchema = new mongoose.Schema({
  winnerPoolPercentage: { type: Number, required: true, default: 80 },
  adminPoolPercentage: { type: Number, required: true, default: 10 },
  appPoolPercentage: { type: Number, required: true, default: 10 },
}, { timestamps: true });

ConfigSchema.pre('save', function(next) {
  const sum = this.winnerPoolPercentage + this.adminPoolPercentage + this.appPoolPercentage;
  if (sum !== 100) {
    return next(new Error('Percentages must sum to 100'));
  }
  next();
});

export default mongoose.model('Config', ConfigSchema);
