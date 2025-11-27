// routes/reportmail.js
import express from "express";
import cron from "node-cron";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { sendSystemEmail } from "../Utils/sendEmail.js";

const router = express.Router();

/* ============================================================
   1. REPORT DATA GENERATOR
   ------------------------------------------------------------
   Generates metrics for admin/manager or per-user reports.
============================================================ */
async function buildReportData(companyId, forUserId = null) {
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const baseQuery = { companyId, isActive: true };
    if (forUserId) baseQuery.assignedTo = forUserId;

    const totalPending = await Task.countDocuments({ ...baseQuery, status: "pending" });

    const totalOverdue = await Task.countDocuments({
        ...baseQuery,
        status: { $in: ["pending", "overdue"] },
        dueDate: { $lt: now }
    });

    const completedToday = await Task.countDocuments({
        ...baseQuery,
        status: "completed",
        completedAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const completedYesterday = await Task.countDocuments({
        ...baseQuery,
        status: "completed",
        completedAt: { $gte: new Date(startOfDay.getTime() - 86400000), $lt: startOfDay }
    });

    const dueToday = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: startOfDay, $lte: endOfDay }
    })
        .limit(10)
        .sort({ dueDate: 1 })
        .lean();

    const dueNext7Days = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) }
    })
        .limit(15)
        .sort({ dueDate: 1 })
        .lean();

    const topDelayed = await Task.aggregate([
        {
            $match: {
                companyId,
                status: { $in: ["pending", "overdue"] },
                dueDate: { $lt: now },
                ...(forUserId ? { assignedTo: forUserId } : {})
            }
        },
        { $group: { _id: "$assignedTo", overdueCount: { $sum: 1 } } },
        { $sort: { overdueCount: -1 } },
        { $limit: 5 },
        {
            $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "user"
            }
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                overdueCount: 1,
                username: "$user.username",
                email: "$user.email"
            }
        }
    ]);

    const highPriorityPending = await Task.find({
        ...baseQuery,
        status: "pending",
        priority: { $in: ["high", "urgent"] }
    })
        .limit(10)
        .sort({ dueDate: 1 })
        .lean();

    // Weekly progress (last 7 days completion rate)
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const weeklyCompleted = await Task.countDocuments({
        ...baseQuery,
        status: "completed",
        completedAt: { $gte: weekAgo, $lte: now }
    });

    const weeklyTotal = await Task.countDocuments({
        ...baseQuery,
        dueDate: { $gte: weekAgo, $lte: now }
    });

    const completionRate = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

    return {
        totalPending,
        totalOverdue,
        completedToday,
        completedYesterday,
        dueToday,
        dueNext7Days,
        topDelayed,
        highPriorityPending,
        weeklyCompleted,
        completionRate
    };
}

