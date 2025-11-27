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
  <html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    
    <div style="max-width:780px;margin:auto;background:#ffffff;border-radius:14px;padding:30px;box-shadow:0 4px 25px rgba(0,0,0,0.08);">

      <!-- HEADER -->
      <div style="display:flex;align-items:center;gap:15px;margin-bottom:25px;">
        <div style="background:#2563eb;color:white;padding:18px 22px;border-radius:12px;font-size:22px;font-weight:bold;">
          TMS
        </div>
        <div>
          <h2 style="margin:0;font-size:22px;color:#111">${title}</h2>
          <p style="margin:2px 0;color:#666;font-size:14px">${companyName}</p>
          ${forUser ? `<p style="margin:2px 0;color:#777;font-size:14px">User: <b>${forUser}</b></p>` : ""}
          <p style="margin:2px 0;color:#999;font-size:12px">Generated at: ${generatedAt}</p>
        </div>
      </div>

      <!-- SUMMARY CARDS -->
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:15px;margin-top:25px;">
        
        <div style="background:#eef2ff;padding:18px;border-radius:10px;">
          <h4 style="margin:0;color:#4338ca;font-size:15px;">Pending Tasks</h4>
          <div style="font-size:28px;font-weight:bold;color:#1e1b4b;">${data.totalPending}</div>
        </div>

        <div style="background:#ffe4e6;padding:18px;border-radius:10px;">
          <h4 style="margin:0;color:#b91c1c;font-size:15px;">Overdue Tasks</h4>
          <div style="font-size:28px;font-weight:bold;color:#7f1d1d;">${data.totalOverdue}</div>
        </div>

        <div style="background:#dcfce7;padding:18px;border-radius:10px;">
          <h4 style="margin:0;color:#166534;font-size:15px;">Completed Today</h4>
          <div style="font-size:28px;font-weight:bold;color:#14532d;">${data.completedToday}</div>
        </div>

        <div style="background:#fef9c3;padding:18px;border-radius:10px;">
          <h4 style="margin:0;color:#854d0e;font-size:15px;">Completed Yesterday</h4>
          <div style="font-size:28px;font-weight:bold;color:#713f12;">${data.completedYesterday}</div>
        </div>

      </div>

      <!-- UPCOMING TASKS -->
      <h3 style="margin-top:35px;color:#111;">📅 Due in Next 7 Days</h3>
      <div style="background:#f9fafb;padding:18px;border-radius:10px;">
        ${data.dueNext7Days.length
            ? data.dueNext7Days.map(t => `
              <div style="padding:8px 0;border-bottom:1px solid #eee;">
                <b>${t.title}</b>
                <br/>
                <span style="color:#666;font-size:13px;">
                  Due: ${new Date(t.dueDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </span>
              </div>
            `).join("")
            : `<p style="color:#666;margin:0;">No upcoming tasks.</p>`
        }
      </div>

      <!-- TOP DELAYED USERS -->
      <h3 style="margin-top:35px;color:#111;">⚠ Top Delayed Users</h3>
      <div style="background:#fef2f2;padding:18px;border-radius:10px;">
        ${data.topDelayed.length
            ? data.topDelayed.map(u => `
              <p style="margin:6px 0;font-size:14px;color:#7f1d1d;">
                • <b>${u.username}</b> — ${u.overdueCount} overdue tasks
              </p>
            `).join("")
            : `<p style="color:#7f1d1d;margin:0;">No delayed users.</p>`
        }
      </div>

      <!-- High Priority Pending -->
      <h3 style="margin-top:35px;color:#111;">🔥 High Priority Pending Tasks</h3>
      <div style="background:#fff7ed;padding:18px;border-radius:10px;">
        ${data.highPriorityPending.length
            ? data.highPriorityPending.map(t => `
              <p style="margin:6px 0;font-size:14px;color:#9a3412;">
                • <b>${t.title}</b> — Priority: ${t.priority}
              </p>
            `).join("")
            : `<p style="color:#9a3412;margin:0;">No high priority tasks.</p>`
        }
      </div>

      <!-- BUTTON -->
      <div style="text-align:center;margin-top:35px;">
        <a href="https://tms.finamite.in"
          style="background:#2563eb;color:white;padding:14px 24px;border-radius:8px;font-size:15px;text-decoration:none;font-weight:bold;">
          Open Dashboard →
        </a>
      </div>

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
