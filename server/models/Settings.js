// models/Settings.js
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
  },
  companyId: {
    type: String, // since you use custom string IDs like comp_xxx
    required: true,
    index: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, {
  timestamps: true
});

// ✅ allow multiple docs per type, but unique per company
settingsSchema.index({ type: 1, companyId: 1 }, { unique: true });

export default mongoose.model('Settings', settingsSchema);
