import TaskDeleteLog from '../models/TaskDeleteLog.js';
import User from '../models/User.js';
import Company from '../models/Company.js';

const resolveId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const resolveUserSnapshot = (value) => {
  if (!value) {
    return {
      id: null,
      username: '',
      email: '',
      role: ''
    };
  }

  if (typeof value === 'object') {
    return {
      id: resolveId(value),
      username: value.username || '',
      email: value.email || '',
      role: value.role || ''
    };
  }

  return {
    id: String(value),
    username: '',
    email: '',
    role: ''
  };
};

const getTaskFamily = (taskType) => String(taskType || '').trim() === 'one-time' ? 'one-time' : 'recurring';

export const createTaskDeleteLogs = async ({
  tasks = [],
  companyId = null,
  deleteMode = 'permanent',
  source = '',
  deletedById = null,
  deletedByName = '',
  deletedByRole = ''
}) => {
  const taskList = Array.isArray(tasks) ? tasks.filter(Boolean) : [tasks].filter(Boolean);

  if (taskList.length === 0) {
    return [];
  }

  const companyKey = companyId || taskList[0]?.companyId || null;
  const companyDoc = companyKey
    ? await Company.findOne({ companyId: companyKey }).select('companyName').lean()
    : null;

  const actor = deletedById
    ? await User.findById(deletedById).select('username email role').lean()
    : null;

  const userIds = new Set();
  taskList.forEach((task) => {
    const assignedById = resolveId(task.assignedBy);
    const assignedToId = resolveId(task.assignedTo);
    if (assignedById) userIds.add(assignedById);
    if (assignedToId) userIds.add(assignedToId);
  });

  const users = userIds.size > 0
    ? await User.find({ _id: { $in: [...userIds] } }).select('username email role').lean()
    : [];

  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const now = new Date();

  const docs = taskList.map((task) => {
    const assignedBySnapshot = resolveUserSnapshot(task.assignedBy);
    const assignedToSnapshot = resolveUserSnapshot(task.assignedTo);
    const resolvedAssignedBy = assignedBySnapshot.id ? userMap.get(assignedBySnapshot.id) : null;
    const resolvedAssignedTo = assignedToSnapshot.id ? userMap.get(assignedToSnapshot.id) : null;
    const resolvedActor = actor || {
      _id: deletedById || null,
      username: deletedByName || 'System Cleanup',
      email: '',
      role: deletedByRole || 'system'
    };

    return {
      companyId: task.companyId || companyKey || '',
      companyName: companyDoc?.companyName || task.companyName || '',
      taskId: task.taskId || '',
      taskGroupId: task.taskGroupId || '',
      taskType: task.taskType || '',
      taskFamily: getTaskFamily(task.taskType),
      taskTitle: task.title || '',
      taskDescription: task.description || '',
      assignedBy: assignedBySnapshot.id,
      assignedByName: assignedBySnapshot.username || resolvedAssignedBy?.username || '',
      assignedByEmail: assignedBySnapshot.email || resolvedAssignedBy?.email || '',
      assignedTo: assignedToSnapshot.id,
      assignedToName: assignedToSnapshot.username || resolvedAssignedTo?.username || '',
      assignedToEmail: assignedToSnapshot.email || resolvedAssignedTo?.email || '',
      deletedBy: resolvedActor._id || null,
      deletedByName: resolvedActor.username || 'System Cleanup',
      deletedByEmail: resolvedActor.email || '',
      deletedByRole: resolvedActor.role || 'system',
      deleteMode,
      source,
      deletedAt: task.deletedAt || task.movedToBinAt || now,
      dueDate: task.dueDate || null,
      status: task.status || '',
      priority: task.priority || '',
      sequenceNumber: task.sequenceNumber ?? null,
      taskSnapshot: {
        _id: resolveId(task._id),
        title: task.title || '',
        description: task.description || '',
        taskId: task.taskId || '',
        taskType: task.taskType || '',
        taskGroupId: task.taskGroupId || '',
        dueDate: task.dueDate || null,
        priority: task.priority || '',
        status: task.status || '',
        assignedBy: assignedBySnapshot,
        assignedTo: assignedToSnapshot
      }
    };
  });

  return TaskDeleteLog.insertMany(docs, { ordered: false });
};
