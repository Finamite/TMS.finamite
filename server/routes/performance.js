import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import Settings from '../models/Settings.js';

const router = express.Router();

// Helper function to calculate performance metrics
const calculatePerformanceMetrics = (member) => {
  const completionRate = member.completionRate ?? 0;
  const onTimeRate = member.onTimeRate ?? 0;

  // Your combined performance formula stays the same:
  const totalPerformanceRate = (completionRate * 0.5) + (onTimeRate * 0.5);

  return {
    ...member,
    actualCompletionRate: completionRate,
    actualOnTimeRate: onTimeRate,
    totalPerformanceRate: Math.round(totalPerformanceRate * 10) / 10
  };
};

// Helper function to build user performance data
const buildUserPerformanceData = async (userId, companyId, dateQuery = {}) => {
  const baseQuery = {
    isActive: true,
    companyId: companyId,
    assignedTo: userId
  };

  // Build separate queries for different task states based on date filtering
  let totalTasksQuery = { ...baseQuery };
  let completedTasksQuery = { ...baseQuery };
  let pendingTasksQuery = { ...baseQuery };

  // Apply date filtering based on whether we have date constraints
  if (dateQuery && Object.keys(dateQuery).length > 0) {
    const { startDate, endDate } = dateQuery;
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // For total tasks: include tasks that were due, completed, or rejected in the date range
      totalTasksQuery = {
        ...baseQuery,
        $or: [
          { dueDate: { $gte: start, $lte: end } },
          { nextDueDate: { $gte: start, $lte: end } },
          { completedAt: { $gte: start, $lte: end } },
          { rejectedAt: { $gte: start, $lte: end } }
        ]
      };

      // For completed tasks: only those completed or rejected within the date range
      completedTasksQuery = {
        ...baseQuery,
        status: { $in: ['completed', 'rejected'] },
        $or: [
          { completedAt: { $gte: start, $lte: end } },
          { rejectedAt: { $gte: start, $lte: end } }
        ]
      };

      // For pending tasks: those with due dates in range and still pending
      pendingTasksQuery = {
        ...baseQuery,
        status: 'pending',
        $or: [
          { dueDate: { $gte: start, $lte: end } },
          { nextDueDate: { $gte: start, $lte: end } }
        ]
      };
    }
  } else {
    // No date filtering - use original queries
    completedTasksQuery = {
      ...baseQuery,
      status: { $in: ['completed', 'rejected'] },
      $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
    };
    pendingTasksQuery = { ...baseQuery, status: 'pending' };
  }

  // Helper function to create task type specific queries
  const createTaskTypeQueries = (taskType) => {
    let baseTaskQuery = { ...totalTasksQuery, taskType };
    let completedTaskQuery = { ...completedTasksQuery, taskType };
    let pendingTaskQuery = { ...pendingTasksQuery, taskType };

    return { baseTaskQuery, completedTaskQuery, pendingTaskQuery };
  };

  // Use Promise.all to run queries in parallel for better performance
  const [
    totalTasks,
    completedTasks,
    pendingTasks,

    // One-time tasks
    oneTimeQueries,
    // Daily tasks  
    dailyQueries,
    // Weekly tasks
    weeklyQueries,
    // Monthly tasks
    monthlyQueries,
    // Quarterly tasks
    quarterlyQueries,
    // Yearly tasks
    yearlyQueries,

    // Special queries for revisions and rejections (only for completed tasks in date range)
    revisedOneTimeTasks,
    rejectedOneTimeTasks,
    rejectedTasks,

    // On-time calculations (only for tasks completed/rejected in date range)
    onTimeCompletedTasksCount,
    onTimeCompletedRecurringTasks,
    onTimeRejectedOneTime,
    onTimeRejectedRecurring

  ] = await Promise.all([
    Task.countDocuments(totalTasksQuery),
    Task.countDocuments(completedTasksQuery),
    Task.countDocuments(pendingTasksQuery),

    // Task type counts
    Promise.all([
      Task.countDocuments({ ...totalTasksQuery, taskType: 'one-time' }),
      Task.countDocuments({ ...pendingTasksQuery, taskType: 'one-time' }),
      Task.countDocuments({ ...completedTasksQuery, taskType: 'one-time' })
    ]).then(([total, pending, completed]) => ({ total, pending, completed })),

    Promise.all([
      Task.countDocuments({ ...totalTasksQuery, taskType: 'daily' }),
      Task.countDocuments({ ...pendingTasksQuery, taskType: 'daily' }),
      Task.countDocuments({ ...completedTasksQuery, taskType: 'daily' })
    ]).then(([total, pending, completed]) => ({ total, pending, completed })),

    Promise.all([
      Task.countDocuments({ ...totalTasksQuery, taskType: 'weekly' }),
      Task.countDocuments({ ...pendingTasksQuery, taskType: 'weekly' }),
      Task.countDocuments({ ...completedTasksQuery, taskType: 'weekly' })
    ]).then(([total, pending, completed]) => ({ total, pending, completed })),

    Promise.all([
      Task.countDocuments({ ...totalTasksQuery, taskType: 'monthly' }),
      Task.countDocuments({ ...pendingTasksQuery, taskType: 'monthly' }),
      Task.countDocuments({ ...completedTasksQuery, taskType: 'monthly' })
    ]).then(([total, pending, completed]) => ({ total, pending, completed })),

    Promise.all([
      Task.countDocuments({ ...totalTasksQuery, taskType: 'quarterly' }),
      Task.countDocuments({ ...pendingTasksQuery, taskType: 'quarterly' }),
      Task.countDocuments({ ...completedTasksQuery, taskType: 'quarterly' })
    ]).then(([total, pending, completed]) => ({ total, pending, completed })),

    Promise.all([
      Task.countDocuments({ ...totalTasksQuery, taskType: 'yearly' }),
      Task.countDocuments({ ...pendingTasksQuery, taskType: 'yearly' }),
      Task.countDocuments({ ...completedTasksQuery, taskType: 'yearly' })
    ]).then(([total, pending, completed]) => ({ total, pending, completed })),

    // Revisions (only count completed one-time tasks with revisions in date range)
    Task.countDocuments({
      ...completedTasksQuery,
      taskType: 'one-time',
      status: 'completed',
      revisionCount: { $gt: 0 }
    }),

    // Rejected one-time tasks (only in date range)
    Task.countDocuments({
      ...completedTasksQuery,
      taskType: 'one-time',
      status: 'rejected'
    }),

    // Total rejected tasks (only in date range)
    Task.countDocuments({
      ...completedTasksQuery,
      status: 'rejected'
    }),

    // On-time completed one-time tasks (only in date range)
    Task.countDocuments({
      ...completedTasksQuery,
      status: 'completed',
      taskType: 'one-time',
      $expr: { $lte: ['$completedAt', { $add: ['$dueDate', 86400000] }] }
    }),

    // On-time completed recurring tasks (only in date range)
    Task.countDocuments({
      ...completedTasksQuery,
      status: 'completed',
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
      $expr: { $lte: ['$completedAt', { $ifNull: ['$nextDueDate', { $add: ['$dueDate', 86400000] }] }] }
    }),

    // On-time rejected one-time tasks (only in date range)
    Task.countDocuments({
      ...completedTasksQuery,
      status: 'rejected',
      taskType: 'one-time',
      $expr: { $lte: ['$rejectedAt', { $add: ['$dueDate', 86400000] }] }
    }),

    // On-time rejected recurring tasks (only in date range)
    Task.countDocuments({
      ...completedTasksQuery,
      status: 'rejected',
      taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
      $expr: { $lte: ['$rejectedAt', { $ifNull: ['$nextDueDate', { $add: ['$dueDate', 86400000] }] }] }
    })
  ]);

  const recurringTasks = dailyQueries.total + weeklyQueries.total + monthlyQueries.total + quarterlyQueries.total + yearlyQueries.total;
  const recurringPending = dailyQueries.pending + weeklyQueries.pending + monthlyQueries.pending + quarterlyQueries.pending + yearlyQueries.pending;
  const recurringCompleted = dailyQueries.completed + weeklyQueries.completed + monthlyQueries.completed + quarterlyQueries.completed + yearlyQueries.completed;
  
  const onTimeRejectedTotal = onTimeRejectedOneTime + onTimeRejectedRecurring;
  const effectiveCompleted = completedTasks - (rejectedTasks * 0.5);  // Partial for rates only

  // --- NEW: compute on-time scoring using revision scoringRules if enabled ---
  const revisionSettings = await Settings.findOne({ type: 'revision', companyId });
  let enableRevisions = revisionSettings?.data?.enableRevisions ?? false;

  const defaultMapping = { 0: 100, 1: 70, 2: 40, 3: 0 };
  let mapping = defaultMapping;

  const rules = revisionSettings?.data?.scoringRules || [];
  const enabledRule = rules.find(r => r.enabled === true);

  if (enabledRule && enabledRule.mapping) {
    mapping = enabledRule.mapping;
  } else {
    enableRevisions = false;
  }

  let onTimeScoreSum = 0;
  if (enableRevisions) {
    try {
      const switchBranches = Object.keys(mapping).map(key => ({
        case: { $eq: ['$revisionCount', parseInt(key, 10)] },
        then: mapping[key]
      }));

      const scorePipeline = [
        {
          $match: completedTasksQuery  // Use the date-filtered completed tasks query
        },
        {
          $addFields: {
            effectiveDue: { $ifNull: ['$nextDueDate', '$dueDate'] }
          }
        },
        {
          $addFields: {
            isRejected: { $eq: ['$status', 'rejected'] },
            completionDate: {
              $cond: {
                if: { $eq: ['$status', 'rejected'] },
                then: '$rejectedAt',
                else: '$completedAt'
              }
            }
          }
        },
        {
          $addFields: {
            isOnTime: { $lte: ['$completionDate', { $add: ['$effectiveDue', 24 * 60 * 60 * 1000] }] }
          }
        },
        {
          $addFields: {
            baseScore: {
              $cond: {
                if: '$isRejected',
                then: {
                  $multiply: [
                    {
                      $switch: {
                        branches: switchBranches,
                        default: 0
                      }
                    },
                    0.5
                  ]
                },
                else: {
                  $switch: {
                    branches: switchBranches,
                    default: 0
                  }
                }
              }
            }
          }
        },
        {
          $project: {
            scoreApplied: { $cond: ['$isOnTime', '$baseScore', 0] }
          }
        },
        {
          $group: {
            _id: null,
            totalScore: { $sum: '$scoreApplied' }
          }
        }
      ];

      const result = await Task.aggregate(scorePipeline);
      onTimeScoreSum = result[0]?.totalScore || 0;
    } catch (e) {
      console.error('Aggregation error for on-time scoring:', e);
      onTimeScoreSum = 0;
    }
  }

  // Now compute rates:
  const completionRate = totalTasks > 0 ? (effectiveCompleted / totalTasks) * 100 : 0;

  let onTimeRate = 0;
  if (enableRevisions) {
    onTimeRate = totalTasks > 0 ? (onTimeScoreSum / totalTasks) : 0;
  } else {
    const effectiveOnTimeCompleted = onTimeCompletedTasksCount + onTimeCompletedRecurringTasks;
    const effectiveOnTimeRejected = onTimeRejectedTotal * 0.5;
    const effectiveOnTime = effectiveOnTimeCompleted + effectiveOnTimeRejected;
    onTimeRate = totalTasks > 0 ? (effectiveOnTime / totalTasks) * 100 : 0;
  }

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    oneTimeTasks: oneTimeQueries.total,
    oneTimePending: oneTimeQueries.pending,
    oneTimeCompleted: oneTimeQueries.completed,
    revisedOneTimeTasks,
    dailyTasks: dailyQueries.total,
    dailyPending: dailyQueries.pending,
    dailyCompleted: dailyQueries.completed,
    weeklyTasks: weeklyQueries.total,
    weeklyPending: weeklyQueries.pending,
    weeklyCompleted: weeklyQueries.completed,
    monthlyTasks: monthlyQueries.total,
    monthlyPending: monthlyQueries.pending,
    monthlyCompleted: monthlyQueries.completed,
    quarterlyTasks: quarterlyQueries.total,
    quarterlyPending: quarterlyQueries.pending,
    quarterlyCompleted: quarterlyQueries.completed,
    yearlyTasks: yearlyQueries.total,
    yearlyPending: yearlyQueries.pending,
    yearlyCompleted: yearlyQueries.completed,
    recurringTasks,
    recurringPending,
    recurringCompleted,
    rejectedTasks,
    rejectedOneTimeTasks,
    onTimeCompletedTasks: (onTimeCompletedTasksCount + onTimeCompletedRecurringTasks) + (onTimeRejectedOneTime + onTimeRejectedRecurring),
    onTimeRecurringCompleted: onTimeCompletedRecurringTasks + onTimeRejectedRecurring,
    completionRate: Math.round(completionRate * 10) / 10,
    onTimeRate: Math.round(onTimeRate * 10) / 10
  };
};

