import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const router = express.Router();
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const dashboardRouteCache = new Map();

const getDashboardCache = (key) => {
  const cached = dashboardRouteCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    dashboardRouteCache.delete(key);
    return null;
  }
  return cached.data;
};

const setDashboardCache = (key, data, ttlMs = DASHBOARD_CACHE_TTL_MS) => {
  dashboardRouteCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs
  });
};

// Optimized dashboard analytics (removed performance data)
router.get('/analytics', async (req, res) => {
  try {
    const { userId, isAdmin, startDate, endDate } = req.query;
    const cacheKey = `analytics:${userId || 'na'}:${isAdmin || 'false'}:${startDate || 'all'}:${endDate || 'all'}`;
    const cachedResponse = getDashboardCache(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const userObjectId = userId ? new mongoose.Types.ObjectId(userId) : null;

    const currentUser = await User.findById(userObjectId).select('companyId').lean();
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const companyId = currentUser.companyId;
    const now = new Date();

    let baseQuery = {
      isActive: true,
      companyId: companyId
    };

    if (isAdmin !== 'true' && userObjectId) {
      baseQuery.assignedTo = userObjectId;
    }

    let dateRangeQueryForStats = {};
    if (startDate && endDate) {
      dateRangeQueryForStats = {
        $or: [
          { dueDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { nextDueDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { completedAt: { $gte: new Date(startDate), $lte: new Date(endDate) } }
        ]
      };
    }

    // Use Promise.all for parallel execution to improve performance
    const currentDate = new Date();
    const sixMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1);
    const endOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // Execute all queries in parallel for better performance
    const [
      statusStats,
      typeStats,
      priorityStats,
      completionTrend,
      plannedTrend,
      recentActivity,
      totalActiveTasks,
      completedTasksCount,
      onTimeCompletedOneTimeOverall,
      completedOneTimeTasksOverallForRate,
      onTimeCompletedRecurringOverall,
      completedRecurringTasksOverallForRate,
      completionTimes
    ] = await Promise.all([
      // Status stats
      // Status stats
      Task.aggregate([
        { $match: { ...baseQuery, ...dateRangeQueryForStats } },
        {
          $addFields: {
            effectiveStatus: {
              $cond: {
                if: { $and: [{ $eq: ['$status', 'overdue'] }, { $eq: ['$taskType', 'daily'] }] },
                then: 'pending',
                else: '$status'
              }
            }
          }
        },
        { $group: { _id: '$effectiveStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // Type stats
      Task.aggregate([
        { $match: { ...baseQuery, ...dateRangeQueryForStats } },
        { $group: { _id: '$taskType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // Priority stats
      Task.aggregate([
        { $match: { ...baseQuery, ...dateRangeQueryForStats } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // Completion trend
      Task.aggregate([
        {
          $match: {
            ...baseQuery,
            status: 'completed',
            completedAt: {
              $ne: null,
              $gte: sixMonthsAgo,
              $lte: endOfCurrentMonth
            }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$completedAt' },
              year: { $year: '$completedAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      // Planned trend
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
      ]),
      // Recent activity
      Task.aggregate([
        {
          $match: {
            isActive: true,
            companyId: companyId,
            ...(isAdmin !== 'true' && userObjectId ? { assignedTo: userObjectId } : {}),
            $nor: [{ status: 'overdue', taskType: 'daily' }], // Add this line
            ...(startDate && endDate ? {
              $or: [
                { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } },
                { completedAt: { $gte: new Date(startDate), $lte: new Date(endDate) }, status: 'completed' },
                { dueDate: { $gte: new Date(startDate), $lte: new Date(endDate) }, status: 'overdue' }
              ]
            } : {})
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'assignedTo',
            foreignField: '_id',
            as: 'assignedUser'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'assignedBy',
            foreignField: '_id',
            as: 'assignedByUser'
          }
        },
        {
          $addFields: {
            activityType: {
              $cond: {
                if: { $eq: ['$status', 'completed'] },
                then: 'completed',
                else: {
                  $cond: {
                    if: { $eq: ['$status', 'overdue'] },
                    then: 'overdue',
                    else: 'assigned'
                  }
                }
              }
            },
            activityDate: {
              $cond: {
                if: { $eq: ['$status', 'completed'] },
                then: '$completedAt',
                else: '$createdAt'
              }
            }
          }
        },
        {
          $project: {
            title: 1,
            taskType: 1,
            type: '$activityType',
            username: { $arrayElemAt: ['$assignedUser.username', 0] },
            assignedBy: { $arrayElemAt: ['$assignedByUser.username', 0] },
            date: '$activityDate'
          }
        },
        { $sort: { date: -1 } },
        { $limit: 20 }
      ]),
      // Total active tasks
      Task.countDocuments({ ...baseQuery, ...dateRangeQueryForStats }),
      // Completed tasks count
      Task.countDocuments({
        ...baseQuery,
        status: 'completed',
        completedAt: { $ne: null },
        ...(startDate && endDate ? dateRangeQueryForStats : {})
      }),
      // On-time completion for one-time tasks
      Task.countDocuments({
        ...baseQuery,
        status: 'completed',
        completedAt: { $ne: null },
        $expr: {
          $lte: ['$completedAt', { $add: ['$dueDate', 24 * 60 * 60 * 1000] }]
        },
        taskType: 'one-time',
        ...(startDate && endDate ? dateRangeQueryForStats : {})
      }),
      // Completed one-time tasks for rate calculation
      Task.countDocuments({
        ...baseQuery,
        taskType: 'one-time',
        status: 'completed',
        completedAt: { $ne: null },
        ...(startDate && endDate ? dateRangeQueryForStats : {})
      }),
      // On-time completion for recurring tasks
      Task.countDocuments({
        ...baseQuery,
        status: 'completed',
        completedAt: { $ne: null },
        $expr: {
          $lte: ['$completedAt', { $ifNull: ['$nextDueDate', { $add: ['$dueDate', 24 * 60 * 60 * 1000] }] }]
        },
        taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
        ...(startDate && endDate ? dateRangeQueryForStats : {})
      }),
      // Completed recurring tasks for rate calculation
      Task.countDocuments({
        ...baseQuery,
        taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
        status: 'completed',
        completedAt: { $ne: null },
        ...(startDate && endDate ? dateRangeQueryForStats : {})
      }),
      // Completion times
      Task.aggregate([
        {
          $match: {
            ...baseQuery,
            ...dateRangeQueryForStats,
            status: 'completed',
            completedAt: { $ne: null }
          }
        },
        {
          $addFields: {
            targetDate: { $ifNull: ['$nextDueDate', '$dueDate'] },
            daysTaken: {
              $divide: [
                { $subtract: ['$completedAt', '$createdAt'] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgDays: { $avg: '$daysTaken' }
          }
        }
      ])
    ]);

    // Calculate performance metrics
    const oneTimeOnTimeRateOverall = completedOneTimeTasksOverallForRate > 0 ? (onTimeCompletedOneTimeOverall / completedOneTimeTasksOverallForRate) * 100 : 0;
    const recurringOnTimeRateOverall = completedRecurringTasksOverallForRate > 0 ? (onTimeCompletedRecurringOverall / completedRecurringTasksOverallForRate) * 100 : 0;

    const performanceMetrics = {
      onTimeCompletion: completedTasksCount > 0 ? Math.round(((onTimeCompletedOneTimeOverall + onTimeCompletedRecurringOverall) / completedTasksCount) * 100) : 0,
      averageCompletionTime: completionTimes.length > 0 ? Math.round(completionTimes[0].avgDays) : 0,
      taskDistribution: typeStats.map(item => ({
        type: item._id,
        count: item.count,
        percentage: totalActiveTasks > 0 ? Math.round((item.count / totalActiveTasks) * 100) : 0
      })),
      oneTimeOnTimeRate: Math.round(oneTimeOnTimeRateOverall * 10) / 10,
      recurringOnTimeRate: Math.round(recurringOnTimeRateOverall * 10) / 10
    };

    const payload = {
      statusStats,
      typeStats,
      priorityStats,
      completionTrend,
      plannedTrend,
      recentActivity,
      performanceMetrics
    };

    setDashboardCache(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Optimized task counts with trends
router.get('/counts', async (req, res) => {
  try {
    const { userId, isAdmin, startDate, endDate } = req.query;
    const cacheKey = `counts:${userId || 'na'}:${isAdmin || 'false'}:${startDate || 'all'}:${endDate || 'all'}`;
    const cachedResponse = getDashboardCache(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const userObjectId = userId ? new mongoose.Types.ObjectId(userId) : null;

    const currentUser = await User.findById(userObjectId).select('companyId').lean();
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const companyId = currentUser.companyId;
    const now = new Date();

    let baseQuery = {
      isActive: true,
      companyId: companyId
    };
    let recentActivityQuery = {
      isActive: true,
      companyId: companyId,
      ...(isAdmin !== 'true' && userObjectId ? { assignedTo: userObjectId } : {})
    };
    let dateRangeQuery = {};

    if (isAdmin !== 'true' && userObjectId) {
      baseQuery.assignedTo = userObjectId;
    }

    // For all-time view (no startDate/endDate), get all data
    if (startDate && endDate) {
      dateRangeQuery = {
        $or: [
          { dueDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { nextDueDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
        ]
      };
    }

    // Calculate previous period for trend comparison
    let previousDateRangeQuery = {};

    if (startDate && endDate) {
      // For current month view, compare with previous month
      const currentStart = new Date(startDate);
      const currentEnd = new Date(endDate);
      const periodDuration = currentEnd.getTime() - currentStart.getTime();

      const previousEnd = new Date(currentStart.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - periodDuration);

      previousDateRangeQuery = {
        $or: [
          { dueDate: { $gte: previousStart, $lte: previousEnd } },
          { nextDueDate: { $gte: previousStart, $lte: previousEnd } }
        ]
      };
    } else {
      // For all-time view, compare this year with last year
      const now = new Date();
      const currentYear = now.getFullYear();
      const previousYear = currentYear - 1;

      const currentYearStart = new Date(currentYear, 0, 1);
      const currentYearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

      const previousYearStart = new Date(previousYear, 0, 1);
      const previousYearEnd = new Date(previousYear, 11, 31, 23, 59, 59, 999);

      // Set dateRangeQuery for this year's data for trend comparison
      const thisYearDateRangeQuery = {
        $or: [
          { dueDate: { $gte: currentYearStart, $lte: currentYearEnd } },
          { nextDueDate: { $gte: currentYearStart, $lte: currentYearEnd } }
        ]
      };

      // But we compare this year vs last year for trends
      previousDateRangeQuery = {
        $or: [
          { dueDate: { $gte: previousYearStart, $lte: previousYearEnd } },
          { nextDueDate: { $gte: previousYearStart, $lte: previousYearEnd } }
        ]
      };

      // Get this year's data for trend comparison
      const [
        thisYearTotalTasks,
        thisYearPendingTasks,
        thisYearCompletedTasks,
        thisYearOverdueTasks
      ] = await Promise.all([
        Task.countDocuments({ ...baseQuery, ...thisYearDateRangeQuery }),
        Task.countDocuments({ ...baseQuery, ...thisYearDateRangeQuery, status: 'pending' }),
        Task.countDocuments({ ...baseQuery, ...thisYearDateRangeQuery, status: 'completed' }),
        Task.countDocuments({
          ...baseQuery,
          ...thisYearDateRangeQuery,
          status: { $ne: 'completed' },
          taskType: { $ne: 'daily' },
          $or: [
            { dueDate: { $lt: now } },
            { nextDueDate: { $lt: now } }
          ]
        })
      ]);

      // Get previous year's data for trend comparison
      const [
        prevYearTotalTasks,
        prevYearPendingTasks,
        prevYearCompletedTasks,
        prevYearOverdueTasks
      ] = await Promise.all([
        Task.countDocuments({ ...baseQuery, ...previousDateRangeQuery }),
        Task.countDocuments({ ...baseQuery, ...previousDateRangeQuery, status: 'pending' }),
        Task.countDocuments({ ...baseQuery, ...previousDateRangeQuery, status: 'completed' }),
        Task.countDocuments({
          ...baseQuery,
          ...previousDateRangeQuery,
          status: { $ne: 'completed' },
          taskType: { $ne: 'daily' },
          $or: [
            { dueDate: { $lt: now } },
            { nextDueDate: { $lt: now } }
          ]
        })
      ]);

      // Calculate trends for all-time view
      const calculateTrend = (current, previous) => {
        if (previous === 0 && current === 0) return { value: 0, direction: 'up' };
        if (previous === 0) return { value: 100, direction: 'up' };
        const change = ((current - previous) / previous) * 100;
        return {
          value: Math.abs(Math.round(change * 10) / 10),
          direction: change >= 0 ? 'up' : 'down'
        };
      };

      // Get all-time data (no date filters) - including quarterly
      const [
        totalTasks,
        pendingTasks,
        completedTasks,
        overdueTasks,
        oneTimeTasks,
        oneTimePending,
        oneTimeCompleted,
        dailyTasks,
        dailyPending,
        dailyCompleted,
        weeklyTasks,
        weeklyPending,
        weeklyCompleted,
        monthlyTasks,
        monthlyPending,
        monthlyCompleted,
        quarterlyTasks,
        quarterlyPending,
        quarterlyCompleted,
        yearlyTasks,
        yearlyPending,
        yearlyCompleted
      ] = await Promise.all([
        Task.countDocuments(baseQuery),
        Task.countDocuments({ ...baseQuery, status: 'pending' }),
        Task.countDocuments({ ...baseQuery, status: 'completed' }),
        Task.countDocuments({
          ...baseQuery,
          status: { $ne: 'completed' },
          taskType: { $ne: 'daily' },
          $or: [
            { dueDate: { $lt: now } },
            { nextDueDate: { $lt: now } }
          ]
        }),
        Task.countDocuments({ ...baseQuery, taskType: 'one-time' }),
        Task.countDocuments({ ...baseQuery, taskType: 'one-time', status: 'pending' }),
        Task.countDocuments({ ...baseQuery, taskType: 'one-time', status: 'completed' }),
        Task.countDocuments({ ...baseQuery, taskType: 'daily' }),
        Task.countDocuments({ ...baseQuery, taskType: 'daily', status: 'pending' }),
        Task.countDocuments({ ...baseQuery, taskType: 'daily', status: 'completed' }),
        Task.countDocuments({ ...baseQuery, taskType: 'weekly' }),
        Task.countDocuments({ ...baseQuery, taskType: 'weekly', status: 'pending' }),
        Task.countDocuments({ ...baseQuery, taskType: 'weekly', status: 'completed' }),
        Task.countDocuments({ ...baseQuery, taskType: 'monthly' }),
        Task.countDocuments({ ...baseQuery, taskType: 'monthly', status: 'pending' }),
        Task.countDocuments({ ...baseQuery, taskType: 'monthly', status: 'completed' }),
        Task.countDocuments({ ...baseQuery, taskType: 'quarterly' }),
        Task.countDocuments({ ...baseQuery, taskType: 'quarterly', status: 'pending' }),
        Task.countDocuments({ ...baseQuery, taskType: 'quarterly', status: 'completed' }),
        Task.countDocuments({ ...baseQuery, taskType: 'yearly' }),
        Task.countDocuments({ ...baseQuery, taskType: 'yearly', status: 'pending' }),
        Task.countDocuments({ ...baseQuery, taskType: 'yearly', status: 'completed' })
      ]);

      const recurringTasks = dailyTasks + weeklyTasks + monthlyTasks + quarterlyTasks + yearlyTasks;
      const recurringPending = dailyPending + weeklyPending + monthlyPending + quarterlyPending + yearlyPending;
      const recurringCompleted = dailyCompleted + weeklyCompleted + monthlyCompleted + quarterlyCompleted + yearlyCompleted;
      const overduePercentage = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;

      const payload = {
        totalTasks,
        pendingTasks,
        completedTasks,
        overdueTasks,
        overduePercentage,
        oneTimeTasks,
        oneTimePending,
        oneTimeCompleted,
        recurringTasks,
        recurringPending,
        recurringCompleted,
        dailyTasks,
        dailyPending,
        dailyCompleted,
        weeklyTasks,
        weeklyPending,
        weeklyCompleted,
        monthlyTasks,
        monthlyPending,
        monthlyCompleted,
        quarterlyTasks,
        quarterlyPending,
        quarterlyCompleted,
        yearlyTasks,
        yearlyPending,
        yearlyCompleted,
        trends: {
          totalTasks: calculateTrend(thisYearTotalTasks, prevYearTotalTasks),
          pendingTasks: calculateTrend(thisYearPendingTasks, prevYearPendingTasks),
          completedTasks: calculateTrend(thisYearCompletedTasks, prevYearCompletedTasks),
          overdueTasks: calculateTrend(thisYearOverdueTasks, prevYearOverdueTasks)
        }
      };

      setDashboardCache(cacheKey, payload);
      return res.json(payload);
    }

    const aggregateCountsForRange = async (rangeQuery) => {
      const result = await Task.aggregate([
        { $match: { ...baseQuery, ...rangeQuery } },
        {
          $addFields: {
            effectiveDue: { $ifNull: ['$nextDueDate', '$dueDate'] }
          }
        },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            pendingTasks: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            overdueTasks: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', 'completed'] },
                      { $ne: ['$taskType', 'daily'] },
                      { $lt: ['$effectiveDue', now] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            oneTimeTasks: { $sum: { $cond: [{ $eq: ['$taskType', 'one-time'] }, 1, 0] } },
            oneTimePending: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'one-time'] }, { $eq: ['$status', 'pending'] }] }, 1, 0]
              }
            },
            oneTimeCompleted: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'one-time'] }, { $eq: ['$status', 'completed'] }] }, 1, 0]
              }
            },
            dailyTasks: { $sum: { $cond: [{ $eq: ['$taskType', 'daily'] }, 1, 0] } },
            dailyPending: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'daily'] }, { $eq: ['$status', 'pending'] }] }, 1, 0]
              }
            },
            dailyCompleted: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'daily'] }, { $eq: ['$status', 'completed'] }] }, 1, 0]
              }
            },
            weeklyTasks: { $sum: { $cond: [{ $eq: ['$taskType', 'weekly'] }, 1, 0] } },
            weeklyPending: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'weekly'] }, { $eq: ['$status', 'pending'] }] }, 1, 0]
              }
            },
            weeklyCompleted: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'weekly'] }, { $eq: ['$status', 'completed'] }] }, 1, 0]
              }
            },
            monthlyTasks: { $sum: { $cond: [{ $eq: ['$taskType', 'monthly'] }, 1, 0] } },
            monthlyPending: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'monthly'] }, { $eq: ['$status', 'pending'] }] }, 1, 0]
              }
            },
            monthlyCompleted: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'monthly'] }, { $eq: ['$status', 'completed'] }] }, 1, 0]
              }
            },
            quarterlyTasks: { $sum: { $cond: [{ $eq: ['$taskType', 'quarterly'] }, 1, 0] } },
            quarterlyPending: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'quarterly'] }, { $eq: ['$status', 'pending'] }] }, 1, 0]
              }
            },
            quarterlyCompleted: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'quarterly'] }, { $eq: ['$status', 'completed'] }] }, 1, 0]
              }
            },
            yearlyTasks: { $sum: { $cond: [{ $eq: ['$taskType', 'yearly'] }, 1, 0] } },
            yearlyPending: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'yearly'] }, { $eq: ['$status', 'pending'] }] }, 1, 0]
              }
            },
            yearlyCompleted: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$taskType', 'yearly'] }, { $eq: ['$status', 'completed'] }] }, 1, 0]
              }
            }
          }
        }
      ]);

      return result[0] || {
        totalTasks: 0,
        pendingTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        oneTimeTasks: 0,
        oneTimePending: 0,
        oneTimeCompleted: 0,
        dailyTasks: 0,
        dailyPending: 0,
        dailyCompleted: 0,
        weeklyTasks: 0,
        weeklyPending: 0,
        weeklyCompleted: 0,
        monthlyTasks: 0,
        monthlyPending: 0,
        monthlyCompleted: 0,
        quarterlyTasks: 0,
        quarterlyPending: 0,
        quarterlyCompleted: 0,
        yearlyTasks: 0,
        yearlyPending: 0,
        yearlyCompleted: 0
      };
    };

    const [currentCounts, previousCounts] = await Promise.all([
      aggregateCountsForRange(dateRangeQuery),
      aggregateCountsForRange(previousDateRangeQuery)
    ]);

    const {
      totalTasks,
      pendingTasks,
      completedTasks,
      overdueTasks,
      oneTimeTasks,
      oneTimePending,
      oneTimeCompleted,
      dailyTasks,
      dailyPending,
      dailyCompleted,
      weeklyTasks,
      weeklyPending,
      weeklyCompleted,
      monthlyTasks,
      monthlyPending,
      monthlyCompleted,
      quarterlyTasks,
      quarterlyPending,
      quarterlyCompleted,
      yearlyTasks,
      yearlyPending,
      yearlyCompleted
    } = currentCounts;

    const prevTotalTasks = previousCounts.totalTasks;
    const prevPendingTasks = previousCounts.pendingTasks;
    const prevCompletedTasks = previousCounts.completedTasks;
    const prevOverdueTasks = previousCounts.overdueTasks;

    // Calculate trends
    const calculateTrend = (current, previous) => {
      if (previous === 0 && current === 0) return { value: 0, direction: 'up' };
      if (previous === 0) return { value: 100, direction: 'up' };
      const change = ((current - previous) / previous) * 100;
      return {
        value: Math.abs(Math.round(change * 10) / 10),
        direction: change >= 0 ? 'up' : 'down'
      };
    };

    const recurringTasks = dailyTasks + weeklyTasks + monthlyTasks + quarterlyTasks + yearlyTasks;
    const recurringPending = dailyPending + weeklyPending + monthlyPending + quarterlyPending + yearlyPending;
    const recurringCompleted = dailyCompleted + weeklyCompleted + monthlyCompleted + quarterlyCompleted + yearlyCompleted;
    const overduePercentage = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;

    const payload = {
      totalTasks,
      pendingTasks,
      completedTasks,
      overdueTasks,
      overduePercentage,
      oneTimeTasks,
      oneTimePending,
      oneTimeCompleted,
      recurringTasks,
      recurringPending,
      recurringCompleted,
      dailyTasks,
      dailyPending,
      dailyCompleted,
      weeklyTasks,
      weeklyPending,
      weeklyCompleted,
      monthlyTasks,
      monthlyPending,
      monthlyCompleted,
      quarterlyTasks,
      quarterlyPending,
      quarterlyCompleted,
      yearlyTasks,
      yearlyPending,
      yearlyCompleted,
      trends: {
        totalTasks: calculateTrend(totalTasks, prevTotalTasks),
        pendingTasks: calculateTrend(pendingTasks, prevPendingTasks),
        completedTasks: calculateTrend(completedTasks, prevCompletedTasks),
        overdueTasks: calculateTrend(overdueTasks, prevOverdueTasks)
      }
    };

    setDashboardCache(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('Dashboard counts error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
