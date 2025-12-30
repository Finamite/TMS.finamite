import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { sendSystemEmail } from '../Utils/sendEmail.js';
import MasterTask from "../models/MasterTask.js";
import mongoose from "mongoose";

const router = express.Router();

// Helper function to get all dates for daily tasks within a range
const getDailyTaskDates = (startDate, endDate, includeSunday, weekOffDays = []) => {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();

    if ((!weekOffDays.includes(dayOfWeek)) && (includeSunday || dayOfWeek !== 0)) {
      dates.push(new Date(current));
    }

    current.setDate(current.getDate() + 1); // Move to the next day
  }

  return dates;
};

let teamPendingCache = {};
let lastCacheTime = 0;
const CACHE_TTL = 30 * 1000;

// Helper function to get all dates for weekly tasks within a range based on selected days
const getWeeklyTaskDates = (startDate, endDate, selectedDays, weekOffDays = []) => {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();

    if (selectedDays.includes(dayOfWeek) && !weekOffDays.includes(dayOfWeek)) {
      dates.push(new Date(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
};

// Helper function to get all dates for monthly tasks with specific day within a range
const getMonthlyTaskDates = (startDate, endDate, monthlyDay, includeSunday, weekOffDays = []) => {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Start from the first day of the start month
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    // Set to the target day of month
    let targetDate = new Date(current.getFullYear(), current.getMonth(), monthlyDay);

    // Handle case where monthlyDay doesn't exist in this month (e.g., Feb 30th)
    if (targetDate.getMonth() !== current.getMonth()) {
      // If the day is out of bounds for the current month, set to the last day of the month
      targetDate = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    }

    // Check if the target date is within our overall date range
    if (targetDate >= start && targetDate <= end) {
      // Handle Sunday exclusion
      if (!includeSunday && targetDate.getDay() === 0) { // 0 is Sunday
        targetDate.setDate(targetDate.getDate() - 1); // move to Saturday
      }

      // Handle week-off exclusion (shift back until it's not a week-off)
      while (weekOffDays.includes(targetDate.getDay())) {
        targetDate.setDate(targetDate.getDate() - 1);
      }

      // Final validation before pushing
      if (targetDate.getMonth() === current.getMonth() && targetDate <= end) {
        dates.push(new Date(targetDate));
      }
    }

    current.setMonth(current.getMonth() + 1); // Move to the next month
  }

  return dates;
};

// Helper function to get all dates for quarterly tasks (4 tasks for one year)
const getQuarterlyTaskDates = (startDate, includeSunday = true, weekOffDays = []) => {
  const dates = [];
  const start = new Date(startDate);

  // Create 4 quarterly tasks (every 3 months)
  for (let i = 0; i < 4; i++) {
    const quarterlyDate = new Date(start);
    quarterlyDate.setMonth(start.getMonth() + (i * 3)); // Add 3 months for each quarter

    // Handle Sunday exclusion
    if (!includeSunday && quarterlyDate.getDay() === 0) { // 0 is Sunday
      quarterlyDate.setDate(quarterlyDate.getDate() - 1); // Move to Saturday
    }

    // Handle week-off exclusion
    while (weekOffDays.includes(quarterlyDate.getDay())) {
      quarterlyDate.setDate(quarterlyDate.getDate() - 1);
    }

    dates.push(quarterlyDate);
  }

  return dates;
};

// Helper function to get all dates for yearly tasks based on duration
const getYearlyTaskDates = (startDate, yearlyDuration, includeSunday = true, weekOffDays = []) => {
  const dates = [];
  const start = new Date(startDate);

  for (let i = 0; i < yearlyDuration; i++) {
    const yearlyDate = new Date(start);
    yearlyDate.setFullYear(start.getFullYear() + i); // Increment year

    // Handle Sunday exclusion
    if (!includeSunday && yearlyDate.getDay() === 0) { // 0 is Sunday
      yearlyDate.setDate(yearlyDate.getDate() - 1); // Move to Saturday
    }

    // Handle week-off exclusion
    while (weekOffDays.includes(yearlyDate.getDay())) {
      yearlyDate.setDate(yearlyDate.getDate() - 1);
    }

    dates.push(yearlyDate);
  }

  return dates;
};

// ✅ HELPER FUNCTION: Send task assignment email
const sendTaskAssignmentEmail = async (taskData) => {
  try {
    const emailSettings = await Settings.findOne({
      type: "email",
      companyId: taskData.companyId
    });

    if (!emailSettings?.data?.enabled || !emailSettings?.data?.sendOnTaskCreate) {
      return; // Email not enabled or task creation emails disabled
    }

    const assignedUser = await User.findById(taskData.assignedTo);
    if (!assignedUser) return;

    const isRecurring = taskData.taskType !== "one-time";

    const subject = isRecurring
      ? `New Recurring Task Assigned: ${taskData.title}`
      : `New Task Assigned: ${taskData.title}`;

    const text = isRecurring
      ? `
A new recurring task has been assigned to you:

Title: ${taskData.title}
Description: ${taskData.description}

Start Date: ${taskData.startDate}
End Date: ${taskData.endDate || 'Ongoing'}

Please check your Task Dashboard.
`
      : `
A new task has been assigned to you:

Title: ${taskData.title}
Description: ${taskData.description}
Due Date: ${new Date(taskData.dueDate).toDateString()}

Please check your Task Dashboard:
https://tms.finamite.in
`;

    await sendSystemEmail(taskData.companyId, assignedUser.email, subject, text);
  } catch (error) {
    console.error('Error sending task assignment email:', error);
  }
};

// --- API Endpoints ---

// ✅ OPTIMIZED: Get all tasks with filters (removed timeout)
router.get('/', async (req, res) => {
  try {
    const {
      taskType,
      status,
      assignedTo,
      assignedBy,
      priority,
      page = 1,
      limit = 10,
      startDate,
      endDate,
      companyId
    } = req.query;

    const query = { isActive: true };

    // Add company filter - CRITICAL for multi-tenant security
    if (companyId) {
      query.companyId = companyId;
    }

    // Handle multiple task types (comma-separated)
    if (taskType) {
      if (taskType.includes(',')) {
        query.taskType = { $in: taskType.split(',') };
      } else {
        query.taskType = taskType;
      }
    }

    if (status) {
      if (status.includes(',')) {
        query.status = { $in: status.split(',') };
      } else {
        query.status = status;
      }
    }

    if (assignedTo && assignedBy) {
      query.$or = [
        { assignedTo },
        { assignedBy }
      ];
    } else {
      if (assignedTo) query.assignedTo = assignedTo;
      if (assignedBy) query.assignedBy = assignedBy;
    }
    if (priority) query.priority = priority;

    if (startDate && endDate) {
      query.dueDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const tasks = await Task.find(query)
      .populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId')
      .populate('approvedBy', 'username email')
      .populate('rejectedBy', 'username email')
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); // ✅ Added lean() for better performance

    const total = await Task.countDocuments(query);

    res.json({
      tasks,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ OPTIMIZED: Get pending tasks (removed timeout)
router.get('/pending', async (req, res) => {
  try {
    const { userId, taskType, companyId } = req.query;
    const query = {
      isActive: true,
      status: { $in: ['pending', 'in-progress', 'overdue'] } // Only show pending or overdue
    };

    // Add company filter - CRITICAL for multi-tenant security
    if (companyId) {
      query.companyId = companyId;
    }

    if (userId) query.assignedTo = userId; // Filter by assigned user if provided
    if (taskType) query.taskType = taskType; // Filter by task type if provided

    const tasks = await Task.find(query)
      .populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId')
      .sort({ dueDate: 1 })
      .lean(); // ✅ Added lean() for better performance

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching pending tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ ULTRA-OPTIMIZED: Get pending recurring tasks with maximum performance
router.get('/pending-recurring', async (req, res) => {
  try {
    const { companyId, userId } = req.query;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const fiveDaysLater = new Date(startOfToday);
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

    const match = {
      companyId,
      isActive: true,
      status: 'pending'
    };

    if (userId) {
      match.assignedTo = userId;
    }

    const tasks = await Task.find({
      ...match,
      $or: [
        // ✅ DAILY → today only (FIXED)
        {
          taskType: 'daily',
          dueDate: {
            $gte: startOfToday,
            $lte: endOfToday
          }
        },

        // ✅ CYCLIC → overdue + today + next 5 days
        {
          taskType: { $in: ['weekly', 'monthly', 'quarterly', 'yearly'] },
          dueDate: {
            $lte: fiveDaysLater
          }
        }
      ]
    })
      .populate('assignedBy', 'username email')
      .populate('assignedTo', 'username email')
      .sort({ dueDate: 1 });

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load pending recurring tasks' });
  }
});


// ✅ ULTRA-FAST: Team pending tasks with aggregation optimization
router.get('/team-pending-fast', async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json([]);
    }

    const nowTs = Date.now();

    // ✅ Serve from cache if valid
    if (
      teamPendingCache[companyId] &&
      nowTs - lastCacheTime < CACHE_TTL
    ) {
      return res.json(teamPendingCache[companyId]);
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayStr = startOfToday.toISOString().slice(0, 10); // YYYY-MM-DD

    const data = await Task.aggregate([
      {
        $match: {
          companyId,
          isActive: true,
          status: { $in: ['pending', 'overdue'] }
        }
      },
      {
        $project: {
          assignedTo: 1,
          taskType: 1,
          dueDate: 1
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'user',
          pipeline: [
            { $project: { username: 1 } }
          ]
        }
      },
      { $unwind: '$user' },

      {
        $addFields: {
          username: '$user.username',

          dueDateStr: {
            $dateToString: { format: '%Y-%m-%d', date: '$dueDate' }
          },

          // ✅ OVERDUE = before today ONLY
          isOverdue: {
            $lt: ['$dueDate', startOfToday]
          },

          // ✅ TODAY = between start & end of today
          isToday: {
            $and: [
              { $gte: ['$dueDate', startOfToday] },
              { $lte: ['$dueDate', endOfToday] }
            ]
          }
        }
      },

      {
        $group: {
          _id: '$username',

          oneTimeToday: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$taskType', 'one-time'] }, '$isToday'] },
                1,
                0
              ]
            }
          },

          oneTimeOverdue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$taskType', 'one-time'] }, '$isOverdue'] },
                1,
                0
              ]
            }
          },

          dailyToday: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$taskType', 'daily'] }, '$isToday'] },
                1,
                0
              ]
            }
          },

          recurringToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$taskType', ['weekly', 'monthly', 'quarterly', 'yearly']] },
                    '$isToday'
                  ]
                },
                1,
                0
              ]
            }
          },

          recurringOverdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$taskType', ['weekly', 'monthly', 'quarterly', 'yearly']] },
                    '$isOverdue'
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },

      { $sort: { _id: 1 } }
    ]).allowDiskUse(true);

    // ✅ Save to cache
    teamPendingCache[companyId] = data;
    lastCacheTime = nowTs;

    res.json(data);
  } catch (err) {
    console.error('❌ Error in team-pending-fast:', err);
    res.json([]);
  }
});


