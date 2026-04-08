import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
  CheckSquare, Clock, AlertTriangle, TrendingUp, Calendar,
  Target, Activity, CheckCircle, XCircle, 
  ChevronDown, BarChart3, Sparkles,
  PieChart as PieChartIcon, Users,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth, isSameYear } from 'date-fns';
// import { availableThemes } from '../contexts/ThemeContext';
import { address } from '../../utils/ipAddress';
import TeamPendingTasksChart from "../components/TeamPendingTasksChart";
import { useNavigate } from "react-router-dom";

// --- Interfaces (updated to include quarterly) ---
interface DashboardData {
  statusStats: Array<{ _id: string; count: number }>;
  typeStats: Array<{ _id: string; count: number }>;
  priorityStats: Array<{ _id: string; count: number }>;
  completionTrend: Array<{ _id: { month: number; year: number }; count: number }>;
  plannedTrend: Array<{ _id: { month: number; year: number }; count: number }>;
  teamPerformance: Array<{
    username: string;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    oneTimeTasks: number;
    oneTimePending: number;
    oneTimeCompleted: number;
    dailyTasks: number;
    dailyPending: number;
    dailyCompleted: number;
    weeklyTasks: number;
    weeklyPending: number;
    weeklyCompleted: number;
    monthlyTasks: number;
    monthlyPending: number;
    monthlyCompleted: number;
    quarterlyTasks: number;
    quarterlyPending: number;
    quarterlyCompleted: number;
    yearlyTasks: number;
    yearlyPending: number;
    yearlyCompleted: number;
    recurringTasks: number;
    recurringPending: number;
    recurringCompleted: number;
    completionRate: number;
    onTimeRate: number;
    onTimeCompletedTasks: number;
    onTimeRecurringCompleted: number;
  }>;
  recentActivity: Array<{
    _id: string;
    title: string;
    type: 'assigned' | 'completed' | 'overdue';
    username: string;
    assignedBy?: string;
    date: string;
    taskType: string;
  }>;
  performanceMetrics: {
    onTimeCompletion: number;
    averageCompletionTime: number;
    taskDistribution: Array<{ type: string; count: number; percentage: number }>;
    oneTimeOnTimeRate?: number;
    recurringOnTimeRate?: number;
  };
  userPerformance?: {
    username: string;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    oneTimeTasks: number;
    oneTimePending: number;
    oneTimeCompleted: number;
    dailyTasks: number;
    dailyPending: number;
    dailyCompleted: number;
    weeklyTasks: number;
    weeklyPending: number;
    weeklyCompleted: number;
    monthlyTasks: number;
    monthlyPending: number;
    monthlyCompleted: number;
    quarterlyTasks: number;
    quarterlyPending: number;
    quarterlyCompleted: number;
    yearlyTasks: number;
    yearlyPending: number;
    yearlyCompleted: number;
    recurringTasks: number;
    recurringPending: number;
    recurringCompleted: number;
    completionRate: number;
    onTimeRate: number;
    onTimeCompletedTasks: number;
    onTimeRecurringCompleted: number;
  };
}

interface TaskCounts {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  overdueTasks: number;
  oneTimeTasks: number;
  oneTimePending: number;
  oneTimeCompleted: number;
  recurringTasks: number;
  recurringPending: number;
  recurringCompleted: number;
  dailyTasks: number;
  dailyPending: number;
  dailyCompleted: number;
  weeklyTasks: number;
  weeklyPending: number;
  weeklyCompleted: number;
  monthlyTasks: number;
  monthlyPending: number;
  monthlyCompleted: number;
  quarterlyTasks: number;
  quarterlyPending: number;
  quarterlyCompleted: number;
  yearlyTasks: number;
  yearlyPending: number;
  yearlyCompleted: number;
  overduePercentage: number;
  trends?: {
    totalTasks: { value: number; direction: 'up' | 'down' };
    pendingTasks: { value: number; direction: 'up' | 'down' };
    completedTasks: { value: number; direction: 'up' | 'down' };
    overdueTasks: { value: number; direction: 'up' | 'down' };
  };
}

interface TeamPendingCounts {
  oneTimeToday: number;
  oneTimeOverdue: number;
  dailyToday: number;
  recurringToday: number;
  recurringOverdue: number;
}

interface TeamPendingData {
  [username: string]: TeamPendingCounts;
}

interface TeamPerformanceItem {
  username: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  completionRate: number;
  onTimeRate: number;
  totalPerformanceRate: number;
}
// window.scrollTo({ top: scrollPosition, behavior: 'instant' });

