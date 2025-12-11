import mongoose from "mongoose";

const masterTaskSchema = new mongoose.Schema({
  taskGroupId: { type: String, unique: true },
  title: String,
  description: String,
  taskType: String,
  priority: String,
  companyId: String,

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  startDate: Date,
  endDate: Date,

  includeSunday: Boolean,
  isForever: Boolean,
  weeklyDays: [Number],
  weekOffDays: [Number],
  monthlyDay: Number,
  yearlyDuration: Number,

  attachments: Array,
  createdAt: { type: Date, default: Date.now },
  
  // Add fields for recycle bin functionality
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  autoDeleteAt: Date
});

export default mongoose.model("MasterTask", masterTaskSchema);
