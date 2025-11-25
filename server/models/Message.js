import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderInfo: {
    username: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true
    }
  },
  content: {
    type: String,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'task-tag'],
    default: 'text'
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  taggedTask: {
    taskId: String,
    taskTitle: String,
    taskType: String, // 'one-time' or 'recurring'
    dueDate: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: Date,
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    replyTo: {
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  content: String,
  senderName: String,
  messageType: String
},
    readAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for better performance
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ content: 'text' }); // Text search index

export default mongoose.model('Message', messageSchema);