/* ============================================================
   2. MODERN HTML TEMPLATE GENERATOR
============================================================ */
function generateModernHtmlReport({ companyName, title, generatedAt, data, forUser, reportType = "daily" }) {
    const isEvening = reportType === "evening";
    const greeting = isEvening ? "Good Evening" : "Good Morning";
    const timeIcon = isEvening ? "🌙" : "☀️";
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header p {
            font-size: 16px;
            opacity: 0.9;
        }
        .greeting {
            background: #f8fafc;
            padding: 25px 30px;
            border-left: 4px solid #667eea;
        }
        .greeting h2 {
            color: #1e293b;
            font-size: 24px;
            margin-bottom: 8px;
        }
        .greeting p {
            color: #64748b;
            font-size: 16px;
        }
        .content {
            padding: 30px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            border: 1px solid #e2e8f0;
            transition: transform 0.2s ease;
        }
        .metric-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .metric-number {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .metric-label {
            color: #64748b;
            font-size: 14px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .pending { color: #3b82f6; background: #eff6ff; }
        .overdue { color: #ef4444; background: #fef2f2; }
        .completed { color: #10b981; background: #f0fdf4; }
        .rate { color: #8b5cf6; background: #faf5ff; }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 20px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .task-list {
            background: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid #e2e8f0;
        }
        .task-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .task-item:last-child {
            border-bottom: none;
        }
        .task-title {
            font-weight: 500;
            color: #1e293b;
            flex: 1;
        }
        .task-date {
            color: #64748b;
            font-size: 14px;
        }
        .priority-badge {
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
        }
        .priority-high { background: #fef2f2; color: #dc2626; }
        .priority-urgent { background: #fef2f2; color: #b91c1c; }
        .priority-medium { background: #fef3c7; color: #d97706; }
        .priority-low { background: #f0fdf4; color: #16a34a; }
        .user-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .user-item:last-child {
            border-bottom: none;
        }
        .user-name {
            font-weight: 500;
            color: #1e293b;
        }
        .overdue-count {
            background: #fef2f2;
            color: #dc2626;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
        }
        .cta-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px;
            text-align: center;
            margin-top: 30px;
        }
        .cta-button {
            display: inline-block;
            background: white;
            color: #667eea;
            padding: 15px 30px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s ease;
        }
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        }
        .footer {
            background: #f8fafc;
            padding: 20px 30px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
        }
        .no-data {
            text-align: center;
            color: #64748b;
            font-style: italic;
            padding: 20px;
        }
        .progress-bar {
            background: #e2e8f0;
            border-radius: 10px;
            height: 8px;
            margin-top: 8px;
            overflow: hidden;
        }
        .progress-fill {
            background: linear-gradient(90deg, #10b981, #059669);
            height: 100%;
            border-radius: 10px;
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${timeIcon} ${title}</h1>
            <p>${companyName}</p>
            ${forUser ? `<p style="margin-top: 8px; opacity: 0.8;">Personal Report for ${forUser}</p>` : ""}
        </div>

        <div class="greeting">
            <h2>${greeting}!</h2>
            <p>Generated on ${generatedAt}</p>
        </div>

        <div class="content">
            <!-- Metrics Overview -->
            <div class="section">
                <h3 class="section-title">📊 Today's Overview</h3>
                <div class="metrics-grid">
                    <div class="metric-card pending">
                        <div class="metric-number">${data.totalPending}</div>
                        <div class="metric-label">Pending Tasks</div>
                    </div>
                    <div class="metric-card overdue">
                        <div class="metric-number">${data.totalOverdue}</div>
                        <div class="metric-label">Overdue Tasks</div>
                    </div>
                    <div class="metric-card completed">
                        <div class="metric-number">${data.completedToday}</div>
                        <div class="metric-label">Completed Today</div>
                    </div>
                    <div class="metric-card rate">
                        <div class="metric-number">${data.completionRate}%</div>
                        <div class="metric-label">Weekly Rate</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${data.completionRate}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            ${data.dueToday && data.dueToday.length > 0 ? `
            <!-- Due Today -->
            <div class="section">
                <h3 class="section-title">🎯 Due Today</h3>
                <div class="task-list">
                    ${data.dueToday.map(task => `
                        <div class="task-item">
                            <div class="task-title">${task.title}</div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Upcoming Tasks -->
            <div class="section">
                <h3 class="section-title">📅 Upcoming (Next 7 Days)</h3>
                ${data.dueNext7Days && data.dueNext7Days.length > 0 ? `
                <div class="task-list">
                    ${data.dueNext7Days.slice(0, 8).map(task => `
                        <div class="task-item">
                            <div class="task-title">${task.title}</div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="task-date">${new Date(task.dueDate).toLocaleDateString("en-IN", { 
                                    month: 'short', 
                                    day: 'numeric',
                                    timeZone: "Asia/Kolkata" 
                                })}</span>
                                <span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                            </div>
                        </div>
                    `).join('')}
                    ${data.dueNext7Days.length > 8 ? `
                        <div class="task-item">
                            <div class="task-title" style="color: #64748b; font-style: italic;">
                                +${data.dueNext7Days.length - 8} more tasks...
                            </div>
                        </div>
                    ` : ''}
                </div>
                ` : '<div class="no-data">No upcoming tasks in the next 7 days</div>'}
            </div>

            ${!forUser && data.topDelayed && data.topDelayed.length > 0 ? `
            <!-- Top Delayed Users -->
            <div class="section">
                <h3 class="section-title">⚠️ Users with Overdue Tasks</h3>
                <div class="task-list">
                    ${data.topDelayed.map(user => `
                        <div class="user-item">
                            <div class="user-name">${user.username}</div>
                            <span class="overdue-count">${user.overdueCount} overdue</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            ${data.highPriorityPending && data.highPriorityPending.length > 0 ? `
            <!-- High Priority Tasks -->
            <div class="section">
                <h3 class="section-title">🔥 High Priority Pending</h3>
                <div class="task-list">
                    ${data.highPriorityPending.map(task => `
                        <div class="task-item">
                            <div class="task-title">${task.title}</div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="task-date">${new Date(task.dueDate).toLocaleDateString("en-IN", { 
                                    month: 'short', 
                                    day: 'numeric',
                                    timeZone: "Asia/Kolkata" 
                                })}</span>
                                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>

        <div class="cta-section">
            <h3 style="color: white; margin-bottom: 15px; font-size: 20px;">Ready to tackle your tasks?</h3>
            <a href="https://tms.finamite.in" class="cta-button">
                Open Task Dashboard →
            </a>
        </div>

        <div class="footer">
            <p>This is an automated report from your Task Management System</p>
            <p style="margin-top: 4px;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
}

/* ============================================================
   3. SEND MORNING REPORT — Admin/Managers
============================================================ */
async function sendMorningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildReportData(companyId);

    const html = generateModernHtmlReport({
        companyName: settings.data.companyName || "Your Company",
        title: "Morning Task Report",
        generatedAt: new Date().toLocaleString("en-IN", { 
            timeZone: "Asia/Kolkata",
            dateStyle: "full",
            timeStyle: "short"
        }),
        data,
        reportType: "morning"
    });

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            "☀️ Morning Task Report - Ready to Start the Day!",
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

/* ============================================================
   4. SEND EVENING REPORT — Admin/Managers
============================================================ */
async function sendEveningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildReportData(companyId);

    const html = generateModernHtmlReport({
        companyName: settings.data.companyName || "Your Company",
        title: "Evening Task Summary",
        generatedAt: new Date().toLocaleString("en-IN", { 
            timeZone: "Asia/Kolkata",
            dateStyle: "full",
            timeStyle: "short"
        }),
        data,
        reportType: "evening"
    });

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            "🌙 Evening Task Summary - Day's Progress Report",
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

/* ============================================================
   5. SEND MORNING REPORT — Each User
============================================================ */
async function sendMorningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const users = await User.find({ companyId, isActive: true });

    for (const user of users) {
        const data = await buildReportData(companyId, user._id);

        const html = generateModernHtmlReport({
            companyName: settings.data.companyName || "Your Company",
            title: "Your Morning Task Briefing",
            generatedAt: new Date().toLocaleString("en-IN", { 
                timeZone: "Asia/Kolkata",
                dateStyle: "full",
                timeStyle: "short"
            }),
            data,
            forUser: user.username,
            reportType: "morning"
        });

        await sendSystemEmail(
            companyId,
            user.email,
            "☀️ Good Morning! Your Daily Task Briefing",
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

/* ============================================================
   6. SEND EVENING REPORT — Each User
============================================================ */
async function sendEveningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const users = await User.find({ companyId, isActive: true });

    for (const user of users) {
        const data = await buildReportData(companyId, user._id);

        const html = generateModernHtmlReport({
            companyName: settings.data.companyName || "Your Company",
            title: "Your Evening Task Summary",
            generatedAt: new Date().toLocaleString("en-IN", { 
                timeZone: "Asia/Kolkata",
                dateStyle: "full",
                timeStyle: "short"
            }),
            data,
            forUser: user.username,
            reportType: "evening"
        });

        await sendSystemEmail(
            companyId,
            user.email,
            "🌙 Evening Summary - Your Day's Accomplishments",
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

/* ============================================================
   7. PUBLIC API ENDPOINTS
============================================================ */

// Manual trigger for morning reports
router.post("/send-morning-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await sendMorningAdminManagerReport(companyId);
        await sendMorningUserReports(companyId);

        res.json({ message: "Morning reports sent successfully" });
    } catch (err) {
        console.error("Morning report error:", err);
        res.status(500).json({ message: "Error sending morning reports" });
    }
});

// Manual trigger for evening reports
router.post("/send-evening-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await sendEveningAdminManagerReport(companyId);
        await sendEveningUserReports(companyId);

        res.json({ message: "Evening reports sent successfully" });
    } catch (err) {
        console.error("Evening report error:", err);
        res.status(500).json({ message: "Error sending evening reports" });
    }
});

// Legacy endpoint for backward compatibility
router.post("/send-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await sendMorningAdminManagerReport(companyId);
        await sendMorningUserReports(companyId);

        res.json({ message: "Reports sent successfully" });
    } catch (err) {
        console.error("Report error:", err);
        res.status(500).json({ message: "Error sending reports" });
    }
});

/* ============================================================
   8. IMPROVED CRON SCHEDULER
============================================================ */

// Convert IST time to UTC cron format
function convertToCron(timeString) {
    if (!timeString || !timeString.includes(":")) return null;
    
    const [localHour, localMinute] = timeString.split(":").map(Number);
    const localMinutes = localHour * 60 + localMinute;
    
    // IST offset in minutes (+5:30)
    const istOffsetMinutes = 5 * 60 + 30;
    
    // Convert to UTC minutes
    let utcMinutes = localMinutes - istOffsetMinutes;
    
    // Normalize to 0-1439 (one day in minutes)
    if (utcMinutes < 0) {
        utcMinutes += 24 * 60;
    } else if (utcMinutes >= 24 * 60) {
        utcMinutes -= 24 * 60;
    }
    
    const utcHour = Math.floor(utcMinutes / 60);
    const utcMinute = utcMinutes % 60;
    
    return `${utcMinute} ${utcHour} * * *`;
}

// Store active cron jobs for cleanup
const activeCronJobs = new Map();

export async function startReportCron() {
    console.log("⏳ Initializing enhanced report cron scheduler...");

    // Clear existing cron jobs
    activeCronJobs.forEach((job, key) => {
        job.destroy();
        console.log(`🗑️ Cleared existing cron job: ${key}`);
    });
    activeCronJobs.clear();

    const companies = await Settings.find({
        type: "email",
        $or: [
            { "data.enableMorningReport": true },
            { "data.enableEveningReport": true }
        ]
    });

    console.log(`📊 Found ${companies.length} companies with report settings enabled`);

    companies.forEach((s) => {
        const companyId = s.companyId;
        const data = s.data;

        console.log(`📌 Setting up cron jobs for company: ${companyId}`);

        // Morning Report
        if (data.enableMorningReport && data.morningReportTime) {
            const cronTime = convertToCron(data.morningReportTime);
            if (cronTime) {
                console.log(`⏰ Morning report cron (UTC): ${cronTime} for IST: ${data.morningReportTime}`);
                
                const morningJob = cron.schedule(cronTime, async () => {
                    console.log(`🌅 Sending morning reports for company: ${companyId}`);
                    try {
                        await sendMorningAdminManagerReport(companyId);
                        await sendMorningUserReports(companyId);
                        console.log(`✅ Morning reports sent successfully for: ${companyId}`);
                    } catch (error) {
                        console.error(`❌ Error sending morning reports for ${companyId}:`, error);
                    }
                }, {
                    scheduled: true,
                    timezone: "UTC"
                });

                activeCronJobs.set(`${companyId}-morning`, morningJob);
            }
        }

        // Evening Report
        if (data.enableEveningReport && data.eveningReportTime) {
            const cronTime = convertToCron(data.eveningReportTime);
            if (cronTime) {
                console.log(`⏰ Evening report cron (UTC): ${cronTime} for IST: ${data.eveningReportTime}`);
                
                const eveningJob = cron.schedule(cronTime, async () => {
                    console.log(`🌆 Sending evening reports for company: ${companyId}`);
                    try {
                        await sendEveningAdminManagerReport(companyId);
                        await sendEveningUserReports(companyId);
                        console.log(`✅ Evening reports sent successfully for: ${companyId}`);
                    } catch (error) {
                        console.error(`❌ Error sending evening reports for ${companyId}:`, error);
                    }
                }, {
                    scheduled: true,
                    timezone: "UTC"
                });

                activeCronJobs.set(`${companyId}-evening`, eveningJob);
            }
        }
    });

    console.log(`🚀 Report cron scheduler initialized with ${activeCronJobs.size} active jobs`);
}

// Function to restart cron jobs (useful when settings change)
export async function restartReportCron() {
    console.log("🔄 Restarting report cron scheduler...");
    await startReportCron();
}

export default router;