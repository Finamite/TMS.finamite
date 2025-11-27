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
  <body style="font-family:Arial;background:#f6f7fb;padding:20px;">
    <div style="max-width:800px;margin:auto;background:white;border-radius:12px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
      
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="background:#2563eb;color:white;padding:15px;border-radius:10px;font-size:20px;font-weight:bold;">
          TMS
        </div>
        <div>
          <h2 style="margin:0">${title}</h2>
          <p style="margin:0;color:#555">${companyName}</p>
          ${forUser ? `<p style="margin:0;color:#888">User: ${forUser}</p>` : ""}
        </div>
      </div>

      <p style="margin-top:15px;color:#666">Generated at: ${generatedAt}</p>

      <hr style="margin:20px 0" />

      <h3>📊 Summary</h3>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
        <div style="background:#eaf2ff;padding:15px;border-radius:8px;">
          <h4>Pending</h4>
          <div style="font-size:22px;font-weight:bold;">${data.totalPending}</div>
        </div>
        <div style="background:#ffe8e8;padding:15px;border-radius:8px;">
          <h4>Overdue</h4>
          <div style="font-size:22px;font-weight:bold;">${data.totalOverdue}</div>
        </div>
        <div style="background:#e1ffe8;padding:15px;border-radius:8px;">
          <h4>Completed Today</h4>
          <div style="font-size:22px;font-weight:bold;">${data.completedToday}</div>
        </div>
        <div style="background:#fffae6;padding:15px;border-radius:8px;">
          <h4>Completed Yesterday</h4>
          <div style="font-size:22px;font-weight:bold;">${data.completedYesterday}</div>
        </div>
      </div>

      <h3 style="margin-top:25px;">📅 Due in next 7 days</h3>
      ${data.dueNext7Days.length
            ? data.dueNext7Days
                .map(
                    (t) =>
                        `<p>• <b>${t.title}</b> — ${new Date(
                            t.dueDate
                        ).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>`
                )
                .join("")
            : "<p>No upcoming tasks</p>"
        }

      <h3 style="margin-top:25px;">⚠ Top Delayed Users</h3>
      ${data.topDelayed.length
            ? data.topDelayed
                .map((u) => `<p>• ${u.username} — ${u.overdueCount} overdue tasks</p>`)
                .join("")
            : "<p>No delayed users</p>"
        }

      <h3 style="margin-top:25px;">🔥 High Priority Pending</h3>
      ${data.highPriorityPending.length
            ? data.highPriorityPending
                .map((t) => `<p>• <b>${t.title}</b> — priority: ${t.priority}</p>`)
                .join("")
            : "<p>No high priority tasks</p>"
        }

      <div style="text-align:center;margin-top:20px;">
        <a href="https://tms.finamite.in"
          style="background:#2563eb;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;">
          Open Dashboard
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

setupReportCron();  // MUST BE OUTSIDE ROUTER
export default router;
