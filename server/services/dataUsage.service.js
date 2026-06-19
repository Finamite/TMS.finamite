import DataUsage from '../models/DataUsage.js';
import Company from '../models/Company.js';
import Task from '../models/Task.js';
import User from '../models/User.js';


const AVG_DOC_SIZE = 937; // 1 KB per document (safe estimate)
const DB_USAGE_COOLDOWN_MS = 15 * 60 * 1000;
const lastDbUsageUpdateByCompany = new Map();

const getCollectionStats = async (Model, companyId) => {
  const count = await Model.countDocuments({ companyId });
  const size = count * AVG_DOC_SIZE;
  return { count, size };
};


export const updateFileUsage = async (companyId, fileInfo, uploadedBy) => {
  if (!companyId || !fileInfo) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await DataUsage.findOneAndUpdate(
    { companyId, date: today },
    {
      $inc: {
        'fileStorage.totalSize': fileInfo.size || 0,
        'fileStorage.fileCount': 1
      },
      $push: {
        'fileStorage.uploads': {
          filename: fileInfo.filename,
          originalName: fileInfo.originalName,
          size: fileInfo.size,
          uploadedAt: new Date(),
          uploadedBy
        }
      }
    },
    { upsert: true }
  );
};

/**
 * Check if adding files of given total size would exceed the company storage limit
 * Returns { allowed: boolean, message: string, usagePercentage: number }
 */
export const checkStorageLimit = async (companyId, additionalBytes = 0) => {
  try {
    if (!companyId) return { allowed: true, message: '', usagePercentage: 0 };

    const company = await Company.findOne({ companyId }).select('storageLimit').lean();
    if (!company) return { allowed: true, message: '', usagePercentage: 0 };

    const storageLimit = company.storageLimit !== undefined && company.storageLimit !== null 
      ? Number(company.storageLimit) 
      : 5368709120; // default 5GB

    // Get total file storage
    const fileUsage = await DataUsage.aggregate([
      { $match: { companyId } },
      {
        $group: {
          _id: null,
          totalFileStorage: { $sum: '$fileStorage.totalSize' }
        }
      }
    ]);

    // Get latest database usage
    const latestDbUsage = await DataUsage.findOne({ companyId })
      .sort({ date: -1 })
      .select('databaseUsage.totalSize')
      .lean();

    const currentFileStorage = fileUsage.length > 0 ? fileUsage[0].totalFileStorage : 0;
    const currentDbSize = latestDbUsage?.databaseUsage?.totalSize || 0;
    const totalUsage = currentFileStorage + currentDbSize + additionalBytes;
    const usagePercentage = storageLimit > 0 ? Math.round((totalUsage / storageLimit) * 100) : 0;

    if (totalUsage > storageLimit) {
      const gbLimit = storageLimit > 0 ? (storageLimit / 1073741824).toFixed(1) : '0';
      const displayLimit = storageLimit > 0 ? `${gbLimit}GB` : '0 (No storage)';
      return {
        allowed: false,
        message: `Storage limit exceeded! Your company storage limit is ${displayLimit}. Please contact Team Finamite to increase storage.`,
        usagePercentage
      };
    }

    return { allowed: true, message: '', usagePercentage };
  } catch (error) {
    console.error('Error checking storage limit:', error);
    return { allowed: true, message: '', usagePercentage: 0 };
  }
};

export const updateDatabaseUsage = async (companyId, options = {}) => {
  if (!companyId) return;
  const force = options.force === true;
  const nowTs = Date.now();
  const lastRunTs = lastDbUsageUpdateByCompany.get(companyId) || 0;

  if (!force && nowTs - lastRunTs < DB_USAGE_COOLDOWN_MS) {
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const taskStats = await getCollectionStats(Task, companyId);
  const userStats = await getCollectionStats(User, companyId);

  const totalDocuments = taskStats.count + userStats.count;
  const totalSize = taskStats.size + userStats.size;

  await DataUsage.findOneAndUpdate(
    { companyId, date: today },
    {
      $set: {
        'databaseUsage.collections.tasks': taskStats,
        'databaseUsage.collections.users': userStats,
        'databaseUsage.totalDocuments': totalDocuments,
        'databaseUsage.totalSize': totalSize
      }
    },
    { upsert: true }
  );

  lastDbUsageUpdateByCompany.set(companyId, nowTs);
};
