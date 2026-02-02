import mongoose from 'mongoose';

const revisionSchema = new mongoose.Schema({
  oldDate: Date,
  newDate: Date,
  remarks: String,
  revisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  revisedAt: {
    type: Date,
    default: Date.now
  }
});

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  taskType: {
    type: String,
    enum: ['one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'fortnightly'],
    required: true
  },
  originalTaskType: {
    type: String,
    enum: ['one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'fortnightly']
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  endedByRecurrence: {
    type: Boolean,
    default: false
  },
  // ADD THIS FIELD
  companyId: {
    type: String,
    required: true
  },

  dueDate: {
    type: Date,
    required: true
  },
  originalStartDate: Date,
  originalEndDate: Date,
  weeklyDays: [Number],
  monthlyDay: {
    type: Number,
    min: 1,
    max: 31
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  requiresApproval: {
    type: Boolean,
    default: false
  },

  weekOffDays: {
    type: [Number], // 0=Sunday, 1=Monday, ...
    default: []
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'overdue', 'rejected'],
    default: 'pending'
  },
  completedAt: Date,
  completionRemarks: String,
  completionAttachments: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  revisions: [revisionSchema],
  revisionCount: {
    type: Number,
    default: 0
  },

  rejectionRemarks: {
    type: String,
    trim: true
  },
  rejectedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  isActive: {
    type: Boolean,
    default: true
  },

  deletedAt: Date,
  autoDeleteAt: Date,

  // Group related tasks together
  taskGroupId: String,
  sequenceNumber: Number,
  scheduledDate: Date,
  parentTaskInfo: {
    originalStartDate: Date,
    originalEndDate: Date,
    isForever: Boolean,
    includeSunday: Boolean,
    weeklyDays: [Number],
    weekOffDays: [Number],
    monthlyDay: Number,
    yearlyDuration: Number
  }
}, {
  timestamps: true
},);

// Create compound index for companyId and assignedTo
taskSchema.index({ companyId: 1, assignedTo: 1 });

taskSchema.index({ companyId: 1, status: 1, isActive: 1 });

// For team pending aggregation
taskSchema.index({ companyId: 1, isActive: 1, status: 1, taskType: 1, dueDate: 1 });

// For assigned user grouping
taskSchema.index({ assignedTo: 1, companyId: 1 });

// Optional but helpful
taskSchema.index({ companyId: 1, dueDate: 1 });

taskSchema.index({
  taskGroupId: 1,
  dueDate: 1,
  isActive: 1
});

const Task = mongoose.model('Task', taskSchema);
export default Task;