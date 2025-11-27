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
async function buildReportData(companyId, forUserId = null, reportType = 'general') {
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

    // Adjust content based on report type (morning/evening)
    let titlePrefix = '';
    let summaryFocus = '';
    if (reportType === 'morning') {
        titlePrefix = 'Morning ';
        summaryFocus = 'Focus on today\'s priorities and upcoming tasks.';
    } else if (reportType === 'evening') {
        titlePrefix = 'Evening ';
        summaryFocus = 'Review today\'s progress and overdue items.';
    }

    return {
        totalPending,
        totalOverdue,
        completedToday,
        completedYesterday,
        dueNext7Days,
        topDelayed,
        highPriorityPending,
        reportType: titlePrefix,
        summaryFocus
    };
}

/* ============================================================
   2. HTML TEMPLATE GENERATOR
============================================================ */
function generateHtmlReport({ companyName, title, generatedAt, data, forUser }) {
    const { reportType, summaryFocus, ...metrics } = data;
    return `
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin:0;padding:0;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);padding:20px 10px;min-height:100vh;">
    <div style="max-width:700px;margin:0 auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.1);">
      
      <!-- Header -->
      <div style="background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);color:white;padding:30px 25px;position:relative;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:15px;">
          <div style="background:#ffffff20;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;">
            TMS
          </div>
          <div>
            <h1 style="margin:0;font-size:28px;font-weight:300;letter-spacing:1px;">${title}</h1>
            <p style="margin:5px 0 0 0;font-size:16px;opacity:0.9;">${companyName}</p>
            ${forUser ? `<p style="margin:5px 0 0 0;font-size:14px;opacity:0.8;">Hello, ${forUser}!</p>` : ""}
          </div>
        </div>
        <div style="position:absolute;top:0;right:0;opacity:0.1;font-size:100px;">📊</div>
      </div>

      <!-- Generated At -->
      <div style="padding:20px 25px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0;color:#64748b;font-size:14px;">
          <span style="font-weight:500;">Generated:</span> ${generatedAt} 
          ${summaryFocus ? `<span style="margin-left:10px;font-style:italic;">${summaryFocus}</span>` : ""}
        </p>
      </div>

      <!-- Summary Cards -->
      <div style="padding:30px 25px;">
        <h2 style="margin:0 0 25px 0;font-size:22px;color:#1e293b;font-weight:600;">📊 Quick Summary</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:15px;">
          <div style="background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);color:white;padding:20px;border-radius:15px;text-align:center;box-shadow:0 4px 15px rgba(59,130,246,0.2);">
            <div style="font-size:12px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;">Pending Tasks</div>
            <div style="font-size:32px;font-weight:700;margin:8px 0;">${metrics.totalPending}</div>
          </div>
          <div style="background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%);color:white;padding:20px;border-radius:15px;text-align:center;box-shadow:0 4px 15px rgba(239,68,68,0.2);">
            <div style="font-size:12px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;">Overdue</div>
            <div style="font-size:32px;font-weight:700;margin:8px 0;">${metrics.totalOverdue}</div>
          </div>
          <div style="background:linear-gradient(135deg, #10b981 0%, #059669 100%);color:white;padding:20px;border-radius:15px;text-align:center;box-shadow:0 4px 15px rgba(16,185,129,0.2);">
            <div style="font-size:12px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;">Completed Today</div>
            <div style="font-size:32px;font-weight:700;margin:8px 0;">${metrics.completedToday}</div>
          </div>
          <div style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);color:white;padding:20px;border-radius:15px;text-align:center;box-shadow:0 4px 15px rgba(245,158,11,0.2);">
            <div style="font-size:12px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;">Completed Yesterday</div>
            <div style="font-size:32px;font-weight:700;margin:8px 0;">${metrics.completedYesterday}</div>
          </div>
        </div>
      </div>

      <!-- Upcoming Tasks -->
      <div style="padding:0 25px 30px 25px;">
        <h2 style="margin:0 0 20px 0;font-size:20px;color:#1e293b;font-weight:600;">📅 Due in Next 7 Days</h2>
        <div style="background:#f8fafc;padding:20px;border-radius:12px;max-height:200px;overflow-y:auto;">
          ${metrics.dueNext7Days.length
            ? metrics.dueNext7Days
                .map(
                    (t) =>
                        `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-weight:500;color:#374151;">${t.title}</span>
                          <span style="color:#64748b;font-size:14px;">${new Date(
                              t.dueDate
                          ).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                        </div>`
                )
                .join("")
            : "<p style='color:#9ca3af;text-align:center;padding:20px;'>No upcoming tasks 🎉</p>"
          }
        </div>
      </div>

      <!-- Top Delayed -->
      ${metrics.topDelayed.length ? `
      <div style="padding:0 25px 30px 25px;">
        <h2 style="margin:0 0 20px 0;font-size:20px;color:#1e293b;font-weight:600;">⚠️ Top Delayed Users</h2>
        <div style="background:#fef2f2;padding:20px;border-radius:12px;">
          ${metrics.topDelayed
            .map((u) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #fecaca;">
                <span style="font-weight:500;color:#dc2626;">${u.username}</span>
                <span style="color:#991b1b;font-size:14px;">${u.overdueCount} overdue</span>
              </div>
            `)
            .join("")}
        </div>
      </div>
      ` : ''}

      <!-- High Priority -->
      ${metrics.highPriorityPending.length ? `
      <div style="padding:0 25px 30px 25px;">
        <h2 style="margin:0 0 20px 0;font-size:20px;color:#1e293b;font-weight:600;">🔥 High Priority Pending</h2>
        <div style="background:#fef3c7;padding:20px;border-radius:12px;">
          ${metrics.highPriorityPending
            .map((t) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #fde68a;">
                <span style="font-weight:500;color:#92400e;">${t.title}</span>
                <span style="color:#d97706;font-size:14px;">Priority: ${t.priority.toUpperCase()}</span>
              </div>
            `)
            .join("")}
        </div>
      </div>
      ` : ''}

      <!-- CTA -->
      <div style="padding:30px 25px;text-align:center;background:#f8fafc;">
        <a href="https://tms.finamite.in"
          style="background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);color:white;padding:15px 30px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block;box-shadow:0 4px 15px rgba(37,99,235,0.3);transition:transform 0.2s;">
          Open Dashboard
        </a>
        <p style="margin:20px 0 0 0;color:#64748b;font-size:14px;">Stay productive! 🚀</p>
      </div>

    </div>
  </body>
  </html>
  `;
}

/* ============================================================
   3. SEND REPORT — Admin/Managers
============================================================ */
async function sendAdminManagerReport(companyId, reportType = 'general') {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableReports) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildReportData(companyId, null, reportType);

    const html = generateHtmlReport({
        companyName: settings.data.companyName || "Company",
        title: `${data.reportType}Daily Report — Admin / Manager`,
        generatedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        data
    });

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            `${data.reportType}Daily Task Report`,
            "Please view the HTML email.",
            html,
            []
        );
    }
}

