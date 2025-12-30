// routes/reportmail.js
import express from "express";
import cron from "node-cron";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Company from "../models/Company.js";
import { sendSystemEmail } from "../Utils/sendEmail.js";
import { generateAdminExcelReport, generatePersonalExcelReport } from "../Utils/excelGenerator.js";

const router = express.Router();

/* ============================================================
   1. ENHANCED REPORT DATA GENERATOR
   ------------------------------------------------------------
   Generates comprehensive metrics for different user roles
============================================================ */
async function buildEnhancedReportData(companyId, forUserId = null, isManagerView = false) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const next7Days = new Date(now);
    next7Days.setDate(next7Days.getDate() + 7);

    // Base query setup
    const baseQuery = { companyId, isActive: true };
    if (forUserId) baseQuery.assignedTo = forUserId;

    // ============================================
    // FOR ADMIN/MANAGER VIEW
    // ============================================
    if (isManagerView) {
        // Get all active users in company
        const users = await User.find({
            companyId,
            isActive: true,
            role: { $in: ['employee', 'manager'] }
        }).select('_id username').lean();

        const staffPerformance = [];

        for (const user of users) {
            const userQuery = { companyId, isActive: true, assignedTo: user._id };

            // Current status for this user
            const todayTasks = await Task.countDocuments({
                ...userQuery,
                status: 'pending',
                dueDate: { $gte: startOfDay, $lte: endOfDay }
            });

            const overdueTasks = await Task.countDocuments({
                ...userQuery,
                status: { $in: ['pending', 'overdue'] },
                dueDate: { $lt: startOfDay }
            });

            const inProgressTasks = await Task.countDocuments({
                ...userQuery,
                status: 'in-progress'
            });

            // Coming up (next 7 days)
            const upcomingTasks = await Task.countDocuments({
                ...userQuery,
                status: 'pending',
                dueDate: { $gt: endOfDay, $lte: next7Days }
            });

            // High priority tasks
            const highPriorityTasks = await Task.countDocuments({
                ...userQuery,
                status: 'pending',
                priority: { $in: ['high', 'urgent'] }
            });

            // Completion rate calculation
            const completedThisWeek = await Task.countDocuments({
                ...userQuery,
                status: 'completed',
                completedAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
            });

            const totalThisWeek = await Task.countDocuments({
                ...userQuery,
                dueDate: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
            });

            const completionRate = totalThisWeek > 0 ? Math.round((completedThisWeek / totalThisWeek) * 100) : 0;

            let performance = 'Good';
            if (completionRate >= 90) performance = 'Excellent';
            else if (completionRate >= 70) performance = 'Good';
            else if (completionRate >= 50) performance = 'Average';
            else performance = 'Needs Improvement';

            staffPerformance.push({
                username: user.username,
                todayTasks,
                overdueTasks,
                inProgressTasks,
                upcomingTasks,
                highPriorityTasks,
                completionRate,
                performance
            });
        }

        // Overall company metrics
        const totalPending = await Task.countDocuments({
            companyId,
            isActive: true,
            status: 'pending',
            dueDate: { $gte: startOfDay, $lte: endOfDay }
        });

        const totalOverdue = await Task.countDocuments({
            companyId,
            isActive: true,
            status: { $in: ['pending', 'overdue'] },
            dueDate: { $lt: startOfDay }
        });

        const completedToday = await Task.countDocuments({
            companyId,
            isActive: true,
            status: 'completed',
            completedAt: { $gte: startOfDay, $lte: endOfDay }
        });

        // High priority tasks with details
        const highPriorityPending = await Task.find({
            companyId,
            isActive: true,
            status: 'pending',
            priority: { $in: ['high', 'urgent'] }
        })
            .populate('assignedTo', 'username')
            .limit(20)
            .sort({ dueDate: 1 })
            .lean();

        // Overdue analysis by user
        const overdueByUser = await Task.aggregate([
            {
                $match: {
                    companyId,
                    isActive: true,
                    status: { $in: ['pending', 'overdue'] },
                    dueDate: { $lt: startOfDay }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'assignedTo',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $group: {
                    _id: '$assignedTo',
                    username: { $first: '$user.username' },
                    overdueCount: { $sum: 1 },
                    oldestOverdue: { $min: '$dueDate' }
                }
            },
            { $sort: { overdueCount: -1 } },
            { $limit: 10 }
        ]);

        const weeklyCompleted = await Task.countDocuments({
            companyId,
            isActive: true,
            status: 'completed',
            completedAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
        });

        const weeklyTotal = await Task.countDocuments({
            companyId,
            isActive: true,
            dueDate: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
        });

        const completionRate = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

        return {
            totalPending,
            totalOverdue,
            completedToday,
            completionRate,
            staffPerformance,
            highPriorityPending,
            overdueByUser,
            weeklyCompleted,
            weeklyTotal
        };
    }

    // ============================================
    // FOR PERSONAL VIEW
    // ============================================
    else {
        // Current Status
        const dueTodayPending = await Task.countDocuments({
            ...baseQuery,
            status: 'pending',
            dueDate: { $gte: startOfDay, $lte: endOfDay }
        });

        const overdue = await Task.countDocuments({
            ...baseQuery,
            status: { $in: ['pending', 'overdue'] },
            dueDate: { $lt: startOfDay }
        });

        const inProgress = await Task.countDocuments({
            ...baseQuery,
            status: 'in-progress'
        });

        const completedToday = await Task.countDocuments({
            ...baseQuery,
            status: 'completed',
            completedAt: { $gte: startOfDay, $lte: endOfDay }
        });

        // Coming up (Next 7 days) - with task type breakdown
        const upcomingOneTime = await Task.countDocuments({
            ...baseQuery,
            taskType: 'one-time',
            status: 'pending',
            dueDate: { $gt: endOfDay, $lte: next7Days }
        });

        const upcomingDaily = await Task.countDocuments({
            ...baseQuery,
            taskType: 'daily',
            status: 'pending',
            dueDate: { $gt: endOfDay, $lte: next7Days }
        });

        const upcomingRecurring = await Task.countDocuments({
            ...baseQuery,
            taskType: { $in: ['weekly', 'monthly', 'quarterly', 'yearly'] },
            status: 'pending',
            dueDate: { $gt: endOfDay, $lte: next7Days }
        });

        // High priority tasks for this week or today
        const highPriorityTasks = await Task.find({
            ...baseQuery,
            status: 'pending',
            priority: { $in: ['high', 'urgent'] },
            dueDate: { $lte: next7Days }
        })
            .sort({ dueDate: 1 })
            .limit(10)
            .lean();

        // Today's tasks
        const todayTasks = await Task.find({
            ...baseQuery,
            status: 'pending',
            dueDate: { $gte: startOfDay, $lte: endOfDay }
        })
            .sort({ priority: 1, dueDate: 1 })
            .limit(10)
            .lean();

        // Upcoming tasks
        const upcomingTasks = await Task.find({
            ...baseQuery,
            status: 'pending',
            dueDate: { $gt: endOfDay, $lte: next7Days }
        })
            .sort({ dueDate: 1 })
            .limit(15)
            .lean();

        // All tasks for Excel export
        const allTasks = await Task.find({
            ...baseQuery,
            status: { $in: ['pending', 'in-progress'] },
            dueDate: { $lte: next7Days }
        })
            .sort({ dueDate: 1 })
            .lean();

        return {
            // Current Status
            totalPending: dueTodayPending,
            dueTodayPending,
            totalOverdue: overdue,
            inProgressTasks: inProgress,
            completedToday,

            // Coming Up
            upcomingOneTime,
            upcomingDaily,
            upcomingRecurring,
            upcomingTotal: upcomingOneTime + upcomingDaily + upcomingRecurring,

            // Tasks with details
            highPriorityTasks,
            todayTasks,
            upcomingTasks,
            allTasks
        };
    }
}

