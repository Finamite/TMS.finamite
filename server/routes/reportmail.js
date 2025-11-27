// routes/reportmail.js
import express from "express";
import cron from "node-cron";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { sendSystemEmail } from "../Utils/sendEmail.js";

const router = express.Router();

/* ============================================================
   1. BUILD REPORT DATA
   ============================================================ */
async function buildReportData(companyId, forUserId = null) {
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const baseQuery = { companyId, isActive: true };
  if (forUserId) baseQuery.assignedTo = forUserId;

  const totalPending = await Task.countDocuments({
    ...baseQuery,
    status: "pending",
  });

  const totalOverdue = await Task.countDocuments({
    ...baseQuery,
    status: { $in: ["pending", "overdue"] },
    dueDate: { $lt: now },
  });

  const completedToday = await Task.countDocuments({
    ...baseQuery,
    status: "completed",
    completedAt: { $gte: startOfDay, $lte: endOfDay },
  });

  const completedYesterday = await Task.countDocuments({
    ...baseQuery,
    status: "completed",
    completedAt: {
      $gte: new Date(startOfDay.getTime() - 86400000),
      $lt: startOfDay,
    },
  });

  const dueNext7Days = await Task.find({
    ...baseQuery,
    status: "pending",
    dueDate: { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) },
  })
    .limit(30)
    .sort({ dueDate: 1 })
    .lean();

  const topDelayed = await Task.aggregate([
    {
      $match: {
        companyId,
        status: { $in: ["pending", "overdue"] },
        dueDate: { $lt: now },
      },
    },
    { $group: { _id: "$assignedTo", overdueCount: { $sum: 1 } } },
    { $sort: { overdueCount: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        overdueCount: 1,
        username: "$user.username",
        email: "$user.email",
      },
    },
  ]);

  const highPriorityPending = await Task.find({
    ...baseQuery,
    status: "pending",
    priority: { $in: ["high", "urgent"] },
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
    highPriorityPending,
  };
}

/* ============================================================
   2. MODERN HTML TEMPLATE
   ============================================================ */
function generateModernReportHTML({
  companyName,
  title,
  generatedAt,
  data,
  forUser,
}) {
  return `
  <html>
  <body style="background:#f3f4f7; padding:25px; font-family:Inter,Arial;">
    <div style="max-width:850px; margin:auto; background:white; padding:30px; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,0.08);">

      <div style="display:flex;align-items:center;gap:15px; margin-bottom:20px;">
        <div style="background:#4f46e5; color:white; padding:18px 22px; border-radius:12px; font-size:22px; font-weight:600;">
          TMS
        </div>
        <div>
          <h2 style="margin:0; font-size:22px; color:#111;">${title}</h2>
          <p style="margin:0;font-size:14px;color:#555">${companyName}</p>
          ${forUser ? `<p style="margin:0;font-size:13px;color:#777">User: <b>${forUser}</b></p>` : ""}
        </div>
      </div>

      <p style="color:#666; font-size:13px; margin:0 0 20px 0;">
        Generated at: ${generatedAt}
      </p>

      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:15px; margin-top:20px;">

        <div style="background:#eef2ff; padding:18px; border-radius:12px;">
          <p style="margin:0;color:#555">Pending</p>
          <h3 style="margin:5px 0 0; font-size:26px; color:#4338ca;">${data.totalPending}</h3>
        </div>

        <div style="background:#ffe7e7; padding:18px; border-radius:12px;">
          <p style="margin:0;color:#555">Overdue</p>
          <h3 style="margin:5px 0 0; font-size:26px; color:#dc2626;">${data.totalOverdue}</h3>
        </div>

        <div style="background:#e7ffe9; padding:18px; border-radius:12px;">
          <p style="margin:0;color:#555">Completed Today</p>
          <h3 style="margin:5px 0 0; font-size:26px; color:#16a34a;">${data.completedToday}</h3>
        </div>

        <div style="background:#fff7d1; padding:18px; border-radius:12px;">
          <p style="margin:0;color:#555">Completed Yesterday</p>
          <h3 style="margin:5px 0 0; font-size:26px; color:#854d0e;">${data.completedYesterday}</h3>
        </div>

      </div>

      <h3 style="margin-top:30px; color:#111;">📅 Tasks Due Next 7 Days</h3>
      <div style="background:#fafafa; padding:15px; border-radius:10px;">
      ${
        data.dueNext7Days.length
          ? data.dueNext7Days
              .map(
                (t) => `
            <div style="padding:8px 0; border-bottom:1px solid #eee;">
              <b>${t.title}</b>
              <div style="font-size:13px; color:#666;">${new Date(
                t.dueDate
              ).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
            </div>
          `
              )
              .join("")
          : `<p style="color:#666;font-size:14px;">No upcoming tasks</p>`
      }
      </div>

      <h3 style="margin-top:30px; color:#111;">⚠ Top Delayed Users</h3>
      <div style="background:#fafafa; padding:15px; border-radius:10px;">
      ${
        data.topDelayed.length
          ? data.topDelayed
              .map(
                (u) =>
                  `<p style="margin:5px 0;"><b>${u.username}</b> — ${u.overdueCount} overdue tasks</p>`
              )
              .join("")
          : `<p style="color:#666;font-size:14px;">No delayed users</p>`
      }
      </div>

      <h3 style="margin-top:30px; color:#111;">🔥 High Priority Pending</h3>
      <div style="background:#fafafa; padding:15px; border-radius:10px;">
      ${
        data.highPriorityPending.length
          ? data.highPriorityPending
              .map(
                (t) =>
                  `<p style="margin:5px 0;"><b>${t.title}</b> — Priority: ${t.priority}</p>`
              )
              .join("")
          : `<p style="color:#666;font-size:14px;">No high priority tasks</p>`
      }
      </div>

      <div style="text-align:center; margin-top:35px;">
        <a href="https://tms.finamite.in"
           style="background:#4f46e5; color:white; padding:14px 25px; border-radius:10px; text-decoration:none; font-size:16px;">
          Open Dashboard
        </a>
      </div>
    </div>
  </body>
  </html>
  `;
}

/* ============================================================
   3. SEND ADMIN REPORT
   ============================================================ */
async function sendAdminManagerReport(companyId, reportType = "morning") {
  const settings = await Settings.findOne({ type: "email", companyId });
  if (!settings?.data?.enabled || !settings.data.enableReports) return;

  const admins = await User.find({
    companyId,
    role: { $in: ["admin", "manager"] },
    isActive: true,
  });

  const data = await buildReportData(companyId);

  const title =
    reportType === "morning"
      ? "Morning Task Summary — Admin"
      : "Evening Task Summary — Admin";

  const html = generateModernReportHTML({
    companyName: settings.data.companyName || "Company",
    title,
    generatedAt: new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    }),
    data,
  });

  for (const admin of admins) {
    await sendSystemEmail(
      companyId,
      admin.email,
      title,
      "Please view the HTML report.",
      html
    );
  }
}

