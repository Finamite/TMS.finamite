import Task from "../models/Task.js";
import mongoose from "mongoose";

/**
 * Reassign a FOREVER task group for next year
 * Used by single & bulk reassign
 */
export const reassignSingleTaskLogic = async ({
  taskGroupId,
  companyId,
  includeFiles
}) => {
  if (!taskGroupId || !companyId) {
    throw new Error("taskGroupId and companyId are required");
  }

  // 1️⃣ Load existing tasks
  const existingTasks = await Task.find({
    taskGroupId,
    companyId,
    isActive: true
  }).sort({ dueDate: 1 });

  if (!existingTasks.length) {
    throw new Error(`No tasks found for taskGroupId ${taskGroupId}`);
  }

  const lastTask = existingTasks[existingTasks.length - 1];

  // 2️⃣ Validate FOREVER task
  if (!lastTask.parentTaskInfo || lastTask.parentTaskInfo.isForever !== true) {
    throw new Error(`TaskGroup ${taskGroupId} is not FOREVER`);
  }

  // 3️⃣ Date calculation
  const lastDueDate = new Date(lastTask.dueDate);

  const newStartDate = new Date(lastDueDate);
  newStartDate.setDate(newStartDate.getDate() + 1);

  const newEndDate = new Date(newStartDate);
  newEndDate.setFullYear(newEndDate.getFullYear() + 1);

  // 4️⃣ Attachments (optional)
  const copiedAttachments =
    includeFiles && Array.isArray(lastTask.attachments)
      ? lastTask.attachments.map(a => ({
          filename: a.filename,
          originalName: a.originalName,
          path: a.path,
          size: a.size,
          uploadedAt: a.uploadedAt
        }))
      : [];

  // 5️⃣ Generate new tasks
  const newTasks = [];
  let currentDate = new Date(newStartDate);
  let sequenceNumber = 1;

  const includeSunday = lastTask.parentTaskInfo.includeSunday === true;
  const weekOffDays = Array.isArray(lastTask.parentTaskInfo.weekOffDays)
    ? lastTask.parentTaskInfo.weekOffDays
    : [];

  while (currentDate <= newEndDate) {
    const day = currentDate.getDay();

    if (!includeSunday && day === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    if (weekOffDays.includes(day)) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    newTasks.push({
      _id: new mongoose.Types.ObjectId(),
      title: lastTask.title,
      description: lastTask.description,
      taskType: lastTask.taskType,
      originalTaskType: lastTask.taskType,
      assignedBy: lastTask.assignedBy,
      assignedTo: lastTask.assignedTo,
      companyId,
      dueDate: new Date(currentDate),
      priority: lastTask.priority,
      status: "pending",
      taskGroupId,
      sequenceNumber,
      scheduledDate: new Date(currentDate),
      attachments: copiedAttachments,
      parentTaskInfo: {
        ...lastTask.parentTaskInfo,
        originalStartDate: newStartDate,
        originalEndDate: newEndDate
      },
      isActive: true
    });

    sequenceNumber++;

    switch (lastTask.taskType) {
      case "daily":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "weekly":
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case "monthly":
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case "quarterly":
        currentDate.setMonth(currentDate.getMonth() + 3);
        break;
      case "yearly":
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
      default:
        throw new Error("Unsupported taskType");
    }
  }

  if (!newTasks.length) {
    throw new Error("No new tasks generated");
  }

  // 6️⃣ Insert
  await Task.insertMany(newTasks);

  return {
    success: true,
    created: newTasks.length,
    taskGroupId
  };
};
