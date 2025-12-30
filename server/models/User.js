import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: function () {
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
    trim: true,
    lowercase: true
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
  department: {
    type: String,
    default: ""
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  permissions: {
    canViewTasks: { type: Boolean, default: true },
    canViewAllTeamTasks: { type: Boolean, default: false },
    canAssignTasks: { type: Boolean, default: false },
    canDeleteTasks: { type: Boolean, default: false },
    canEditTasks: { type: Boolean, default: false },
    canManageUsers: { type: Boolean, default: false },
    canEditRecurringTaskSchedules: { type: Boolean, default: false },
    canManageCompanies: { type: Boolean, default: false },
    canManageSettings: { type: Boolean, default: false },
    canManageRecycle: { type: Boolean, default: false },
    canManageApproval: { type:Boolean, default: false}
  },
  isActive: {
    type: Boolean,
    default: true
  },

  lastAccess: {
  type: Date,
  default: null
},

accessLogs: {
  type: [Date], // array of timestamps
  default: []
},

deactivatedAt: {
  type: Date,
  default: null
},

deactivatedBy: {
  id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String }
},

  sessionInvalidated: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound index for username uniqueness within company
userSchema.index({ username: 1, companyId: 1 }, { unique: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
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
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.addAccessLog = function () {
  this.lastAccess = new Date();

  this.accessLogs.unshift(this.lastAccess);
  if (this.accessLogs.length > 50) {
    this.accessLogs.pop();
  }

  return this.save();
};

export default mongoose.model('User', userSchema);