// Get performance analytics (separate from dashboard)
router.get('/analytics', async (req, res) => {
  try {
    const { userId, isAdmin, startDate, endDate } = req.query;

    const userObjectId = userId ? new mongoose.Types.ObjectId(userId) : null;

    const currentUser = await User.findById(userObjectId).select('companyId username');
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const companyId = currentUser.companyId;

    // Build date query if provided
    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = { startDate, endDate };
    }

    let teamPerformance = [];
    let userPerformance = null;

    if (isAdmin === 'true') {
      // Admin: Get team performance for users in the same company
      const users = await User.find({
        isActive: true,
        companyId: companyId
      }).select('_id username').lean();

      // Build team performance data in parallel
      const teamPromises = users.map(async (user) => {
        const performanceData = await buildUserPerformanceData(user._id, companyId, dateQuery);
        return {
          username: user.username,
          ...performanceData
        };
      });

      teamPerformance = await Promise.all(teamPromises);

      // Calculate performance metrics for all team members
      teamPerformance = teamPerformance.map(calculatePerformanceMetrics);

      // Sort by performance rate
      teamPerformance.sort((a, b) => b.totalPerformanceRate - a.totalPerformanceRate);
    } else {
      // Non-admin: Get individual user performance
      if (userObjectId) {
        const performanceData = await buildUserPerformanceData(userObjectId, companyId, dateQuery);
        userPerformance = {
          username: currentUser.username,
          ...performanceData
        };
        userPerformance = calculatePerformanceMetrics(userPerformance);
      }
    }

    res.json({
      teamPerformance,
      userPerformance
    });
  } catch (error) {
    console.error('Performance analytics error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get individual team member trend data
router.get('/member-trend', async (req, res) => {
  try {
    const { memberUsername, isAdmin, userId } = req.query;

    if (isAdmin !== 'true') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!memberUsername) {
      return res.status(400).json({ message: 'Member username is required' });
    }

    const requestingUser = await User.findById(userId).select('companyId');
    if (!requestingUser) {
      return res.status(404).json({ message: 'Requesting user not found' });
    }

    const user = await User.findOne({
      username: memberUsername,
      isActive: true,
      companyId: requestingUser.companyId
    }).select('_id username companyId').lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found in your company' });
    }

    const baseQuery = {
      isActive: true,
      assignedTo: user._id,
      companyId: user.companyId
    };

    const currentDate = new Date();
    const sixMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1);
    const endOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // Use Promise.all for parallel execution
    const [completionTrend, plannedTrend] = await Promise.all([
      Task.aggregate([
        {
          $match: {
            ...baseQuery,
            status: { $in: ['completed', 'rejected'] },
            $or: [
              { completedAt: { $ne: null, $gte: sixMonthsAgo, $lte: endOfCurrentMonth } },
              { rejectedAt: { $ne: null, $gte: sixMonthsAgo, $lte: endOfCurrentMonth } }
            ]
          }
        },
        {
          $addFields: {
            completionDate: { $ifNull: ['$completedAt', '$rejectedAt'] }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$completionDate' },
              year: { $year: '$completionDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Task.aggregate([
        {
          $match: {
            ...baseQuery,
            isActive: true,
            $or: [
              { dueDate: { $ne: null } },
              { nextDueDate: { $ne: null } }
            ]
          }
        },
        {
          $addFields: {
            relevantDate: { $ifNull: ['$nextDueDate', '$dueDate'] }
          }
        },
        {
          $match: {
            relevantDate: {
              $gte: sixMonthsAgo,
              $lte: endOfCurrentMonth
            }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$relevantDate' },
              year: { $year: '$relevantDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    // Generate trend data for the last 6 months including current month
    const trendMonths = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthName = date.toLocaleString('default', { month: 'short' });
      const monthNum = date.getMonth() + 1;
      const yearNum = date.getFullYear();

      const matchingCompletedData = completionTrend.find(item =>
        item._id.month === monthNum && item._id.year === yearNum
      );

      const matchingPlannedData = plannedTrend.find(item =>
        item._id.month === monthNum && item._id.year === yearNum
      );

      trendMonths.push({
        month: monthName,
        completed: matchingCompletedData?.count || 0,
        planned: matchingPlannedData?.count || 0,
      });
    }

    res.json(trendMonths);
  } catch (error) {
    console.error('Member trend data error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;