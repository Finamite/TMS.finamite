import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: true
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true
    }
  }],
  chatType: {
    type: String,
    enum: ['direct', 'support'],
    default: 'support'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  typing: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastUpdated: Date
  },
   deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  deletedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

// Index for better performance
chatSchema.index({ companyId: 1, 'participants.userId': 1 });
chatSchema.index({ companyId: 1, lastMessageAt: -1 });

export default mongoose.model('Chat', chatSchema);