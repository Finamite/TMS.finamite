import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { sendSystemEmail } from '../Utils/sendEmail.js';
import MasterTask from "../models/MasterTask.js";

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

    if (assignedTo) query.assignedTo = assignedTo;
    if (assignedBy) query.assignedBy = assignedBy;
    if (priority) query.priority = priority;

    if (startDate && endDate) {
      query.dueDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const tasks = await Task.find(query)
      .populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId')
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
      status: { $in: ['pending', 'overdue'] } // Only show pending or overdue
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
    const { userId, companyId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day for comparison
    const fiveDaysFromNow = new Date(today);
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    // ✅ Super optimized query with better indexing
    const query = {
      isActive: true,
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
      status: { $in: ['pending', 'overdue'] },
      dueDate: { $lte: fiveDaysFromNow }
    };

    if (companyId) {
      query.companyId = companyId;
    }

    if (userId) query.assignedTo = userId;

    // ✅ Ultra-fast query with minimal data transfer
    const tasks = await Task.find(query)
      .select('title description taskType assignedBy assignedTo dueDate priority status lastCompletedDate createdAt attachments')
      .populate('assignedBy', 'username email')
      .populate('assignedTo', '_id username email')
      .sort({ dueDate: 1 })
      .lean(); // ✅ Lean for maximum performance

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching pending recurring tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ ULTRA-FAST: Team pending tasks with aggregation optimization
router.get('/team-pending-fast', async (req, res) => {
  try {
    const { companyId } = req.query;

    // ✅ Super optimized aggregation pipeline
    const tasks = await Task.aggregate([
      {
        $match: {
          companyId,
          isActive: true,
          status: { $in: ["pending", "overdue"] }
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
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { username: 1 } }] // ✅ Only select username field
        }
      },
      { $unwind: "$user" },
      {
        $addFields: {
          username: "$user.username",
          isToday: {
            $eq: [
              { $dateToString: { format: "%Y-%m-%d", date: "$dueDate" } },
              { $dateToString: { format: "%Y-%m-%d", date: new Date() } }
            ]
          },
          isOverdue: { $lt: ["$dueDate", new Date()] }
        }
      },
      {
        $group: {
          _id: "$username",
          oneTimeToday: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$taskType", "one-time"] }, "$isToday"] }, 1, 0
              ]
            }
          },
          oneTimeOverdue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$taskType", "one-time"] }, "$isOverdue"] }, 1, 0
              ]
            }
          },
          dailyToday: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$taskType", "daily"] }, "$isToday"] }, 1, 0
              ]
            }
          },
          recurringToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$taskType", ["weekly", "monthly", "quarterly", "yearly"]] },
                    "$isToday"
                  ]
                }, 1, 0
              ]
            }
          },
          recurringOverdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$taskType", ["weekly", "monthly", "quarterly", "yearly"]] },
                    "$isOverdue"
                  ]
                }, 1, 0
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } } // ✅ Sort by username for consistent ordering
    ]).allowDiskUse(true); // ✅ Allow disk use for large datasets

    res.json(tasks);
  } catch (err) {
    console.error('Error in team-pending-fast:', err);
    res.json([]);
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

    console.log('🚀 Fetching master recurring tasks - Ultra-optimized version');

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
    console.log('⚡ Executing ultra-fast aggregation pipeline...');
    const masterTasks = await Task.aggregate(pipeline).allowDiskUse(true);

    // ✅ Sort tasks within each group efficiently
    masterTasks.forEach(masterTask => {
      masterTask.tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    });

    console.log(`✅ Ultra-fast fetch completed: ${masterTasks.length} master tasks`);

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

    console.log(`🔍 Searching for master tasks with companyId: ${companyId}`);

    // 🔥 Try to get from MasterTask collection first
    let masters = await MasterTask.find(
      { companyId, isActive: { $ne: false } },
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

    console.log(`📊 Found ${masters.length} master tasks in MasterTask collection`);

    // 🚀 FALLBACK: If no master tasks found, generate from Task collection
    if (!masters.length) {
      console.log('🔄 No master tasks found, generating from Task collection...');

      const taskGroups = await Task.aggregate([
        {
          $match: {
            companyId,
            isActive: true,
            taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
            taskGroupId: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$taskGroupId',
            title: { $first: '$title' },
            description: { $first: '$description' },
            taskType: { $first: '$taskType' },
            priority: { $first: '$priority' },
            assignedTo: { $first: '$assignedTo' },
            assignedBy: { $first: '$assignedBy' },
            attachments: { $first: '$attachments' },
            parentTaskInfo: { $first: '$parentTaskInfo' },
            weekOffDays: { $first: '$weekOffDays' },
            firstDueDate: { $min: '$dueDate' },
            lastDueDate: { $max: '$dueDate' },
            createdAt: { $first: '$createdAt' }
          }
        },
        { $limit: 1000 }
      ]).allowDiskUse(true);

      console.log(`🔄 Generated ${taskGroups.length} master tasks from Task collection`);

      // Convert task groups to master task format
      masters = taskGroups.map(group => ({
        taskGroupId: group._id,
        title: group.title,
        description: group.description,
        taskType: group.taskType,
        priority: group.priority,
        assignedTo: group.assignedTo,
        assignedBy: group.assignedBy,
        startDate: group.parentTaskInfo?.originalStartDate || group.firstDueDate,
        endDate: group.parentTaskInfo?.originalEndDate || group.lastDueDate,
        includeSunday: group.parentTaskInfo?.includeSunday ?? true,
        isForever: group.parentTaskInfo?.isForever ?? false,
        weeklyDays: group.parentTaskInfo?.weeklyDays || [],
        weekOffDays: group.parentTaskInfo?.weekOffDays || group.weekOffDays || [],
        monthlyDay: group.parentTaskInfo?.monthlyDay,
        yearlyDuration: group.parentTaskInfo?.yearlyDuration || 1,
        attachments: group.attachments || [],
        createdAt: group.createdAt
      }));

      // 🚀 SYNC: Create missing MasterTask entries for future use
      if (masters.length > 0) {
        console.log('💾 Syncing master tasks to MasterTask collection...');
        const masterTaskOps = masters.map(master => ({
          updateOne: {
            filter: { taskGroupId: master.taskGroupId },
            update: { $setOnInsert: master },
            upsert: true
          }
        }));

        try {
          await MasterTask.bulkWrite(masterTaskOps, { ordered: false });
          console.log('✅ Master tasks synced successfully');
        } catch (syncError) {
          console.error('⚠️ Error syncing master tasks:', syncError);
        }
      }
    }

    if (!masters.length) {
      console.log('❌ No master tasks found in either collection');
      return res.json([]);
    }

    // ---------------------------------------------------
    // 🧠 Populate Usernames manually — MUCH FASTER than .populate()
    // ---------------------------------------------------
    const userIds = [
      ...new Set([
        ...masters.map((m) => m.assignedTo?.toString()),
        ...masters.map((m) => m.assignedBy?.toString())
      ])
    ].filter(Boolean);

    const users = await User.find(
      { _id: { $in: userIds } },
      { username: 1, email: 1 }
    )
      .lean();

    const userMap = {};
    users.forEach((u) => {
      userMap[u._id.toString()] = u;
    });

    console.log(`👥 Populated ${Object.keys(userMap).length} users`);

    const taskGroupIds = masters.map(m => m.taskGroupId);

    const counts = await Task.aggregate([
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
          }
        }
      }
    ]);

    const countMap = {};
    counts.forEach(c => (countMap[c._id] = c));

    // ---------------------------------------------------
    // 🧩 FINAL FORMAT (safe for React)
    // ---------------------------------------------------
    const formatted = masters.map((m) => ({
      ...m,
      assignedTo: userMap[m.assignedTo?.toString()] || null,
      assignedBy: userMap[m.assignedBy?.toString()] || null,
      dateRange: {
        start: m.startDate,
        end: m.endDate
      },
      parentTaskInfo: {
        includeSunday: m.includeSunday,
        isForever: m.isForever,
        weeklyDays: m.weeklyDays,
        weekOffDays: m.weekOffDays,
        monthlyDay: m.monthlyDay,
        yearlyDuration: m.yearlyDuration
      },
      instanceCount: countMap[m.taskGroupId]?.instanceCount || 0,
      completedCount: countMap[m.taskGroupId]?.completedCount || 0,
      pendingCount: countMap[m.taskGroupId]?.pendingCount || 0
    }));

    console.log(`✅ Returning ${formatted.length} formatted master tasks`);

    return res.json(formatted);
  } catch (error) {
    console.error("❌ master-recurring-light error:", error);
    res.status(500).json({
      message: "Failed to fetch master tasks",
      error: error.message
    });
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
    const { tasks, totalUsers } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ message: 'No tasks provided' });
    }

    console.log(`🚀 LIGHTNING BULK CREATE: Processing ${tasks.length} task types for ${totalUsers} users`);
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
      console.log(`⚡ LIGHTNING BULK INSERT: Writing ${allBulkOperations.length} tasks to database...`);
      await Task.bulkWrite(allBulkOperations, {
        ordered: false,
        bypassDocumentValidation: false // ✅ Keep validation for data integrity
      });
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`⚡ LIGHTNING BULK CREATE COMPLETED: ${totalTasksCreated} tasks created in ${duration}s`);

    res.status(201).json({
      message: `⚡ Lightning fast! Successfully created ${totalTasksCreated} tasks in ${duration}s`,
      totalTasksCreated,
      totalUsers,
      duration,
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
    const { completionRemarks, completionAttachments, companyId, userId } = req.body;
    const findQuery = { _id: req.params.id };

    if (companyId) {
      findQuery.companyId = companyId;
    }

    const task = await Task.findOne(findQuery);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // 1. Mark the current task instance as completed
    task.status = 'completed';
    task.completedAt = new Date();

    if (completionRemarks && completionRemarks.trim()) {
      task.completionRemarks = completionRemarks.trim();
    }

    if (completionAttachments && completionAttachments.length > 0) {
      task.completionAttachments = completionAttachments;
    }

    task.lastCompletedDate = new Date();

    // SAVE TASK FIRST
    await task.save();

    // ✅ EMAIL: SEND ON TASK COMPLETION
    const emailSettings = await Settings.findOne({
      type: "email",
      companyId: task.companyId
    });

    if (emailSettings?.data?.enabled && emailSettings?.data?.sendOnTaskComplete) {
      // Get all admins + managers of same company
      const admins = await User.find({
        companyId: task.companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
      }).lean(); // ✅ Added lean()

      // Get user who completed the task
      const completingUser = userId ? await User.findById(userId).lean() : null;
      const assignedToUser = await User.findById(task.assignedTo).lean();

      const subject = `Task Completed: ${task.title}`;
      const attachmentsText =
        task.completionAttachments?.length > 0
          ? `\nAttached Files:\n${task.completionAttachments
            .map(a => "- " + (a.filename || a.originalName || a.name || "file"))
            .join("\n")}\n`
          : '';
      const text = `
The following task has been completed:

Title: ${task.title}
Description: ${task.description}

Completed by: ${assignedToUser?.username || 'Unknown User'}
Completed at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

${completionRemarks ? `Completion Remarks: ${completionRemarks}` : ''}

${attachmentsText}

Please check the Task Dashboard for more details:
https://tms.finamite.in
`;

      for (const admin of admins) {
        await sendSystemEmail(task.companyId, admin.email, subject, text, "", task.completionAttachments || []);
      }
    }

    // Populate for frontend response
    const populatedTask = await Task.findById(task._id)
      .populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId')
      .lean(); // ✅ Added lean()

    res.json(populatedTask);

  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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

    console.log(`⚡ Ultra-fast rescheduling master task: ${taskGroupId}`);

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

    console.log(`⚡ Ultra-fast rescheduling completed: ${bulkOps.length} tasks`);

    res.json({
      message: "Master Task Rescheduled Successfully",
      instances: bulkOps.length
    });

  } catch (error) {
    console.error("❌ Ultra-fast reschedule error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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

    if (assignedTo) query.assignedTo = assignedTo;
    if (assignedById) query.assignedBy = assignedById;
    if (priority) query.priority = priority;

    if (dateFrom && dateTo) {
      query.$or.push(
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