import express from 'express';
import DataUsage from '../models/DataUsage.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import mongoose from 'mongoose';
import * as jsPDFModule from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

const router = express.Router();
applyPlugin(jsPDFModule.jsPDF);

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const buildMatchQuery = ({ companyId, startDate, endDate }) => {
  const matchQuery = {};

  if (companyId && companyId !== '') {
    matchQuery.companyId = companyId;
  }

  if (startDate || endDate) {
    matchQuery.date = {};
    if (startDate) matchQuery.date.$gte = startOfDay(startDate);
    if (endDate) matchQuery.date.$lte = endOfDay(endDate);
  }

  return matchQuery;
};

const getGroupByFormat = (groupBy) => {
  switch (groupBy) {
    case 'month':
      return {
        year: { $year: '$date' },
        month: { $month: '$date' }
      };
    case 'week':
      return {
        year: { $year: '$date' },
        week: { $week: '$date' }
      };
    default:
      return {
        year: { $year: '$date' },
        month: { $month: '$date' },
        day: { $dayOfMonth: '$date' }
      };
  }
};

const buildUsagePipeline = ({ companyId, startDate, endDate, groupBy = 'day' }) => {
  const matchQuery = buildMatchQuery({ companyId, startDate, endDate });
  const groupByFormat = getGroupByFormat(groupBy);

  return [
    { $match: matchQuery },
    {
      $group: {
        _id: {
          companyId: '$companyId',
          ...groupByFormat
        },
        totalFileStorage: { $sum: '$fileStorage.totalSize' },
        totalFileCount: { $sum: '$fileStorage.fileCount' },
        totalDatabaseSize: { $max: '$databaseUsage.totalSize' },
        totalDocuments: { $max: '$databaseUsage.totalDocuments' },
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
};

const buildDetailedUsageResponse = async ({ companyId, startDate, endDate }) => {
  const matchQuery = buildMatchQuery({ companyId, startDate, endDate });
  const usage = await DataUsage.find(matchQuery).sort({ companyId: 1, date: -1 }).lean();

  const companyIds = [...new Set(usage.map((item) => item.companyId))];
  const companies = await Company.find({ companyId: { $in: companyIds } })
    .select('companyId companyName')
    .lean();

  const companyMap = new Map(companies.map((c) => [c.companyId, c.companyName]));
  const grouped = usage.reduce((acc, item) => {
    if (!acc[item.companyId]) acc[item.companyId] = [];
    acc[item.companyId].push(item);
    return acc;
  }, {});

  const companyDetails = Object.keys(grouped).map((id) => {
    const entries = grouped[id];
    const totalFileStorage = entries.reduce((sum, day) => sum + (day.fileStorage?.totalSize || 0), 0);
    const totalFileCount = entries.reduce((sum, day) => sum + (day.fileStorage?.fileCount || 0), 0);
    const totalDatabaseSize = entries.reduce((max, day) => Math.max(max, day.databaseUsage?.totalSize || 0), 0);
    const totalDocuments = entries.reduce((max, day) => Math.max(max, day.databaseUsage?.totalDocuments || 0), 0);

    return {
      company: {
        companyId: id,
        companyName: companyMap.get(id) || id
      },
      usage: entries,
      summary: {
        totalFileStorage,
        totalFileCount,
        totalDatabaseSize,
        totalDocuments,
        dateRange: {
          start: entries.length > 0 ? entries[entries.length - 1].date : null,
          end: entries.length > 0 ? entries[0].date : null
        }
      }
    };
  });

  const summary = {
    totalFileStorage: companyDetails.reduce((sum, item) => sum + item.summary.totalFileStorage, 0),
    totalFileCount: companyDetails.reduce((sum, item) => sum + item.summary.totalFileCount, 0),
    totalDatabaseSize: companyDetails.reduce((sum, item) => sum + item.summary.totalDatabaseSize, 0),
    totalDocuments: companyDetails.reduce((sum, item) => sum + item.summary.totalDocuments, 0),
    companyCount: companyDetails.length
  };

  return {
    companies: companyDetails,
    summary
  };
};

// Get data usage for all companies or specific company
router.get('/', async (req, res) => {
  try {
    const { companyId, startDate, endDate, groupBy = 'day' } = req.query;
    const pipeline = buildUsagePipeline({ companyId, startDate, endDate, groupBy });

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

// Get detailed usage for all companies or a specific company and date range
router.get('/detailed', async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.query;

    const response = await buildDetailedUsageResponse({
      companyId,
      startDate,
      endDate
    });

    res.json(response);
  } catch (error) {
    console.error('Error fetching detailed usage:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Backward-compatible route
router.get('/detailed/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const response = await buildDetailedUsageResponse({
      companyId,
      startDate,
      endDate
    });

    res.json(response);
  } catch (error) {
    console.error('Error fetching detailed usage:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/export-pdf', async (req, res) => {
  try {
    const { companyId, startDate, endDate, groupBy = 'day' } = req.body;
    const usage = await DataUsage.aggregate(
      buildUsagePipeline({ companyId, startDate, endDate, groupBy })
    );

    const doc = new jsPDFModule.jsPDF();
    const title = 'Data Usage Report';
    const generatedAt = new Date().toLocaleString();
    const periodLabel = `${startDate || 'Start'} to ${endDate || 'Current'}`;

    doc.setFontSize(16);
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated: ${generatedAt}`, 14, 24);
    doc.text(`Period: ${periodLabel}`, 14, 30);
    doc.text(`Group By: ${groupBy}`, 14, 36);

    const rows = usage.map((item) => {
      const period =
        groupBy === 'month'
          ? `${item._id.month}/${item._id.year}`
          : groupBy === 'week'
            ? `W${item._id.week}/${item._id.year}`
            : `${item._id.day}/${item._id.month}/${item._id.year}`;

      return [
        item.company?.[0]?.companyName || item._id.companyId,
        period,
        item.totalFileCount?.toLocaleString() || '0',
        item.totalFileStorage?.toLocaleString() || '0',
        item.totalDocuments?.toLocaleString() || '0',
        item.totalDatabaseSize?.toLocaleString() || '0'
      ];
    });

    doc.autoTable({
      startY: 42,
      head: [['Company', 'Period', 'File Count', 'File Storage (Bytes)', 'Tasks', 'DB Size (Bytes)']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] }
    });

    const pdfBuffer = doc.output('arraybuffer');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=data-usage-report.pdf');
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('Error exporting data usage PDF:', error);
    res.status(500).json({ message: 'Error generating PDF file', error: error.message });
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
    
    // console.log(`🔄 Updating database usage for ${companies.length} companies...`);

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
