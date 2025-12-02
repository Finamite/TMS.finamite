// routes/reportmail.js
import express from "express";
import cron from "node-cron";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Company from "../models/Company.js";
import { sendSystemEmail } from "../Utils/sendEmail.js";

const router = express.Router();

/* ============================================================
   1. ENHANCED REPORT DATA GENERATOR
   ------------------------------------------------------------
   Generates comprehensive metrics for different user roles
============================================================ */
async function buildReportData(companyId, forUserId = null, isManagerView = false) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Base query setup
    const baseQuery = { companyId, isActive: true };
    if (forUserId) baseQuery.assignedTo = forUserId;

    // Core metrics
    const totalPending = await Task.countDocuments({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: startOfDay, $lte: endOfDay }
    });
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

    // Tasks due today
    const dueToday = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: startOfDay, $lte: endOfDay }
    })
        .populate('assignedTo', 'username')
        .limit(10)
        .sort({ priority: 1, dueDate: 1 })
        .lean();

    // Upcoming tasks (next 7 days)
    const dueNext7Days = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) }
    })
        .populate('assignedTo', 'username')
        .limit(15)
        .sort({ dueDate: 1, priority: 1 })
        .lean();

    // High priority pending tasks
    const highPriorityPending = await Task.find({
        ...baseQuery,
        status: "pending",
        priority: { $in: ["high", "urgent"] }
    })
        .populate('assignedTo', 'username')
        .limit(10)
        .sort({ priority: 1, dueDate: 1 })
        .lean();

    // Weekly progress
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

    // Enhanced metrics for admin/manager view
    let enhancedData = {};

    if (isManagerView) {
        // Team performance metrics
        const teamPerformance = await Task.aggregate([
            {
                $match: {
                    companyId,
                    isActive: true,
                    completedAt: { $gte: weekAgo, $lte: now }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "assignedTo",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: "$user" },
            {
                $group: {
                    _id: "$assignedTo",
                    username: { $first: "$user.username" },
                    completedTasks: { $sum: 1 },
                    avgCompletionTime: {
                        $avg: {
                            $divide: [
                                { $subtract: ["$completedAt", "$createdAt"] },
                                1000 * 60 * 60 * 24 // Convert to days
                            ]
                        }
                    }
                }
            },
            { $sort: { completedTasks: -1 } },
            { $limit: 5 }
        ]);

        // Overdue tasks by user
        const overdueByUser = await Task.aggregate([
            {
                $match: {
                    companyId,
                    status: { $in: ["pending", "overdue"] },
                    dueDate: { $lt: now },
                    isActive: true
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "assignedTo",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: "$user" },
            {
                $group: {
                    _id: "$assignedTo",
                    username: { $first: "$user.username" },
                    overdueCount: { $sum: 1 },
                    oldestOverdue: { $min: "$dueDate" }
                }
            },
            { $sort: { overdueCount: -1 } },
            { $limit: 5 }
        ]);

        // Task distribution by priority
        const priorityDistribution = await Task.aggregate([
            {
                $match: {
                    companyId,
                    status: "pending",
                    isActive: true
                }
            },
            {
                $group: {
                    _id: "$priority",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Recent completions with details
        const recentCompletions = await Task.find({
            companyId,
            status: "completed",
            completedAt: { $gte: startOfDay, $lte: endOfDay },
            isActive: true
        })
            .populate('assignedTo', 'username')
            .populate('assignedBy', 'username')
            .sort({ completedAt: -1 })
            .limit(10)
            .lean();

        enhancedData = {
            teamPerformance,
            overdueByUser,
            priorityDistribution,
            recentCompletions
        };
    }

    return {
        totalPending,
        totalOverdue,
        completedToday,
        completedYesterday,
        dueToday,
        dueNext7Days,
        highPriorityPending,
        weeklyCompleted,
        completionRate,
        weeklyTotal,
        ...enhancedData
    };
}

/* ============================================================
   2. ENHANCED HTML TEMPLATE GENERATOR
============================================================ */
function generateEnhancedHtmlReport({
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
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 4s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
        .header-content {
            position: relative;
            z-index: 1;
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
            position: relative;
        }
        .greeting h2 {
            color: #1e293b;
            font-size: 28px;
            margin-bottom: 8px;
            font-weight: 700;
        }
        .greeting p {
            color: #64748b;
            font-size: 16px;
            font-weight: 500;
        }
        .content {
            padding: 40px 30px;
        }
        .metrics-row {
    display: flex;
    justify-content: space-between;
    gap: 25px;
    margin-bottom: 40px;
    flex-wrap: nowrap;
    width: 100%;
}
        .metric-card {
    flex: 1 1 23%;
    max-width: 23%;
    min-width: 220px;
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
        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            border-color: var(--card-color);
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
        .metric-change {
            font-size: 12px;
            margin-top: 8px;
            padding: 4px 8px;
            border-radius: 12px;
            font-weight: 600;
        }
        .pending { --card-color: #3b82f6; }
        .overdue { --card-color: #ef4444; }
        .completed { --card-color: #10b981; }
        .rate { --card-color: #8b5cf6; }
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
      .table-wrapper {
            max-height: 380px;
            overflow-y: auto;
            overflow-x: hidden;
            border-radius: 12px;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            border: 1px solid #e2e8f0;
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
        .stat-number {
            font-size: 18px;
            font-weight: 700;
            color: #3b82f6;
        }
        .stat-label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
        }
        .overdue-count {
            background: #fef2f2;
            color: #dc2626;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
        }
        .cta-section {
            background: linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%);
            padding: 40px 30px;
            text-align: center;
            margin-top: 40px;
            position: relative;
            overflow: hidden;
        }
        .cta-section::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 6s ease-in-out infinite reverse;
        }
        .cta-content {
            position: relative;
            z-index: 1;
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
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            background: white;
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
        .progress-bar {
            background: #e2e8f0;
            border-radius: 10px;
            height: 8px;
            margin-top: 12px;
            overflow: hidden;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
        }
        .progress-fill {
            background: linear-gradient(90deg, #10b981, #059669);
            height: 100%;
            border-radius: 10px;
            transition: width 0.8s ease;
            position: relative;
        }
        .progress-fill::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            animation: shimmer 2s infinite;
        }
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        .highlight-box {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 1px solid #f59e0b;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .highlight-title {
            font-weight: 700;
            color: #92400e;
            margin-bottom: 8px;
        }
        .highlight-text {
            color: #78350f;
            font-size: 14px;
        }
        @media (max-width: 768px) {
            .container { margin: 10px; border-radius: 16px; }
            .header { padding: 30px 20px; }
            .content { padding: 30px 20px; }
            .metrics-row { flex-direction: column; gap: 15px; }
            .metric-card { min-width: auto; padding: 20px; }
            .metric-number { font-size: 28px; }
            .section-title { font-size: 20px; }
            .data-table { font-size: 14px; }
            .data-table th, .data-table td { padding: 12px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <h1>${timeIcon} ${title}</h1>
                <p>${companyName}</p>
                ${forUser ? `<p style="margin-top: 12px; opacity: 0.9; font-size: 16px;">Personal Report for ${forUser}</p>` : ""}
            </div>
        </div>

        <div class="greeting">
            <h2>${greeting}!</h2>
            <p>Generated on ${generatedAt}</p>
            ${isEvening ? '<p style="margin-top: 8px; font-style: italic;">Here\'s how your day went and what\'s coming up tomorrow.</p>' : '<p style="margin-top: 8px; font-style: italic;">Here\'s your daily briefing to start the day right.</p>'}
        </div>

        <div class="content">
            <!-- Key Metrics Overview -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white;">📊</div>
                    ${isEvening ? "Today's Performance" : "Current Status"}
                </h3>
                <div class="metrics-row">
                    <div class="metric-card pending">
                        <div class="metric-number">${data.totalPending}</div>
                        <div class="metric-label">Pending Tasks</div>
                        ${data.totalPending > 0 ? '<div class="metric-change" style="background: #dbeafe; color: #1d4ed8;">Active</div>' : '<div class="metric-change" style="background: #dcfce7; color: #166534;">All Clear!</div>'}
                    </div>
                    <div class="metric-card overdue">
                        <div class="metric-number">${data.totalOverdue}</div>
                        <div class="metric-label">Overdue Tasks</div>
                        ${data.totalOverdue > 0 ? '<div class="metric-change" style="background: #fee2e2; color: #dc2626;">Needs Attention</div>' : '<div class="metric-change" style="background: #dcfce7; color: #166534;">On Track!</div>'}
                    </div>
                    <div class="metric-card completed">
                        <div class="metric-number">${data.completedToday}</div>
                        <div class="metric-label">${isEvening ? "Completed Today" : "Done Today"}</div>
                        ${data.completedYesterday ? `<div class="metric-change" style="background: ${data.completedToday >= data.completedYesterday ? '#dcfce7; color: #166534' : '#fef3c7; color: #92400e'};">${data.completedToday >= data.completedYesterday ? '↗' : '↘'} vs Yesterday</div>` : ''}
                    </div>
                    <div class="metric-card rate">
                        <div class="metric-number">${data.completionRate}%</div>
                        <div class="metric-label">Weekly Success Rate</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${data.completionRate}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            ${data.totalOverdue > 0 ? `
            <div class="highlight-box">
                <div class="highlight-title">⚠️ Attention Required</div>
                <div class="highlight-text">You have ${data.totalOverdue} overdue task${data.totalOverdue > 1 ? 's' : ''} that need${data.totalOverdue === 1 ? 's' : ''} immediate attention. Consider prioritizing these to get back on track.</div>
            </div>
            ` : ''}

            ${data.dueToday && data.dueToday.length > 0 ? `
            <!-- Due Today -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">🎯</div>
                    ${isEvening ? "Was Due Today" : "Due Today"}
                </h3>
                <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            ${isManagerView ? '<th>Assigned To</th>' : ''}
                            <th>Priority</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.dueToday.map(task => `
                            <tr>
                                <td style="font-weight: 600;">${task.title}</td>
                                ${isManagerView && task.assignedTo ? `<td><span class="user-badge">${task.assignedTo.username}</span></td>` : ''}
                                <td><span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span></td>
                                <td class="date-text">Due Today</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            </div>
            ` : ''}

            <!-- Upcoming Tasks -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">📅</div>
                    ${isEvening ? "Tomorrow & This Week" : "Coming Up (Next 7 Days)"}
                </h3>
                ${data.dueNext7Days && data.dueNext7Days.length > 0 ? `
                    <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Due Date</th>
                            ${isManagerView ? '<th>Assigned To</th>' : ''}
                            <th>Priority</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.dueNext7Days.slice(0, 10).map(task => `
                            <tr>
                                <td style="font-weight: 600;">${task.title}</td>
                                <td class="date-text">${new Date(task.dueDate).toLocaleDateString("en-IN", {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: "Asia/Kolkata"
    })}</td>
                                ${isManagerView && task.assignedTo ? `<td><span class="user-badge">${task.assignedTo.username}</span></td>` : ''}
                                <td><span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span></td>
                            </tr>
                        `).join('')}
                        ${data.dueNext7Days.length > 10 ? `
                            <tr>
                                <td colspan="${isManagerView ? '4' : '3'}" style="color: #64748b; font-style: italic; text-align: center; padding: 20px;">
                                    +${data.dueNext7Days.length - 10} more tasks this week...
                                </td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>
                </div>
                ` : '<div class="no-data">🎉 No upcoming tasks in the next 7 days! Great job staying ahead.</div>'}
            </div>

            ${isManagerView && data.teamPerformance && data.teamPerformance.length > 0 ? `
            <!-- Team Performance (Admin/Manager Only) -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="background: linear-gradient(135deg, #10b981, #059669); color: white;">👥</div>
                    Team Performance (Last 7 Days)
                </h3>
                <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Team Member</th>
                            <th>Completed Tasks</th>
                            <th>Avg Completion Time</th>
                            <th>Performance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.teamPerformance.map((member, index) => `
                            <tr>
                                <td style="font-weight: 600;">${member.username}</td>
                                <td><span class="stat-number">${member.completedTasks}</span> <span class="stat-label">tasks</span></td>
                                <td><span class="stat-number">${member.avgCompletionTime ? Math.round(member.avgCompletionTime * 10) / 10 : 0}</span> <span class="stat-label">days</span></td>
                                <td>
                                    ${index === 0 ? '<span style="color: #059669; font-weight: 700;">🏆 Top Performer</span>' :
            index <= 2 ? '<span style="color: #10b981; font-weight: 600;">✨ Excellent</span>' :
                '<span style="color: #6366f1; font-weight: 500;">👍 Good</span>'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            </div>
            ` : ''}

            ${isManagerView && data.overdueByUser && data.overdueByUser.length > 0 ? `
            <!-- Overdue Tasks by User (Admin/Manager Only) -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white;">⚠️</div>
                    Team Members with Overdue Tasks
                </h3>
                <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Team Member</th>
                            <th>Overdue Tasks</th>
                            <th>Oldest Overdue</th>
                            <th>Action Required</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.overdueByUser.map(user => `
                            <tr>
                                <td style="font-weight: 600;">${user.username}</td>
                                <td><span class="overdue-count">${user.overdueCount} overdue</span></td>
                                <td class="date-text">${new Date(user.oldestOverdue).toLocaleDateString("en-IN", {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: "Asia/Kolkata"
                })}</td>
                                <td style="color: #dc2626; font-weight: 600;">
                                    ${user.overdueCount > 3 ? '🚨 Urgent Follow-up' : '⚠️ Follow-up Needed'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            </div>
            ` : ''}

            ${data.highPriorityPending && data.highPriorityPending.length > 0 ? `
            <!-- High Priority Tasks -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white;">🔥</div>
                    High Priority Tasks
                </h3>
                <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Due Date</th>
                            ${isManagerView ? '<th>Assigned To</th>' : ''}
                            <th>Priority</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.highPriorityPending.map(task => `
                            <tr>
                                <td style="font-weight: 600;">${task.title}</td>
                                <td class="date-text">${new Date(task.dueDate).toLocaleDateString("en-IN", {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    timeZone: "Asia/Kolkata"
                })}</td>
                                ${isManagerView && task.assignedTo ? `<td><span class="user-badge">${task.assignedTo.username}</span></td>` : ''}
                                <td><span class="priority-badge priority-${task.priority}">${task.priority}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            </div>
            ` : ''}

            ${isEvening && isManagerView && data.recentCompletions && data.recentCompletions.length > 0 ? `
            <!-- Recent Completions (Evening Report for Managers) -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon" style="background: linear-gradient(135deg, #10b981, #059669); color: white;">✅</div>
                    Today's Completions
                </h3>
                <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Completed At</th>
                            <th>Completed By</th>
                            <th>Priority</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.recentCompletions.map(task => `
                            <tr>
                                <td style="font-weight: 600;">${task.title}</td>
                                <td class="date-text">${new Date(task.completedAt).toLocaleTimeString("en-IN", {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: "Asia/Kolkata"
                })}</td>
                                <td><span class="user-badge">${task.assignedTo?.username || 'Unknown'}</span></td>
                                <td><span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            </div>
            ` : ''}
        </div>

        <div class="cta-section">
            <div class="cta-content">
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
   3. ENHANCED REPORT FUNCTIONS
============================================================ */

// Send morning report to admin/managers
async function sendMorningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildReportData(companyId, null, true);
    const company = await Company.findOne({ companyId });

    const html = generateEnhancedHtmlReport({
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

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            `Morning Task Report ${new Date().toLocaleDateString("en-IN")} - Team Overview & Priorities`,
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

// Send evening report to admin/managers
async function sendEveningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    const data = await buildReportData(companyId, null, true);

    const company = await Company.findOne({ companyId });

    const html = generateEnhancedHtmlReport({
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

    for (const admin of admins) {
        await sendSystemEmail(
            companyId,
            admin.email,
            `Evening Task Summary ${new Date().toLocaleDateString("en-IN")} - Team Performance & Tomorrow's Focus `,
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

// Send morning report to individual users
async function sendMorningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const users = await User.find({
        companyId,
        isActive: true,
        role: { $in: ["employee", "manager"] } // Include managers for their personal reports
    });

    for (const user of users) {
        const data = await buildReportData(companyId, user._id, false);
        const company = await Company.findOne({ companyId });

        const html = generateEnhancedHtmlReport({
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

        await sendSystemEmail(
            companyId,
            user.email,
            `Morning Report ${new Date().toLocaleDateString("en-IN")} - Your Personal Task Briefing `,
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

// Send evening report to individual users
async function sendEveningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const users = await User.find({
        companyId,
        isActive: true,
        role: { $in: ["employee", "manager"] } // Include managers for their personal reports
    });

    for (const user of users) {
        const data = await buildReportData(companyId, user._id, false);
        const company = await Company.findOne({ companyId });

        const html = generateEnhancedHtmlReport({
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

        await sendSystemEmail(
            companyId,
            user.email,
            `Evening Summary ${new Date().toLocaleDateString("en-IN")} - Your Day's Accomplishments & Tomorrow's Plan`,
            "Please view this email in HTML format for the best experience.",
            html,
            []
        );
    }
}

/* ============================================================
   7. PUBLIC API ENDPOINTS (Enhanced)
============================================================ */

// Manual trigger for morning reports
router.post("/send-morning-report", async (req, res) => {
    try {
        const { companyId } = req.body;

        await Promise.all([
            sendMorningAdminManagerReport(companyId),
            sendMorningUserReports(companyId)
        ]);

        res.json({ message: "Enhanced morning reports sent successfully" });
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

        res.json({ message: "Enhanced evening reports sent successfully" });
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

        res.json({ message: "Enhanced reports sent successfully" });
    } catch (err) {
        console.error("Report error:", err);
        res.status(500).json({ message: "Error sending reports" });
    }
});

/* ============================================================
   8. IMPROVED CRON SCHEDULER (No changes needed)
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

        console.log(`📌 Setting up enhanced cron jobs for company: ${companyId}`);

        // Morning Report
        if (data.enableMorningReport && data.morningReportTime) {
            const cronTime = convertToCron(data.morningReportTime);
            if (cronTime) {
                console.log(`⏰ Morning report cron (UTC): ${cronTime} for IST: ${data.morningReportTime}`);

                const morningJob = cron.schedule(cronTime, async () => {
                    console.log(`🌅 Sending enhanced morning reports for company: ${companyId}`);
                    try {
                        await Promise.all([
                            sendMorningAdminManagerReport(companyId),
                            sendMorningUserReports(companyId)
                        ]);
                        console.log(`✅ Enhanced morning reports sent successfully for: ${companyId}`);
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
                    console.log(`🌆 Sending enhanced evening reports for company: ${companyId}`);
                    try {
                        await Promise.all([
                            sendEveningAdminManagerReport(companyId),
                            sendEveningUserReports(companyId)
                        ]);
                        console.log(`✅ Enhanced evening reports sent successfully for: ${companyId}`);
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

    console.log(`🚀 Enhanced report cron scheduler initialized with ${activeCronJobs.size} active jobs`);
}

// Function to restart cron jobs (useful when settings change)
export async function restartReportCron() {
    console.log("🔄 Restarting enhanced report cron scheduler...");
    await startReportCron();
}

export default router;