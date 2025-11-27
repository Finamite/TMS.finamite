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

    const dueNext7Days = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) }
    })
        .limit(30)
        .sort({ dueDate: 1 })
        .lean();

    const topDelayed = await Task.aggregate([
        {
            $match: {
                companyId,
                status: { $in: ["pending", "overdue"] },
                dueDate: { $lt: now }
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
        .limit(20)
        .sort({ dueDate: 1 })
        .lean();

    return {
        totalPending,
        totalOverdue,
        completedToday,
        completedYesterday,
        dueNext7Days,
        topDelayed,
        highPriorityPending
    };
}

/* ============================================================
   2. HTML TEMPLATE GENERATOR
============================================================ */
function generateHtmlReport({ companyName, title, generatedAt, data, forUser }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }

    .header h1 {
      color: #1a202c;
      font-size: 2rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }

    .company {
      color: #667eea;
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .meta-info {
      display: flex;
      gap: 2rem;
      color: #4a5568;
      font-size: 0.9rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
    }

    .stat-card h3 {
      font-size: 0.875rem;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }

    .stat-card .value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #1a202c;
    }

    .stat-card.pending .value { color: #3182ce; }
    .stat-card.overdue .value { color: #e53e3e; }
    .stat-card.completed .value { color: #38a169; }

    .section {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }

    .section h2 {
      font-size: 1.25rem;
      color: #1a202c;
      margin-bottom: 1.5rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .task-list, .user-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .task-item, .user-item {
      background: #f7fafc;
      border-radius: 8px;
      padding: 1rem;
      border-left: 4px solid #667eea;
      transition: all 0.2s;
    }

    .task-item:hover, .user-item:hover {
      background: #edf2f7;
      transform: translateX(4px);
    }

    .task-item strong, .user-item strong {
      color: #1a202c;
      display: block;
      margin-bottom: 0.25rem;
    }

    .task-item small, .user-item small {
      color: #718096;
      font-size: 0.875rem;
    }

    .empty-state {
      text-align: center;
      color: #a0aec0;
      padding: 2rem;
      font-style: italic;
    }

    .dashboard-link {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1rem 2rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 2rem;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
    }

    .dashboard-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(102, 126, 234, 0.6);
    }

    @media (max-width: 768px) {
      body { padding: 1rem; }
      .stats-grid { grid-template-columns: 1fr; }
      .header h1 { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <div class="company">${companyName}</div>
      <div class="meta-info">
        ${forUser ? `<div><strong>User:</strong> ${forUser}</div>` : ''}
        <div><strong>Generated:</strong> ${generatedAt}</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card pending">
        <h3>Pending Tasks</h3>
        <div class="value">${data.totalPending}</div>
      </div>
      <div class="stat-card overdue">
        <h3>Overdue Tasks</h3>
        <div class="value">${data.totalOverdue}</div>
      </div>
      <div class="stat-card completed">
        <h3>Completed Today</h3>
        <div class="value">${data.completedToday}</div>
      </div>
      <div class="stat-card completed">
        <h3>Completed Yesterday</h3>
        <div class="value">${data.completedYesterday}</div>
      </div>
    </div>

    <div class="section">
      <h2>📅 Due in Next 7 Days</h2>
      ${data.dueNext7Days.length ? `
        <div class="task-list">
          ${data.dueNext7Days.map(t => `
            <div class="task-item">
              <strong>${t.title}</strong>
              <small>Due: ${new Date(t.dueDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</small>
            </div>
          `).join('')}
        </div>
      ` : '<div class="empty-state">No upcoming tasks.</div>'}
    </div>

    <div class="section">
      <h2>⚠️ Top Delayed Users</h2>
      ${data.topDelayed.length ? `
        <div class="user-list">
          ${data.topDelayed.map(u => `
            <div class="user-item">
              <strong>${u.username}</strong>
              <small>${u.overdueCount} overdue tasks</small>
            </div>
          `).join('')}
        </div>
      ` : '<div class="empty-state">No delayed users.</div>'}
    </div>

    <div class="section">
      <h2>🔥 High Priority Pending Tasks</h2>
      ${data.highPriorityPending.length ? `
        <div class="task-list">
          ${data.highPriorityPending.map(t => `
            <div class="task-item">
              <strong>${t.title}</strong>
              <small>Priority: ${t.priority}</small>
            </div>
          `).join('')}
        </div>
      ` : '<div class="empty-state">No high priority tasks.</div>'}
    </div>

    <center>
      <a href="/dashboard" class="dashboard-link">Open Dashboard →</a>
    </center>
  </div>
</body>
</html>
  `;
}

/* ============================================================
   3. SEND REPORT — Admin/Managers
============================================================ */
async function sendAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableReports) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildReportData(companyId);

    const html = generateHtmlReport({
        companyName: settings.data.companyName || "Company",
        title: "Daily Report — Admin / Manager",
        generatedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        data
    });

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            "Daily Task Report",
            "Please view the HTML email.",
            html,
            []
        );
    }
}

/* ============================================================
   4. SEND REPORT — Each User
============================================================ */
async function sendUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableReports) return;

    const users = await User.find({ companyId, isActive: true });

    for (const user of users) {

        // ❌ Skip admins & managers
        if (user.role === "admin" || user.role === "manager") continue;

        const data = await buildReportData(companyId, user._id);

        const html = generateHtmlReport({
            companyName: settings.data.companyName || "Company",
            title: "Your Daily Task Summary",
            generatedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            data,
            forUser: user.username
        });

        await sendSystemEmail(
            companyId,
            user.email,
            "Your Daily Task Summary",
            "Please view the HTML email.",
            html,
            []
        );
    }
}

/* ============================================================
   5. PUBLIC API ENDPOINTS
============================================================ */

// Manual trigger
router.post("/send-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await sendAdminManagerReport(companyId);
        await sendUserReports(companyId);

        res.json({ message: "Reports sent successfully" });
    } catch (err) {
        console.error("Report error:", err);
        res.status(500).json({ message: "Error sending reports" });
    }
});

/* ============================================================
   6. CRON SCHEDULER (runs automatically)
============================================================ */
async function setupReportCron() {
    const companies = await Settings.find({
        type: "email", $or: [
            { "data.enableReports": true },
            { "data.enableMorningReport": true },
            { "data.enableEveningReport": true }
        ]
    });

    companies.forEach((s) => {
        const companyId = s.companyId;
        const morning = s.data.morningReportTime || "09:00";
        const evening = s.data.eveningReportTime || "18:00";

        const [mh, mm] = morning.split(":");
        cron.schedule(`${mm} ${mh} * * *`, async () => {
            await sendAdminManagerReport(companyId);
            await sendUserReports(companyId);
        });

        const [eh, em] = evening.split(":");
        cron.schedule(`${em} ${eh} * * *`, async () => {
            await sendAdminManagerReport(companyId);
            await sendUserReports(companyId);
        });
    });
}

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

export async function startReportCron() {
    console.log("⏳ Initializing report cron...");

    const companies = await Settings.find({
        type: "email",
        $or: [
            { "data.enableReports": true },
            { "data.enableMorningReport": true },
            { "data.enableEveningReport": true }
        ]
    });

    companies.forEach((s) => {
        const companyId = s.companyId;
        const data = s.data;

        console.log(`📌 Setting up cron for company: ${companyId}`);

        // Morning
        if (data.enableMorningReport && data.morningReportTime) {
            const cronTime = convertToCron(data.morningReportTime);
            console.log(`⏰ Morning cron (UTC): ${cronTime}`);
            cron.schedule(cronTime, async () => {
                console.log(`🚀 Sending morning report for ${companyId}`);
                try {
                    await sendAdminManagerReport(companyId);
                    await sendUserReports(companyId);
                } catch (error) {
                    console.error(`Error sending morning report for ${companyId}:`, error);
                }
            });
            // No timezone option - using UTC cron
        }

        // Evening
        if (data.enableEveningReport && data.eveningReportTime) {
            const cronTime = convertToCron(data.eveningReportTime);
            console.log(`⏰ Evening cron (UTC): ${cronTime}`);
            cron.schedule(cronTime, async () => {
                console.log(`🌙 Sending evening report for ${companyId}`);
                try {
                    await sendAdminManagerReport(companyId);
                    await sendUserReports(companyId);
                } catch (error) {
                    console.error(`Error sending evening report for ${companyId}:`, error);
                }
            });
            // No timezone option - using UTC cron
        }
    });
}
export default router;