const Dashboard: React.FC = () => {
  const DASHBOARD_API_CACHE_TTL_MS = 60 * 1000;
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [taskCounts, setTaskCounts] = useState<TaskCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showMonthFilter] = useState(false);
  const [viewMode, setViewMode] = useState<'current' | 'all-time'>('current');

  // New states for team member selection
  const [selectedTeamMember, setSelectedTeamMember] = useState<string>('all');
  const [showTeamMemberFilter, setShowTeamMemberFilter] = useState(false);
  const [memberTrendData, setMemberTrendData] = useState<any[]>([]);
  const [teamPendingData, setTeamPendingData] = useState<TeamPendingData>({});
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformanceItem[]>([]);
  const monthListRef = React.useRef<HTMLDivElement>(null);
  const [whatsappIntegrationStatus, setWhatsappIntegrationStatus] = useState<{
    live: boolean;
    provider: 'interakt' | 'wati' | 'fichat' | null;
  }>({
    live: false,
    provider: null
  });
  const analyticsCacheRef = React.useRef<Map<string, { data: any; ts: number }>>(new Map());
  const countsCacheRef = React.useRef<Map<string, { data: any; ts: number }>>(new Map());
  const teamPendingCacheRef = React.useRef<Map<string, { data: TeamPendingData; ts: number }>>(new Map());

  const navigate = useNavigate();

  const isPrivilegedUser = user?.role === 'admin' || user?.role === 'manager';

  // --- Core Data Fetching Logic ---
  // Using useCallback for memoization of fetch functions
  const fetchDashboardAnalytics = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      const params: any = {
        userId: user?.id,
        isAdmin: (user?.role === "admin" || user?.role === "manager") ? "true" : "false"
      };
      const cacheKey = `${params.userId || 'na'}:${params.isAdmin}:${startDate || 'all'}:${endDate || 'all'}`;
      const cached = analyticsCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < DASHBOARD_API_CACHE_TTL_MS) {
        return cached.data;
      }
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await axios.get(`${address}/api/dashboard/analytics`, { params });
      analyticsCacheRef.current.set(cacheKey, {
        data: response.data,
        ts: Date.now()
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }, [user?.id, user?.role]);

  const fetchTeamPendingTasks = useCallback(async () => {
    try {
      if (!user?.companyId) return {};
      const cacheKey = `${user.companyId}`;
      const cached = teamPendingCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < DASHBOARD_API_CACHE_TTL_MS) {
        return cached.data;
      }

      const res = await axios.get(`${address}/api/tasks/team-pending-fast`, {
        params: { companyId: user.companyId }
      });

      const grouped: TeamPendingData = {};
      res.data.forEach((u: { _id: string | number; oneTimeToday: any; oneTimeOverdue: any; dailyToday: any; recurringToday: any; recurringOverdue: any; }) => {
        grouped[u._id] = {
          oneTimeToday: u.oneTimeToday,
          oneTimeOverdue: u.oneTimeOverdue,
          dailyToday: u.dailyToday,
          recurringToday: u.recurringToday,
          recurringOverdue: u.recurringOverdue
        };
      });

      teamPendingCacheRef.current.set(cacheKey, {
        data: grouped,
        ts: Date.now()
      });
      return grouped;
    } catch {
      return {};
    }
  }, [user?.companyId]);


  const fetchTaskCounts = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      const params: any = {
        userId: user?.id,
        isAdmin: (user?.role === 'admin' || user?.role === 'manager') ? 'true' : 'false'
      };
      const cacheKey = `${params.userId || 'na'}:${params.isAdmin}:${startDate || 'all'}:${endDate || 'all'}`;
      const cached = countsCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < DASHBOARD_API_CACHE_TTL_MS) {
        return cached.data;
      }
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await axios.get(`${address}/api/dashboard/counts`, { params });
      countsCacheRef.current.set(cacheKey, {
        data: response.data,
        ts: Date.now()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching task counts:', error);
      return null;
    }
  }, [user?.id, user?.role]);

  const fetchPerformanceAnalytics = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      const params: any = {
        userId: user?.id,
        isAdmin: (user?.role === 'admin' || user?.role === 'manager') ? 'true' : 'false'
      };

      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await axios.get(`${address}/api/performance/analytics`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching performance analytics:', error);
      return null;
    }
  }, [user?.id, user?.role]);

  // New function to fetch individual member trend data
  const fetchMemberTrendData = useCallback(async (memberUsername: string, startDate?: string, endDate?: string) => {
    try {
      const params: any = {
        memberUsername,
        isAdmin: 'true'
      };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await axios.get(`${address}/api/performance/member-trend`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching member trend data:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        let analyticsPromise;
        let countsPromise;
        let performancePromise;

        if (viewMode === 'current') {
          // For current month view, use date filters
          const monthStart = startOfMonth(selectedMonth);
          const monthEnd = endOfMonth(selectedMonth);
          analyticsPromise = fetchDashboardAnalytics(monthStart.toISOString(), monthEnd.toISOString());
          countsPromise = fetchTaskCounts(monthStart.toISOString(), monthEnd.toISOString());
          performancePromise = fetchPerformanceAnalytics(monthStart.toISOString(), monthEnd.toISOString());
        } else {
          // For all-time view, fetch without date filters
          analyticsPromise = fetchDashboardAnalytics();
          countsPromise = fetchTaskCounts();
          performancePromise = fetchPerformanceAnalytics();
        }

        fetchTeamPendingTasks().then((teamPending) => {
          if (!cancelled) {
            setTeamPendingData(teamPending);
          }
        }).catch(() => {});

        const [analyticsData, countsData, performanceData] = await Promise.all([
          analyticsPromise,
          countsPromise,
          performancePromise
        ]);

        if (!cancelled) {
          setDashboardData(analyticsData);
          setTaskCounts(countsData);
          setTeamPerformance(performanceData?.teamPerformance || []);
        }

      } catch (error) {
        console.error('Error in loadData:', error);
        if (!cancelled) {
          setTeamPerformance([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (user?.id) {
      loadData();
    }

    return () => {
      cancelled = true;
    };
  }, [user, selectedMonth, viewMode, fetchDashboardAnalytics, fetchTaskCounts, fetchTeamPendingTasks, fetchPerformanceAnalytics]);

  useEffect(() => {
    if (showMonthFilter && monthListRef.current) {
      const selectedEl = monthListRef.current.querySelector(".selected-month");
      if (selectedEl) {
        selectedEl.scrollIntoView({
          block: "center",
          behavior: "instant",
        });
      }
    }
  }, [showMonthFilter]);

  useEffect(() => {
    if (!user?.companyId) return;

    axios
      .get(`${address}/api/settings/whatsapp`, {
        params: { companyId: user.companyId }
      })
      .then((res) => {
        const live = res.data?.enabled === true && Boolean(res.data?.activeProvider);
        setWhatsappIntegrationStatus({
          live,
          provider: live ? res.data?.activeProvider : null
        });
      })
      .catch(() => {
        setWhatsappIntegrationStatus({ live: false, provider: null });
      });
  }, [user?.companyId]);

  // Load member trend data when selected team member changes
  useEffect(() => {
    const loadMemberTrendData = async () => {
      if ((user?.role === 'admin' || user?.role === 'manager') && selectedTeamMember && selectedTeamMember !== 'all') {
        try {
          let memberTrendDataResult = null;

          if (viewMode === 'current') {
            const monthStart = startOfMonth(selectedMonth);
            const monthEnd = endOfMonth(selectedMonth);
            memberTrendDataResult = await fetchMemberTrendData(selectedTeamMember, monthStart.toISOString(), monthEnd.toISOString());
          } else {
            memberTrendDataResult = await fetchMemberTrendData(selectedTeamMember);
          }

          if (memberTrendDataResult) {
            setMemberTrendData(memberTrendDataResult);
          }
        } catch (error) {
          console.error('Error loading member trend data:', error);
        }
      }
    };

    loadMemberTrendData();
  }, [selectedTeamMember, viewMode, selectedMonth, fetchMemberTrendData, user?.role]);

  // --- Helper Functions ---
  const generateMonthOptions = () => {
    const options = [];
    const currentDate = new Date();

    for (let i = 5; i >= 1; i--) {
      options.push(subMonths(currentDate, i));
    }
    options.push(currentDate);
    for (let i = 1; i <= 5; i++) {
      options.push(addMonths(currentDate, i));
    }

    return options;
  };

  const monthOptions = generateMonthOptions();

  const statusColors = {
    pending: 'var(--color-warning)',
    completed: 'var(--color-success)',
    overdue: 'var(--color-error)',
    'in-progress': 'var(--color-primary)'
  };

  const statusData = dashboardData?.statusStats.map(item => ({
    name: item._id.charAt(0).toUpperCase() + item._id.slice(1),
    value: item.count,
    color: statusColors[item._id as keyof typeof statusColors] || 'var(--color-secondary)'
  })) || [];


  // Generate trend data to always show last 6 months including current month
  const generateTrendData = () => {
    const trendMonths: { month: string; completed: number; planned: number; }[] = [];
    const currentDate = new Date();

    // If a specific team member is selected and we have their data, use it
    if (selectedTeamMember !== 'all' && memberTrendData && memberTrendData.length > 0) {
      return memberTrendData;
    }

    // Otherwise use the overall team data
    // Generate last 6 months including current month
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(currentDate, i);
      const monthName = format(date, 'MMM');
      const monthNum = date.getMonth() + 1;
      const yearNum = date.getFullYear();

      const matchingCompletedData = dashboardData?.completionTrend?.find(item =>
        item._id.month === monthNum && item._id.year === yearNum
      );

      const matchingPlannedData = dashboardData?.plannedTrend?.find(item =>
        item._id.month === monthNum && item._id.year === yearNum
      );

      trendMonths.push({
        month: monthName,
        completed: matchingCompletedData?.count || 0,
        planned: matchingPlannedData?.count || 0,
      });
    }

    return trendMonths;
  };

  const trendData = generateTrendData();

  const displayData = taskCounts;

  // Updated taskTypeData to include quarterly
  const taskTypeData = [
    {
      name: 'One-time',
      value: displayData?.oneTimeTasks || 0,
      pending: displayData?.oneTimePending || 0,
      completed: displayData?.oneTimeCompleted || 0,
      color: 'var(--color-primary)'
    },
    {
      name: 'Daily',
      value: displayData?.dailyTasks || 0,
      pending: displayData?.dailyPending || 0,
      completed: displayData?.dailyCompleted || 0,
      color: 'var(--color-success)'
    },
    {
      name: 'Weekly',
      value: displayData?.weeklyTasks || 0,
      pending: displayData?.weeklyPending || 0,
      completed: displayData?.weeklyCompleted || 0,
      color: 'var(--color-warning)'
    },
    {
      name: 'Monthly',
      value: displayData?.monthlyTasks || 0,
      pending: displayData?.monthlyPending || 0,
      completed: displayData?.monthlyCompleted || 0,
      color: 'var(--color-accent)'
    },
    {
      name: 'Quarterly',
      value: displayData?.quarterlyTasks || 0,
      pending: displayData?.quarterlyPending || 0,
      completed: displayData?.quarterlyCompleted || 0,
      color: 'var(--color-info)'
    },
    {
      name: 'Yearly',
      value: displayData?.yearlyTasks || 0,
      pending: displayData?.yearlyPending || 0,
      completed: displayData?.yearlyCompleted || 0,
      color: 'var(--color-secondary)'
    }
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'assigned': return <Target size={16} style={{ color: 'var(--color-primary)' }} />;
      case 'completed': return <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />;
      case 'overdue': return <XCircle size={16} style={{ color: 'var(--color-error)' }} />;
      default: return <Activity size={16} style={{ color: 'var(--color-secondary)' }} />;
    }
  };

  // Get team members list for the dropdown
  const getTeamMembersList = () => {
    if ((user?.role !== 'admin' && user?.role !== 'manager') || !teamPerformance.length) return [];

    return teamPerformance.map(member => ({
      username: member.username,
      totalTasks: member.totalTasks,
      completionRate: member.totalTasks > 0 ? (member.completedTasks / member.totalTasks) * 100 : 0
    }));
  };

  const teamMembersList = getTeamMembersList();
  const selectedTeamMemberData = teamPerformance.find((member) => member.username === selectedTeamMember);
  const topTeamMembers = teamPerformance.slice(0, 4);

  const cardStyle = {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.80)' : 'rgba(255, 255, 255, 0.92)',
    borderColor: isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.18)',
    boxShadow: isDark ? '0 28px 80px rgba(2, 6, 23, 0.32)' : '0 28px 80px rgba(15, 23, 42, 0.08)',
    backdropFilter: 'blur(18px)'
  };

  const softCardStyle = {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.66)' : 'rgba(248, 250, 252, 0.95)',
    borderColor: isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.18)',
  };

  const periodLabel =
    viewMode === 'current'
      ? (isSameMonth(selectedMonth, new Date()) && isSameYear(selectedMonth, new Date())
          ? 'Current month'
          : format(selectedMonth, 'MMMM yyyy'))
      : 'All time';

  const totalStatus = statusData.reduce((sum, item) => sum + item.value, 0);
  const totalPlanned = trendData.reduce((sum, item) => sum + item.planned, 0);
  const totalCompleted = trendData.reduce((sum, item) => sum + item.completed, 0);
  const totalTaskTypes = taskTypeData.reduce((sum, item) => sum + item.value, 0);

  if (loading) {
    return (
      <div className="relative min-h-full overflow-hidden bg-[var(--color-background)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute left-0 top-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>
        <div className="relative z-10 space-y-6">
          <div className="h-56 animate-pulse rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)]/70" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)]/70"
              />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
            <div className="space-y-6">
              <div className="h-[420px] animate-pulse rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)]/70" />
              <div className="h-[300px] animate-pulse rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)]/70" />
            </div>
            <div className="space-y-6">
              <div className="h-[320px] animate-pulse rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)]/70" />
              <div className="h-[400px] animate-pulse rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)]/70" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData || !taskCounts) {
    return (
      <div className="relative min-h-full overflow-hidden bg-[var(--color-background)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute left-0 top-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>
        <div className="relative z-10 rounded-[32px] border px-6 py-10 text-center" style={cardStyle}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <BarChart3 size={28} className="text-[var(--color-primary)]" />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Dashboard unavailable</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--color-textSecondary)]">
            We could not load the live dashboard data right now. Please refresh the page or try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => navigate('/master-tasks')}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:translate-y-[-1px]"
          >
            Open tasks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-[var(--color-background)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute left-0 top-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: isDark
              ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.85) 1px, transparent 0)'
              : 'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.85) 1px, transparent 0)',
            backgroundSize: '28px 28px'
          }}
        />
      </div>

      <div className="relative z-10 space-y-6">
        <section className="rounded-[28px] border px-5 py-4 sm:px-6 sm:py-5 lg:px-7 lg:py-6" style={cardStyle}>
          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr] xl:items-start">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-textSecondary)]">
                <Sparkles size={12} />
                Command center
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-[2rem]">
                Welcome back, {user?.username || 'there'}
              </h1>
              {/* <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-textSecondary)] sm:text-[15px]">
                A cleaner snapshot of your workload, live activity, and delivery rhythm, rebuilt as a modern SaaS dashboard.
              </p> */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/75 px-3 py-1.5 text-xs font-semibold text-[var(--color-text)]">
                  <Calendar size={14} />
                  {periodLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/75 px-3 py-1.5 text-xs font-semibold text-[var(--color-text)]">
                  <Users size={14} />
                  {user?.role || 'user'}
                </span>
                {isPrivilegedUser && whatsappIntegrationStatus.live && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 shadow-sm shadow-emerald-500/10">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    <MessageSquare size={14} />
                    WhatsApp integration live now
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border p-3 sm:p-4" style={softCardStyle}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Quick filters
                </p>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-textSecondary)]">
                  <Calendar size={13} />
                  {periodLabel}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('current');
                    setSelectedMonth(new Date());
                  }}
                  className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition ${
                    viewMode === 'current'
                      ? 'bg-[var(--color-primary)] text-white shadow-lg'
                      : 'border border-[var(--color-border)] text-[var(--color-textSecondary)] hover:text-[var(--color-text)]'
                  }`}
                >
                  Current month
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('all-time')}
                  className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition ${
                    viewMode === 'all-time'
                      ? 'bg-[var(--color-primary)] text-white shadow-lg'
                      : 'border border-[var(--color-border)] text-[var(--color-textSecondary)] hover:text-[var(--color-text)]'
                  }`}
                >
                  All time
                </button>

                {viewMode === 'current' && (
                  <label className="inline-flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 text-sm text-[var(--color-text)] shadow-sm">
                    <Calendar size={15} className="shrink-0 text-[var(--color-textSecondary)]" />
                    <select
                      value={format(selectedMonth, 'yyyy-MM')}
                      onChange={(event) => setSelectedMonth(new Date(`${event.target.value}-01T00:00:00`))}
                      className="min-w-0 flex-1 bg-transparent outline-none"
                    >
                      {monthOptions.map((date) => {
                        const key = format(date, 'yyyy-MM');
                        return (
                          <option key={key} value={key}>
                            {format(date, 'MMMM yyyy')}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown size={14} className="shrink-0 text-[var(--color-textSecondary)]" />
                  </label>
                )}

                {/* <span className="inline-flex h-10 items-center rounded-full border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-textSecondary)]">
                  Team: {selectedTeamMember === 'all' ? 'All members' : selectedTeamMember}
                </span>
                <span className="inline-flex h-10 items-center rounded-full border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-textSecondary)]">
                  Updates: {dashboardData.recentActivity.length}
                </span> */}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Total tasks',
              value: taskCounts.totalTasks,
              icon: <CheckSquare size={20} />,
              key: 'total' as const,
              onClick: () => navigate('/master-tasks')
            },
            {
              label: 'Pending',
              value: taskCounts.pendingTasks,
              icon: <Clock size={20} />,
              key: 'pending' as const,
              onClick: () => navigate('/pending-tasks')
            },
            {
              label: 'Completed',
              value: taskCounts.completedTasks,
              icon: <CheckCircle size={20} />,
              key: 'completed' as const,
              onClick: () => navigate('/master-tasks')
            },
            {
              label: 'Overdue',
              value: taskCounts.overdueTasks,
              icon: <AlertTriangle size={20} />,
              key: 'overdue' as const,
              onClick: () => navigate('/pending-tasks')
            }
          ].map((item) => {
            const color = item.key === 'total' ? '#3b82f6' : item.key === 'pending' ? '#f59e0b' : item.key === 'completed' ? '#10b981' : '#ef4444';
            const toneBg = `${color}18`;
            const trendKey = item.key === 'total' ? taskCounts.trends?.totalTasks : item.key === 'pending' ? taskCounts.trends?.pendingTasks : item.key === 'completed' ? taskCounts.trends?.completedTasks : taskCounts.trends?.overdueTasks;
            const trendGood = item.key === 'pending' || item.key === 'overdue' ? trendKey?.direction === 'down' : trendKey?.direction === 'up';
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="rounded-[28px] border p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30"
                style={cardStyle}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: toneBg, color }}>
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">{item.label}</p>
                      <p className="mt-2 text-3xl font-semibold text-[var(--color-text)]">{item.value}</p>
                    </div>
                  </div>
                  {trendKey && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trendGood ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                      {trendKey.direction === 'up' ? <TrendingUp size={12} /> : <TrendingUp size={12} className="rotate-180" />}
                      {trendKey.direction === 'up' ? '+' : '-'}{trendKey.value}%
                    </span>
                  )}
                </div>
                <p className="mt-4 text-sm text-[var(--color-textSecondary)]">
                  {item.key === 'total' && 'All active work items in the selected scope'}
                  {item.key === 'pending' && 'Tasks waiting for action'}
                  {item.key === 'completed' && 'Tasks delivered successfully'}
                  {item.key === 'overdue' && `${taskCounts.overduePercentage.toFixed(1)}% of active tasks`}
                </p>
              </button>
            );
          })}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr] xl:items-start">
          <div className="space-y-6">
            <section className="rounded-[28px] border p-5 sm:p-6" style={cardStyle}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                    <TrendingUp size={12} />
                    Delivery curve
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">Planned vs completed</h2>
                  <p className="mt-2 text-sm text-[var(--color-textSecondary)]">Six-month momentum view for the selected period.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/75 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Completed</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{totalCompleted}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/75 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Planned</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{totalPlanned}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="plannedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="var(--color-textSecondary)" fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} stroke="var(--color-textSecondary)" fontSize={12} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      return (
                        <div className="rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl" style={cardStyle}>
                          <p className="text-sm font-semibold text-[var(--color-text)]">{label}</p>
                          <div className="mt-2 space-y-1">
                            {payload.map((entry: any) => (
                              <div key={entry.dataKey} className="flex items-center justify-between gap-8 text-sm">
                                <span className="text-[var(--color-textSecondary)]">{entry.name}</span>
                                <span className="font-semibold" style={{ color: entry.color }}>{entry.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }} />
                    <Area type="monotone" dataKey="planned" name="Planned" stroke="#3b82f6" strokeWidth={3} fill="url(#plannedFill)" dot={{ r: 4, stroke: 'var(--color-background)', strokeWidth: 2, fill: '#3b82f6' }} activeDot={{ r: 6, stroke: 'var(--color-background)', strokeWidth: 2, fill: '#3b82f6' }} />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={3} fill="url(#completedFill)" dot={{ r: 4, stroke: 'var(--color-background)', strokeWidth: 2, fill: '#10b981' }} activeDot={{ r: 6, stroke: 'var(--color-background)', strokeWidth: 2, fill: '#10b981' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-[28px] border p-5 sm:p-6" style={cardStyle}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                    <BarChart3 size={12} />
                    Task mix
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">Workload by cadence</h2>
                </div>
                <div className="text-sm text-[var(--color-textSecondary)]">{totalTaskTypes} tasks across six cadences</div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {taskTypeData.map((item) => {
                  const percent = totalTaskTypes > 0 ? (item.value / totalTaskTypes) * 100 : 0;
                  return (
                    <div key={item.name} className="rounded-[24px] border border-[var(--color-border)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-text)]">{item.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-textSecondary)]">{percent.toFixed(1)}% of total workload</p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${item.color}18`, color: item.color }}>
                          <Target size={18} />
                        </div>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(percent, 2)}%`, backgroundColor: item.color }} />
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm">
                        <span className="text-[var(--color-textSecondary)]">Total</span>
                        <span className="font-semibold text-[var(--color-text)]">{item.value}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-textSecondary)]">
                        <span>Pending {item.pending}</span>
                        <span>Completed {item.completed}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {isPrivilegedUser && (
              <section className="rounded-[28px] border p-5 sm:p-6" style={cardStyle}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                    <Activity size={12} />
                    Recent activity
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">Latest updates</h2>
                </div>
                <div className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-textSecondary)]">
                  Last {Math.min(dashboardData.recentActivity?.slice(0, 10).length || 0, 10)}
                </div>
              </div>
              <div className="mt-5 h-[405px] space-y-3 overflow-y-auto pr-1">
                {dashboardData?.recentActivity?.slice(0, 10).length ? (
                  dashboardData.recentActivity.slice(0, 10).map((activity) => (
                    <div key={activity._id} className="rounded-[22px] border border-[var(--color-border)] px-4 py-4 transition hover:border-[var(--color-primary)]/30">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                          style={{
                            backgroundColor:
                              activity.type === 'completed'
                                ? '#10b9811a'
                                : activity.type === 'overdue'
                                  ? '#ef44441a'
                                  : '#3b82f61a',
                            color:
                              activity.type === 'completed'
                                ? '#10b981'
                                : activity.type === 'overdue'
                                  ? '#ef4444'
                                  : '#3b82f6'
                          }}
                        >
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[var(--color-text)]">
                            {(user?.role === 'admin' || user?.role === 'manager') ? (
                              <>
                                <span className="font-semibold">{activity.username}</span>
                                <span className="mx-1 text-[var(--color-textSecondary)]">
                                  {activity.type === 'assigned' && 'was assigned'}
                                  {activity.type === 'completed' && 'completed'}
                                  {activity.type === 'overdue' && 'has overdue'}
                                </span>
                                <span className="font-semibold">{activity.title}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[var(--color-textSecondary)]">
                                  {activity.type === 'assigned' && 'You were assigned'}
                                  {activity.type === 'completed' && 'You completed'}
                                  {activity.type === 'overdue' && 'You have overdue'}
                                </span>
                                <span className="mx-1 font-semibold">{activity.title}</span>
                              </>
                            )}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-textSecondary)]">
                            <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1">{activity.taskType}</span>
                            <span>{format(new Date(activity.date), 'MMM d, h:mm a')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
                    <Activity size={32} className="mx-auto text-[var(--color-textSecondary)]" />
                    <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">No recent activity</p>
                    <p className="mt-1 text-xs text-[var(--color-textSecondary)]">Task updates will appear here as work moves.</p>
                  </div>
                )}
              </div>
              </section>
            )}
          </div>

          <div className="space-y-6">
            {(user?.role === 'admin' || user?.role === 'manager') && (
              <section className="flex h-[360px] flex-col rounded-[28px] border p-5 sm:p-6" style={cardStyle}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                      <Users size={12} />
                      Team lens
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">Team performance focus</h2>
                    <p className="mt-2 text-sm text-[var(--color-textSecondary)]">
                      Switch between team members and inspect the current rhythm without leaving the dashboard.
                    </p>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTeamMemberFilter((value) => !value)}
                      className="inline-flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-3 text-sm font-semibold text-[var(--color-text)] shadow-sm transition hover:border-[var(--color-primary)]/30"
                    >
                      <Users size={16} className="text-[var(--color-textSecondary)]" />
                      <span>{selectedTeamMember === 'all' ? 'All team' : selectedTeamMember}</span>
                      <ChevronDown size={14} className="text-[var(--color-textSecondary)]" />
                    </button>

                    {showTeamMemberFilter && (
                      <div className="absolute right-0 top-full z-20 mt-2 w-[280px] overflow-hidden rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
                        <div className="h-72 overflow-y-auto p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTeamMember('all');
                              setShowTeamMemberFilter(false);
                            }}
                            className={`mb-1 w-full rounded-2xl px-3 py-3 text-left transition ${
                              selectedTeamMember === 'all'
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'hover:bg-[var(--color-background)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">All team</p>
                                <p className="text-xs opacity-80">Whole company performance</p>
                              </div>
                              <span className="text-xs opacity-80">{teamPerformance.length}</span>
                            </div>
                          </button>

                          {teamMembersList.map((member, index) => (
                            <button
                              key={member.username}
                              type="button"
                              onClick={() => {
                                setSelectedTeamMember(member.username);
                                setShowTeamMemberFilter(false);
                              }}
                              className={`mb-1 w-full rounded-2xl px-3 py-3 text-left transition ${
                                selectedTeamMember === member.username
                                  ? 'bg-[var(--color-primary)] text-white'
                                  : 'hover:bg-[var(--color-background)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold">{member.username}</p>
                                  <p className="text-xs opacity-80">
                                    {member.totalTasks} tasks, {member.completionRate.toFixed(1)}% complete
                                  </p>
                                </div>
                                <span className="text-xs opacity-80">#{index + 1}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {selectedTeamMember !== 'all' && selectedTeamMemberData && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Tasks</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{selectedTeamMemberData.totalTasks}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Completed</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{selectedTeamMemberData.completedTasks}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Rate</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--color-text)]">{selectedTeamMemberData.totalPerformanceRate}%</p>
                    </div>
                  </div>
                )}

                <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {topTeamMembers.length > 0 ? (
                    topTeamMembers.map((member) => {
                      const barWidth = Math.max(member.totalPerformanceRate, 8);
                      return (
                        <div key={member.username} className="rounded-[20px] border border-[var(--color-border)] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-text)]">{member.username}</p>
                              <p className="text-xs text-[var(--color-textSecondary)]">
                                {member.totalTasks} tasks, {member.completionRate.toFixed(1)}% completion
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-[var(--color-text)]">{member.totalPerformanceRate}%</span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-cyan-500"
                              style={{ width: `${Math.min(barWidth, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-6 py-8 text-center text-sm text-[var(--color-textSecondary)]">
                      Team performance data will appear here once the analytics endpoint loads.
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-[28px] border p-5 sm:p-6" style={cardStyle}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                    <PieChartIcon size={12} />
                    Status breakdown
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">Live task states</h2>
                </div>
                <div className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-textSecondary)]">{totalStatus} total</div>
              </div>
              {totalStatus > 0 ? (
                <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={96} paddingAngle={2}>
                          {statusData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const item = payload[0].payload as { name: string; value: number; color: string };
                          return (
                            <div className="rounded-2xl border px-4 py-3 shadow-2xl" style={cardStyle}>
                              <p className="text-sm font-semibold text-[var(--color-text)]">{item.name}</p>
                              <p className="mt-1 text-sm" style={{ color: item.color }}>{item.value}</p>
                            </div>
                          );
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {statusData.map((item) => {
                      const percent = totalStatus > 0 ? (item.value / totalStatus) * 100 : 0;
                      return (
                        <div key={item.name} className="rounded-[20px] border border-[var(--color-border)] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-sm font-semibold text-[var(--color-text)]">{item.name}</span>
                            </div>
                            <span className="text-sm font-semibold text-[var(--color-text)]">{item.value}</span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(percent, 2)}%`, backgroundColor: item.color }} />
                          </div>
                          <p className="mt-2 text-xs text-[var(--color-textSecondary)]">{percent.toFixed(1)}% of status total</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-textSecondary)]">
                  No status data is available for the selected period.
                </div>
              )}
            </section>

            {!isPrivilegedUser && (
              <section className="flex h-[600px] flex-col rounded-[28px] border p-5 sm:p-6" style={cardStyle}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                      <Activity size={12} />
                      Recent activity
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">Latest updates</h2>
                  </div>
                  <div className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-textSecondary)]">
                    Last {Math.min(dashboardData.recentActivity?.slice(0, 10).length || 0, 10)}
                  </div>
                </div>
                <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {dashboardData?.recentActivity?.slice(0, 10).length ? (
                    dashboardData.recentActivity.slice(0, 10).map((activity) => (
                      <div key={activity._id} className="rounded-[22px] border border-[var(--color-border)] px-4 py-4 transition hover:border-[var(--color-primary)]/30">
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                            style={{
                              backgroundColor:
                                activity.type === 'completed'
                                  ? '#10b9811a'
                                  : activity.type === 'overdue'
                                    ? '#ef44441a'
                                    : '#3b82f61a',
                              color:
                                activity.type === 'completed'
                                  ? '#10b981'
                                  : activity.type === 'overdue'
                                    ? '#ef4444'
                                    : '#3b82f6'
                            }}
                          >
                            {getActivityIcon(activity.type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--color-text)]">
                              <span className="text-[var(--color-textSecondary)]">
                                {activity.type === 'assigned' && 'You were assigned'}
                                {activity.type === 'completed' && 'You completed'}
                                {activity.type === 'overdue' && 'You have overdue'}
                              </span>
                              <span className="mx-1 font-semibold">{activity.title}</span>
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-textSecondary)]">
                              <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1">{activity.taskType}</span>
                              <span>{format(new Date(activity.date), 'MMM d, h:mm a')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
                      <Activity size={32} className="mx-auto text-[var(--color-textSecondary)]" />
                      <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">No recent activity</p>
                      <p className="mt-1 text-xs text-[var(--color-textSecondary)]">Task updates will appear here as work moves.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {isPrivilegedUser && (
              <section className="rounded-[28px] border p-5 sm:p-6" style={cardStyle}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                      <Activity size={12} />
                      Team pending
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--color-text)]">Pending work by member</h2>
                    <p className="mt-2 text-sm text-[var(--color-textSecondary)]">
                      A quick view of today&apos;s pending and overdue items.
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <TeamPendingTasksChart teamPendingData={teamPendingData} user={user} />
                </div>
              </section>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