/* ============================================================
   4. SEND REPORT — Each User (exclude admins)
============================================================ */
async function sendUserReports(companyId, reportType = 'general') {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableReports) return;

    // Exclude admins from user-specific reports
    const users = await User.find({ 
        companyId, 
        isActive: true,
        role: { $ne: 'admin' }  // Do not send personal reports to admins
    });

    for (const user of users) {
        const data = await buildReportData(companyId, user._id, reportType);

        const html = generateHtmlReport({
            companyName: settings.data.companyName || "Company",
            title: `${data.reportType}Your Daily Task Summary`,
            generatedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            data,
            forUser: user.username
        });

        await sendSystemEmail(
            companyId,
            user.email,
            `${data.reportType}Your Daily Task Summary`,
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
        const { companyId, reportType = 'general' } = req.body;

        await sendAdminManagerReport(companyId, reportType);
        await sendUserReports(companyId, reportType);

        res.json({ message: "Reports sent successfully" });
    } catch (err) {
        console.error("Report error:", err);
        res.status(500).json({ message: "Error sending reports" });
    }
});

/* ============================================================
   6. CRON SCHEDULER (runs automatically)
============================================================ */
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
          await sendAdminManagerReport(companyId, 'morning');
          await sendUserReports(companyId, 'morning');
        } catch (error) {
          console.error(`Error sending morning report for ${companyId}:`, error);
        }
      });
    }

    // Evening
    if (data.enableEveningReport && data.eveningReportTime) {
      const cronTime = convertToCron(data.eveningReportTime);
      console.log(`⏰ Evening cron (UTC): ${cronTime}`);
      cron.schedule(cronTime, async () => {
        console.log(`🌙 Sending evening report for ${companyId}`);
        try {
          await sendAdminManagerReport(companyId, 'evening');
          await sendUserReports(companyId, 'evening');
        } catch (error) {
          console.error(`Error sending evening report for ${companyId}:`, error);
        }
      });
    }
  });
}

export default router;