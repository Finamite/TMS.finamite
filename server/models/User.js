import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: function() {
      return this.role !== 'superadmin';
    }
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'manager', 'employee'],
    default: 'employee'
  },
  permissions: {
    canViewTasks: { type: Boolean, default: true },
    canViewAllTeamTasks: { type: Boolean, default: false },
    canAssignTasks: { type: Boolean, default: false },
    canDeleteTasks: { type: Boolean, default: false },
    canEditTasks: { type: Boolean, default: false },
    canManageUsers: { type: Boolean, default: false },
    canEditRecurringTaskSchedules: { type: Boolean, default: false },
    canManageCompanies: { type: Boolean, default: false }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for username uniqueness within company
userSchema.index({ username: 1, companyId: 1 }, { unique: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);