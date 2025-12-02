// routes/reportmail.js
import express from "express";
import cron from "node-cron";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { sendSystemEmail } from "../Utils/sendEmail.js";

const router = express.Router();

/* ============================================================
   1. ENHANCED REPORT DATA GENERATOR
   ------------------------------------------------------------
   Generates comprehensive metrics for admin/manager or per-user reports.
============================================================ */
async function buildReportData(companyId, forUserId = null) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Enhanced time ranges
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const yesterday = new Date(startOfDay.getTime() - 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const baseQuery = { companyId, isActive: true };
    if (forUserId) baseQuery.assignedTo = forUserId;

    // Core metrics
    const totalPending = await Task.countDocuments({ ...baseQuery, status: "pending" });
    const totalOverdue = await Task.countDocuments({
        ...baseQuery,
        status: { $in: ["pending", "overdue"] },
        dueDate: { $lt: now }
    });

    // Enhanced completion metrics
    const completedToday = await Task.countDocuments({
        ...baseQuery,
        status: "completed",
        completedAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const completedYesterday = await Task.countDocuments({
        ...baseQuery,
        status: "completed",
        completedAt: { $gte: yesterday, $lt: startOfDay }
    });

    const completedThisWeek = await Task.countDocuments({
        ...baseQuery,
        status: "completed",
        completedAt: { $gte: startOfWeek, $lte: endOfDay }
    });

    const completedThisMonth = await Task.countDocuments({
        ...baseQuery,
        status: "completed",
        completedAt: { $gte: startOfMonth, $lte: endOfDay }
    });

    // Due date analysis
    const dueToday = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: startOfDay, $lte: endOfDay }
    })
        .limit(10)
        .sort({ priority: -1, dueDate: 1 })
        .lean();

    const dueTomorrow = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { 
            $gte: new Date(endOfDay.getTime() + 1), 
            $lte: new Date(endOfDay.getTime() + 86400000) 
        }
    })
        .limit(8)
        .sort({ priority: -1, dueDate: 1 })
        .lean();

    const dueNext7Days = await Task.find({
        ...baseQuery,
        status: "pending",
        dueDate: { $gte: now, $lte: new Date(now.getTime() + 7 * 86400000) }
    })
        .limit(15)
        .sort({ priority: -1, dueDate: 1 })
        .lean();

    // Priority analysis
    const highPriorityPending = await Task.find({
        ...baseQuery,
        status: "pending",
        priority: { $in: ["high", "urgent"] }
    })
        .limit(10)
        .sort({ dueDate: 1 })
        .lean();

    const priorityBreakdown = await Task.aggregate([
        { $match: { ...baseQuery, status: "pending" } },
        { $group: { 
            _id: "$priority", 
            count: { $sum: 1 },
            overdue: { 
                $sum: { $cond: [{ $lt: ["$dueDate", now] }, 1, 0] } 
            }
        }},
        { $sort: { _id: 1 } }
    ]);

    // Task type analysis
    const taskTypeBreakdown = await Task.aggregate([
        { $match: { ...baseQuery, status: "pending" } },
        { $group: { 
            _id: "$taskType", 
            count: { $sum: 1 },
            overdue: { 
                $sum: { $cond: [{ $lt: ["$dueDate", now] }, 1, 0] } 
            }
        }}
    ]);

    // Performance insights
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

    // Revision analysis
    const revisionsToday = await Task.countDocuments({
        ...baseQuery,
        "revisions.0": { $exists: true },
        "revisions": { 
            $elemMatch: { 
                "newDate": { $gte: startOfDay, $lte: endOfDay }
            }
        }
    });

    const avgRevisionCount = await Task.aggregate([
        { $match: { ...baseQuery, "revisions.0": { $exists: true } } },
        { $group: { _id: null, avgRevisions: { $avg: "$revisionCount" } } }
    ]);

    // Top delayed users (for admin/manager reports only)
    const topDelayed = !forUserId ? await Task.aggregate([
        {
            $match: {
                companyId,
                status: { $in: ["pending", "overdue"] },
                dueDate: { $lt: now },
                isActive: true
            }
        },
        { $group: { 
            _id: "$assignedTo", 
            overdueCount: { $sum: 1 },
            avgDelayDays: { 
                $avg: { 
                    $divide: [
                        { $subtract: [now, "$dueDate"] }, 
                        86400000 
                    ] 
                } 
            }
        }},
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
                avgDelayDays: { $round: ["$avgDelayDays", 1] },
                username: "$user.username",
                email: "$user.email"
            }
        }
    ]) : [];

    // Team performance (for admin/manager only)
    const teamPerformance = !forUserId ? await Task.aggregate([
        {
            $match: {
                companyId,
                isActive: true,
                completedAt: { $gte: startOfWeek, $lte: now }
            }
        },
        {
            $group: {
                _id: "$assignedTo",
                completed: { $sum: 1 },
                onTime: { 
                    $sum: { 
                        $cond: [
                            { $lte: ["$completedAt", "$dueDate"] }, 
                            1, 
                            0 
                        ] 
                    } 
                }
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "_id", 
                foreignField: "_id",
                as: "user"
            }
        },
        { $unwind: "$user" },
        {
            $project: {
                username: "$user.username",
                completed: 1,
                onTime: 1,
                onTimeRate: { 
                    $round: [
                        { 
                            $multiply: [
                                { $divide: ["$onTime", "$completed"] }, 
                                100 
                            ] 
                        }, 
                        1 
                    ] 
                }
            }
        },
        { $sort: { completed: -1 } },
        { $limit: 5 }
    ]) : [];

    return {
        // Basic metrics
        totalPending,
        totalOverdue,
        completedToday,
        completedYesterday,
        completedThisWeek,
        completedThisMonth,
        
        // Due tasks
        dueToday,
        dueTomorrow,
        dueNext7Days,
        
        // Priority & type analysis
        highPriorityPending,
        priorityBreakdown,
        taskTypeBreakdown,
        
        // Performance metrics
        weeklyCompleted,
        completionRate,
        revisionsToday,
        avgRevisionCount: avgRevisionCount[0]?.avgRevisions || 0,
        
        // Team data (admin/manager only)
        topDelayed,
        teamPerformance,
        
        // Insights
        improvementTrend: completedToday > completedYesterday ? 'up' : completedToday < completedYesterday ? 'down' : 'stable'
    };
}

