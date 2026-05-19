import mongoose from 'mongoose';

const ConfigSchema = new mongoose.Schema({
  winnerPoolPercentage: { type: Number, required: true, default: 80 },
  adminPoolPercentage: { type: Number, required: true, default: 10 },
  appPoolPercentage: { type: Number, required: true, default: 10 },
}, { timestamps: true });

ConfigSchema.pre('save', function() {
  const sum = this.winnerPoolPercentage + this.adminPoolPercentage + this.appPoolPercentage;
  if (sum !== 100) {
    throw new Error('Percentages must sum to 100');
  }
});

export default mongoose.model('Config', ConfigSchema);
