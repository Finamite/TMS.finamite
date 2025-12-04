import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { sendSystemEmail } from '../Utils/sendEmail.js';

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

// Get all tasks with filters
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
      .skip((page - 1) * limit);

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

// Get pending tasks (including one-time and recurring that are overdue or due)
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
      .sort({ dueDate: 1 }); // Sort by due date ascending

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching pending tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ OPTIMIZED: Get pending recurring tasks with better performance
router.get('/pending-recurring', async (req, res) => {
  try {
    const { userId, companyId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to start of day for comparison
    const fiveDaysFromNow = new Date(today);
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    // ✅ Optimized query with better indexing and specific filtering
    const query = {
      isActive: true,
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }, // Only recurring tasks
      status: { $in: ['pending', 'overdue'] }, // Only pending or overdue
      dueDate: { $lte: fiveDaysFromNow } // Due today or within the next 5 days (or overdue)
    };

    // Add company filter - CRITICAL for multi-tenant security
    if (companyId) {
      query.companyId = companyId;
    }

    if (userId) query.assignedTo = userId; // Filter by assigned user if provided

    // ✅ Use lean() for faster queries and select only necessary fields to reduce data transfer
    const tasks = await Task.find(query)
      .select('title description taskType assignedBy assignedTo dueDate priority status lastCompletedDate createdAt attachments')
      .populate('assignedBy', 'username email')
      .populate('assignedTo', '_id username email')
      .sort({ dueDate: 1 }) // Sort by due date ascending
      .lean(); // ✅ Use lean for better performance

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching pending recurring tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/team-pending-fast', async (req, res) => {
  try {
    const { companyId } = req.query;

    const tasks = await Task.aggregate([
      { $match: {
          companyId,
          isActive: true,
          status: { $in: ["pending", "overdue"] }
      }},
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
          as: "user"
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
                { $and: [ { $eq: ["$taskType", "one-time"] }, "$isToday" ] }, 1, 0
              ]
            }
          },
          oneTimeOverdue: {
            $sum: {
              $cond: [
                { $and: [ { $eq: ["$taskType", "one-time"] }, "$isOverdue" ] }, 1, 0
              ]
            }
          },
          dailyToday: {
            $sum: {
              $cond: [
                { $and: [ { $eq: ["$taskType", "daily"] }, "$isToday" ] }, 1, 0
              ]
            }
          },
          recurringToday: {
            $sum: {
              $cond: [
                { $and: [
                    { $in: ["$taskType", ["weekly","monthly","quarterly","yearly"]] },
                    "$isToday"
                ] }, 1, 0
              ]
            }
          },
          recurringOverdue: {
            $sum: {
              $cond: [
                { $and: [
                    { $in: ["$taskType", ["weekly","monthly","quarterly","yearly"]] },
                    "$isOverdue"
                ] }, 1, 0
              ]
            }
          }
        }
      }
    ]);

    res.json(tasks);
  } catch (err) {
    res.json([]);
  }
});

