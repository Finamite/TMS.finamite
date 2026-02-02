import express from 'express';
import DataUsage from '../models/DataUsage.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get data usage for all companies or specific company
router.get('/', async (req, res) => {
  try {
    const { companyId, startDate, endDate, groupBy = 'day' } = req.query;

    let matchQuery = {};
    
    if (companyId && companyId !== '') {
      matchQuery.companyId = companyId;
    }

    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) matchQuery.date.$gte = new Date(startDate);
      if (endDate) matchQuery.date.$lte = new Date(endDate);
    }

    let groupByFormat;
    switch (groupBy) {
      case 'month':
        groupByFormat = {
          year: { $year: '$date' },
          month: { $month: '$date' }
        };
        break;
      case 'week':
        groupByFormat = {
          year: { $year: '$date' },
          week: { $week: '$date' }
        };
        break;
      default: // day
        groupByFormat = {
          year: { $year: '$date' },
          month: { $month: '$date' },
          day: { $dayOfMonth: '$date' }
        };
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: {
            companyId: '$companyId',
            ...groupByFormat
          },
          totalFileStorage: { $sum: '$fileStorage.totalSize' },
          totalFileCount: { $sum: '$fileStorage.fileCount' },
          totalDatabaseSize: { $sum: '$databaseUsage.totalSize' },
          totalDocuments: { $sum: '$databaseUsage.totalDocuments' },
          records: { $push: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'companies',
          localField: '_id.companyId',
          foreignField: 'companyId',
          as: 'company'
        }
      },
      {
        $sort: {
          '_id.year': -1,
          '_id.month': -1,
          '_id.day': -1,
          '_id.week': -1
        }
      }
    ];

    const usage = await DataUsage.aggregate(pipeline);

    res.json(usage);
  } catch (error) {
    console.error('Error fetching data usage:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: Get all companies for dropdown filter
router.get('/companies', async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true })
      .select('companyId companyName')
      .sort({ companyName: 1 })
      .lean();

    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get detailed usage for a specific company and date range
router.get('/detailed/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    let dateQuery = {};
    if (startDate || endDate) {
      dateQuery.date = {};
      if (startDate) dateQuery.date.$gte = new Date(startDate);
      if (endDate) dateQuery.date.$lte = new Date(endDate);
    }

    const usage = await DataUsage.find({
      companyId,
      ...dateQuery
    }).sort({ date: -1 });

    const company = await Company.findOne({ companyId }).select('companyName');

    res.json({
      company,
      usage,
      summary: {
        totalFileStorage: usage.reduce((sum, day) => sum + day.fileStorage.totalSize, 0),
        totalFileCount: usage.reduce((sum, day) => sum + day.fileStorage.fileCount, 0),
        totalDatabaseSize: usage.reduce((sum, day) => sum + day.databaseUsage.totalSize, 0),
        totalDocuments: usage.reduce((sum, day) => sum + day.databaseUsage.totalDocuments, 0),
        dateRange: {
          start: usage.length > 0 ? usage[usage.length - 1].date : null,
          end: usage.length > 0 ? usage[0].date : null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching detailed usage:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update file usage (called when files are uploaded)
export const updateFileUsage = async (companyId, fileInfo, uploadedBy) => {
  try {
    if (!companyId || !fileInfo) {
      console.log('⚠️ Missing companyId or fileInfo for file usage tracking');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const uploadInfo = {
      filename: fileInfo.filename || 'unknown',
      originalName: fileInfo.originalName || fileInfo.filename || 'unknown',
      size: fileInfo.size || 0,
      uploadedAt: new Date(),
      uploadedBy: uploadedBy || 'system'
    };

    const usage = await DataUsage.findOneAndUpdate(
      { companyId, date: today },
      {
        $inc: {
          'fileStorage.totalSize': uploadInfo.size,
          'fileStorage.fileCount': 1
        },
        $push: {
          'fileStorage.uploads': uploadInfo
        }
      },
      { upsert: true, new: true }
    );

    console.log(`✅ File usage tracked for company ${companyId}: ${uploadInfo.size} bytes`);
    return usage;
  } catch (error) {
    console.error('Error updating file usage:', error);
    throw error;
  }
};

// Update database usage (called periodically via cron)
export const updateDatabaseUsage = async () => {
  try {
    const companies = await Company.find({ isActive: true }).select('companyId companyName');
    
    console.log(`🔄 Updating database usage for ${companies.length} companies...`);

    for (const company of companies) {
      const companyId = company.companyId;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      try {
        // Get collection stats for this company
        const [taskStats, userStats, messageStats] = await Promise.all([
          getCollectionStats('tasks', { companyId }),
          getCollectionStats('users', { companyId }),
          getCollectionStats('messages', { companyId })
        ]);

        const totalSize = taskStats.size + userStats.size + messageStats.size;
        const totalDocuments = taskStats.count + userStats.count + messageStats.count;

        await DataUsage.findOneAndUpdate(
          { companyId, date: today },
          {
            $set: {
              'databaseUsage.collections.tasks': taskStats,
              'databaseUsage.collections.users': userStats,
              'databaseUsage.collections.messages': messageStats,
              'databaseUsage.totalSize': totalSize,
              'databaseUsage.totalDocuments': totalDocuments
            }
          },
          { upsert: true, new: true }
        );

        console.log(`✅ Database usage updated for ${company.companyName}: ${totalDocuments} docs, ${totalSize} bytes`);
      } catch (companyError) {
        console.error(`❌ Error updating database usage for company ${company.companyName}:`, companyError);
      }
    }

    console.log('✅ Database usage update completed for all companies');
  } catch (error) {
    console.error('❌ Error updating database usage:', error);
  }
};

// Helper function to get collection statistics
const getCollectionStats = async (collectionName, filter = {}) => {
  try {
    const collection = mongoose.connection.db.collection(collectionName);
    
    const [count, stats] = await Promise.all([
      collection.countDocuments(filter),
      collection.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalSize: { $sum: { $bsonSize: '$$ROOT' } }
          }
        }
      ]).toArray()
    ]);

    return {
      count,
      size: stats.length > 0 ? stats[0].totalSize : 0
    };
  } catch (error) {
    console.error(`Error getting stats for ${collectionName}:`, error);
    return { count: 0, size: 0 };
  }
};

// ✅ NEW: Initialize sample data for testing (can be called via API)
router.post('/init-sample-data', async (req, res) => {
  try {
    const { companyId } = req.body;
    
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }

    // Generate sample data for the last 7 days
    const sampleData = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const fileSize = Math.floor(Math.random() * 50000000) + 1000000; // 1MB to 50MB
      const fileCount = Math.floor(Math.random() * 50) + 1; // 1 to 50 files
      const dbSize = Math.floor(Math.random() * 10000000) + 100000; // 100KB to 10MB
      const docCount = Math.floor(Math.random() * 1000) + 10; // 10 to 1000 docs

      sampleData.push({
        companyId,
        date,
        fileStorage: {
          totalSize: fileSize,
          fileCount: fileCount,
          uploads: Array.from({ length: Math.min(fileCount, 5) }, (_, idx) => ({
            filename: `file_${idx + 1}.pdf`,
            originalName: `Document ${idx + 1}.pdf`,
            size: Math.floor(fileSize / fileCount),
            uploadedAt: date,
            uploadedBy: 'system'
          }))
        },
        databaseUsage: {
          collections: {
            tasks: { count: Math.floor(docCount * 0.7), size: Math.floor(dbSize * 0.7) },
            users: { count: Math.floor(docCount * 0.2), size: Math.floor(dbSize * 0.2) },
            messages: { count: Math.floor(docCount * 0.1), size: Math.floor(dbSize * 0.1) },
            other: { count: 0, size: 0 }
          },
          totalSize: dbSize,
          totalDocuments: docCount
        }
      });
    }

    // Insert sample data
    await DataUsage.insertMany(sampleData, { ordered: false });

    res.json({
      message: `Sample data created for company ${companyId}`,
      records: sampleData.length
    });

  } catch (error) {
    console.error('Error creating sample data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;