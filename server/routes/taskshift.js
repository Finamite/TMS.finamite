import express from 'express';
import Task from '../models/Task.js';
import User from '../models/User.js';
import MasterTask from '../models/MasterTask.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get users for task shifting (excluding current user)
router.get('/users', async (req, res) => {
  try {
    const { companyId, excludeUserId } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    const query = { 
      companyId,
      isActive: { $ne: false }
    };

    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const users = await User.find(query)
      .select('_id username email role')
      .sort({ username: 1 })
      .lean();

    res.json(users);
  } catch (error) {
    console.error('Error fetching users for task shift:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get one-time tasks for shifting
router.get('/one-time-tasks', async (req, res) => {
  try {
    const { companyId, assignedTo, startDate, endDate, search } = req.query;

    if (!companyId || !assignedTo) {
      return res.status(400).json({ message: 'Company ID and assignedTo are required' });
    }

    const query = {
      companyId,
      assignedTo,
      taskType: 'one-time',
      status: 'pending',
      isActive: true
    };

    if (startDate && endDate) {
      query.dueDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const tasks = await Task.find(query)
      .populate('assignedBy', 'username email')
      .populate('assignedTo', 'username email')
      .sort({ dueDate: 1 })
      .limit(1000)
      .lean();

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching one-time tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get recurring task masters for shifting
router.get('/recurring-masters', async (req, res) => {
  try {
    const { companyId, assignedTo, taskType, dateFrom, dateTo } = req.query;

    if (!companyId || !assignedTo) {
      return res.status(400).json({ message: 'Company ID and assignedTo are required' });
    }

    // First try to get from MasterTask collection
    const masterQuery = {
      companyId,
      assignedTo,
      isActive: { $ne: false },
      taskType: { $ne: 'one-time' }
    };

    if (taskType && taskType !== 'all') {
      masterQuery.taskType = taskType;
    }

    let masters = await MasterTask.find(masterQuery)
      .select('taskGroupId title description taskType priority assignedTo assignedBy startDate endDate attachments')
      .lean();

    // Fallback: Generate from Task collection if no masters found
    if (!masters.length) {
      const assignedToId = new mongoose.Types.ObjectId(assignedTo);
      const taskMatch = {
        companyId,
        assignedTo: assignedToId,
        isActive: true,
        taskGroupId: { $exists: true },
        taskType: { $in: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] }
      };

      if (taskType && taskType !== 'all') {
        taskMatch.taskType = taskType;
      }

      const grouped = await Task.aggregate([
        { $match: taskMatch },
        {
          $group: {
            _id: '$taskGroupId',
            title: { $first: '$title' },
            description: { $first: '$description' },
            taskType: { $first: '$taskType' },
            priority: { $first: '$priority' },
            assignedTo: { $first: '$assignedTo' },
            assignedBy: { $first: '$assignedBy' },
            startDate: { $min: '$dueDate' },
            endDate: { $max: '$dueDate' },
            attachments: { $first: '$attachments' },
            instanceCount: { $sum: 1 },
            completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
          }
        }
      ]);

      masters = grouped.map(g => ({
        taskGroupId: g._id,
        title: g.title,
        description: g.description,
        taskType: g.taskType,
        priority: g.priority,
        assignedTo: g.assignedTo,
        assignedBy: g.assignedBy,
        startDate: g.startDate,
        endDate: g.endDate,
        attachments: g.attachments || [],
        instanceCount: g.instanceCount,
        completedCount: g.completedCount,
        pendingCount: g.pendingCount
      }));
    }

    // Apply date filtering if provided
    if (dateFrom || dateTo) {
      masters = masters.filter(task => {
        const start = new Date(task.startDate);
        const end = new Date(task.endDate);

        if (dateFrom && end < new Date(dateFrom)) return false;
        if (dateTo && start > new Date(dateTo)) return false;

        return true;
      });
    }

    // Get user details for each master task
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

    // Get task counts for masters that don't have them
    const mastersNeedingCounts = masters.filter(m => !m.instanceCount);
    if (mastersNeedingCounts.length > 0) {
      const taskGroupIds = mastersNeedingCounts.map(m => m.taskGroupId);
      const stats = await Task.aggregate([
        { $match: { taskGroupId: { $in: taskGroupIds }, isActive: true } },
        {
          $group: {
            _id: '$taskGroupId',
            instanceCount: { $sum: 1 },
            completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }
          }
        }
      ]);

      const statMap = {};
      stats.forEach(s => (statMap[s._id] = s));

      mastersNeedingCounts.forEach(m => {
        const stat = statMap[m.taskGroupId];
        if (stat) {
          m.instanceCount = stat.instanceCount;
          m.completedCount = stat.completedCount;
          m.pendingCount = stat.pendingCount;
        }
      });
    }

    // Format final response
    const finalMasters = masters.map(m => ({
      ...m,
      assignedTo: userMap[m.assignedTo?.toString()] || null,
      assignedBy: userMap[m.assignedBy?.toString()] || null,
      dateRange: {
        start: m.startDate,
        end: m.endDate
      },
      instanceCount: m.instanceCount || 0,
      completedCount: m.completedCount || 0,
      pendingCount: m.pendingCount || 0
    }));

    res.json(finalMasters);
  } catch (error) {
    console.error('Error fetching recurring masters:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Shift one-time tasks
router.post('/shift-one-time', async (req, res) => {
  try {
    const { taskIds, fromUser, toUser, companyId } = req.body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ message: 'Task IDs are required' });
    }

    if (!fromUser || !toUser || !companyId) {
      return res.status(400).json({ message: 'fromUser, toUser, and companyId are required' });
    }

    if (fromUser === toUser) {
      return res.status(400).json({ message: 'Source and target users cannot be the same' });
    }

    // Validate users exist
    const [fromUserDoc, toUserDoc] = await Promise.all([
      User.findById(fromUser).lean(),
      User.findById(toUser).lean()
    ]);

    if (!fromUserDoc || !toUserDoc) {
      return res.status(400).json({ message: 'Invalid user IDs provided' });
    }

    // Update tasks
    const result = await Task.updateMany(
      {
        _id: { $in: taskIds },
        companyId,
        assignedTo: fromUser,
        taskType: 'one-time',
        status: 'pending',
        isActive: true
      },
      {
        $set: { assignedTo: toUser }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'No matching tasks found to shift' });
    }

    res.json({
      success: true,
      message: `Successfully shifted ${result.modifiedCount} one-time task(s) to ${toUserDoc.username}`,
      shiftedCount: result.modifiedCount,
      fromUser: fromUserDoc.username,
      toUser: toUserDoc.username
    });
  } catch (error) {
    console.error('Error shifting one-time tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Shift recurring task masters
router.post('/shift-recurring', async (req, res) => {
  try {
    const { taskGroupIds, fromUser, toUser, companyId } = req.body;

    // 🔴 Basic validation
    if (!Array.isArray(taskGroupIds) || taskGroupIds.length === 0) {
      return res.status(400).json({ message: 'Task Group IDs are required' });
    }

    if (!fromUser || !toUser || !companyId) {
      return res.status(400).json({
        message: 'fromUser, toUser, and companyId are required'
      });
    }

    if (fromUser === toUser) {
      return res.status(400).json({
        message: 'Source and target users cannot be the same'
      });
    }

    // 🔴 Validate users
    const [fromUserDoc, toUserDoc] = await Promise.all([
      User.findById(fromUser).lean(),
      User.findById(toUser).lean()
    ]);

    if (!fromUserDoc || !toUserDoc) {
      return res.status(400).json({ message: 'Invalid user IDs provided' });
    }

    const fromUserId = new mongoose.Types.ObjectId(fromUser);
    const toUserId = new mongoose.Types.ObjectId(toUser);

    let totalShiftedInstances = 0;

    // 🔁 Process each recurring task group
    for (const taskGroupId of taskGroupIds) {

      // 1️⃣ Shift ONLY pending task instances
      const instanceResult = await Task.updateMany(
        {
          companyId,
          taskGroupId,
          assignedTo: fromUserId,
          status: 'pending',
          isActive: true
        },
        {
          $set: { assignedTo: toUserId }
        }
      );

      totalShiftedInstances += instanceResult.modifiedCount;

      // 2️⃣ Update master task assignment
      // ❗ NEVER CREATE MASTER HERE (prevents duplicate key error)
      await MasterTask.findOneAndUpdate(
        {
          companyId,
          taskGroupId
        },
        {
          $set: { assignedTo: toUserId }
        }
      );
    }

    // ✅ Final success response
    return res.json({
      success: true,
      message: `Successfully shifted ${taskGroupIds.length} recurring task series (${totalShiftedInstances} pending tasks) to ${toUserDoc.username}`,
      shiftedSeries: taskGroupIds.length,
      shiftedInstances: totalShiftedInstances,
      fromUser: fromUserDoc.username,
      toUser: toUserDoc.username
    });

  } catch (error) {
    console.error('Error shifting recurring tasks:', error);

    // 🔴 Duplicate key safeguard (just in case)
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate task group detected. Please retry.',
        error: error.message
      });
    }

    return res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

// Get task shift history/logs (optional feature)
router.get('/history', async (req, res) => {
  try {
    const { companyId, page = 1, limit = 50 } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    // This would require a separate TaskShiftLog model to track shifts
    // For now, we can return recent task updates
    const recentShifts = await Task.find({
      companyId,
      updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    })
      .populate('assignedTo', 'username email')
      .populate('assignedBy', 'username email')
      .select('title taskType assignedTo assignedBy updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    res.json({
      shifts: recentShifts,
      currentPage: parseInt(page),
      hasMore: recentShifts.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching task shift history:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;