// ✅ NEW OPTIMIZED ROUTE: Get master recurring tasks with pre-processed data
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

    // Build aggregation pipeline for better performance
    const pipeline = [];

    // Match stage - filter at database level
    const matchStage = {
      isActive: true,
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
    };

    // Add company filter - CRITICAL for multi-tenant security
    if (companyId) {
      matchStage.companyId = companyId;
    }

    // Add filters
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
    if (assignedBy) matchStage.assignedBy = assignedBy;
    if (priority) matchStage.priority = priority;

    if (dateFrom && dateTo) {
      matchStage.dueDate = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    }

    // Add search functionality
    if (search) {
      matchStage.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    pipeline.push({ $match: matchStage });

    // Populate user data
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'assignedBy',
          foreignField: '_id',
          as: 'assignedByUser'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedToUser'
        }
      }
    );

    // Unwind user arrays
    pipeline.push(
      { $unwind: '$assignedByUser' },
      { $unwind: '$assignedToUser' }
    );

    // Group by taskGroupId to create master tasks
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

    // Add computed fields
    pipeline.push({
      $addFields: {
        taskGroupId: '$_id',
        dateRange: {
          start: '$firstDueDate',
          end: '$lastDueDate'
        }
      }
    });

    // Sort by first due date
    pipeline.push({ $sort: { firstDueDate: 1 } });

    // Get total count for pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const totalResult = await Task.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    // Add pagination
    pipeline.push(
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    );

    // Execute aggregation
    const masterTasks = await Task.aggregate(pipeline);

    // Sort tasks within each group by due date
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
    console.error('Error fetching master recurring tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW ROUTE: Get individual recurring tasks (optimized for non-edit mode)
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

    const query = {
      isActive: true,
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
    };

    // Add company filter - CRITICAL for multi-tenant security
    if (companyId) {
      query.companyId = companyId;
    }

    // Add filters
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

    if (dateFrom && dateTo) {
      query.dueDate = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Use lean() for better performance and select only necessary fields
    const tasks = await Task.find(query)
      .select('title description taskType assignedBy assignedTo dueDate priority status lastCompletedDate completedAt completionRemarks completionAttachments createdAt attachments parentTaskInfo weekOffDays taskGroupId')
      .populate('assignedBy', 'username email')
      .populate('assignedTo', '_id username email')
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Task.countDocuments(query);

    res.json({
      tasks,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      hasMore: page * limit < total
    });
  } catch (error) {
    console.error('Error fetching recurring task instances:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ⚡ SUPER FAST BULK CREATE: Single API endpoint for all tasks
router.post('/bulk-create', async (req, res) => {
  try {
    const { tasks, totalUsers } = req.body;
    
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ message: 'No tasks provided' });
    }

    console.log(`🚀 BULK CREATE: Processing ${tasks.length} task types for ${totalUsers} users`);
    const startTime = Date.now();

    let totalTasksCreated = 0;
    const allBulkOperations = [];
    
    // ⚡ Process all tasks in parallel
    await Promise.all(tasks.map(async (taskData) => {
      const { assignedTo, ...taskTemplate } = taskData;
      
      // ⚡ Process each assigned user for this task
      await Promise.all(assignedTo.map(async (assignedUserId) => {
        let taskDates = [];
        
        // ⚡ Generate dates for this task type
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

          // ⚡ Fast date generation based on type
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

        // ⚡ Generate unique task group ID
        const taskGroupId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${assignedUserId}`;
        
        // ⚡ Prepare ALL task instances for bulk insert
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

        // ⚡ Send email notification (async, don't wait)
        setImmediate(() => sendTaskAssignmentEmail({
          ...taskData,
          assignedTo: assignedUserId
        }));
      }));
    }));

    // ⚡ SUPER FAST: Single bulk write operation for ALL tasks
    if (allBulkOperations.length > 0) {
      console.log(`⚡ BULK INSERT: Writing ${allBulkOperations.length} tasks to database...`);
      await Task.bulkWrite(allBulkOperations, { ordered: false });
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`✅ BULK CREATE COMPLETED: ${totalTasksCreated} tasks created in ${duration}s`);

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
    console.error('❌ Error in bulk create:', error);
    res.status(500).json({ 
      message: 'Bulk task creation failed', 
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

    // CREATE ALL TASK INSTANCES
    for (let i = 0; i < taskDates.length; i++) {
      const taskDate = taskDates[i];

      const individualTaskData = {
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
      };

      const task = new Task(individualTaskData);
      await task.save();
      createdTasks.push(task);
    }

    // ✅ SEND EMAIL NOTIFICATION
    await sendTaskAssignmentEmail(taskData);

    // RESPONSE
    res.status(201).json({
      message: `Successfully created ${createdTasks.length} tasks`,
      tasksCreated: createdTasks.length,
      taskGroupId: taskGroupId,
      tasks: createdTasks.slice(0, 5)
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
    // This part might need re-evaluation if this endpoint is only for one-time tasks
    // or if scheduled tasks are exclusively created via /create-scheduled
    if (taskData.isForever && taskData.startDate) {
      const oneYearLater = new Date(taskData.startDate);
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      taskData.endDate = oneYearLater;
    }

    const task = new Task({
      ...taskData,
      attachments: taskData.attachments || [] // Pass attachments here
    });
    await task.save();

    // ✅ SEND EMAIL NOTIFICATION FOR SINGLE TASK CREATION
    await sendTaskAssignmentEmail(taskData);

    const populatedTask = await Task.findById(task._id)
      .populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId');

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update task
router.put('/:id', async (req, res) => {
  try {
    const { companyId } = req.query;
    const updateQuery = { _id: req.params.id };

    // Add company filter for security
    if (companyId) {
      updateQuery.companyId = companyId;
    }

    const task = await Task.findOneAndUpdate(
      updateQuery,
      req.body, // req.body should now correctly include the attachments array if it's being updated
      { new: true } // Return the updated document
    ).populate('assignedBy', 'username email companyId')
      .populate('assignedTo', 'username email companyId');

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

    // Add company filter for security
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

    task.lastCompletedDate = new Date(); // Record when this instance was completed

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
      });

      // Get user who completed the task
      const completingUser = userId ? await User.findById(userId) : null;
      const assignedToUser = await User.findById(task.assignedTo);

      const completedByName = completingUser?.username || assignedToUser?.username || 'Unknown User';

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
      .populate('assignedTo', 'username email companyId');

    res.json(populatedTask);

  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ FIXED: Revise task - with proper email notification
router.post('/:id/revise', async (req, res) => {
  try {
    console.log('Revise request body:', req.body); // Debug log - remove in production
    const { newDate, remarks, revisedBy, companyId, userId } = req.body;

    if (!newDate) {
      console.log('Missing newDate'); // Debug log - remove in production
      return res.status(400).json({ message: "New revision date is required" });
    }

    const pickedDateTest = new Date(newDate);
    if (isNaN(pickedDateTest.getTime())) {
      console.log('Invalid newDate format:', newDate);
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

// 3️⃣ Check Revision Limit (only if revisions enabled)
let limit = enableMaxRevision ? (revisionSettings?.data?.limit ?? 3) : Infinity;
if (!enableRevisions) {
  limit = Infinity;
}

if (enableRevisions && task.revisionCount >= limit) {
  return res.status(400).json({
    message: `Maximum ${limit} revisions allowed`
  });
}

// 4️⃣ Determine Base Date & Max Days (only apply day limits if revisions AND days rule enabled)
const baseDate = task.lastPlannedDate
  ? new Date(task.lastPlannedDate)
  : new Date(task.dueDate);

let maxDays = Infinity; // Default: no day limit

if (enableRevisions && enableDaysRule) {
  maxDays = revisionSettings?.data?.maxDays ?? 7; // Fallback to global maxDays
  const days = revisionSettings?.data?.days || {};
  const revisionIndex = task.revisionCount + 1;
  if (days[revisionIndex] !== undefined && days[revisionIndex] !== null) {
    maxDays = days[revisionIndex]; // Override with revision-specific days
  }
}

const allowedMaxDate = new Date(baseDate);
allowedMaxDate.setDate(allowedMaxDate.getDate() + maxDays);

const pickedDate = new Date(newDate);

// 5️⃣ Validate Selected Date Range (only if day limits apply)
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
    task.revisionCount += 1; // Increment even if disabled (for tracking)
    task.dueDate = pickedDate;
    task.lastPlannedDate = pickedDate; // Next revision starts from this

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
      });

      // Get user who requested the revision
      const revisingUser = userId ? await User.findById(userId) : null;
      const assignedToUser = await User.findById(task.assignedTo);

      const requestedByName = revisingUser?.username || assignedToUser?.username || 'Unknown User';

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
      .populate("revisions.revisedBy", "username email companyId");

    res.json(result);

  } catch (error) {
    console.error("Error revising task:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
});

// PUT /api/tasks/reschedule/:taskGroupId
router.put('/reschedule/:taskGroupId', async (req, res) => {
  try {
    const { taskGroupId } = req.params;
    const updates = req.body;

    // 1. Find existing tasks for the group
    const existingTasks = await Task.find({ taskGroupId, isActive: true })
      .select('assignedBy assignedTo attachments parentTaskInfo companyId');

    if (existingTasks.length === 0) {
      return res.status(404).json({ message: "Master Task not found" });
    }

    const template = existingTasks[0];

    // 2. Delete old tasks (fast)
    await Task.deleteMany({ taskGroupId });

    // 3. Recreate tasks using same speed logic as bulk-create
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

    await Task.bulkWrite(bulkOps, { ordered: false });

    res.json({ 
      message: "Master Task Rescheduled Successfully",
      instances: bulkOps.length
    });

  } catch (error) {
    console.error("Reschedule Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete task (soft delete by setting isActive to false)
router.delete('/:id', async (req, res) => {

  try {
    const { companyId } = req.query;
    const updateQuery = { _id: req.params.id };

    // Add company filter for security
    if (companyId) {
      updateQuery.companyId = companyId;
    }

    const task = await Task.findOneAndUpdate(
      updateQuery,
      { isActive: false },
      { new: true } // Return the updated document
    );

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;