router.get("/master/:taskGroupId", async (req, res) => {
  try {
    const { taskGroupId } = req.params;

    const master = await MasterTask.findOne({ taskGroupId }).lean();

    if (!master) return res.status(404).json({ message: "Master Task not found" });

    res.json(master);

  } catch (err) {
    console.error("Error fetching master task:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// ✅ ULTRA-OPTIMIZED: Master recurring tasks endpoint with maximum performance
router.get('/master-recurring', async (req, res) => {
  try {
    const {
      taskType,
      status,
      assignedTo,
      assignedBy,
      priority,
      page = 1,
      limit = 50,
      search,
      dateFrom,
      dateTo,
      companyId
    } = req.query;


    // ✅ Build super-optimized aggregation pipeline
    const pipeline = [];
    let assignedById = null;

    // ✅ Pre-resolve assignedBy username to ObjectId for faster matching
    if (req.query.assignedBy) {
      const user = await User.findOne({ username: req.query.assignedBy }).select('_id').lean();
      if (user) assignedById = user._id;
    }

    // ✅ Ultra-optimized match stage with compound indexing support
    const matchStage = {
      isActive: true,
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
    };

    if (companyId) {
      matchStage.companyId = companyId;
    }

    if (taskType) {
      if (taskType.includes(',')) {
        matchStage.taskType = { $in: taskType.split(',') };
      } else {
        matchStage.taskType = taskType;
      }
    }

    if (status) {
      if (status.includes(',')) {
        matchStage.status = { $in: status.split(',') };
      } else {
        matchStage.status = status;
      }
    }

    if (assignedTo) matchStage.assignedTo = assignedTo;
    if (assignedById) matchStage.assignedBy = assignedById;
    if (priority) matchStage.priority = priority;

    if (dateFrom && dateTo) {
      matchStage.dueDate = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    }

    if (search) {
      matchStage.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    pipeline.push({ $match: matchStage });

    // ✅ Optimized lookups with minimal field projection
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'assignedBy',
          foreignField: '_id',
          as: 'assignedByUser',
          pipeline: [{ $project: { username: 1, email: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedToUser',
          pipeline: [{ $project: { _id: 1, username: 1, email: 1 } }]
        }
      }
    );

    pipeline.push(
      { $unwind: '$assignedByUser' },
      { $unwind: '$assignedToUser' }
    );

    // ✅ Optimized grouping with better field handling
    pipeline.push({
      $group: {
        _id: { $ifNull: ['$taskGroupId', '$_id'] },
        title: { $first: '$title' },
        description: { $first: '$description' },
        taskType: { $first: '$taskType' },
        priority: { $first: '$priority' },
        assignedBy: {
          $first: {
            username: '$assignedByUser.username',
            email: '$assignedByUser.email'
          }
        },
        assignedTo: {
          $first: {
            _id: '$assignedToUser._id',
            username: '$assignedToUser.username',
            email: '$assignedToUser.email'
          }
        },
        parentTaskInfo: { $first: '$parentTaskInfo' },
        attachments: { $first: '$attachments' },
        weekOffDays: { $first: '$weekOffDays' },
        tasks: {
          $push: {
            _id: '$_id',
            dueDate: '$dueDate',
            status: '$status',
            completedAt: '$completedAt',
            completionRemarks: '$completionRemarks',
            completionAttachments: '$completionAttachments',
            lastCompletedDate: '$lastCompletedDate',
            createdAt: '$createdAt'
          }
        },
        instanceCount: { $sum: 1 },
        completedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        firstDueDate: { $min: '$dueDate' },
        lastDueDate: { $max: '$dueDate' }
      }
    });

    // ✅ Add computed fields efficiently
    pipeline.push({
      $addFields: {
        taskGroupId: '$_id',
        dateRange: {
          start: '$firstDueDate',
          end: '$lastDueDate'
        }
      }
    });

    // ✅ Sort by due date for better user experience
    pipeline.push({ $sort: { firstDueDate: 1 } });

    // ✅ Fast count calculation
    const countPipeline = [...pipeline, { $count: 'total' }];
    const totalResult = await Task.aggregate(countPipeline).allowDiskUse(true);
    const total = totalResult[0]?.total || 0;

    // ✅ Add efficient pagination
    pipeline.push(
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    );

    // ✅ Execute ultra-fast aggregation
    const masterTasks = await Task.aggregate(pipeline).allowDiskUse(true);

    // ✅ Sort tasks within each group efficiently
    masterTasks.forEach(masterTask => {
      masterTask.tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    });


    res.json({
      masterTasks,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      hasMore: page * limit < total
    });

  } catch (error) {
    console.error('❌ Error fetching master recurring tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get("/master-recurring-light", async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    // ---------------------------------------------------------
    // 1) LOAD EXISTING MASTER TASKS
    // ---------------------------------------------------------
    let masters = await MasterTask.find(
      {
        companyId,
        isActive: { $ne: false },
        taskType: { $ne: "one-time" }
      },
      {
        taskGroupId: 1,
        title: 1,
        description: 1,
        taskType: 1,
        priority: 1,
        assignedTo: 1,
        assignedBy: 1,
        startDate: 1,
        endDate: 1,
        includeSunday: 1,
        isForever: 1,
        weeklyDays: 1,
        weekOffDays: 1,
        monthlyDay: 1,
        yearlyDuration: 1,
        attachments: 1
      }
    ).lean();

    // ---------------------------------------------------------
    // 2) FIND & SYNC MISSING MASTER TASKS (🔥 REAL FIX)
    // ---------------------------------------------------------
    const existingGroupIds = new Set(masters.map(m => m.taskGroupId));

    const missingGroups = await Task.aggregate([
      {
        $match: {
          companyId,
          isActive: true,
          taskType: { $in: ["daily", "weekly", "monthly", "quarterly", "yearly"] },
          taskGroupId: { $exists: true, $ne: null, $nin: Array.from(existingGroupIds) }
        }
      },
      {
        $group: {
          _id: "$taskGroupId",
          title: { $first: "$title" },
          description: { $first: "$description" },
          taskType: { $first: "$taskType" },
          priority: { $first: "$priority" },
          assignedTo: { $first: "$assignedTo" },
          assignedBy: { $first: "$assignedBy" },
          attachments: { $first: "$attachments" },
          parentTaskInfo: { $first: "$parentTaskInfo" },
          weekOffDays: { $first: "$weekOffDays" },
          requiresApproval: { $first: "$requiresApproval" },
          firstDueDate: { $min: "$dueDate" },
          lastDueDate: { $max: "$dueDate" },
          createdAt: { $first: "$createdAt" }
        }
      }
    ]).allowDiskUse(true);

    if (missingGroups.length > 0) {
      const newMasters = missingGroups.map(g => ({
        taskGroupId: g._id,
        title: g.title,
        description: g.description,
        taskType: g.taskType,
        priority: g.priority,
        assignedTo: g.assignedTo,
        assignedBy: g.assignedBy,
        requiresApproval: g.requiresApproval ?? false,
        startDate: g.parentTaskInfo?.originalStartDate || g.firstDueDate,
        endDate: g.parentTaskInfo?.originalEndDate || g.lastDueDate,
        includeSunday: g.parentTaskInfo?.includeSunday ?? true,
        isForever: g.parentTaskInfo?.isForever ?? false,
        weeklyDays: g.parentTaskInfo?.weeklyDays || [],
        weekOffDays: g.parentTaskInfo?.weekOffDays || g.weekOffDays || [],
        monthlyDay: g.parentTaskInfo?.monthlyDay,
        yearlyDuration: g.parentTaskInfo?.yearlyDuration || 1,
        attachments: g.attachments || [],
        createdAt: g.createdAt
      }));

      await MasterTask.bulkWrite(
        newMasters.map(m => ({
          updateOne: {
            filter: { taskGroupId: m.taskGroupId },
            update: { $setOnInsert: m },
            upsert: true
          }
        })),
        { ordered: false }
      );

      masters.push(...newMasters);
    }

    if (!masters.length) {
      return res.json([]);
    }

    // ---------------------------------------------------------
    // 3) LOAD USER MAP
    // ---------------------------------------------------------
    const userIds = [
      ...new Set([
        ...masters.map(m => m.assignedTo?.toString()),
        ...masters.map(m => m.assignedBy?.toString())
      ])
    ].filter(Boolean);

    const users = await User.find(
      { _id: { $in: userIds } },
      { username: 1, email: 1 }
    ).lean();

    const userMap = {};
    users.forEach(u => (userMap[u._id.toString()] = u));

    // ---------------------------------------------------------
    // 4) LOAD COUNTS + LAST DUE DATE
    // ---------------------------------------------------------
    const taskGroupIds = masters.map(m => m.taskGroupId);

    const stats = await Task.aggregate([
      { $match: { taskGroupId: { $in: taskGroupIds }, isActive: true } },
      {
        $group: {
          _id: "$taskGroupId",
          instanceCount: { $sum: 1 },
          completedCount: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          },
          lastDueDate: { $max: "$dueDate" }
        }
      }
    ]);

    const statMap = {};
    stats.forEach(s => (statMap[s._id] = s));

    // ---------------------------------------------------------
    // 5) FOREVER TASK END DATE FIX
    // ---------------------------------------------------------
    const foreverUpdateOps = [];
    const finalOutput = [];

    for (const m of masters) {
      let correctedEndDate = m.endDate;

      if (m.isForever === true && statMap[m.taskGroupId]?.lastDueDate) {
        correctedEndDate = statMap[m.taskGroupId].lastDueDate;

        foreverUpdateOps.push({
          updateOne: {
            filter: { taskGroupId: m.taskGroupId },
            update: { $set: { endDate: correctedEndDate } }
          }
        });
      }

      finalOutput.push({
        ...m,
        assignedTo: userMap[m.assignedTo?.toString()] || null,
        assignedBy: userMap[m.assignedBy?.toString()] || null,
        dateRange: {
          start: m.startDate,
          end: correctedEndDate
        },
        parentTaskInfo: {
          includeSunday: m.includeSunday,
          isForever: m.isForever,
          weeklyDays: m.weeklyDays,
          weekOffDays: m.weekOffDays,
          monthlyDay: m.monthlyDay,
          yearlyDuration: m.yearlyDuration
        },
        instanceCount: statMap[m.taskGroupId]?.instanceCount || 0,
        completedCount: statMap[m.taskGroupId]?.completedCount || 0,
        pendingCount: statMap[m.taskGroupId]?.pendingCount || 0
      });
    }

    if (foreverUpdateOps.length) {
      await MasterTask.bulkWrite(foreverUpdateOps, { ordered: false });
    }

    // ---------------------------------------------------------
    // 6) SEND RESPONSE
    // ---------------------------------------------------------
    return res.json(finalOutput);

  } catch (error) {
    console.error("❌ master-recurring-light error:", error);
    return res.status(500).json({
      message: "Failed to fetch master tasks",
      error: error.message
    });
  }
});


router.get('/approval-count', async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.json({ count: 0 });
    }

    const count = await Task.countDocuments({
      companyId,
      isActive: true,
      status: 'in-progress',
      requiresApproval: true
    });

    res.json({ count });
  } catch (err) {
    console.error('Approval count error:', err);
    res.json({ count: 0 });
  }
});

// ✅ ULTRA-OPTIMIZED: Individual recurring tasks endpoint
router.get('/recurring-instances', async (req, res) => {
  try {
    const {
      taskType,
      status,
      assignedTo,
      assignedBy,
      priority,
      page = 1,
      limit = 100,
      search,
      dateFrom,
      dateTo,
      companyId
    } = req.query;

    let assignedById = null;

    // ✅ Fast user lookup with lean()
    if (req.query.assignedBy) {
      const user = await User.findOne({ username: req.query.assignedBy }).select('_id').lean();
      if (user) assignedById = user._id;
    }

    // ✅ Optimized query building
    const query = {
      isActive: true,
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
    };

    if (companyId) {
      query.companyId = companyId;
    }

    if (taskType) {
      if (taskType.includes(',')) {
        query.taskType = { $in: taskType.split(',') };
      } else {
        query.taskType = taskType;
      }
    }

    if (status) {
      if (status.includes(',')) {
        query.status = { $in: status.split(',') };
      } else {
        query.status = status;
      }
    }

    if (assignedTo) query.assignedTo = assignedTo;
    if (assignedById) query.assignedBy = assignedById;
    if (priority) query.priority = priority;

    if (dateFrom && dateTo) {
      query.dueDate = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // ✅ Ultra-fast query with lean() and selective field projection
    const tasks = await Task.find(query)
      .select('title description taskType assignedBy assignedTo dueDate priority status lastCompletedDate completedAt completionRemarks completionAttachments createdAt attachments parentTaskInfo weekOffDays taskGroupId')
      .populate('assignedBy', 'username email')
      .populate('assignedTo', '_id username email')
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); // ✅ Maximum performance with lean()

    // ✅ Fast count with same query
    const total = await Task.countDocuments(query);

    res.json({
      tasks,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      hasMore: page * limit < total
    });
  } catch (error) {
    console.error('❌ Error fetching recurring task instances:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ⚡ LIGHTNING-FAST BULK CREATE: Single API endpoint for all tasks
router.post('/bulk-create', async (req, res) => {
  try {
    const { tasks, totalUsers, isReassignMode, originalTaskId } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ message: 'No tasks provided' });
    }

    if (isReassignMode && originalTaskId) {
    }
    const startTime = Date.now();

    let totalTasksCreated = 0;
    const allBulkOperations = [];

    // ⚡ Process all tasks in parallel for maximum speed
    await Promise.all(tasks.map(async (taskData) => {
      const { assignedTo, ...taskTemplate } = taskData;

      // ⚡ Process each assigned user for this task in parallel
      await Promise.all(assignedTo.map(async (assignedUserId) => {
        let taskDates = [];

        // ⚡ Ultra-fast date generation
        if (taskData.taskType === 'one-time') {
          taskDates = [new Date(taskData.dueDate)];
        } else {
          const startDate = new Date(taskData.startDate);
          let endDate;

          if (taskData.isForever) {
            endDate = new Date(startDate);
            if (taskData.taskType === 'yearly') {
              endDate.setFullYear(endDate.getFullYear() + (taskData.yearlyDuration || 3));
            } else {
              endDate.setFullYear(endDate.getFullYear() + 1);
            }
          } else {
            endDate = new Date(taskData.endDate);
          }

          // ⚡ Lightning-fast date generation
          switch (taskData.taskType) {
            case 'daily':
              taskDates = getDailyTaskDates(startDate, endDate, taskData.includeSunday, taskData.weekOffDays);
              break;
            case 'weekly':
              taskDates = getWeeklyTaskDates(startDate, endDate, taskData.weeklyDays, taskData.weekOffDays);
              break;
            case 'monthly':
              taskDates = getMonthlyTaskDates(startDate, endDate, taskData.monthlyDay || 1, taskData.includeSunday, taskData.weekOffDays);
              break;
            case 'quarterly':
              taskDates = getQuarterlyTaskDates(startDate, taskData.includeSunday, taskData.weekOffDays);
              break;
            case 'yearly':
              if (taskData.isForever) {
                taskDates = getYearlyTaskDates(startDate, taskData.yearlyDuration, taskData.includeSunday, taskData.weekOffDays || []);
              } else {
                taskDates = getYearlyTaskDates(startDate, 1, taskData.includeSunday, taskData.weekOffDays || []);
              }
              break;
          }
        }

        // ⚡ Generate ultra-fast unique task group ID
        const taskGroupId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${assignedUserId}`;

        // ✅ Create master task entry for edit mode
        await MasterTask.create({
          taskGroupId,
          title: taskTemplate.title,
          description: taskTemplate.description,
          taskType: taskTemplate.taskType,
          priority: taskTemplate.priority,
          companyId: taskData.companyId,
          assignedTo: assignedUserId,
          assignedBy: taskTemplate.assignedBy,
          startDate: taskData.startDate,
          endDate: taskData.endDate,
          includeSunday: taskData.includeSunday,
          isForever: taskData.isForever,
          weeklyDays: taskData.weeklyDays,
          weekOffDays: taskData.weekOffDays || [],
          monthlyDay: taskData.monthlyDay,
          yearlyDuration: taskData.yearlyDuration,
          attachments: taskData.attachments || []
        });

        // ⚡ Prepare ALL task instances for lightning bulk insert
        const bulkTaskInstances = taskDates.map((taskDate, index) => ({
          insertOne: {
            document: {
              ...taskTemplate,
              assignedTo: assignedUserId,
              dueDate: taskDate,
              isActive: true,
              status: 'pending',
              taskGroupId: taskGroupId,
              sequenceNumber: index + 1,
              parentTaskInfo: {
                originalStartDate: taskData.startDate,
                originalEndDate: taskData.endDate,
                isForever: taskData.isForever,
                includeSunday: taskData.includeSunday,
                weeklyDays: taskData.weeklyDays,
                weekOffDays: taskData.weekOffDays || [],
                monthlyDay: taskData.monthlyDay,
                yearlyDuration: taskData.yearlyDuration
              }
            }
          }
        }));

        allBulkOperations.push(...bulkTaskInstances);
        totalTasksCreated += taskDates.length;

        // ⚡ Lightning-fast async email notification (don't wait)
        setImmediate(() => sendTaskAssignmentEmail({
          ...taskData,
          assignedTo: assignedUserId
        }));
      }));
    }));

    // ⚡ LIGHTNING STRIKE: Single ultra-fast bulk write operation
    if (allBulkOperations.length > 0) {
      await Task.bulkWrite(allBulkOperations, {
        ordered: false,
        bypassDocumentValidation: false // ✅ Keep validation for data integrity
      });

      // ✅ UPDATE ORIGINAL TASK STATUS TO REJECTED (only after successful task creation)
      if (isReassignMode && originalTaskId) {
        try {
          const updatedTask = await Task.findByIdAndUpdate(
            originalTaskId,
            {
              status: 'rejected',
              rejectedAt: new Date(),
              reassignCompleted: true // Flag to indicate reassignment was completed
            },
            { new: true }
          );

          if (updatedTask) {
          } else {
          }
        } catch (updateError) {
          console.error(`❌ Error updating original task ${originalTaskId} status:`, updateError);
          // Don't fail the entire operation if status update fails
        }
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);


    res.status(201).json({
      message: `⚡ Lightning fast! Successfully created ${totalTasksCreated} tasks in ${duration}s`,
      totalTasksCreated,
      totalUsers,
      duration,
      originalTaskUpdated: isReassignMode && originalTaskId ? true : false,
      performance: {
        tasksPerSecond: Math.round(totalTasksCreated / (duration || 1)),
        averageTimePerTask: Math.round((endTime - startTime) / totalTasksCreated),
        bulkOperationSize: allBulkOperations.length
      },
      summary: {
        taskTypes: tasks.length,
        totalUsers: totalUsers,
        totalInstances: totalTasksCreated
      }
    });

  } catch (error) {
    console.error('❌ Error in lightning bulk create:', error);
    res.status(500).json({
      message: 'Lightning bulk task creation failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create scheduled tasks (keeping existing endpoint for backwards compatibility)
router.post('/create-scheduled', async (req, res) => {
  try {
    const taskData = req.body;
    const createdTasks = [];
    let taskDates = [];

    // Validate companyId is provided (except for superadmin)
    if (!taskData.companyId && taskData.assignedBy) {
      const assignedByUser = await User.findById(taskData.assignedBy);
      if (!assignedByUser || assignedByUser.role !== 'superadmin') {
        return res.status(400).json({ message: 'Company ID is required for task creation' });
      }
    }

    if (taskData.taskType === 'one-time') {
      taskDates = [new Date(taskData.dueDate)];
    } else {
      const startDate = new Date(taskData.startDate);
      let endDate;

      if (taskData.isForever) {
        endDate = new Date(startDate);
        if (taskData.taskType === 'yearly') {
          endDate.setFullYear(endDate.getFullYear() + (taskData.yearlyDuration || 3));
        } else {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }
      } else {
        endDate = new Date(taskData.endDate);
      }

      switch (taskData.taskType) {
        case 'daily':
          taskDates = getDailyTaskDates(startDate, endDate, taskData.includeSunday, taskData.weekOffDays);
          break;

        case 'weekly':
          taskDates = getWeeklyTaskDates(startDate, endDate, taskData.weeklyDays, taskData.weekOffDays);
          break;

        case 'monthly':
          taskDates = getMonthlyTaskDates(startDate, endDate, taskData.monthlyDay || 1, taskData.includeSunday, taskData.weekOffDays);
          break;

        case 'quarterly':
          taskDates = getQuarterlyTaskDates(startDate, taskData.includeSunday, taskData.weekOffDays);
          break;

        case 'yearly':
          if (taskData.isForever) {
            taskDates = getYearlyTaskDates(startDate, taskData.yearlyDuration, taskData.includeSunday, taskData.weekOffDays || []);
          } else {
            taskDates = getYearlyTaskDates(startDate, 1, taskData.includeSunday, taskData.weekOffDays || []);
          }
          break;
      }
    }

    // GROUP ID for recurring
    const taskGroupId = new Date().getTime().toString() + '-' + Math.random().toString(12).substr(2, 9);

    // ✅ Create master task entry for edit mode (only for recurring tasks)
    if (taskData.taskType !== 'one-time') {
      await MasterTask.create({
        taskGroupId,
        title: taskData.title,
        description: taskData.description,
        taskType: taskData.taskType,
        priority: taskData.priority,
        companyId: taskData.companyId,
        assignedTo: taskData.assignedTo,
        assignedBy: taskData.assignedBy,
        startDate: taskData.startDate,
        endDate: taskData.endDate,
        includeSunday: taskData.includeSunday,
        isForever: taskData.isForever,
        weeklyDays: taskData.weeklyDays,
        weekOffDays: taskData.weekOffDays || [],
        monthlyDay: taskData.monthlyDay,
        yearlyDuration: taskData.yearlyDuration,
        attachments: taskData.attachments || []
      });
    }

    // ✅ OPTIMIZED: Use bulk insert for better performance
    const bulkOps = taskDates.map((taskDate, i) => ({
      insertOne: {
        document: {
          title: taskData.title,
          description: taskData.description,
          taskType: taskData.taskType,
          assignedBy: taskData.assignedBy,
          assignedTo: taskData.assignedTo,
          priority: taskData.priority,
          dueDate: taskDate,
          companyId: taskData.companyId,
          attachments: taskData.attachments || [],
          isActive: true,
          status: 'pending',
          taskGroupId: taskGroupId,
          sequenceNumber: i + 1,
          parentTaskInfo: {
            originalStartDate: taskData.startDate,
            originalEndDate: taskData.endDate,
            isForever: taskData.isForever,
            includeSunday: taskData.includeSunday,
            weeklyDays: taskData.weeklyDays,
            weekOffDays: taskData.weekOffDays || [],
            monthlyDay: taskData.monthlyDay,
            yearlyDuration: taskData.yearlyDuration
          }
        }
      }
    }));

    if (bulkOps.length > 0) {
      await Task.bulkWrite(bulkOps, { ordered: false });
    }

    // ✅ SEND EMAIL NOTIFICATION
    await sendTaskAssignmentEmail(taskData);

    // RESPONSE
    res.status(201).json({
      message: `Successfully created ${bulkOps.length} tasks`,
      tasksCreated: bulkOps.length,
      taskGroupId: taskGroupId,
      tasks: [] // Don't return all tasks for performance
    });

  } catch (error) {
    console.error('Error creating scheduled tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ FIXED: Create task (original endpoint - now with email)
router.post('/', async (req, res) => {
  try {
    const taskData = req.body;

    // Validate companyId is provided (except for superadmin)
    if (!taskData.companyId && taskData.assignedBy) {
      const assignedByUser = await User.findById(taskData.assignedBy);
      if (!assignedByUser || assignedByUser.role !== 'superadmin') {
        return res.status(400).json({ message: 'Company ID is required for task creation' });
      }
    }

    // If 'isForever' is true for a non-scheduled endpoint, set an arbitrary end date
    if (taskData.isForever && taskData.startDate) {
      const oneYearLater = new Date(taskData.startDate);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      taskData.endDate = oneYearLater;
    }

    const task = new Task({
      ...taskData,
      attachments: taskData.attachments || []
    });
    await task.save();

    // ✅ SEND EMAIL NOTIFICATION FOR SINGLE TASK CREATION
    await sendTaskAssignmentEmail(taskData);

    const populatedTask = await Task.findById(task._id)
      .populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId')
      .lean(); // ✅ Added lean() for better performance

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ OPTIMIZED: Update task
router.put('/:id', async (req, res) => {
  try {
    const { companyId } = req.query;
    const updateQuery = { _id: req.params.id };

    // Add company filter for security
    if (companyId) {
      updateQuery.companyId = companyId;
    } else {
      delete updateQuery.companyId;
    }

    const task = await Task.findOneAndUpdate(
      updateQuery,
      req.body,
      { new: true }
    ).populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId')
      .lean(); // ✅ Added lean() for better performance

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ FIXED: Complete task - with proper email notification
router.post('/:id/complete', async (req, res) => {
  try {
    const {
      completionRemarks,
      completionAttachments,
      companyId,
      userId
    } = req.body;

    const findQuery = { _id: req.params.id };
    if (companyId) findQuery.companyId = companyId;

    const task = await Task.findOne(findQuery);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // --------------------------------------------------
    // SAVE COMPLETION DATA (COMMON FOR BOTH FLOWS)
    // --------------------------------------------------
    if (completionRemarks && completionRemarks.trim()) {
      task.completionRemarks = completionRemarks.trim();
    }

    if (completionAttachments?.length > 0) {
      task.completionAttachments = completionAttachments;
    }

    task.completedAt = new Date();

    // --------------------------------------------------
    // 🔥 APPROVAL VS NORMAL COMPLETION LOGIC
    // --------------------------------------------------
    let emailSubject = '';
    let emailText = '';

    if (task.requiresApproval === true) {
      // ✅ SEND TO APPROVAL
      task.status = 'in-progress';

      emailSubject = `Task Submitted for Approval: ${task.title}`;
      emailText = `
A task has been completed and is awaiting approval:

Title: ${task.title}
Description: ${task.description}

Submitted by: ${task.assignedTo}
Submitted at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

${completionRemarks ? `Remarks:\n${completionRemarks}\n` : ''}

Please review this task in the "For Approval" section:
https://tms.finamite.in
`;

    } else {
      // ✅ NORMAL COMPLETION
      task.status = 'completed';

      emailSubject = `Task Completed: ${task.title}`;
      emailText = `
The following task has been completed:

Title: ${task.title}
Description: ${task.description}

Completed at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

${completionRemarks ? `Remarks:\n${completionRemarks}\n` : ''}

Please check the Task Dashboard:
https://tms.finamite.in
`;
    }

    // --------------------------------------------------
    // SAVE TASK
    // --------------------------------------------------
    await task.save();

    // --------------------------------------------------
    // 📩 EMAIL NOTIFICATION
    // --------------------------------------------------
    const emailSettings = await Settings.findOne({
      type: "email",
      companyId: task.companyId
    });

    if (
      emailSettings?.data?.enabled &&
      (
        (task.requiresApproval && emailSettings.data.sendOnTaskApproval) ||
        (!task.requiresApproval && emailSettings.data.sendOnTaskComplete)
      )
    ) {
      const admins = await User.find({
        companyId: task.companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
      }).lean();

      for (const admin of admins) {
        await sendSystemEmail(
          task.companyId,
          admin.email,
          emailSubject,
          emailText,
          "",
          task.completionAttachments || []
        );
      }
    }

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------
    const populatedTask = await Task.findById(task._id)
      .populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId')
      .lean();

    res.json({
      success: true,
      requiresApproval: task.requiresApproval,
      status: task.status,
      task: populatedTask
    });

  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});


// ✅ FIXED: Revise task - with proper email notification
router.post('/:id/revise', async (req, res) => {
  try {
    const { newDate, remarks, revisedBy, companyId, userId } = req.body;

    if (!newDate) {
      return res.status(400).json({ message: "New revision date is required" });
    }

    const pickedDateTest = new Date(newDate);
    if (isNaN(pickedDateTest.getTime())) {
      return res.status(400).json({ message: "Invalid date format for new due date" });
    }

    // 1️⃣ Fetch Task
    const findQuery = { _id: req.params.id };
    if (companyId) findQuery.companyId = companyId;

    const task = await Task.findOne(findQuery);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // 2️⃣ Fetch Revision Settings
    const revisionSettings = await Settings.findOne({
      type: "revision",
      companyId: task.companyId
    });

    const enableRevisions = revisionSettings?.data?.enableRevisions ?? false;
    const enableDaysRule = revisionSettings?.data?.enableDaysRule ?? false;
    const enableMaxRevision = revisionSettings?.data?.enableMaxRevision ?? true;

    // 3️⃣ Check Revision Limit
    let limit = enableMaxRevision ? (revisionSettings?.data?.limit ?? 3) : Infinity;
    if (!enableRevisions) {
      limit = Infinity;
    }

    if (enableRevisions && task.revisionCount >= limit) {
      return res.status(400).json({
        message: `Maximum ${limit} revisions allowed`
      });
    }

    // 4️⃣ Determine Base Date & Max Days
    const baseDate = task.lastPlannedDate
      ? new Date(task.lastPlannedDate)
      : new Date(task.dueDate);

    let maxDays = Infinity;

    if (enableRevisions && enableDaysRule) {
      maxDays = revisionSettings?.data?.maxDays ?? 7;
      const days = revisionSettings?.data?.days || {};
      const revisionIndex = task.revisionCount + 1;
      if (days[revisionIndex] !== undefined && days[revisionIndex] !== null) {
        maxDays = days[revisionIndex];
      }
    }

    const allowedMaxDate = new Date(baseDate);
    allowedMaxDate.setDate(allowedMaxDate.getDate() + maxDays);

    const pickedDate = new Date(newDate);

    // 5️⃣ Validate Selected Date Range
    if (enableRevisions && enableDaysRule && pickedDate > allowedMaxDate) {
      return res.status(400).json({
        message: `You can only revise up to ${maxDays} days from the planned date`
      });
    }

    // 6️⃣ Save Revision History
    const oldDate = task.dueDate;

    task.revisions.push({
      oldDate,
      newDate: pickedDate,
      remarks,
      revisedBy
    });

    // 7️⃣ Update Task Fields
    task.revisionCount += 1;
    task.dueDate = pickedDate;
    task.lastPlannedDate = pickedDate;

    await task.save();

    // ✅ EMAIL: SEND ON TASK REVISION
    const emailSettings = await Settings.findOne({
      type: "email",
      companyId: task.companyId
    });

    if (emailSettings?.data?.enabled && emailSettings?.data?.sendOnTaskRevision) {
      const admins = await User.find({
        companyId: task.companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
      }).lean(); // ✅ Added lean()

      // Get user who requested the revision
      const revisingUser = userId ? await User.findById(userId).lean() : null;
      const assignedToUser = await User.findById(task.assignedTo).lean();

      const subject = `Task Revision Updated: ${task.title}`;
      const text = `
A task revision has been updated:

Title: ${task.title}
Description: ${task.description}

User: ${assignedToUser?.username || 'Unknown User'}
Revision Count: ${task.revisionCount}

${remarks ? `Revision Remarks: ${remarks}` : ''}

Please review the revision in the Task Dashboard:
https://tms.finamite.in
`;

      for (const admin of admins) {
        await sendSystemEmail(task.companyId, admin.email, subject, text);
      }
    }

    // 8️⃣ Populate and Return Updated Task
    const result = await Task.findById(task._id)
      .populate("assignedBy", "username email companyId")
      .populate("assignedTo", "username email companyId")
      .populate("revisions.revisedBy", "username email companyId")
      .lean(); // ✅ Added lean()

    res.json(result);

  } catch (error) {
    console.error("Error revising task:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});

// ✅ ULTRA-FAST: Reschedule master task endpoint
router.put('/reschedule/:taskGroupId', async (req, res) => {
  try {
    const { taskGroupId } = req.params;
    const updates = req.body;


    // 1. Find existing tasks for the group (lean and minimal fields)
    const existingTasks = await Task.find({ taskGroupId, isActive: true })
      .select('assignedBy assignedTo attachments parentTaskInfo companyId')
      .lean();

    if (existingTasks.length === 0) {
      return res.status(404).json({ message: "Master Task not found" });
    }

    const template = existingTasks[0];

    // 2. Delete old tasks (ultra-fast)
    await Task.deleteMany({ taskGroupId });

    // 3. Update master task entry
    await MasterTask.findOneAndUpdate(
      { taskGroupId },
      {
        title: updates.title,
        description: updates.description,
        taskType: updates.taskType,
        priority: updates.priority,
        assignedTo: updates.assignedTo,
        startDate: updates.startDate,
        endDate: updates.endDate,
        includeSunday: updates.includeSunday,
        isForever: updates.isForever,
        weeklyDays: updates.weeklyDays,
        weekOffDays: updates.weekOffDays || [],
        monthlyDay: updates.monthlyDay,
        yearlyDuration: updates.yearlyDuration
      },
      { upsert: true }
    );

    // 4. Generate new dates ultra-fast
    let taskDates = [];
    const startDate = new Date(updates.startDate);
    const endDate = updates.isForever
      ? new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate())
      : new Date(updates.endDate);

    switch (updates.taskType) {
      case 'daily':
        taskDates = getDailyTaskDates(startDate, endDate, updates.includeSunday, updates.weekOffDays);
        break;
      case 'weekly':
        taskDates = getWeeklyTaskDates(startDate, endDate, updates.weeklyDays, updates.weekOffDays);
        break;
      case 'monthly':
        taskDates = getMonthlyTaskDates(startDate, endDate, updates.monthlyDay, updates.includeSunday, updates.weekOffDays);
        break;
      case 'quarterly':
        taskDates = getQuarterlyTaskDates(startDate, updates.includeSunday, updates.weekOffDays);
        break;
      case 'yearly':
        taskDates = getYearlyTaskDates(startDate, updates.yearlyDuration, updates.includeSunday, updates.weekOffDays);
        break;
    }

    // 5. Ultra-fast bulk operations
    const bulkOps = taskDates.map((date, i) => ({
      insertOne: {
        document: {
          title: updates.title,
          description: updates.description,
          taskType: updates.taskType,
          priority: updates.priority,
          assignedBy: template.assignedBy,
          assignedTo: updates.assignedTo,
          companyId: template.companyId,
          attachments: template.attachments,
          dueDate: date,
          isActive: true,
          status: "pending",
          taskGroupId,
          sequenceNumber: i + 1,
          parentTaskInfo: {
            originalStartDate: updates.startDate,
            originalEndDate: updates.endDate,
            isForever: updates.isForever,
            includeSunday: updates.includeSunday,
            weeklyDays: updates.weeklyDays,
            weekOffDays: updates.weekOffDays || [],
            monthlyDay: updates.monthlyDay,
            yearlyDuration: updates.yearlyDuration
          }
        }
      }
    }));

    if (bulkOps.length > 0) {
      await Task.bulkWrite(bulkOps, { ordered: false });
    }


    res.json({
      message: "Master Task Rescheduled Successfully",
      instances: bulkOps.length
    });

  } catch (error) {
    console.error("❌ Ultra-fast reschedule error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ DELETE one-time task (soft delete)
router.delete('/onetime/:onetimeid', async (req, res) => {
  try {
    const { onetimeid } = req.params;

    if (!mongoose.Types.ObjectId.isValid(onetimeid)) {
      return res.status(400).json({ message: 'Invalid task ID' });
    }

    const task = await Task.findOne({
      _id: onetimeid,
      taskType: 'one-time',
      isActive: true
    });

    if (!task) {
      return res.status(404).json({
        message: 'One-time task not found or already deleted'
      });
    }

    // ✅ Soft delete
    task.isActive = false;
    task.deletedAt = new Date();

    await task.save();

    return res.json({
      message: 'One-time task deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting one-time task:', error);
    res.status(500).json({
      message: 'Failed to delete task',
      error: error.message
    });
  }
});



// ✅ OPTIMIZED: Delete task endpoint
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { moveToRecycleBin, companyId } = req.query;
    const isSoftDelete = moveToRecycleBin === 'true';

    if (isSoftDelete) {
      // Soft delete: Move to bin
      const binSettings = await Settings.findOne({ type: 'bin', companyId });
      const retentionDays = binSettings?.data?.retentionDays || 15;
      const autoDeleteAt = new Date();
      autoDeleteAt.setDate(autoDeleteAt.getDate() + retentionDays);

      const updateQuery = { _id: id, companyId, isDeleted: { $ne: true } };
      const updateData = {
        isActive: false,
        isDeleted: true,
        deletedAt: new Date(),
        autoDeleteAt
      };

      const task = await Task.findOneAndUpdate(updateQuery, updateData, { new: true });
      if (!task) {
        return res.status(404).json({ message: 'Task not found or already deleted' });
      }

      // ✅ Also soft delete the master task entry
      if (task.taskGroupId) {
        await MasterTask.findOneAndUpdate(
          { taskGroupId: task.taskGroupId },
          {
            isActive: false,
            isDeleted: true,
            deletedAt: new Date(),
            autoDeleteAt
          }
        );
      }

      // Send optional notification email if enabled
      if (binSettings?.data?.enabled) {
        const emailSettings = await Settings.findOne({ type: 'email', companyId });
        if (emailSettings?.data?.enabled) {
          const assignedUser = await User.findById(task.assignedTo).lean();
          if (assignedUser) {
            await sendSystemEmail(
              companyId,
              assignedUser.email,
              `Task Moved to Recycle Bin: ${task.title}`,
              `Your task "${task.title}" has been moved to the recycle bin. It will be permanently deleted in ${retentionDays} days unless restored.`
            );
          }
        }
      }

      res.json({ message: 'Task moved to recycle bin successfully' });
    } else {
      // Hard delete: Permanent removal
      const deleteQuery = { _id: id, companyId };
      const task = await Task.findOneAndDelete(deleteQuery);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // ✅ Also permanently delete the master task entry
      if (task.taskGroupId) {
        await MasterTask.findOneAndDelete({ taskGroupId: task.taskGroupId });
      }

      res.json({ message: 'Task permanently deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ OPTIMIZED: Recycle Bin Routes with better performance

// Get deleted master recurring tasks
router.get('/bin/master-recurring', async (req, res) => {
  try {
    const {
      taskType,
      status,
      assignedTo,
      assignedBy,
      priority,
      page = 1,
      limit = 50,
      search,
      dateFrom,
      dateTo,
      companyId
    } = req.query;

    const pipeline = [];
    let assignedById = null;

    if (req.query.assignedBy) {
      const user = await User.findOne({ username: req.query.assignedBy }).select('_id').lean();
      if (user) assignedById = user._id;
    }

    // ✅ FIXED: Match stage for deleted tasks
    const matchStage = {
      isActive: false,
      $or: [
        { isDeleted: true },
        { isDeleted: { $exists: false } },
        { isDeleted: null }
      ],
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
    };

    if (companyId) {
      matchStage.companyId = companyId;
    }

    if (taskType) {
      if (taskType.includes(',')) {
        matchStage.taskType = { $in: taskType.split(',') };
      } else {
        matchStage.taskType = taskType;
      }
    }

    if (status) {
      if (status.includes(',')) {
        matchStage.status = { $in: status.split(',') };
      } else {
        matchStage.status = status;
      }
    }

    if (assignedTo) matchStage.assignedTo = assignedTo;
    if (assignedById) matchStage.assignedBy = assignedById;
    if (priority) matchStage.priority = priority;

    if (dateFrom && dateTo) {
      matchStage.$or.push(
        {
          deletedAt: {
            $gte: new Date(dateFrom),
            $lte: new Date(dateTo)
          }
        },
        {
          deletedAt: { $exists: false },
          updatedAt: {
            $gte: new Date(dateFrom),
            $lte: new Date(dateTo)
          }
        }
      );
    }

    if (search) {
      matchStage.$and = matchStage.$and || [];
      matchStage.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      });
    }

    pipeline.push({ $match: matchStage });

    // Optimized lookups
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'assignedBy',
          foreignField: '_id',
          as: 'assignedByUser',
          pipeline: [{ $project: { username: 1, email: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedToUser',
          pipeline: [{ $project: { _id: 1, username: 1, email: 1 } }]
        }
      }
    );

    pipeline.push(
      { $unwind: '$assignedByUser' },
      { $unwind: '$assignedToUser' }
    );

    // Group by taskGroupId
    pipeline.push({
      $group: {
        _id: { $ifNull: ['$taskGroupId', '$_id'] },
        title: { $first: '$title' },
        description: { $first: '$description' },
        taskType: { $first: '$taskType' },
        priority: { $first: '$priority' },
        assignedBy: {
          $first: {
            username: '$assignedByUser.username',
            email: '$assignedByUser.email'
          }
        },
        assignedTo: {
          $first: {
            _id: '$assignedToUser._id',
            username: '$assignedToUser.username',
            email: '$assignedToUser.email'
          }
        },
        parentTaskInfo: { $first: '$parentTaskInfo' },
        attachments: { $first: '$attachments' },
        weekOffDays: { $first: '$weekOffDays' },
        deletedAt: {
          $first: {
            $ifNull: ['$deletedAt', '$updatedAt']
          }
        },
        autoDeleteAt: {
          $first: {
            $ifNull: [
              '$autoDeleteAt',
              { $add: ['$updatedAt', 15 * 24 * 60 * 60 * 1000] }
            ]
          }
        },
        tasks: {
          $push: {
            _id: '$_id',
            dueDate: '$dueDate',
            status: '$status',
            completedAt: '$completedAt',
            completionRemarks: '$completionRemarks',
            completionAttachments: '$completionAttachments',
            lastCompletedDate: '$lastCompletedDate',
            createdAt: '$createdAt',
            deletedAt: { $ifNull: ['$deletedAt', '$updatedAt'] },
            autoDeleteAt: {
              $ifNull: [
                '$autoDeleteAt',
                { $add: ['$updatedAt', 15 * 24 * 60 * 60 * 1000] }
              ]
            }
          }
        },
        instanceCount: { $sum: 1 },
        completedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        deletedCount: { $sum: 1 },
        firstDueDate: { $min: '$dueDate' },
        lastDueDate: { $max: '$dueDate' }
      }
    });

    pipeline.push({
      $addFields: {
        taskGroupId: '$_id',
        dateRange: {
          start: '$firstDueDate',
          end: '$lastDueDate'
        }
      }
    });

    pipeline.push({ $sort: { deletedAt: -1 } });

    const countPipeline = [...pipeline, { $count: 'total' }];
    const totalResult = await Task.aggregate(countPipeline).allowDiskUse(true);
    const total = totalResult[0]?.total || 0;

    pipeline.push(
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    );

    const masterTasks = await Task.aggregate(pipeline).allowDiskUse(true);

    masterTasks.forEach(masterTask => {
      masterTask.tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    });

    res.json({
      masterTasks,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      hasMore: page * limit < total
    });

  } catch (error) {
    console.error('Error fetching deleted master recurring tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get deleted individual recurring tasks
router.get('/bin/recurring-instances', async (req, res) => {
  try {
    const {
      taskType,
      status,
      assignedTo,
      assignedBy,
      priority,
      page = 1,
      limit = 100,
      search,
      dateFrom,
      dateTo,
      companyId
    } = req.query;

    let assignedById = null;

    if (assignedBy) {
      assignedById = assignedBy; // already an ObjectId
    }

    if (req.query.assignedBy) {
      const user = await User.findOne({ username: req.query.assignedBy }).select('_id').lean();
      if (user) assignedById = user._id;
    }

    // ✅ FIXED: Handle both properly deleted and legacy deleted tasks
    const query = {
      isActive: false,
      $or: [
        { isDeleted: true },
        { isDeleted: { $exists: false } },
        { isDeleted: null }
      ],
      taskType: { $in: ['one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
    };

    if (companyId) {
      query.companyId = companyId;
    }

    if (taskType) {
      if (taskType.includes(',')) {
        query.taskType = { $in: taskType.split(',') };
      } else {
        query.taskType = taskType;
      }
    }

    if (status) {
      if (status.includes(',')) {
        query.status = { $in: status.split(',') };
      } else {
        query.status = status;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (status === 'overdue') {
      query.status = 'pending';   // only pending tasks
      query.dueDate = { $lt: today }; // due date before today
    }

    if (assignedTo && assignedTo !== 'all') {
      query.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    }
    if (assignedById) query.assignedBy = assignedById;
    if (priority) query.priority = priority;

    if (dateFrom && dateTo) {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);

      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);

      query.dueDate = {
        $gte: start,
        $lte: end
      };
    }

    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // ✅ Use aggregation pipeline for better performance
    const pipeline = [
      { $match: query },
      {
        $addFields: {
          deletedAt: { $ifNull: ['$deletedAt', '$updatedAt'] },
          autoDeleteAt: {
            $ifNull: [
              '$autoDeleteAt',
              { $add: ['$updatedAt', 15 * 24 * 60 * 60 * 1000] }
            ]
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedBy',
          foreignField: '_id',
          as: 'assignedBy',
          pipeline: [{ $project: { username: 1, email: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedTo',
          pipeline: [{ $project: { _id: 1, username: 1, email: 1 } }]
        }
      },
      { $unwind: '$assignedBy' },
      { $unwind: '$assignedTo' },
      {
        $project: {
          title: 1,
          description: 1,
          taskType: 1,
          'assignedBy.username': 1,
          'assignedBy.email': 1,
          'assignedTo._id': 1,
          'assignedTo.username': 1,
          'assignedTo.email': 1,
          dueDate: 1,
          priority: 1,
          status: 1,
          lastCompletedDate: 1,
          completedAt: 1,
          completionRemarks: 1,
          completionAttachments: 1,
          createdAt: 1,
          attachments: 1,
          parentTaskInfo: 1,
          weekOffDays: 1,
          taskGroupId: 1,
          deletedAt: 1,
          autoDeleteAt: 1
        }
      },
      { $sort: { deletedAt: -1, createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ];

    const tasks = await Task.aggregate(pipeline).allowDiskUse(true);

    // Get total count
    const countPipeline = [
      { $match: query },
      { $count: 'total' }
    ];
    const totalResult = await Task.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    res.json({
      tasks,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      hasMore: page * limit < total
    });
  } catch (error) {
    console.error('Error fetching deleted recurring task instances:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get("/pending-approval-count", async (req, res) => {
  try {
    const { companyId, userId, role } = req.query;

    if (!companyId) {
      return res.status(400).json({ count: 0 });
    }

    const query = {
      companyId,
      isActive: true,
      status: "in-progress",
      requiresApproval: true
    };

    // 🔒 STRICT USER FILTER
    if (role === "employee") {
      if (!userId) {
        return res.json({ count: 0 });
      }
      query.assignedTo = userId;
    }

    const count = await Task.countDocuments(query);
    res.json({ count });

  } catch (error) {
    console.error("Pending approval count error:", error);
    res.status(500).json({ count: 0 });
  }
});


// Restore single task
router.post('/bin/restore/:id', async (req, res) => {
  try {
    const { companyId } = req.body;
    const updateQuery = { _id: req.params.id };

    if (companyId) {
      updateQuery.companyId = companyId;
    }

    const task = await Task.findOneAndUpdate(
      {
        ...updateQuery,
        isActive: false
      },
      {
        isActive: true,
        isDeleted: false,
        $unset: { deletedAt: 1, autoDeleteAt: 1 }
      },
      { new: true }
    );

    // ✅ Also restore the master task entry
    if (task && task.taskGroupId) {
      await MasterTask.findOneAndUpdate(
        { taskGroupId: task.taskGroupId },
        {
          isActive: true,
          isDeleted: false,
          $unset: { deletedAt: 1, autoDeleteAt: 1 }
        }
      );
    }

    if (!task) {
      return res.status(404).json({ message: 'Task not found in recycle bin' });
    }

    res.json({ message: 'Task restored successfully' });
  } catch (error) {
    console.error('Error restoring task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Restore master task series
router.post('/bin/restore-master/:taskGroupId', async (req, res) => {
  try {
    const { taskGroupId } = req.params;
    const { companyId } = req.body;

    const updateQuery = { taskGroupId };
    if (companyId) {
      updateQuery.companyId = companyId;
    }

    const result = await Task.updateMany(
      {
        ...updateQuery,
        isActive: false
      },
      {
        isActive: true,
        isDeleted: false,
        $unset: { deletedAt: 1, autoDeleteAt: 1 }
      }
    );

    // ✅ Also restore master task entries
    await MasterTask.updateMany(
      { taskGroupId },
      {
        isActive: true,
        isDeleted: false,
        $unset: { deletedAt: 1, autoDeleteAt: 1 }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Master task series not found in recycle bin' });
    }

    res.json({
      message: 'Master task series restored successfully',
      restoredCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error restoring master task series:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});




// Permanently delete single task
router.delete('/bin/permanent/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(id);

    let result;
    if (isObjectId) {
      result = await Task.findOneAndDelete({ _id: id });
    } else {
      result = await Task.deleteMany({ taskGroupId: id });
    }

    return res.json({ message: 'Deleted successfully', result });
  } catch (error) {
    console.error('Error deleting permanently:', error);
    return res.status(500).json({ message: 'Server error', error });
  }
});

router.post("/reassign/:taskGroupId", async (req, res) => {
  try {
    const { taskGroupId } = req.params;
    const { includeFiles, companyId } = req.body;


    // 1️⃣ Load the original MasterTask
    const oldMaster = await MasterTask.findOne({ taskGroupId, companyId }).lean();

    if (!oldMaster) {
      return res.status(404).json({ message: "Master task not found" });
    }

    if (!oldMaster.isForever) {
      return res.status(400).json({ message: "Reassign allowed only for forever tasks" });
    }

    // 2️⃣ Calculate new start/end dates
    const lastEnd = new Date(oldMaster.endDate);
    lastEnd.setDate(lastEnd.getDate() + 1); // Next day start

    const newStartDate = lastEnd;
    const newEndDate = new Date(newStartDate);
    newEndDate.setFullYear(newEndDate.getFullYear() + 1);


    // 3️⃣ Create NEW MasterTask
    const newGroupId = `MT-${Date.now()}`;

    const newMaster = await MasterTask.create({
      taskGroupId: newGroupId,
      title: oldMaster.title,
      description: oldMaster.description,
      taskType: oldMaster.taskType,
      priority: oldMaster.priority,
      companyId,

      assignedTo: oldMaster.assignedTo,
      assignedBy: oldMaster.assignedBy,

      startDate: newStartDate,
      endDate: newEndDate,

      includeSunday: oldMaster.includeSunday,
      isForever: true,
      weeklyDays: oldMaster.weeklyDays,
      weekOffDays: oldMaster.weekOffDays,
      monthlyDay: oldMaster.monthlyDay,
      yearlyDuration: oldMaster.yearlyDuration,

      attachments: includeFiles ? oldMaster.attachments : []
    });



    // 4️⃣ Generate new task instances
    let dates = [];

    if (oldMaster.taskType === "daily") {
      dates = getDailyTaskDates(newStartDate, newEndDate, oldMaster.includeSunday, oldMaster.weekOffDays);
    } else if (oldMaster.taskType === "weekly") {
      dates = getWeeklyTaskDates(newStartDate, newEndDate, oldMaster.weeklyDays, oldMaster.weekOffDays);
    } else if (oldMaster.taskType === "monthly") {
      dates = getMonthlyTaskDates(newStartDate, newEndDate, oldMaster.monthlyDay, oldMaster.includeSunday, oldMaster.weekOffDays);
    } else if (oldMaster.taskType === "quarterly") {
      dates = getQuarterlyTaskDates(newStartDate, oldMaster.includeSunday, oldMaster.weekOffDays);
    } else if (oldMaster.taskType === "yearly") {
      dates = getYearlyTaskDates(newStartDate, oldMaster.yearlyDuration, oldMaster.includeSunday, oldMaster.weekOffDays);
    }


    const newTasks = [];

    for (let i = 0; i < dates.length; i++) {
      const t = await Task.create({
        title: oldMaster.title,
        description: oldMaster.description,
        taskType: oldMaster.taskType,
        priority: oldMaster.priority,
        companyId,

        assignedBy: oldMaster.assignedBy,
        assignedTo: oldMaster.assignedTo,

        dueDate: dates[i],
        taskGroupId: newGroupId,
        sequenceNumber: i + 1,

        parentTaskInfo: {
          originalStartDate: newStartDate,
          originalEndDate: newEndDate,
          isForever: true,
          includeSunday: oldMaster.includeSunday,
          weeklyDays: oldMaster.weeklyDays,
          weekOffDays: oldMaster.weekOffDays,
          monthlyDay: oldMaster.monthlyDay,
          yearlyDuration: oldMaster.yearlyDuration
        },

        attachments: includeFiles ? oldMaster.attachments : []
      });

      newTasks.push(t);
    }


    return res.json({
      message: "Reassigned successfully",
      newMasterTask: newMaster,
      createdTasks: newTasks
    });

  } catch (err) {
    console.error("❌ REASSIGN ERROR:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { userid } = req.headers; // admin user id
    const { remarks } = req.body;

    const task = await Task.findById(id);
    if (!task || task.status !== 'in-progress') {
      return res.status(400).json({ message: 'Invalid task for approval' });
    }

    // ✅ FINALIZE TASK
    task.status = 'completed';

    task.approvedAt = new Date();

    // ✅ WHO APPROVED (optional but recommended)
    if (userid) {
      task.approvedBy = userid;
    }

    // Optional admin remarks
    if (remarks && remarks.trim()) {
      task.completionRemarks = remarks.trim();
    }

    await task.save();

    // 📩 Notify assignee
    const assignedUser = await User.findById(task.assignedTo);
    if (assignedUser) {
      await sendSystemEmail(
        task.companyId,
        assignedUser.email,
        'Task Approved',
        `Your task "${task.title}" has been approved.`
      );
    }

    res.json({
      success: true,
      message: 'Task approved successfully',
      approvedAt: task.approvedAt
    });

  } catch (error) {
    console.error('Approve task error:', error);
    res.status(500).json({ error: error.message });
  }
});


router.post('/:id/reject', async (req, res) => {
  try {
    const { action, remarks } = req.body;
    const taskId = req.params.id;
    const { userid } = req.headers;

    // ✅ Validate action
    if (!['noAction', 'reassign', 'finalize-reassign'].includes(action)) {
      return res.status(400).json({ message: 'Invalid reject action' });
    }

    // ✅ Remarks required
    if (!remarks || !remarks.trim()) {
      return res.status(400).json({ message: 'Remarks are required' });
    }

    // ✅ Fetch task ONCE
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // ✅ Common rejection fields
    task.rejectionRemarks = remarks.trim();
    task.rejectedAt = new Date();

    // =====================================================
    // 1️⃣ NO ACTION REQUIRED (final reject)
    // =====================================================
    if (action === 'noAction') {
      task.status = 'rejected';
      task.requiresApproval = false;
      task.reassignRequested = false;
      task.rejectedBy = userid;

      await task.save();

      return res.json({
        success: true,
        message: 'Task rejected (No action required)',
        taskId: task._id
      });
    }

    // =====================================================
    // 2️⃣ FINALIZE REASSIGN (after new task created)
    // =====================================================
    if (action === 'finalize-reassign') {
      task.status = 'rejected';
      task.reassignRequested = false;

      await task.save();

      return res.json({
        success: true,
        message: 'Task rejected after reassignment'
      });
    }

    // =====================================================
    // 3️⃣ REASSIGN (intent only, redirect to Assign Task)
    // =====================================================
    task.reassignRequested = true;
    await task.save();

    // Ensure taskGroupId exists
    if (!task.taskGroupId) {
      task.taskGroupId = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}-${task.assignedTo}`;
      await task.save();
    }

    // Ensure MasterTask exists
    let master = await MasterTask.findOne({ taskGroupId: task.taskGroupId });

    if (!master) {
      master = await MasterTask.create({
        taskGroupId: task.taskGroupId,
        title: task.title,
        description: task.description,
        taskType: task.taskType,
        priority: task.priority,
        assignedBy: task.assignedBy,
        assignedTo: task.assignedTo,
        companyId: task.companyId,

        // Reference dates only
        startDate: task.dueDate,
        endDate: task.dueDate,

        weeklyDays: task.weeklyDays || [],
        weekOffDays: task.weekOffDays || [],
        monthlyDay: task.monthlyDay || 1,
        yearlyDuration: task.yearlyDuration || 1,

        includeSunday: task.parentTaskInfo?.includeSunday ?? true,
        isForever: task.parentTaskInfo?.isForever ?? false,

        attachments: task.attachments || [],
        parentTaskInfo: task.parentTaskInfo || {}
      });
    }

    return res.json({
      success: true,
      action: 'reassign',
      reassignPayload: {
        taskGroupId: master.taskGroupId,
        originalTaskId: task._id
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting task:', error);
    res.status(500).json({
      message: 'Failed to reject task',
      error: error.message
    });
  }
});



router.post('/:id/archive', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.isActive = false;
    task.status = 'pending';
    await task.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to archive task' });
  }
});


// Auto-cleanup expired tasks (cron job endpoint)
router.post('/bin/cleanup', async (req, res) => {
  try {
    const now = new Date();

    const result = await Task.deleteMany({
      $or: [
        {
          isDeleted: true,
          autoDeleteAt: { $lte: now }
        },
        {
          isActive: false,
          isDeleted: { $exists: false },
          updatedAt: { $lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
        }
      ]
    });

    res.json({
      message: 'Cleanup completed successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error during auto-cleanup:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Empty entire recycle bin for a company
router.delete('/bin/empty', async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const result = await Task.deleteMany({
      companyId,
      isActive: false
    });

    res.json({
      message: 'Recycle bin emptied successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error emptying recycle bin:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;