/* ============================================================
   4. SEND USER REPORT (admin excluded)
   ============================================================ */
async function sendUserReports(companyId, reportType = "morning") {
  const settings = await Settings.findOne({ type: "email", companyId });
  if (!settings?.data?.enabled || !settings.data.enableReports) return;

  const users = await User.find({
    companyId,
    isActive: true,
    role: { $ne: "admin" }, // ❌ exclude admin
  });

  for (const user of users) {
    const data = await buildReportData(companyId, user._id);

    const title =
      reportType === "morning"
        ? "Your Morning Task Report"
        : "Your Evening Task Report";

    const html = generateModernReportHTML({
      companyName: settings.data.companyName || "Company",
      title,
      generatedAt: new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      }),
      data,
      forUser: user.username,
    });

    await sendSystemEmail(
      companyId,
      user.email,
      title,
      "Please view the HTML report.",
      html
    );
  }
}

/* ============================================================
   5. PUBLIC API — Manual Trigger
   ============================================================ */
router.post("/send-report", async (req, res) => {
  try {
    const { companyId } = req.body;
    await sendAdminManagerReport(companyId, "morning");
    await sendUserReports(companyId, "morning");

    res.json({ message: "Reports sent successfully" });
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ message: "Error sending reports" });
  }
});

/* ============================================================
   6. CRON SETUP — Morning + Evening
   ============================================================ */
async function setupReportCron() {
  const companies = await Settings.find({
    type: "email",
    $or: [
      { "data.enableReports": true },
      { "data.enableMorningReport": true },
      { "data.enableEveningReport": true },
    ],
  });

  companies.forEach((s) => {
    const companyId = s.companyId;
    const morning = s.data.morningReportTime || "09:00";
    const evening = s.data.eveningReportTime || "18:00";

    const [mh, mm] = morning.split(":");
    cron.schedule(`${mm} ${mh} * * *`, () =>
      sendAdminManagerReport(companyId, "morning")
    );
    cron.schedule(`${mm} ${mh} * * *`, () =>
      sendUserReports(companyId, "morning")
    );

    const [eh, em] = evening.split(":");
    cron.schedule(`${em} ${eh} * * *`, () =>
      sendAdminManagerReport(companyId, "evening")
    );
    cron.schedule(`${em} ${eh} * * *`, () =>
      sendUserReports(companyId, "evening")
    );
  });
}

setupReportCron();

export default router;
