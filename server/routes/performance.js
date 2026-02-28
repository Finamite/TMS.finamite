import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import Settings from '../models/Settings.js';
import XLSX from 'xlsx';
import * as jsPDFModule from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

applyPlugin(jsPDFModule.jsPDF);

const router = express.Router();
const PERFORMANCE_CACHE_TTL_MS = 60 * 1000;
const performanceRouteCache = new Map();

const getPerformanceCache = (key) => {
  const cached = performanceRouteCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    performanceRouteCache.delete(key);
    return null;
  }
  return cached.data;
};

const setPerformanceCache = (key, data, ttlMs = PERFORMANCE_CACHE_TTL_MS) => {
  performanceRouteCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs
  });
};

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
};

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

const formatDateDDMMYYYY = (dateStr) => {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const fetchUserTasksForPeriod = async (userId, companyId, startDate, endDate) => {
  const query = {
    isActive: true,
    companyId,
    assignedTo: userId,
    dueDate: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };

  return Task.find(query)
    .populate('assignedBy', 'username')
    .populate('assignedTo', 'username')
    .sort({ dueDate: 1 })
    .lean();
};




// Helper function to build user performance data
const buildUserPerformanceData = async (userId, companyId, dateQuery = {}, revisionConfig = null) => {
  const baseQuery = {
    isActive: true,
    companyId,
    assignedTo: userId
  };
  const hasDateRange = !!(dateQuery?.startDate && dateQuery?.endDate);
  const start = hasDateRange ? new Date(dateQuery.startDate) : null;
  const end = hasDateRange ? new Date(dateQuery.endDate) : null;

  const dueInRangeExpr = hasDateRange
    ? { $and: [{ $ne: ['$dueDate', null] }, { $gte: ['$dueDate', start] }, { $lte: ['$dueDate', end] }] }
    : null;
  const nextDueInRangeExpr = hasDateRange
    ? { $and: [{ $ne: ['$nextDueDate', null] }, { $gte: ['$nextDueDate', start] }, { $lte: ['$nextDueDate', end] }] }
    : null;
  const completedInRangeExpr = hasDateRange
    ? { $and: [{ $ne: ['$completedAt', null] }, { $gte: ['$completedAt', start] }, { $lte: ['$completedAt', end] }] }
    : null;
  const rejectedInRangeExpr = hasDateRange
    ? { $and: [{ $ne: ['$rejectedAt', null] }, { $gte: ['$rejectedAt', start] }, { $lte: ['$rejectedAt', end] }] }
    : null;

  const isTotalExpr = hasDateRange
    ? { $or: [dueInRangeExpr, nextDueInRangeExpr, completedInRangeExpr, rejectedInRangeExpr] }
    : true;
  const isCompletedExpr = hasDateRange
    ? {
      $and: [
        { $in: ['$status', ['completed', 'rejected']] },
        { $or: [completedInRangeExpr, rejectedInRangeExpr] }
      ]
    }
    : {
      $and: [
        { $in: ['$status', ['completed', 'rejected']] },
        { $or: [{ $ne: ['$completedAt', null] }, { $ne: ['$rejectedAt', null] }] }
      ]
    };
  const isPendingExpr = hasDateRange
    ? {
      $and: [
        { $eq: ['$status', 'pending'] },
        { $or: [dueInRangeExpr, nextDueInRangeExpr] }
      ]
    }
    : { $eq: ['$status', 'pending'] };

  const statsPipeline = [
    { $match: baseQuery },
    ...(hasDateRange ? [{
      $match: {
        $or: [
          { dueDate: { $gte: start, $lte: end } },
          { nextDueDate: { $gte: start, $lte: end } },
          { completedAt: { $gte: start, $lte: end } },
          { rejectedAt: { $gte: start, $lte: end } }
        ]
      }
    }] : []),
    {
      $addFields: {
        effectiveDue: { $ifNull: ['$nextDueDate', '$dueDate'] },
        isTotalTask: isTotalExpr,
        isCompletedTask: isCompletedExpr,
        isPendingTask: isPendingExpr
      }
    },
    {
      $group: {
        _id: null,
        totalTasks: { $sum: { $cond: ['$isTotalTask', 1, 0] } },
        completedTasks: { $sum: { $cond: ['$isCompletedTask', 1, 0] } },
        pendingTasks: { $sum: { $cond: ['$isPendingTask', 1, 0] } },

        oneTimeTasks: { $sum: { $cond: [{ $and: ['$isTotalTask', { $eq: ['$taskType', 'one-time'] }] }, 1, 0] } },
        oneTimePending: { $sum: { $cond: [{ $and: ['$isPendingTask', { $eq: ['$taskType', 'one-time'] }] }, 1, 0] } },
        oneTimeCompleted: { $sum: { $cond: [{ $and: ['$isCompletedTask', { $eq: ['$taskType', 'one-time'] }] }, 1, 0] } },

        dailyTasks: { $sum: { $cond: [{ $and: ['$isTotalTask', { $eq: ['$taskType', 'daily'] }] }, 1, 0] } },
        dailyPending: { $sum: { $cond: [{ $and: ['$isPendingTask', { $eq: ['$taskType', 'daily'] }] }, 1, 0] } },
        dailyCompleted: { $sum: { $cond: [{ $and: ['$isCompletedTask', { $eq: ['$taskType', 'daily'] }] }, 1, 0] } },

        weeklyTasks: { $sum: { $cond: [{ $and: ['$isTotalTask', { $eq: ['$taskType', 'weekly'] }] }, 1, 0] } },
        weeklyPending: { $sum: { $cond: [{ $and: ['$isPendingTask', { $eq: ['$taskType', 'weekly'] }] }, 1, 0] } },
        weeklyCompleted: { $sum: { $cond: [{ $and: ['$isCompletedTask', { $eq: ['$taskType', 'weekly'] }] }, 1, 0] } },

        monthlyTasks: { $sum: { $cond: [{ $and: ['$isTotalTask', { $eq: ['$taskType', 'monthly'] }] }, 1, 0] } },
        monthlyPending: { $sum: { $cond: [{ $and: ['$isPendingTask', { $eq: ['$taskType', 'monthly'] }] }, 1, 0] } },
        monthlyCompleted: { $sum: { $cond: [{ $and: ['$isCompletedTask', { $eq: ['$taskType', 'monthly'] }] }, 1, 0] } },

        quarterlyTasks: { $sum: { $cond: [{ $and: ['$isTotalTask', { $eq: ['$taskType', 'quarterly'] }] }, 1, 0] } },
        quarterlyPending: { $sum: { $cond: [{ $and: ['$isPendingTask', { $eq: ['$taskType', 'quarterly'] }] }, 1, 0] } },
        quarterlyCompleted: { $sum: { $cond: [{ $and: ['$isCompletedTask', { $eq: ['$taskType', 'quarterly'] }] }, 1, 0] } },

        yearlyTasks: { $sum: { $cond: [{ $and: ['$isTotalTask', { $eq: ['$taskType', 'yearly'] }] }, 1, 0] } },
        yearlyPending: { $sum: { $cond: [{ $and: ['$isPendingTask', { $eq: ['$taskType', 'yearly'] }] }, 1, 0] } },
        yearlyCompleted: { $sum: { $cond: [{ $and: ['$isCompletedTask', { $eq: ['$taskType', 'yearly'] }] }, 1, 0] } },

        revisedOneTimeTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  '$isCompletedTask',
                  { $eq: ['$status', 'completed'] },
                  { $eq: ['$taskType', 'one-time'] },
                  { $gt: ['$revisionCount', 0] }
                ]
              },
              1,
              0
            ]
          }
        },
        rejectedTasks: {
          $sum: { $cond: [{ $and: ['$isCompletedTask', { $eq: ['$status', 'rejected'] }] }, 1, 0] }
        },
        rejectedOneTimeTasks: {
          $sum: {
            $cond: [
              { $and: ['$isCompletedTask', { $eq: ['$status', 'rejected'] }, { $eq: ['$taskType', 'one-time'] }] },
              1,
              0
            ]
          }
        },
        onTimeCompletedTasksCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  '$isCompletedTask',
                  { $eq: ['$status', 'completed'] },
                  { $eq: ['$taskType', 'one-time'] },
                  { $ne: ['$completedAt', null] },
                  { $ne: ['$dueDate', null] },
                  { $lte: ['$completedAt', { $add: ['$dueDate', 86400000] }] }
                ]
              },
              1,
              0
            ]
          }
        },
        onTimeCompletedRecurringTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  '$isCompletedTask',
                  { $eq: ['$status', 'completed'] },
                  { $in: ['$taskType', ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']] },
                  { $ne: ['$completedAt', null] },
                  { $ne: ['$effectiveDue', null] },
                  { $lte: ['$completedAt', { $add: ['$effectiveDue', 86400000] }] }
                ]
              },
              1,
              0
            ]
          }
        },
        onTimeRejectedOneTime: {
          $sum: {
            $cond: [
              {
                $and: [
                  '$isCompletedTask',
                  { $eq: ['$status', 'rejected'] },
                  { $eq: ['$taskType', 'one-time'] },
                  { $ne: ['$rejectedAt', null] },
                  { $ne: ['$dueDate', null] },
                  { $lte: ['$rejectedAt', { $add: ['$dueDate', 86400000] }] }
                ]
              },
              1,
              0
            ]
          }
        },
        onTimeRejectedRecurring: {
          $sum: {
            $cond: [
              {
                $and: [
                  '$isCompletedTask',
                  { $eq: ['$status', 'rejected'] },
                  { $in: ['$taskType', ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']] },
                  { $ne: ['$rejectedAt', null] },
                  { $ne: ['$effectiveDue', null] },
                  { $lte: ['$rejectedAt', { $add: ['$effectiveDue', 86400000] }] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ];

  const statsResult = await Task.aggregate(statsPipeline);
  const stats = statsResult[0] || {
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
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
    yearlyCompleted: 0,
    revisedOneTimeTasks: 0,
    rejectedTasks: 0,
    rejectedOneTimeTasks: 0,
    onTimeCompletedTasksCount: 0,
    onTimeCompletedRecurringTasks: 0,
    onTimeRejectedOneTime: 0,
    onTimeRejectedRecurring: 0
  };

  const recurringTasks = stats.dailyTasks + stats.weeklyTasks + stats.monthlyTasks + stats.quarterlyTasks + stats.yearlyTasks;
  const recurringPending = stats.dailyPending + stats.weeklyPending + stats.monthlyPending + stats.quarterlyPending + stats.yearlyPending;
  const recurringCompleted = stats.dailyCompleted + stats.weeklyCompleted + stats.monthlyCompleted + stats.quarterlyCompleted + stats.yearlyCompleted;

  const onTimeRejectedTotal = stats.onTimeRejectedOneTime + stats.onTimeRejectedRecurring;
  const effectiveCompleted = stats.completedTasks - (stats.rejectedTasks * 0.5);  // Partial for rates only

  // --- NEW: compute on-time scoring using revision scoringRules if enabled ---
  const defaultMapping = { 0: 100, 1: 70, 2: 40, 3: 0 };
  let enableRevisions = false;
  let mapping = defaultMapping;

  if (revisionConfig) {
    enableRevisions = revisionConfig.enableRevisions === true;
    mapping = revisionConfig.mapping || defaultMapping;
  } else {
    const revisionSettings = await Settings.findOne({ type: 'revision', companyId }).lean();
    enableRevisions = revisionSettings?.data?.enableRevisions ?? false;
    const rules = revisionSettings?.data?.scoringRules || [];
    const enabledRule = rules.find(r => r.enabled === true);
    if (enabledRule && enabledRule.mapping) {
      mapping = enabledRule.mapping;
    } else {
      enableRevisions = false;
    }
  }

  let onTimeScoreSum = 0;
  if (enableRevisions) {
    try {
      const switchBranches = Object.keys(mapping).map(key => ({
        case: { $eq: ['$revisionCount', parseInt(key, 10)] },
        then: mapping[key]
      }));

      let completedTasksQuery = { ...baseQuery };
      if (hasDateRange) {
        completedTasksQuery = {
          ...baseQuery,
          status: { $in: ['completed', 'rejected'] },
          $or: [
            { completedAt: { $gte: start, $lte: end } },
            { rejectedAt: { $gte: start, $lte: end } }
          ]
        };
      } else {
        completedTasksQuery = {
          ...baseQuery,
          status: { $in: ['completed', 'rejected'] },
          $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
        };
      }

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
  const completionRate = stats.totalTasks > 0 ? (effectiveCompleted / stats.totalTasks) * 100 : 0;

  let onTimeRate = 0;
  if (enableRevisions) {
    onTimeRate = stats.totalTasks > 0 ? (onTimeScoreSum / stats.totalTasks) : 0;
  } else {
    const effectiveOnTimeCompleted = stats.onTimeCompletedTasksCount + stats.onTimeCompletedRecurringTasks;
    const effectiveOnTimeRejected = onTimeRejectedTotal * 0.5;
    const effectiveOnTime = effectiveOnTimeCompleted + effectiveOnTimeRejected;
    onTimeRate = stats.totalTasks > 0 ? (effectiveOnTime / stats.totalTasks) * 100 : 0;
  }

  return {
    totalTasks: stats.totalTasks,
    completedTasks: stats.completedTasks,
    pendingTasks: stats.pendingTasks,
    oneTimeTasks: stats.oneTimeTasks,
    oneTimePending: stats.oneTimePending,
    oneTimeCompleted: stats.oneTimeCompleted,
    revisedOneTimeTasks: stats.revisedOneTimeTasks,
    dailyTasks: stats.dailyTasks,
    dailyPending: stats.dailyPending,
    dailyCompleted: stats.dailyCompleted,
    weeklyTasks: stats.weeklyTasks,
    weeklyPending: stats.weeklyPending,
    weeklyCompleted: stats.weeklyCompleted,
    monthlyTasks: stats.monthlyTasks,
    monthlyPending: stats.monthlyPending,
    monthlyCompleted: stats.monthlyCompleted,
    quarterlyTasks: stats.quarterlyTasks,
    quarterlyPending: stats.quarterlyPending,
    quarterlyCompleted: stats.quarterlyCompleted,
    yearlyTasks: stats.yearlyTasks,
    yearlyPending: stats.yearlyPending,
    yearlyCompleted: stats.yearlyCompleted,
    recurringTasks,
    recurringPending,
    recurringCompleted,
    rejectedTasks: stats.rejectedTasks,
    rejectedOneTimeTasks: stats.rejectedOneTimeTasks,
    onTimeCompletedTasks: (stats.onTimeCompletedTasksCount + stats.onTimeCompletedRecurringTasks) + (stats.onTimeRejectedOneTime + stats.onTimeRejectedRecurring),
    onTimeRecurringCompleted: stats.onTimeCompletedRecurringTasks + stats.onTimeRejectedRecurring,
    completionRate: Math.round(completionRate * 10) / 10,
    onTimeRate: Math.round(onTimeRate * 10) / 10
  };
};

// Get performance analytics (separate from dashboard)
router.get('/analytics', async (req, res) => {
  try {
    const { userId, isAdmin, startDate, endDate } = req.query;
    const cacheKey = `analytics:${userId || 'na'}:${isAdmin || 'false'}:${startDate || 'all'}:${endDate || 'all'}`;
    const cachedResponse = getPerformanceCache(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const userObjectId = userId ? new mongoose.Types.ObjectId(userId) : null;

    const currentUser = await User.findById(userObjectId).select('companyId username').lean();
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const companyId = currentUser.companyId;

    // Build date query if provided
    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = { startDate, endDate };
    }

    const revisionSettings = await Settings.findOne({ type: 'revision', companyId }).lean();
    const rules = revisionSettings?.data?.scoringRules || [];
    const enabledRule = rules.find(r => r.enabled === true);
    const revisionConfig = {
      enableRevisions: revisionSettings?.data?.enableRevisions === true && !!enabledRule?.mapping,
      mapping: enabledRule?.mapping || { 0: 100, 1: 70, 2: 40, 3: 0 }
    };

    let teamPerformance = [];
    let userPerformance = null;

    if (isAdmin === 'true') {
      // Admin: Get team performance for users in the same company
      const users = await User.find({
        isActive: true,
        companyId: companyId
      }).select('_id username').lean();

      // Build team performance data in parallel
      teamPerformance = await mapWithConcurrency(users, 5, async (user) => {
        const performanceData = await buildUserPerformanceData(user._id, companyId, dateQuery, revisionConfig);
        return {
          username: user.username,
          ...performanceData
        };
      });

      // Calculate performance metrics for all team members
      teamPerformance = teamPerformance.map(calculatePerformanceMetrics);

      // Sort by performance rate
      teamPerformance.sort((a, b) => b.totalPerformanceRate - a.totalPerformanceRate);
    } else {
      // Non-admin: Get individual user performance
      if (userObjectId) {
        const performanceData = await buildUserPerformanceData(userObjectId, companyId, dateQuery, revisionConfig);
        userPerformance = {
          username: currentUser.username,
          ...performanceData
        };
        userPerformance = calculatePerformanceMetrics(userPerformance);
      }
    }

    const payload = {
      teamPerformance,
      userPerformance
    };

    setPerformanceCache(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    console.error('Performance analytics error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get individual team member trend data
router.get('/member-trend', async (req, res) => {
  try {
    const { memberUsername, isAdmin, userId } = req.query;
    const cacheKey = `member-trend:${memberUsername || 'na'}:${userId || 'na'}:${isAdmin || 'false'}`;
    const cachedResponse = getPerformanceCache(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

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

    setPerformanceCache(cacheKey, trendMonths);
    res.json(trendMonths);
  } catch (error) {
    console.error('Member trend data error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Export performance data to Excel
router.post('/export-excel', async (req, res) => {
  try {
    const { teamPerformance, userPerformance, dateRange, userInfo } = req.body;

    const workbook = XLSX.utils.book_new();

    /* -----------------------------
       1️⃣ DATE HELPERS
    ----------------------------- */
    const resolveDateRange = () => {
      if (dateRange.viewMode === 'current') {
        const d = new Date(dateRange.selectedMonth);
        return {
          startDate: new Date(d.getFullYear(), d.getMonth(), 1),
          endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
        };
      }
      if (dateRange.viewMode === 'custom') {
        return {
          startDate: new Date(dateRange.dateFrom),
          endDate: new Date(dateRange.dateTo)
        };
      }
      return {};
    };

    const { startDate, endDate } = resolveDateRange();

    const formatDateDDMMYYYY = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    };

    /* -----------------------------
       2️⃣ RESOLVE MEMBERS
    ----------------------------- */
    const members =
      teamPerformance && teamPerformance.length
        ? teamPerformance
        : userPerformance
          ? [userPerformance]
          : [];

    /* -----------------------------
       3️⃣ BUILD SUMMARY DATA
    ----------------------------- */
    const totalMembers = members.length;

    const totals = members.reduce(
      (acc, m) => {
        acc.totalTasks += m.totalTasks || 0;
        acc.completed += m.completedTasks || 0;
        acc.pending += m.pendingTasks || 0;
        acc.rejected += m.rejectedTasks || 0;
        acc.onTime += m.onTimeCompletedTasks || 0;
        return acc;
      },
      { totalTasks: 0, completed: 0, pending: 0, rejected: 0 }
    );

    const completionRate =
      totals.totalTasks > 0
        ? (((totals.completed - totals.rejected * 0.5) / totals.totalTasks) * 100).toFixed(1)
        : 0;

    const avgOnTimeRate =
      members.length > 0
        ? (
            members.reduce((s, m) => s + (m.onTimeRate || 0), 0) / members.length
          ).toFixed(1)
        : 0;

    const avgPerformance =
      members.length > 0
        ? (
            members.reduce((s, m) => s + (m.totalPerformanceRate || 0), 0) / members.length
          ).toFixed(1)
        : 0;

    const topPerformer = [...members].sort(
      (a, b) => (b.totalPerformanceRate || 0) - (a.totalPerformanceRate || 0)
    )[0];

    const lowPerformer = [...members].sort(
      (a, b) => (a.totalPerformanceRate || 0) - (b.totalPerformanceRate || 0)
    )[0];

    /* -----------------------------
       4️⃣ SUMMARY SHEET
    ----------------------------- */
    const summaryData = [
      ['PERFORMANCE SUMMARY REPORT'],
      [],
      ['Generated On', formatDateDDMMYYYY(new Date())],
      [
        'Period',
        dateRange.viewMode === 'current'
          ? new Date(dateRange.selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })
          : dateRange.viewMode === 'custom'
            ? `${formatDateDDMMYYYY(dateRange.dateFrom)} to ${formatDateDDMMYYYY(dateRange.dateTo)}`
            : 'All Time'
      ],
      ['Generated By', userInfo.username],
      [],
      ['OVERALL SUMMARY'],
      ['Total Team Members', totalMembers],
      ['Total Tasks', totals.totalTasks],
      ['Completed Tasks', totals.completed],
      ['On-Time Tasks (Count)', totals.onTime],
      ['Pending Tasks', totals.pending],
      ['Rejected Tasks', totals.rejected],
      ['Completion Rate (%)', completionRate],
      ['Average On-Time Rate (%)', avgOnTimeRate],
      ['Average Performance Score', avgPerformance],
      [],
      ['HIGHLIGHTS'],
      ['Top Performer', topPerformer?.username || ''],
      ['Top Score', topPerformer?.totalPerformanceRate || ''],
      ['Needs Attention', lowPerformer?.username || ''],
      ['Lowest Score', lowPerformer?.totalPerformanceRate || ''],
      [],
      ['TEAM PERFORMANCE'],
      [
        'User',
        'Total Tasks',
        'Completed',
        'On-Time (Count)',
        'Pending',
        'Rejected',
        'Completion %',
        'On-Time %',
        'Performance Score'
      ]
    ];

    members.forEach(m => {
      summaryData.push([
        m.username,
        m.totalTasks || 0,
        m.completedTasks || 0,
        m.onTimeCompletedTasks || 0,
        m.pendingTasks || 0,
        m.rejectedTasks || 0,
        `${m.completionRate || 0}%`,
        `${m.onTimeRate || 0}%`,
        m.totalPerformanceRate || 0
      ]);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    /* -----------------------------
       5️⃣ USER TASK DETAIL SHEETS
    ----------------------------- */
    for (const member of members) {
      const userDoc = await User.findOne({
        username: member.username,
        companyId: userInfo.companyId
      });

      if (!userDoc) continue;

      const taskQuery = {
        isActive: true,
        companyId: userInfo.companyId,
        assignedTo: userDoc._id
      };

      if (startDate && endDate) {
        taskQuery.dueDate = { $gte: startDate, $lte: endDate };
      }

      const tasks = await Task.find(taskQuery)
        .populate('assignedBy', 'username')
        .populate('assignedTo', 'username')
        .sort({ dueDate: 1 })
        .lean();

      const sheetData = [[
        'Title',
        'Description',
        'Task Type',
        'Priority',
        'Status',
        'Due Date',
        'Completed Date',
        'Assigned By',
        'Assigned To',
        'On-Time',
        'Revision Count',
        'Remarks'
      ]];

      tasks.forEach(task => {
        const onTime =
          task.completedAt && task.dueDate
            ? new Date(task.completedAt) <= new Date(task.dueDate)
              ? 'Yes'
              : 'No'
            : '';

        sheetData.push([
          task.title,
          task.description,
          task.taskType,
          task.priority,
          task.status,
          formatDateDDMMYYYY(task.dueDate),
          formatDateDDMMYYYY(task.completedAt || task.rejectedAt),
          task.assignedBy?.username || '',
          task.assignedTo?.username || '',
          onTime,
          task.revisionCount || 0,
          task.completionRemarks || ''
        ]);
      });

      const sheet = XLSX.utils.aoa_to_sheet(sheetData);
      const safeName = member.username.substring(0, 31);
      XLSX.utils.book_append_sheet(workbook, sheet, safeName);
    }

    /* -----------------------------
       6️⃣ SEND FILE
    ----------------------------- */
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=task-performance-report.xlsx');
    res.send(buffer);

  } catch (error) {
    console.error('Error generating Excel export:', error);
    res.status(500).json({
      message: 'Error generating Excel file',
      error: error.message
    });
  }
});



// Export performance data to PDF
router.post('/export-pdf', async (req, res) => {
  try {
    const { teamPerformance, userPerformance, dateRange, userInfo } = req.body;

    const doc = new jsPDFModule.jsPDF();

    // Add title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Performance Scorecard', 20, 20);

    // Add metadata
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);

    const periodText = dateRange.viewMode === 'current' ?
      `Period: ${new Date(dateRange.selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}` :
      dateRange.viewMode === 'custom' ?
        `Period: ${formatDateDDMMYYYY(dateRange.dateFrom)} to ${formatDateDDMMYYYY(dateRange.dateTo)}`: 
        'Period: All Time'; 
        'Period: All Time';

    doc.text(periodText, 20, 35);

    let yPosition = 50;

    if (teamPerformance && teamPerformance.length > 0) {  
      // Team Performance Scorecard
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Team Performance Overview', 20, yPosition);
      yPosition += 10;

      // Overall team metrics
      const totalTeamTasks = teamPerformance.reduce((sum, member) => sum + (member.totalTasks || 0), 0);
      const totalTeamCompleted = teamPerformance.reduce((sum, member) => sum + (member.completedTasks || 0), 0);
      const avgCompletionRate = teamPerformance.reduce((sum, member) => sum + (member.completionRate || 0), 0) / teamPerformance.length;
      const avgOnTimeRate = teamPerformance.reduce((sum, member) => sum + (member.onTimeRate || 0), 0) / teamPerformance.length;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Team Members: ${teamPerformance.length}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Total Tasks: ${totalTeamTasks}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Completed Tasks: ${totalTeamCompleted}`, 20, yPosition);
      yPosition += 8;
      doc.text(`Average Completion Rate: ${avgCompletionRate.toFixed(1)}%`, 20, yPosition);
      yPosition += 8;
      doc.text(`Average On-Time Rate: ${avgOnTimeRate.toFixed(1)}%`, 20, yPosition);
      yPosition += 15;

      // Performance table
      const sortedTeam = [...teamPerformance]
        .sort((a, b) => ((b.completionRate * 0.5) + (b.onTimeRate * 0.5)) - ((a.completionRate * 0.5) + (a.onTimeRate * 0.5)));

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Individual Performance Scores', 20, yPosition);
      yPosition += 10;

      const tableData = sortedTeam.map((member, index) => {
        const score = ((member.completionRate * 0.5) + (member.onTimeRate * 0.5)).toFixed(1);

        return [
          (index + 1).toString(),
          member.username,
          member.totalTasks.toString(),
          member.completedTasks.toString(),              // ✅ count
          (member.onTimeCompletedTasks || 0).toString(), // ✅ count
          `${score}%`                                     // keep score if you want
        ];
      });

      doc.autoTable({
        startY: yPosition,
        head: [['Rank', 'Name', 'Total Tasks', 'Completed', 'On-Time', 'Score %']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 139, 202] }
      });

      yPosition = doc.lastAutoTable.finalY + 20;

      // Task type distribution
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Task Type Distribution', 20, yPosition);
      yPosition += 10;

      const taskTypeData = sortedTeam.slice(0, 10).map(member => {
        return [
          member.username,
          (member.oneTimeTasks || 0).toString(),
          (member.dailyTasks || 0).toString(),
          (member.weeklyTasks || 0).toString(),
          (member.monthlyTasks || 0).toString(),
          (member.quarterlyTasks || 0).toString(),
          (member.yearlyTasks || 0).toString()
        ];
      });

      doc.autoTable({
        startY: yPosition,
        head: [['Name', 'One-time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']],
        body: taskTypeData,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
      });

    } else if (userPerformance) {
      // Individual Performance Scorecard
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Performance Scorecard: ${userPerformance.username}`, 20, yPosition);
      yPosition += 20;

      // Performance metrics in a visually appealing layout
      const performanceScore = ((userPerformance.completionRate * 0.5) + (userPerformance.onTimeRate * 0.5)).toFixed(1);

      // Main score box
      doc.setFillColor(240, 248, 255);
      doc.rect(20, yPosition, 170, 30, 'F');
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(`Performance Score: ${performanceScore}%`, 30, yPosition + 20);

      yPosition += 45;

      // Key metrics
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Key Performance Metrics', 20, yPosition);
      yPosition += 15;

      const metricsData = [
        ['Total Tasks', userPerformance.totalTasks.toString()],
        ['Completed Tasks', userPerformance.completedTasks.toString()],
        ['Pending Tasks', userPerformance.pendingTasks.toString()],
        ['Completion Rate', `${userPerformance.completionRate}%`],
        ['On-Time Rate', `${userPerformance.onTimeRate}%`],
        ['On-Time Completed', (userPerformance.onTimeCompletedTasks || 0).toString()]
      ];

      doc.autoTable({
        startY: yPosition,
        head: [['Metric', 'Value']],
        body: metricsData,
        theme: 'grid',
        styles: { fontSize: 12 },
        headStyles: { fillColor: [66, 139, 202] }
      });

      yPosition = doc.lastAutoTable.finalY + 20;

      // Task breakdown
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Task Type Breakdown', 20, yPosition);
      yPosition += 10;

      const taskBreakdownData = [
        ['One-time Tasks', (userPerformance.oneTimeTasks || 0).toString(), (userPerformance.oneTimeCompleted || 0).toString(), (userPerformance.oneTimePending || 0).toString()],
        ['Daily Tasks', (userPerformance.dailyTasks || 0).toString(), (userPerformance.dailyCompleted || 0).toString(), (userPerformance.dailyPending || 0).toString()],
        ['Weekly Tasks', (userPerformance.weeklyTasks || 0).toString(), (userPerformance.weeklyCompleted || 0).toString(), (userPerformance.weeklyPending || 0).toString()],
        ['Monthly Tasks', (userPerformance.monthlyTasks || 0).toString(), (userPerformance.monthlyCompleted || 0).toString(), (userPerformance.monthlyPending || 0).toString()],
        ['Quarterly Tasks', (userPerformance.quarterlyTasks || 0).toString(), (userPerformance.quarterlyCompleted || 0).toString(), (userPerformance.quarterlyPending || 0).toString()],
        ['Yearly Tasks', (userPerformance.yearlyTasks || 0).toString(), (userPerformance.yearlyCompleted || 0).toString(), (userPerformance.yearlyPending || 0).toString()]
      ];

      doc.autoTable({
        startY: yPosition,
        head: [['Task Type', 'Total', 'Completed', 'Pending']],
        body: taskBreakdownData,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [66, 139, 202] }
      });

      // Additional insights for one-time tasks
      if (userPerformance.revisedOneTimeTasks || userPerformance.rejectedOneTimeTasks) {
        yPosition = doc.lastAutoTable.finalY + 15;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('One-time Task Quality Metrics', 20, yPosition);
        yPosition += 10;

        const qualityData = [
          ['Revised One-time Tasks', (userPerformance.revisedOneTimeTasks || 0).toString()],
          ['Rejected One-time Tasks', (userPerformance.rejectedOneTimeTasks || 0).toString()]
        ];

        doc.autoTable({
          startY: yPosition,
          head: [['Quality Metric', 'Count']],
          body: qualityData,
          theme: 'grid',
          styles: { fontSize: 10 },
          headStyles: { fillColor: [255, 193, 7] }
        });
      }
    }

    // Add footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} of ${pageCount}`, 180, 285);
      doc.text('Generated by TMS - Task Management System', 20, 285);
    }

    const pdfBuffer = doc.output('arraybuffer');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=performance-scorecard.pdf');
    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    console.error('Error generating PDF export:', error);
    res.status(500).json({ message: 'Error generating PDF file', error: error.message });
  }
});

export default router;
