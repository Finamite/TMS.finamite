import mongoose from 'mongoose';

const dataUsageSchema = new mongoose.Schema({
  companyId: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  fileStorage: {
    totalSize: { type: Number, default: 0 }, // in bytes
    fileCount: { type: Number, default: 0 },
    uploads: [{
      filename: String,
      originalName: String,
      size: Number,
      uploadedAt: Date,
      uploadedBy: String
    }]
  },
  databaseUsage: {
    collections: {
      tasks: { count: { type: Number, default: 0 }, size: { type: Number, default: 0 } },
      users: { count: { type: Number, default: 0 }, size: { type: Number, default: 0 } },
      messages: { count: { type: Number, default: 0 }, size: { type: Number, default: 0 } },
      other: { count: { type: Number, default: 0 }, size: { type: Number, default: 0 } }
    },
    totalSize: { type: Number, default: 0 }, // in bytes
    totalDocuments: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Compound index for efficient querying
dataUsageSchema.index({ companyId: 1, date: 1 }, { unique: true });

export default mongoose.model('DataUsage', dataUsageSchema);