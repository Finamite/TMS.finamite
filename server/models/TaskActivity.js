import mongoose from "mongoose";

const taskActivitySchema = new mongoose.Schema({
  taskGroupId: {
    type: String,
    required: true,
    index: true
  },

  actionType: {
    type: String,
    enum: [
      "RECURRING_END_DATE_UPDATED",
      "RECURRING_PAUSE_UPDATED",
      "RECURRING_PAUSE_CLEARED"
    ],
    required: true
  },

  oldEndDate: Date,
  newEndDate: Date,
  oldPauseFrom: Date,
  oldPauseTo: Date,
  pauseFrom: Date,
  pauseTo: Date,

  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  performedRole: {
    type: String,
    enum: ["admin", "manager", "employee", "superadmin", "user"]
  },

  reason: String,

  companyId: {
    type: String,
    required: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Helpful index for audit queries
taskActivitySchema.index({ companyId: 1, taskGroupId: 1 });

export default mongoose.model("TaskActivity", taskActivitySchema);