/* ============================================================
   2. ENHANCED MODERN HTML TEMPLATE GENERATOR
============================================================ */
function generateModernHtmlReport({ companyName, title, generatedAt, data, forUser, reportType = "morning" }) {
    const isEvening = reportType === "evening";
    const greeting = isEvening ? "Good Evening" : "Good Morning";
    const timeIcon = isEvening ? "🌙" : "☀️";
    const isAdminReport = !forUser;
    
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
            color: #2d3748;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 25px 50px rgba(0,0,0,0.15);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="75" cy="75" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="50" cy="10" r="0.5" fill="rgba(255,255,255,0.05)"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
            opacity: 0.3;
        }
        .header-content {
            position: relative;
            z-index: 1;
        }
        .header h1 {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .header p {
            font-size: 18px;
            opacity: 0.95;
            font-weight: 500;
        }
        .user-tag {
            display: inline-block;
            margin-top: 12px;
            padding: 8px 16px;
            background: rgba(255,255,255,0.2);
            border-radius: 25px;
            font-size: 14px;
            font-weight: 600;
            backdrop-filter: blur(10px);
        }
        .greeting {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            padding: 30px;
            border-left: 6px solid #667eea;
            position: relative;
        }
        .greeting::after {
            content: '${timeIcon}';
            position: absolute;
            right: 30px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 48px;
            opacity: 0.1;
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
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 25px;
            margin-bottom: 40px;
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
        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            border-color: var(--card-color);
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
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-label {
            color: #64748b;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }
        .metric-change {
            font-size: 12px;
            margin-top: 8px;
            padding: 4px 8px;
            border-radius: 12px;
            font-weight: 600;
        }
        .trend-up { background: #dcfce7; color: #166534; }
        .trend-down { background: #fef2f2; color: #dc2626; }
        .trend-stable { background: #f1f5f9; color: #475569; }
        
        .pending { --card-color: #3b82f6; }
        .overdue { --card-color: #ef4444; }
        .completed { --card-color: #10b981; }
        .rate { --card-color: #8b5cf6; }
        .revision { --card-color: #f59e0b; }
        
        .section {
            margin-bottom: 35px;
        }
        .section-title {
            font-size: 22px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            padding-bottom: 10px;
            border-bottom: 3px solid #e2e8f0;
        }
        .section-icon {
            font-size: 24px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .task-list {
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
            border-radius: 16px;
            padding: 25px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .task-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid #e2e8f0;
            transition: all 0.2s ease;
        }
        .task-item:hover {
            padding-left: 10px;
            background: rgba(102, 126, 234, 0.03);
            margin: 0 -10px;
            border-radius: 8px;
        }
        .task-item:last-child {
            border-bottom: none;
        }
        .task-title {
            font-weight: 600;
            color: #1e293b;
            flex: 1;
            font-size: 15px;
        }
        .task-meta {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .task-date {
            color: #64748b;
            font-size: 13px;
            font-weight: 500;
        }
        .priority-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .priority-high { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
        .priority-urgent { background: #7f1d1d; color: #ffffff; border: 1px solid #991b1b; }
        .priority-medium { background: #fef3c7; color: #d97706; border: 1px solid #fbbf24; }
        .priority-low { background: #f0fdf4; color: #16a34a; border: 1px solid #4ade80; }
        
        .user-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .user-item:last-child {
            border-bottom: none;
        }
        .user-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .user-avatar {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 16px;
        }
        .user-name {
            font-weight: 600;
            color: #1e293b;
            font-size: 15px;
        }
        .user-stats {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .overdue-count {
            background: #fef2f2;
            color: #dc2626;
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 700;
            border: 1px solid #fca5a5;
        }
        .performance-badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }
        .perf-excellent { background: #dcfce7; color: #166534; }
        .perf-good { background: #dbeafe; color: #1e40af; }
        .perf-average { background: #fef3c7; color: #d97706; }
        
        .insights-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .insight-card {
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
            border-radius: 16px;
            padding: 20px;
            border-left: 6px solid var(--insight-color);
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .insight-title {
            font-size: 16px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 8px;
        }
        .insight-value {
            font-size: 24px;
            font-weight: 800;
            color: var(--insight-color);
            margin-bottom: 4px;
        }
        .insight-desc {
            font-size: 12px;
            color: #64748b;
            font-weight: 500;
        }
        
        .cta-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
            background-size: 20px 20px;
            animation: float 20s infinite linear;
        }
        @keyframes float {
            0% { transform: translateX(0) translateY(0); }
            100% { transform: translateX(-20px) translateY(-20px); }
        }
        .cta-content {
            position: relative;
            z-index: 1;
        }
        .cta-button {
            display: inline-block;
            background: rgba(255,255,255,0.95);
            color: #667eea;
            padding: 18px 36px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            backdrop-filter: blur(10px);
        }
        .cta-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 35px rgba(0,0,0,0.2);
            background: #ffffff;
        }
        .footer {
            background: #f8fafc;
            padding: 30px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
        }
        .footer-logo {
            font-size: 18px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 8px;
        }
        .no-data {
            text-align: center;
            color: #64748b;
            font-style: italic;
            padding: 30px;
            background: #f8fafc;
            border-radius: 12px;
            margin: 20px 0;
        }
        .progress-bar {
            background: #e2e8f0;
            border-radius: 10px;
            height: 10px;
            margin-top: 12px;
            overflow: hidden;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
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
        
        @media (max-width: 600px) {
            body { padding: 10px; }
            .header { padding: 30px 20px; }
            .content { padding: 30px 20px; }
            .metrics-grid { grid-template-columns: 1fr; gap: 15px; }
            .insights-grid { grid-template-columns: 1fr; }
            .task-item { flex-direction: column; align-items: flex-start; gap: 8px; }
            .task-meta { align-self: flex-end; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-content">
                <h1>${timeIcon} ${title}</h1>
                <p>${companyName}</p>
                ${forUser ? `<div class="user-tag">Personal Report for ${forUser}</div>` : '<div class="user-tag">Management Dashboard</div>'}
            </div>
        </div>

        <!-- Greeting -->
        <div class="greeting">
            <h2>${greeting}!</h2>
            <p>Generated on ${generatedAt} • ${isEvening ? 'End of day summary' : 'Start your day with insights'}</p>
        </div>

        <div class="content">
            <!-- Key Metrics Overview -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">📊</div>
                    ${isEvening ? "Today's Performance" : "Current Status"}
                </h3>
                <div class="metrics-grid">
                    <div class="metric-card pending">
                        <div class="metric-number">${data.totalPending}</div>
                        <div class="metric-label">Pending Tasks</div>
                        ${data.totalPending > 0 ? `<div class="metric-change trend-${data.improvementTrend}">
                            ${data.improvementTrend === 'up' ? '📈 Active' : data.improvementTrend === 'down' ? '📉 Needs attention' : '📊 Stable'}
                        </div>` : ''}
                    </div>
                    <div class="metric-card overdue">
                        <div class="metric-number">${data.totalOverdue}</div>
                        <div class="metric-label">Overdue Tasks</div>
                        ${data.totalOverdue > 0 ? '<div class="metric-change trend-down">⚠️ Immediate action needed</div>' : '<div class="metric-change trend-up">✅ All on track</div>'}
                    </div>
                    <div class="metric-card completed">
                        <div class="metric-number">${data.completedToday}</div>
                        <div class="metric-label">Completed Today</div>
                        ${data.completedYesterday ? `<div class="metric-change trend-${data.completedToday >= data.completedYesterday ? 'up' : 'down'}">
                            ${data.completedToday > data.completedYesterday ? '📈' : data.completedToday < data.completedYesterday ? '📉' : '📊'} 
                            vs yesterday (${data.completedYesterday})
                        </div>` : ''}
                    </div>
                    <div class="metric-card rate">
                        <div class="metric-number">${data.completionRate}%</div>
                        <div class="metric-label">Weekly Success Rate</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${data.completionRate}%"></div>
                        </div>
                        <div class="metric-change ${data.completionRate >= 80 ? 'trend-up' : data.completionRate >= 60 ? 'trend-stable' : 'trend-down'}">
                            ${data.completionRate >= 80 ? '🎯 Excellent' : data.completionRate >= 60 ? '👍 Good' : '⚡ Needs improvement'}
                        </div>
                    </div>
                    ${isEvening && data.revisionsToday > 0 ? `
                    <div class="metric-card revision">
                        <div class="metric-number">${data.revisionsToday}</div>
                        <div class="metric-label">Revisions Today</div>
                        <div class="metric-change trend-stable">📝 Avg: ${Math.round(data.avgRevisionCount * 10) / 10} per task</div>
                    </div>` : ''}
                </div>
            </div>

            <!-- Performance Insights (Evening Only) -->
            ${isEvening ? `
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">📈</div>
                    Performance Insights
                </h3>
                <div class="insights-grid">
                    <div class="insight-card" style="--insight-color: #10b981;">
                        <div class="insight-title">Weekly Progress</div>
                        <div class="insight-value">${data.completedThisWeek}</div>
                        <div class="insight-desc">Tasks completed this week</div>
                    </div>
                    <div class="insight-card" style="--insight-color: #3b82f6;">
                        <div class="insight-title">Monthly Total</div>
                        <div class="insight-value">${data.completedThisMonth}</div>
                        <div class="insight-desc">Tasks completed this month</div>
                    </div>
                    ${data.priorityBreakdown.length > 0 ? `
                    <div class="insight-card" style="--insight-color: #f59e0b;">
                        <div class="insight-title">High Priority Pending</div>
                        <div class="insight-value">${data.priorityBreakdown.find(p => p._id === 'high')?.count || 0}</div>
                        <div class="insight-desc">Requiring immediate focus</div>
                    </div>` : ''}
                </div>
            </div>` : ''}

            <!-- Due Today/Tomorrow -->
            ${data.dueToday && data.dueToday.length > 0 ? `
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">🎯</div>
                    ${isEvening ? "Tasks Due Tomorrow" : "Due Today"}
                </h3>
                <div class="task-list">
                    ${data.dueToday.map(task => `
                        <div class="task-item">
                            <div class="task-title">${task.title}</div>
                            <div class="task-meta">
                                <span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${!isEvening && data.dueTomorrow && data.dueTomorrow.length > 0 ? `
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">📅</div>
                    Due Tomorrow
                </h3>
                <div class="task-list">
                    ${data.dueTomorrow.map(task => `
                        <div class="task-item">
                            <div class="task-title">${task.title}</div>
                            <div class="task-meta">
                                <span class="priority-badge priority-${task.priority || 'medium'}">${task.priority || 'medium'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            <!-- Upcoming Tasks -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">📅</div>
                    Upcoming (Next 7 Days)
                </h3>
                ${data.dueNext7Days && data.dueNext7Days.length > 0 ? `
                <div class="task-list">
                    ${data.dueNext7Days.slice(0, 8).map(task => `
                        <div class="task-item">
                            <div class="task-title">${task.title}</div>
                            <div class="task-meta">
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
                ` : '<div class="no-data">🎉 No upcoming tasks in the next 7 days! Great job staying on top of your work.</div>'}
            </div>

            ${isAdminReport && data.teamPerformance && data.teamPerformance.length > 0 ? `
            <!-- Team Performance -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">👥</div>
                    Team Performance This Week
                </h3>
                <div class="task-list">
                    ${data.teamPerformance.map(member => `
                        <div class="user-item">
                            <div class="user-info">
                                <div class="user-avatar">${member.username.charAt(0).toUpperCase()}</div>
                                <div class="user-name">${member.username}</div>
                            </div>
                            <div class="user-stats">
                                <div class="performance-badge ${member.onTimeRate >= 90 ? 'perf-excellent' : member.onTimeRate >= 70 ? 'perf-good' : 'perf-average'}">
                                    ${member.completed} completed • ${member.onTimeRate}% on-time
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${isAdminReport && data.topDelayed && data.topDelayed.length > 0 ? `
            <!-- Users Needing Support -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">⚠️</div>
                    Team Members Needing Support
                </h3>
                <div class="task-list">
                    ${data.topDelayed.map(user => `
                        <div class="user-item">
                            <div class="user-info">
                                <div class="user-avatar">${user.username?.charAt(0).toUpperCase() || '?'}</div>
                                <div class="user-name">${user.username || 'Unknown User'}</div>
                            </div>
                            <div class="user-stats">
                                <span class="overdue-count">${user.overdueCount} overdue</span>
                                ${user.avgDelayDays ? `<span class="performance-badge perf-average">Avg: ${user.avgDelayDays} days late</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${data.highPriorityPending && data.highPriorityPending.length > 0 ? `
            <!-- High Priority Tasks -->
            <div class="section">
                <h3 class="section-title">
                    <div class="section-icon">🔥</div>
                    High Priority Pending
                </h3>
                <div class="task-list">
                    ${data.highPriorityPending.map(task => `
                        <div class="task-item">
                            <div class="task-title">${task.title}</div>
                            <div class="task-meta">
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
            </div>` : ''}
        </div>

        <!-- Call to Action -->
        <div class="cta-section">
            <div class="cta-content">
                <h3 style="color: white; margin-bottom: 15px; font-size: 24px; font-weight: 700;">
                    ${isEvening ? '🌟 Great work today! Plan for tomorrow.' : '⚡ Ready to tackle your tasks?'}
                </h3>
                <p style="color: rgba(255,255,255,0.9); margin-bottom: 25px; font-size: 16px;">
                    ${isEvening ? 'Review your progress and prepare for another productive day.' : 'Access your dashboard to manage tasks and stay on track.'}
                </p>
                <a href="https://tms.finamite.in" class="cta-button">
                    ${isEvening ? '📋 Plan Tomorrow →' : '🚀 Open Dashboard →'}
                </a>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <div class="footer-logo">Task Management System</div>
            <p>This is an automated ${isEvening ? 'evening summary' : 'morning briefing'} from your Task Management System</p>
            <p style="margin-top: 8px;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
            <p style="margin-top: 8px; font-size: 12px; opacity: 0.7;">
                ${isEvening ? '🌙 Have a great evening!' : '☀️ Have a productive day!'}
            </p>
        </div>
    </div>
</body>
</html>`;
}

/* ============================================================
   3. ENHANCED MORNING REPORT FUNCTIONS
============================================================ */
async function sendMorningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    if (admins.length === 0) return;

    const data = await buildReportData(companyId);
    const companyDoc = await Settings.findOne({ companyId }) || { data: { companyName: "Your Company" } };

    const html = generateModernHtmlReport({
        companyName: companyDoc.data?.companyName || "Your Company",
        title: "Morning Task Intelligence Report",
        generatedAt: new Date().toLocaleString("en-IN", { 
            timeZone: "Asia/Kolkata",
            dateStyle: "full",
            timeStyle: "short"
        }),
        data,
        reportType: "morning"
    });

    for (const admin of admins) {
        try {
            await sendSystemEmail(
                companyId,
                admin.email,
                "☀️ Morning Intelligence Report - Team Dashboard Overview",
                "Please view this email in HTML format for the best experience.",
                html,
                []
            );
        } catch (error) {
            console.error(`Failed to send morning report to ${admin.email}:`, error);
        }
    }
}

async function sendEveningAdminManagerReport(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const admins = await User.find({
        companyId,
        role: { $in: ["admin", "manager"] },
        isActive: true
    });

    if (admins.length === 0) return;

    const data = await buildReportData(companyId);
    const companyDoc = await Settings.findOne({ companyId }) || { data: { companyName: "Your Company" } };

    const html = generateModernHtmlReport({
        companyName: companyDoc.data?.companyName || "Your Company",
        title: "Evening Performance Summary",
        generatedAt: new Date().toLocaleString("en-IN", { 
            timeZone: "Asia/Kolkata",
            dateStyle: "full",
            timeStyle: "short"
        }),
        data,
        reportType: "evening"
    });

    for (const admin of admins) {
        try {
            await sendSystemEmail(
                companyId,
                admin.email,
                "🌙 Evening Summary - Team Performance & Tomorrow's Focus",
                "Please view this email in HTML format for the best experience.",
                html,
                []
            );
        } catch (error) {
            console.error(`Failed to send evening report to ${admin.email}:`, error);
        }
    }
}

async function sendMorningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableMorningReport) return;

    const users = await User.find({ 
        companyId, 
        isActive: true,
        role: { $in: ["employee", "manager"] } // Include managers for personal reports
    });

    const companyDoc = await Settings.findOne({ companyId }) || { data: { companyName: "Your Company" } };

    for (const user of users) {
        try {
            const data = await buildReportData(companyId, user._id);

            const html = generateModernHtmlReport({
                companyName: companyDoc.data?.companyName || "Your Company",
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
                "☀️ Good Morning! Your Personal Task Briefing",
                "Please view this email in HTML format for the best experience.",
                html,
                []
            );
        } catch (error) {
            console.error(`Failed to send morning report to ${user.email}:`, error);
        }
    }
}

async function sendEveningUserReports(companyId) {
    const settings = await Settings.findOne({ type: "email", companyId });
    if (!settings?.data?.enabled || !settings?.data?.enableEveningReport) return;

    const users = await User.find({ 
        companyId, 
        isActive: true,
        role: { $in: ["employee", "manager"] } // Include managers for personal reports
    });

    const companyDoc = await Settings.findOne({ companyId }) || { data: { companyName: "Your Company" } };

    for (const user of users) {
        try {
            const data = await buildReportData(companyId, user._id);

            const html = generateModernHtmlReport({
                companyName: companyDoc.data?.companyName || "Your Company",
                title: "Your Evening Achievement Summary",
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
                "🌙 Evening Summary - Your Day's Accomplishments & Tomorrow's Prep",
                "Please view this email in HTML format for the best experience.",
                html,
                []
            );
        } catch (error) {
            console.error(`Failed to send evening report to ${user.email}:`, error);
        }
    }
}

/* ============================================================
   4. API ENDPOINTS (Enhanced)
============================================================ */

// Manual trigger for morning reports
router.post("/send-morning-report", async (req, res) => {
    try {
        const { companyId } = req.body;
        if (!companyId) {
            return res.status(400).json({ message: "Company ID is required" });
        }

        await Promise.all([
            sendMorningAdminManagerReport(companyId),
            sendMorningUserReports(companyId)
        ]);

        res.json({ 
            message: "Morning reports sent successfully",
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error("Morning report error:", err);
        res.status(500).json({ 
            message: "Error sending morning reports",
            error: err.message 
        });
    }
});

// Manual trigger for evening reports
router.post("/send-evening-report", async (req, res) => {
    try {
        const { companyId } = req.body;
        if (!companyId) {
            return res.status(400).json({ message: "Company ID is required" });
        }

        await Promise.all([
            sendEveningAdminManagerReport(companyId),
            sendEveningUserReports(companyId)
        ]);

        res.json({ 
            message: "Evening reports sent successfully",
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error("Evening report error:", err);
        res.status(500).json({ 
            message: "Error sending evening reports",
            error: err.message 
        });
    }
});

// Enhanced report preview endpoint
router.get("/preview-report", async (req, res) => {
    try {
        const { companyId, type = "morning", userRole = "admin" } = req.query;
        
        if (!companyId) {
            return res.status(400).json({ message: "Company ID is required" });
        }

        const data = await buildReportData(companyId, userRole === "user" ? "sample-user-id" : null);
        const companyDoc = await Settings.findOne({ companyId }) || { data: { companyName: "Your Company" } };
        
        const html = generateModernHtmlReport({
            companyName: companyDoc.data?.companyName || "Your Company",
            title: type === "morning" ? "Morning Task Report" : "Evening Summary Report",
            generatedAt: new Date().toLocaleString("en-IN", { 
                timeZone: "Asia/Kolkata",
                dateStyle: "full",
                timeStyle: "short"
            }),
            data,
            forUser: userRole === "user" ? "Sample User" : null,
            reportType: type
        });

        res.send(html);
    } catch (err) {
        console.error("Report preview error:", err);
        res.status(500).json({ 
            message: "Error generating report preview",
            error: err.message 
        });
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

        res.json({ message: "Reports sent successfully" });
    } catch (err) {
        console.error("Report error:", err);
        res.status(500).json({ message: "Error sending reports" });
    }
});

/* ============================================================
   5. ENHANCED CRON SCHEDULER (Same as before but with better error handling)
============================================================ */

function convertToCron(timeString) {
    if (!timeString || !timeString.includes(":")) return null;
    
    const [localHour, localMinute] = timeString.split(":").map(Number);
    const localMinutes = localHour * 60 + localMinute;
    const istOffsetMinutes = 5 * 60 + 30;
    let utcMinutes = localMinutes - istOffsetMinutes;
    
    if (utcMinutes < 0) {
        utcMinutes += 24 * 60;
    } else if (utcMinutes >= 24 * 60) {
        utcMinutes -= 24 * 60;
    }
    
    const utcHour = Math.floor(utcMinutes / 60);
    const utcMinute = utcMinutes % 60;
    
    return `${utcMinute} ${utcHour} * * *`;
}

const activeCronJobs = new Map();

export async function startReportCron() {
    console.log("⏳ Initializing enhanced report cron scheduler...");

    activeCronJobs.forEach((job, key) => {
        job.destroy();
        console.log(`🗑️ Cleared existing cron job: ${key}`);
    });
    activeCronJobs.clear();

    try {
        const companies = await Settings.find({
            type: "email",
            $or: [
                { "data.enableMorningReport": true },
                { "data.enableEveningReport": true }
            ]
        });

        console.log(`📊 Found ${companies.length} companies with report settings enabled`);

        for (const s of companies) {
            const companyId = s.companyId;
            const data = s.data;

            console.log(`📌 Setting up cron jobs for company: ${companyId}`);

            if (data.enableMorningReport && data.morningReportTime) {
                const cronTime = convertToCron(data.morningReportTime);
                if (cronTime) {
                    console.log(`⏰ Morning report cron (UTC): ${cronTime} for IST: ${data.morningReportTime}`);
                    
                    const morningJob = cron.schedule(cronTime, async () => {
                        console.log(`🌅 Sending morning reports for company: ${companyId}`);
                        try {
                            await Promise.all([
                                sendMorningAdminManagerReport(companyId),
                                sendMorningUserReports(companyId)
                            ]);
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

            if (data.enableEveningReport && data.eveningReportTime) {
                const cronTime = convertToCron(data.eveningReportTime);
                if (cronTime) {
                    console.log(`⏰ Evening report cron (UTC): ${cronTime} for IST: ${data.eveningReportTime}`);
                    
                    const eveningJob = cron.schedule(cronTime, async () => {
                        console.log(`🌆 Sending evening reports for company: ${companyId}`);
                        try {
                            await Promise.all([
                                sendEveningAdminManagerReport(companyId),
                                sendEveningUserReports(companyId)
                            ]);
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
        }

        console.log(`🚀 Report cron scheduler initialized with ${activeCronJobs.size} active jobs`);
    } catch (error) {
        console.error("❌ Error initializing cron scheduler:", error);
    }
}

export async function restartReportCron() {
    console.log("🔄 Restarting report cron scheduler...");
    await startReportCron();
}

export default router;