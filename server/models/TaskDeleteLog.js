import mongoose from 'mongoose';

const taskDeleteLogSchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: true,
    index: true
  },
  companyName: {
    type: String,
    default: ''
  },
  taskId: {
    type: String,
    index: true
  },
  taskGroupId: {
    type: String,
    index: true
  },
  taskType: {
    type: String,
    index: true
  },
  taskFamily: {
    type: String,
    enum: ['one-time', 'recurring'],
    index: true
  },
  taskTitle: {
    type: String,
    default: ''
  },
  taskDescription: {
    type: String,
    default: ''
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedByName: {
    type: String,
    default: ''
  },
  assignedByEmail: {
    type: String,
    default: ''
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedToName: {
    type: String,
    default: ''
  },
  assignedToEmail: {
    type: String,
    default: ''
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedByName: {
    type: String,
    default: ''
  },
  deletedByEmail: {
    type: String,
    default: ''
  },
  deletedByRole: {
    type: String,
    default: ''
  },
  deleteMode: {
    type: String,
    enum: ['soft', 'permanent'],
    default: 'permanent',
    index: true
  },
  source: {
    type: String,
    default: ''
  },
  deletedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  dueDate: Date,
  status: String,
  priority: String,
  sequenceNumber: Number,
  taskSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

taskDeleteLogSchema.index({ companyId: 1, deletedAt: -1 });
taskDeleteLogSchema.index({ companyId: 1, taskType: 1, deletedAt: -1 });
taskDeleteLogSchema.index({ companyId: 1, deleteMode: 1, deletedAt: -1 });

export default mongoose.model('TaskDeleteLog', taskDeleteLogSchema);
