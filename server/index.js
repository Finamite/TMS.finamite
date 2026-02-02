import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import dotenv from 'dotenv';
import cron from "node-cron";
import Task from "./models/Task.js";


// Import routes
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import userRoutes from './routes/users.js';
import companyRoutes from './routes/companies.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import performanceRoutes from './routes/performance.js';
import chat from './routes/chat.js';
import reportMailRoutes from "./routes/reportmail.js";
import taskshiftRoutes from "./routes/taskshift.js";
import { startReportCron } from "./routes/reportmail.js";
import dataUsageRoutes, { updateFileUsage, updateDatabaseUsage } from "./routes/dataUsage.js";


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    cb(null, true);
  }
});

// File upload endpoint
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    
    // Get company ID from request (you might need to adjust this based on your auth middleware)
    const companyId = req.body.companyId || req.headers['x-company-id'];
    const uploadedBy = req.body.uploadedBy || req.headers['x-user-id'];
    
    const fileInfo = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      size: file.size,
      uploadedAt: new Date()
    }));
    
    // Update file usage tracking for each uploaded file
    if (companyId) {
      req.files.forEach(file => {
        updateFileUsage(companyId, {
          filename: file.filename,
          originalName: file.originalname,
          size: file.size
        }, uploadedBy).catch(err => {
          console.error('Error updating file usage:', err);
        });
      });
    }
    
    res.json({ message: 'Files uploaded successfully', files: fileInfo });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

// Serve uploaded files statically
app.use('/uploads/chat', express.static(path.join(__dirname, 'uploads/chat')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/chat', chat);
app.use('/api/reports', reportMailRoutes);
app.use('/api/taskshift', taskshiftRoutes);
app.use('/api/data-usage', dataUsageRoutes);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');

     cron.schedule("0 * * * *", async () => {
      try {
        const now = new Date();
        const result = await Task.deleteMany({
          isActive: false,
          autoDeleteAt: { $lte: now }
        });

        if (result.deletedCount > 0) {
          console.log(`🧹 Auto-cleanup: Deleted ${result.deletedCount} expired bin tasks`);
        }
      } catch (err) {
        console.error("❌ Auto-delete cron error:", err);
      }
    });

    // Schedule database usage tracking (runs daily at midnight)
    cron.schedule("0 0 * * *", async () => {
      try {
        await updateDatabaseUsage();
      } catch (err) {
        console.error("❌ Database usage tracking error:", err);
      }
    });

    // Create default superadmin if not exists
    const User = mongoose.model('User');
    User.findOne({ email: 'superadmin@system.com' })
      .then(existingSuperAdmin => {
        if (!existingSuperAdmin) {
          const superAdmin = new User({
            username: 'SuperAdmin',
            email: 'superadmin@system.com',
            password: 'finamite@TMS#12',
            role: 'superadmin',
            phone: '9878542564',
            permissions: {
              canViewTasks: true,
              canViewAllTeamTasks: true,
              canAssignTasks: true,
              canDeleteTasks: true,
              canEditTasks: true,
              canManageUsers: true,
              canEditRecurringTaskSchedules: true,
              canManageSettings: true,
              canManageRecycle: true,
              canManageApproval:true,
              canManageCompanies: true,
            }
          });
          superAdmin.save()
            .then(() => console.log('✅ SuperAdmin user created with default credentials'))
            .catch(err => console.error('Error creating superadmin user:', err));
        } else {
          console.log('ℹ️ SuperAdmin user already exists');
        }
      })
      .catch(err => console.error('Error checking for superadmin user:', err));
      

      app.listen(PORT, '0.0.0.0', () => {

      // START CRON AFTER SERVER START
      startReportCron();
    });

  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
  });
