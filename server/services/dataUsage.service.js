import DataUsage from '../models/DataUsage.js';
import Company from '../models/Company.js';
import Task from '../models/Task.js';
import User from '../models/User.js';


const AVG_DOC_SIZE = 937; // 1 KB per document (safe estimate)

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

export const updateDatabaseUsage = async () => {
  const companies = await Company.find({ isActive: true }).select('companyId');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const company of companies) {
    const companyId = company.companyId;

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
  }
};