/* ============================================================
   2. ENHANCED HTML TEMPLATE GENERATOR
============================================================ */
function generateNewHtmlReport({
    companyName,
    title,
    generatedAt,
    data,
    forUser,
    reportType = "morning",
    isManagerView = false
}) {
    const isEvening = reportType === "evening";
    const greeting = isEvening ? "Good Evening" : "Good Morning";
    const timeIcon = isEvening ? "🌙" : "☀️";
    const primaryColor = isEvening ? "#6366f1" : "#3b82f6";
    const gradientFrom = isEvening ? "#6366f1" : "#3b82f6";
    const gradientTo = isEvening ? "#8b5cf6" : "#1d4ed8";

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
            background: linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%);
            padding: 20px;
            line-height: 1.6;
            color: #1f2937;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 25px 50px rgba(0,0,0,0.15);
        }
        .header {
            background: linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .header h1 {
            font-size: 32px;
            font-weight: 800;
            margin-bottom: 12px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header p {
            font-size: 18px;
            opacity: 0.95;
            font-weight: 500;
        }
        .greeting {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            padding: 30px;
            border-left: 6px solid ${primaryColor};
        }
        .greeting h2 {
            color: #1e293b;
            font-size: 28px;
            margin-bottom: 8px;
            font-weight: 700;
        }
        .content {
            padding: 40px 30px;
        }
        .section {
            margin-bottom: 40px;
        }
        .section-title {
            font-size: 22px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding-bottom: 12px;
            border-bottom: 3px solid #e2e8f0;
        }
        .section-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }
        .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr); /* 4 cards in one row */
    gap: 20px;
    margin-bottom: 30px;
}

