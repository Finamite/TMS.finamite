import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: true,
    unique: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  limits: {
    adminLimit: {
      type: Number,
      default: 1
    },
    managerLimit: {
      type: Number,
      default: 5
    },
    userLimit: {
      type: Number,
      default: 50
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  permissions: {
  dashboard: { type: Boolean, default: true },
  pendingTasks: { type: Boolean, default: true },
  pendingRecurringTasks: { type: Boolean, default: true },
  masterTasks: { type: Boolean, default: true },
  masterRecurringTasks: { type: Boolean, default: true },
  performance: { type: Boolean, default: true },
  assignTask: { type: Boolean, default: true },
  adminPanel: { type: Boolean, default: true },
  chat: { type: Boolean, default: true},
  settingspage: { type: Boolean, default: true},
  recyclebin: { type: Boolean, default: true},
  helpsupport: { type: Boolean, default: true},
}
}, {
  timestamps: true
});

export default mongoose.model('Company', companySchema);