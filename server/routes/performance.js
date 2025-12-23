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
  const userBaseQuery = {
    isActive: true,
    companyId: companyId,
    assignedTo: userId,
    ...dateQuery
  };


  // Use Promise.all to run queries in parallel for better performance
  const [
  totalTasks,
  completedTasks,
  pendingTasks,
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
  yearlyCompleted,

  revisedOneTimeTasks,          // ✅ revisions FIRST
  rejectedOneTimeTasks,         // ✅ rejected one-time NEXT

  onTimeCompletedTasksCount,
  onTimeCompletedRecurringTasks,

  rejectedTasks,
  onTimeRejectedOneTime,
  onTimeRejectedRecurring

] = await Promise.all([
  Task.countDocuments(userBaseQuery),

  Task.countDocuments({
    ...userBaseQuery,
    status: { $in: ['completed', 'rejected'] },
    $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
  }),

  Task.countDocuments({ ...userBaseQuery, status: 'pending' }),

  Task.countDocuments({ ...userBaseQuery, taskType: 'one-time' }),
  Task.countDocuments({ ...userBaseQuery, taskType: 'one-time', status: 'pending' }),
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'one-time',
    status: { $in: ['completed', 'rejected'] },
    $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
  }),

  Task.countDocuments({ ...userBaseQuery, taskType: 'daily' }),
  Task.countDocuments({ ...userBaseQuery, taskType: 'daily', status: 'pending' }),
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'daily',
    status: { $in: ['completed', 'rejected'] },
    $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
  }),

  Task.countDocuments({ ...userBaseQuery, taskType: 'weekly' }),
  Task.countDocuments({ ...userBaseQuery, taskType: 'weekly', status: 'pending' }),
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'weekly',
    status: { $in: ['completed', 'rejected'] },
    $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
  }),

  Task.countDocuments({ ...userBaseQuery, taskType: 'monthly' }),
  Task.countDocuments({ ...userBaseQuery, taskType: 'monthly', status: 'pending' }),
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'monthly',
    status: { $in: ['completed', 'rejected'] },
    $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
  }),

  Task.countDocuments({ ...userBaseQuery, taskType: 'quarterly' }),
  Task.countDocuments({ ...userBaseQuery, taskType: 'quarterly', status: 'pending' }),
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'quarterly',
    status: { $in: ['completed', 'rejected'] },
    $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
  }),

  Task.countDocuments({ ...userBaseQuery, taskType: 'yearly' }),
  Task.countDocuments({ ...userBaseQuery, taskType: 'yearly', status: 'pending' }),
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'yearly',
    status: { $in: ['completed', 'rejected'] },
    $or: [{ completedAt: { $ne: null } }, { rejectedAt: { $ne: null } }]
  }),

  // 🔁 revisions
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'one-time',
    revisionCount: { $gt: 0 },
    completedAt: { $ne: null }
  }),

  // ❌ rejected one-time (THIS WAS MISPLACED BEFORE)
  Task.countDocuments({
    ...userBaseQuery,
    taskType: 'one-time',
    status: 'rejected',
    rejectedAt: { $ne: null }
  }),

  Task.countDocuments({
    ...userBaseQuery,
    status: 'completed',
    completedAt: { $ne: null },
    $expr: { $lte: ['$completedAt', { $add: ['$dueDate', 86400000] }] },
    taskType: 'one-time'
  }),

  Task.countDocuments({
    ...userBaseQuery,
    status: 'completed',
    completedAt: { $ne: null },
    $expr: { $lte: ['$completedAt', { $ifNull: ['$nextDueDate', { $add: ['$dueDate', 86400000] }] }] },
    taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
  }),

  Task.countDocuments({
    ...userBaseQuery,
    status: 'rejected',
    rejectedAt: { $ne: null }
  }),

  Task.countDocuments({
    ...userBaseQuery,
    status: 'rejected',
    rejectedAt: { $ne: null },
    taskType: 'one-time'
  }),

  Task.countDocuments({
    ...userBaseQuery,
    status: 'rejected',
    rejectedAt: { $ne: null },
    taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
  })
]);


  const recurringTasks = dailyTasks + weeklyTasks + monthlyTasks + quarterlyTasks + yearlyTasks;
  const recurringPending = dailyPending + weeklyPending + monthlyPending + quarterlyPending + yearlyPending;
  // UPDATED: Include rejected in recurringCompleted
  const recurringCompleted = dailyCompleted + weeklyCompleted + monthlyCompleted + quarterlyCompleted + yearlyCompleted;
  const onTimeRejectedTotal = onTimeRejectedOneTime + onTimeRejectedRecurring;
  const effectiveCompleted = completedTasks - (rejectedTasks * 0.5);  // Partial for rates only
  // --- NEW: compute on-time scoring using revision scoringRules if enabled ---
  // Load revision settings for the company and pick the first enabled scoring mapping
  const revisionSettings = await Settings.findOne({ type: 'revision', companyId });
  let enableRevisions = revisionSettings?.data?.enableRevisions ?? false;

  // Default fallback mapping (matches your defaults)
  const defaultMapping = { 0: 100, 1: 70, 2: 40, 3: 0 };
  let mapping = defaultMapping;

  // check if ANY scoring rule is enabled
  const rules = revisionSettings?.data?.scoringRules || [];
  const enabledRule = rules.find(r => r.enabled === true);

  if (enabledRule && enabledRule.mapping) {
    // use enabled rule
    mapping = enabledRule.mapping;
  } else {
    // No scoring rule enabled → disable revision scoring completely
    enableRevisions = false;
  }

  // If revisions are enabled, compute total applied score for completed tasks
  // We'll sum per-task: (isOnTime ? mapping[revisionCount] : 0). We'll compute via aggregation for accuracy
  let onTimeScoreSum = 0;
  if (enableRevisions) {
    try {
      // Build $switch branches dynamically from mapping
      const switchBranches = Object.keys(mapping).map(key => ({
        case: { $eq: ['$revisionCount', parseInt(key, 10)] },
        then: mapping[key]
      }));

      const scorePipeline = [
        {
          $match: {
            ...userBaseQuery,
            status: { $in: ['completed', 'rejected'] },
            $or: [
              { status: 'completed', completedAt: { $ne: null } },
              { status: 'rejected', rejectedAt: { $ne: null } }
            ]
          }
        },
        // compute effectiveDue (prefer nextDueDate if set)
        {
          $addFields: {
            effectiveDue: { $ifNull: ['$nextDueDate', '$dueDate'] }
          }
        },
        // Handle completion date and rejected flag
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
        // determine isOnTime boolean (use completionDate <= effectiveDue + 24h)
        {
          $addFields: {
            isOnTime: { $lte: ['$completionDate', { $add: ['$effectiveDue', 24 * 60 * 60 * 1000] }] }
          }
        },
        // map revisionCount -> mapping value (for completed) OR fixed 50 for rejected
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
                        default: 0  // Default 0 if unknown rev for rejected
                      }
                    },
                    0.5  // 50% partial credit for rejected
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
        // apply score only if on time
        {
          $project: {
            scoreApplied: { $cond: ['$isOnTime', '$baseScore', 0] }
          }
        },
        // sum
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

  // If revisions enabled -> use mapped scoring; else fallback to legacy onTimeRate
  let onTimeRate = 0;
  if (enableRevisions) {
    // Average on-time % score across ALL tasks (totalScore sums per-task scores like 100/50/0)
    onTimeRate = totalTasks > 0 ? (onTimeScoreSum / totalTasks) : 0;
  } else {
    const effectiveOnTimeCompleted = onTimeCompletedTasksCount + onTimeCompletedRecurringTasks;
    const effectiveOnTimeRejected = onTimeRejectedTotal * 0.5;
    const effectiveOnTime = effectiveOnTimeCompleted + effectiveOnTimeRejected;
    // FIXED: Denominator = totalTasks (not effectiveCompleted) for % across all assigned tasks
    onTimeRate = totalTasks > 0 ? (effectiveOnTime / totalTasks) * 100 : 0;
  }

  return {
    totalTasks,
    completedTasks,  // Now includes rejected
    pendingTasks,
    oneTimeTasks,
    oneTimePending,
    oneTimeCompleted,  // Now includes rejected one-time
    revisedOneTimeTasks,
    dailyTasks,
    dailyPending,
    dailyCompleted,  // Now includes rejected daily
    weeklyTasks,
    weeklyPending,
    weeklyCompleted,  // Now includes rejected weekly
    monthlyTasks,
    monthlyPending,
    monthlyCompleted,  // Now includes rejected monthly
    quarterlyTasks,
    quarterlyPending,
    quarterlyCompleted,  // Now includes rejected quarterly
    yearlyTasks,
    yearlyPending,
    yearlyCompleted,  // Now includes rejected yearly
    recurringTasks,
    recurringPending,
    recurringCompleted,  // Now includes rejected recurring
    rejectedTasks,
    rejectedOneTimeTasks,
    // UPDATED: Include on-time rejected in total on-time count for UI
    onTimeCompletedTasks: (onTimeCompletedTasksCount + onTimeCompletedRecurringTasks) + (onTimeRejectedOneTime + onTimeRejectedRecurring),
    onTimeRecurringCompleted: onTimeCompletedRecurringTasks + onTimeRejectedRecurring,  // For recurring on-time UI if used
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
      dateQuery = {
        $or: [
          { dueDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { nextDueDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { completedAt: { $gte: new Date(startDate), $lte: new Date(endDate) } },
          { rejectedAt: { $gte: new Date(startDate), $lte: new Date(endDate) } }
        ]
      };
    }

    let teamPerformance = [];
    let userPerformance = null;

    if (isAdmin === 'true') {
      // Admin: Get team performance for users in the same company
      const users = await User.find({
        isActive: true,
        companyId: companyId
      }).select('_id username').lean(); // Use lean() for better performance

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
            status: { $in: ['completed', 'rejected'] },  // UPDATED: Include rejected
            $or: [  // UPDATED: Use appropriate date
              { completedAt: { $ne: null, $gte: sixMonthsAgo, $lte: endOfCurrentMonth } },
              { rejectedAt: { $ne: null, $gte: sixMonthsAgo, $lte: endOfCurrentMonth } }
            ]
          }
        },
        {
          $addFields: {  // NEW: Unified completion date for grouping
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