.metrics-grid-3 {
    grid-template-columns: repeat(3, 1fr);
}

        .metric-card {
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
            border-radius: 16px;
            padding: 25px;
            text-align: center;
            border: 2px solid #e2e8f0;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        .metric-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--card-color);
        }
        .metric-number {
            font-size: 36px;
            font-weight: 800;
            margin-bottom: 8px;
            color: var(--card-color);
        }
        .metric-label {
            color: #64748b;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .pending { --card-color: #3b82f6; }
        .overdue { --card-color: #ef4444; }
        .completed { --card-color: #10b981; }
        .progress { --card-color: #f59e0b; }
        .upcoming { --card-color: #8b5cf6; }

        .data-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            border: 1px solid #e2e8f0;
            margin-bottom: 20px;
        }
        .data-table th {
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
            color: #1e293b;
            font-weight: 700;
            padding: 16px;
            text-align: left;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #cbd5e1;
        }
        .data-table td {
            padding: 16px;
            border-bottom: 1px solid #f1f5f9;
            color: #374151;
            font-weight: 500;
        }
        .data-table tr:hover {
            background: rgba(59, 130, 246, 0.05);
        }
        .data-table tr:last-child td {
            border-bottom: none;
        }
        .priority-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .priority-high { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .priority-urgent { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; }
        .priority-medium { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }
        .priority-low { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .user-badge {
            color: #6366f1;
            font-size: 12px;
            font-weight: 600;
            background: #f1f5f9;
            padding: 4px 8px;
            border-radius: 6px;
        }
        .date-text {
            color: #64748b;
            font-size: 14px;
            font-weight: 500;
        }
        .cta-section {
            background: linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%);
            padding: 40px 30px;
            text-align: center;
            margin-top: 40px;
        }
        .cta-button {
            display: inline-block;
            background: rgba(255,255,255,0.95);
            color: ${primaryColor};
            padding: 18px 36px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .footer {
            background: #f8fafc;
            padding: 25px 30px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
        }
        .no-data {
            text-align: center;
            color: #64748b;
            font-style: italic;
            padding: 30px;
            background: #f8fafc;
            border-radius: 12px;
            border: 2px dashed #e2e8f0;
        }
        @media (max-width: 768px) {
            .metrics-grid { grid-template-columns: 1fr; }
            .container { margin: 10px; border-radius: 16px; }
            .header { padding: 30px 20px; }
            .content { padding: 30px 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${timeIcon} ${title}</h1>
            <p>${companyName}</p>
            ${forUser ? `<p style="margin-top: 12px; opacity: 0.9; font-size: 16px;">Personal Report for ${forUser}</p>` : ""}
        </div>

        <div class="greeting">
            <h2>${greeting}!</h2>
            <p>Generated on ${generatedAt}</p>
            <p style="margin-top: 8px; font-style: italic;">
                ${isEvening ? "Here's how your day went and what's coming up tomorrow." : "Here's your daily briefing to start the day right."}
            </p>
        </div>

        <div class="content">
            ${isManagerView ? `
            <!-- ADMIN/MANAGER VIEW -->
            
            <!-- Current Status -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="font-size:18px;line-height:1;vertical-align:middle;">📊</div>
                    Current Status
                </h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">
  <tr>
    <!-- Today's Tasks -->
    <td width="33.33%" align="center" style="padding:10px;">
      <div style="
        border:2px solid #e2e8f0;
        border-radius:16px;
        padding:22px;
        background:#ffffff;
      ">
        <div style="font-size:36px;font-weight:800;color:#3b82f6;">
          ${data.totalPending || 0}
        </div>
        <div style="font-size:13px;color:#64748b;font-weight:600;letter-spacing:0.5px;">
          TODAY’S TASKS
        </div>
      </div>
    </td>

    <!-- Overdue Tasks -->
    <td width="33.33%" align="center" style="padding:10px;">
      <div style="
        border:2px solid #e2e8f0;
        border-radius:16px;
        padding:22px;
        background:#ffffff;
      ">
        <div style="font-size:36px;font-weight:800;color:#ef4444;">
          ${data.totalOverdue || 0}
        </div>
        <div style="font-size:13px;color:#64748b;font-weight:600;letter-spacing:0.5px;">
          OVERDUE TASKS
        </div>
      </div>
    </td>

    <!-- Completed Today -->
    <td width="33.33%" align="center" style="padding:10px;">
      <div style="
        border:2px solid #e2e8f0;
        border-radius:16px;
        padding:22px;
        background:#ffffff;
      ">
        <div style="font-size:36px;font-weight:800;color:#10b981;">
          ${data.completedToday || 0}
        </div>
        <div style="font-size:13px;color:#64748b;font-weight:600;letter-spacing:0.5px;">
          COMPLETED TODAY
        </div>
      </div>
    </td>
  </tr>
</table>

            </div>

            <!-- Staff Performance -->
            ${data.staffPerformance && data.staffPerformance.length > 0 ? `
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="font-size:18px;line-height:1;vertical-align:middle;">👥</div>
                    Staff Performance Overview
                </h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Staff Member</th>
                            <th>Today</th>
                            <th>Overdue</th>
                            <th>In Progress</th>
                            <th>Coming Up</th>
                            <th>High Priority</th>
                            <th>Performance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.staffPerformance.map(staff => `
                            <tr>
                                <td style="font-weight: 600;">${staff.username}</td>
                                <td>${staff.todayTasks}</td>
                                <td style="color: ${staff.overdueTasks > 0 ? '#dc2626' : '#10b981'};">${staff.overdueTasks}</td>
                                <td>${staff.inProgressTasks}</td>
                                <td>${staff.upcomingTasks}</td>
                                <td style="color: ${staff.highPriorityTasks > 0 ? '#dc2626' : '#6b7280'};">${staff.highPriorityTasks}</td>
                                <td>
                                    <span style="color: ${staff.performance === 'Excellent' ? '#059669' :
            staff.performance === 'Good' ? '#10b981' :
                staff.performance === 'Average' ? '#f59e0b' : '#dc2626'
        }; font-weight: 600;">
                                        ${staff.performance}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <!-- High Priority Tasks -->
            ${data.highPriorityPending && data.highPriorityPending.length > 0 ? `
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="font-size:18px;line-height:1;vertical-align:middle;">🔥</div>
                    High Priority Tasks
                </h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Assigned To</th>
                            <th>Due Date</th>
                            <th>Priority</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.highPriorityPending.slice(0, 10).map(task => `
                            <tr>
                                <td style="font-weight: 600;">${task.title}</td>
                                <td><span class="user-badge">${task.assignedTo?.username || 'Unassigned'}</span></td>
                                <td class="date-text">${new Date(task.dueDate).toLocaleDateString("en-IN")}</td>
                                <td><span class="priority-badge priority-${task.priority}">${task.priority}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            ` : `
            <!-- PERSONAL VIEW -->
            
            <!-- Current Status -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="font-size:18px;line-height:1;vertical-align:middle;">📊</div>
                    Current Status
                </h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">
  <tr>
    <td width="25%" align="center" style="padding:10px;">
      <div style="border:2px solid #e2e8f0;border-radius:16px;padding:20px;">
        <div style="font-size:36px;font-weight:800;color:#3b82f6;">${data.dueTodayPending || 0}</div>
        <div style="font-size:13px;color:#64748b;font-weight:600;">DUE TODAY PENDING</div>
      </div>
    </td>

    <td width="25%" align="center" style="padding:10px;">
      <div style="border:2px solid #e2e8f0;border-radius:16px;padding:20px;">
        <div style="font-size:36px;font-weight:800;color:#ef4444;">${data.totalOverdue || 0}</div>
        <div style="font-size:13px;color:#64748b;font-weight:600;">OVERDUE</div>
      </div>
    </td>

    <td width="25%" align="center" style="padding:10px;">
      <div style="border:2px solid #e2e8f0;border-radius:16px;padding:20px;">
        <div style="font-size:36px;font-weight:800;color:#f59e0b;">${data.inProgressTasks || 0}</div>
        <div style="font-size:13px;color:#64748b;font-weight:600;">IN PROGRESS</div>
      </div>
    </td>

    <td width="25%" align="center" style="padding:10px;">
      <div style="border:2px solid #e2e8f0;border-radius:16px;padding:20px;">
        <div style="font-size:36px;font-weight:800;color:#10b981;">${data.completedToday || 0}</div>
        <div style="font-size:13px;color:#64748b;font-weight:600;">COMPLETED TODAY</div>
      </div>
    </td>
  </tr>
</table>
            </div>

            <!-- Coming Up -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="font-size:18px;line-height:1;vertical-align:middle;">📅</div>
                    Coming Up (Next 7 Days)
                </h3>
               <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">
  <tr>
    <!-- One Time Tasks -->
    <td width="33.33%" align="center" style="padding:10px;">
      <div style="
        border:2px solid #e2e8f0;
        border-radius:16px;
        padding:20px;
        background:#ffffff;
      ">
        <div style="font-size:34px;font-weight:800;color:#8b5cf6;">
          ${data.upcomingOneTime || 0}
        </div>
        <div style="font-size:13px;color:#64748b;font-weight:600;letter-spacing:0.5px;">
          ONE TIME TASKS
        </div>
      </div>
    </td>

    <!-- Daily Tasks -->
    <td width="33.33%" align="center" style="padding:10px;">
      <div style="
        border:2px solid #e2e8f0;
        border-radius:16px;
        padding:20px;
        background:#ffffff;
      ">
        <div style="font-size:34px;font-weight:800;color:#8b5cf6;">
          ${data.upcomingDaily || 0}
        </div>
        <div style="font-size:13px;color:#64748b;font-weight:600;letter-spacing:0.5px;">
          DAILY TASKS
        </div>
      </div>
    </td>

    <!-- Recurring Tasks -->
    <td width="33.33%" align="center" style="padding:10px;">
      <div style="
        border:2px solid #e2e8f0;
        border-radius:16px;
        padding:20px;
        background:#ffffff;
      ">
        <div style="font-size:34px;font-weight:800;color:#8b5cf6;">
          ${data.upcomingRecurring || 0}
        </div>
        <div style="font-size:13px;color:#64748b;font-weight:600;letter-spacing:0.5px;">
          RECURRING TASKS
        </div>
      </div>
    </td>
  </tr>
</table>

            </div>

            <!-- High Priority Tasks for This Week/Today -->
            ${data.highPriorityTasks && data.highPriorityTasks.length > 0 ? `
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="font-size:18px;line-height:1;vertical-align:middle;">⚡</div>
                    High Priority Tasks (This Week)
                </h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Due Date</th>
                            <th>Priority</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.highPriorityTasks.map(task => `
                            <tr>
                                <td style="font-weight: 600;">${task.title}</td>
                                <td class="date-text">${new Date(task.dueDate).toLocaleDateString("en-IN")}</td>
                                <td><span class="priority-badge priority-${task.priority}">${task.priority}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <!-- Today's Tasks -->
            ${data.todayTasks && data.todayTasks.length > 0 ? `
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="font-size:18px;line-height:1;vertical-align:middle;">🎯</div>
                    ${isEvening ? "Tasks Due Today" : "Due Today"}
                </h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Priority</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.todayTasks.map(task => `
                            <tr>
                                <td style="font-weight: 600;">${task.title}</td>
                                <td><span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span></td>
                                <td class="date-text">${task.taskType}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}
            `}

        </div>

        <div class="cta-section">
            <h3 style="color: white; margin-bottom: 20px; font-size: 24px; font-weight: 700;">
                ${isEvening ? "Ready for tomorrow? 🌟" : "Ready to tackle your day? 💪"}
            </h3>
            <p style="color: rgba(255,255,255,0.9); margin-bottom: 25px; font-size: 16px;">
                ${isEvening ? "Review your progress and plan for tomorrow's success." : "Access your task dashboard to stay organized and productive."}
            </p>
            <a href="https://tms.finamite.in" class="cta-button">
                Open Task Dashboard →
            </a>
        </div>

        <div class="footer">
            <p><strong>Task Management System</strong> - Automated ${reportType} report</p>
            <p style="margin-top: 8px; opacity: 0.8;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
            <p style="margin-top: 4px; font-size: 12px; opacity: 0.6;">
                ${isEvening ? "Have a great evening! 🌙" : "Have a productive day! ☀️"}
            </p>
        </div>
    </div>
</body>
</html>`;
}

/* ============================================================
   3. ENHANCED REPORT FUNCTIONS WITH EXCEL ATTACHMENTS
============================================================ */

// Send morning report to admin/managers with Excel
async function sendMorningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildEnhancedReportData(companyId, null, true);
    const company = await Company.findOne({ companyId });

    const html = generateNewHtmlReport({
        companyName: company?.companyName || "Your Company",
        title: "Morning Task Report - Management Overview",
        generatedAt: new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "full",
            timeStyle: "short"
        }),
        data,
        reportType: "morning",
        isManagerView: true
    });

    // Generate Excel attachment
    const excelBuffer = await generateAdminExcelReport(data, company?.companyName || "Your Company", "Morning");
    const excelAttachment = {
        filename: `Morning_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
        content: excelBuffer
    };

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            `Morning Task Report ${new Date().toLocaleDateString("en-IN")} - Team Overview & Priorities`,
            "Please view this email in HTML format for the best experience. Detailed Excel report is attached.",
            html,
            [excelAttachment]
        );
    }
}

// Send evening report to admin/managers with Excel
async function sendEveningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildEnhancedReportData(companyId, null, true);
    const company = await Company.findOne({ companyId });

    const html = generateNewHtmlReport({
        companyName: company?.companyName || "Your Company",
        title: "Evening Task Summary - Management Dashboard",
        generatedAt: new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "full",
            timeStyle: "short"
        }),
        data,
        reportType: "evening",
        isManagerView: true
    });

    // Generate Excel attachment
    const excelBuffer = await generateAdminExcelReport(data, company?.companyName || "Your Company", "Evening");
    const excelAttachment = {
        filename: `Evening_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
        content: excelBuffer
    };

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            `Evening Task Summary ${new Date().toLocaleDateString("en-IN")} - Team Performance & Tomorrow's Focus`,
            "Please view this email in HTML format for the best experience. Detailed Excel report is attached.",
            html,
            [excelAttachment]
        );
    }
}

// Send morning report to individual users with Excel
async function sendMorningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const users = await User.find({
        companyId,
        isActive: true,
        role: { $in: ["employee", "manager"] }
    });

    for (const user of users) {
        const data = await buildEnhancedReportData(companyId, user._id, false);
        const company = await Company.findOne({ companyId });

        const html = generateNewHtmlReport({
            companyName: company?.companyName || "Your Company",
            title: "Your Morning Task Briefing",
            generatedAt: new Date().toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "full",
                timeStyle: "short"
            }),
            data,
            forUser: user.username,
            reportType: "morning",
            isManagerView: false
        });

        // Generate personal Excel attachment
        const excelBuffer = await generatePersonalExcelReport(data, user.username, "Morning");
        const excelAttachment = {
            filename: `My_Morning_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
            content: excelBuffer
        };

        await sendSystemEmail(
            companyId,
            user.email,
            `Morning Report ${new Date().toLocaleDateString("en-IN")} - Your Personal Task Briefing`,
            "Please view this email in HTML format for the best experience. Your detailed task report is attached as Excel.",
            html,
            [excelAttachment]
        );
    }
}

// Send evening report to individual users with Excel
async function sendEveningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const users = await User.find({
        companyId,
        isActive: true,
        role: { $in: ["employee", "manager"] }
    });

    for (const user of users) {
        const data = await buildEnhancedReportData(companyId, user._id, false);
        const company = await Company.findOne({ companyId });

        const html = generateNewHtmlReport({
            companyName: company?.companyName || "Your Company",
            title: "Your Evening Task Summary",
            generatedAt: new Date().toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "full",
                timeStyle: "short"
            }),
            data,
            forUser: user.username,
            reportType: "evening",
            isManagerView: false
        });

        // Generate personal Excel attachment
        const excelBuffer = await generatePersonalExcelReport(data, user.username, "Evening");
        const excelAttachment = {
            filename: `My_Evening_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
            content: excelBuffer
        };

        await sendSystemEmail(
            companyId,
            user.email,
            `Evening Summary ${new Date().toLocaleDateString("en-IN")} - Your Day's Accomplishments & Tomorrow's Plan`,
            "Please view this email in HTML format for the best experience. Your detailed task summary is attached as Excel.",
            html,
            [excelAttachment]
        );
    }
}

/* ============================================================
   4. PUBLIC API ENDPOINTS (Enhanced)
============================================================ */

// Manual trigger for morning reports
router.post("/send-morning-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await Promise.all([
            sendMorningAdminManagerReport(companyId),
            sendMorningUserReports(companyId)
        ]);

        res.json({ message: "Enhanced morning reports with Excel attachments sent successfully" });
    } catch (err) {
        console.error("Morning report error:", err);
        res.status(500).json({ message: "Error sending morning reports" });
    }
});

// Manual trigger for evening reports
router.post("/send-evening-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await Promise.all([
            sendEveningAdminManagerReport(companyId),
            sendEveningUserReports(companyId)
        ]);

        res.json({ message: "Enhanced evening reports with Excel attachments sent successfully" });
    } catch (err) {
        console.error("Evening report error:", err);
        res.status(500).json({ message: "Error sending evening reports" });
    }
});

// Legacy endpoint for backward compatibility
router.post("/send-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await Promise.all([
            sendMorningAdminManagerReport(companyId),
            sendMorningUserReports(companyId)
        ]);

        res.json({ message: "Enhanced reports with Excel attachments sent successfully" });
    } catch (err) {
        console.error("Report error:", err);
        res.status(500).json({ message: "Error sending reports" });
    }
});

/* ============================================================
   5. IMPROVED CRON SCHEDULER
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

    companies.forEach((s) => {
        const companyId = s.companyId;
        const data = s.data;

        console.log(`📌 Setting up enhanced cron jobs with Excel for company: ${companyId}`);

        // Morning Report
        if (data.enableMorningReport && data.morningReportTime) {
            const cronTime = convertToCron(data.morningReportTime);
            if (cronTime) {
                console.log(`⏰ Morning report cron (UTC): ${cronTime} for IST: ${data.morningReportTime}`);

                const morningJob = cron.schedule(cronTime, async () => {
                    console.log(`🌅 Sending enhanced morning reports with Excel for company: ${companyId}`);
                    try {
                        await Promise.all([
                            sendMorningAdminManagerReport(companyId),
                            sendMorningUserReports(companyId)
                        ]);
                        console.log(`✅ Enhanced morning reports with Excel sent successfully for: ${companyId}`);
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
                    console.log(`🌆 Sending enhanced evening reports with Excel for company: ${companyId}`);
                    try {
                        await Promise.all([
                            sendEveningAdminManagerReport(companyId),
                            sendEveningUserReports(companyId)
                        ]);
                        console.log(`✅ Enhanced evening reports with Excel sent successfully for: ${companyId}`);
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
}

// Function to restart cron jobs (useful when settings change)
export async function restartReportCron() {
    console.log("🔄 Restarting enhanced report cron scheduler with Excel attachments...");
    await startReportCron();
}

export default router;