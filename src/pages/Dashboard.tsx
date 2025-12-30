import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import {
  CheckSquare, Clock, AlertTriangle, TrendingUp, Calendar,
  Target, Activity, CheckCircle, XCircle, Timer,
  ChevronDown, Star, Zap, BarChart3,
  PieChart as PieChartIcon, Users, RotateCcw, ClipboardCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isThisMonth, isSameMonth, isSameYear } from 'date-fns';
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
// window.scrollTo({ top: scrollPosition, behavior: 'instant' });

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  useTheme();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [taskCounts, setTaskCounts] = useState<TaskCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showMonthFilter, setShowMonthFilter] = useState(false);
  const [viewMode, setViewMode] = useState<'current' | 'all-time'>('current');

  // New states for team member selection
  const [selectedTeamMember, setSelectedTeamMember] = useState<string>('all');
  const [showTeamMemberFilter, setShowTeamMemberFilter] = useState(false);
  const [memberTrendData, setMemberTrendData] = useState<any[]>([]);
  const [teamPendingData, setTeamPendingData] = useState<TeamPendingData>({});
  const monthListRef = React.useRef<HTMLDivElement>(null);
  const [openSelector, setOpenSelector] = useState<string | null>(null);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [adminApprovalEnabled, setAdminApprovalEnabled] = useState(false);


  const handleCardClick = (card: string) => {
    setOpenSelector(openSelector === card ? null : card);
  };

  const navigate = useNavigate();

  const goToPage = (type: string, category: string) => {
    setOpenSelector(null);

    if (category === "total") {
      navigate(type === "single" ? "/master-tasks" : "/master-recurring");
    }
    if (category === "pending") {
      navigate(type === "single" ? "/pending-tasks" : "/pending-recurring");
    }
    if (category === "completed") {
      navigate(type === "single" ? "/master-tasks" : "/master-recurring");
    }
    if (category === "overdue") {
      navigate(type === "single" ? "/pending-tasks" : "/pending-recurring");
    }
  };

  const canOpenApprovalPage =
    user &&
    (user.role === 'admin' ||
      (user.role === 'manager' && user.permissions?.canManageApproval));

  const ThemeCard = ({ children, className = "", variant = "default", hover = true, onClick }: {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'glass' | 'elevated' | 'bordered';
    hover?: boolean;
    onClick?: () => void;
  }) => {
    const baseClasses = "relative transition-all duration-300 ease-out";

    const variants = {
      default: `rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg`,
      glass: `rounded-2xl bg-[var(--color-surface)]/80 backdrop-blur-xl border border-[var(--color-border)] shadow-xl`,
      elevated: `rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl`,
      bordered: `rounded-2xl bg-[var(--color-primary)]/10 border-2 border-[var(--color-primary)]/20`
    };

    const hoverClasses = hover ? "hover:shadow-xl hover:scale-[1.02] hover:border-[var(--color-primary)]/30" : "";

    return (
      <div onClick={onClick}
        className={`${baseClasses} ${variants[variant]} ${hoverClasses} ${className}`}>
        {children}
      </div>
    );
  };

  // --- MetricCard Component with Real Trends ---
  const MetricCard = ({
    icon,
    title,
    slug,
    value,
    subtitle,
    sparklineData,
    isMain = false,
    pendingValue,
    completedValue,
    valueColor,
    onClick,
  }: {
    icon: React.ReactNode;
    title: string;
    slug?: string;
    value: string | number;
    subtitle?: string;
    percentage?: number;
    sparklineData?: number[];
    isMain?: boolean;
    pendingValue?: number;
    completedValue?: number;
    valueColor?: string;
    onClick?: () => void;
  }) => {


    return (
      <div className="relative">
        <ThemeCard
          onClick={
            onClick
              ? onClick
              : slug
                ? () => handleCardClick(title)
                : undefined
          }
          className={`p-2 sm:p-3 rounded-xl transition-shadow duration-300 hover:shadow-lg ${isMain ? "col-span-2" : ""
            }`}
          variant="glass"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            {/* Left: Icon + Title */}
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-xl ring-1 ring-white/10 shadow-md backdrop-blur"
                style={{
                  backgroundColor: `var(--color-primary)12`,
                  boxShadow: `0 4px 14px var(--color-primary)25`
                }}
              >
                <div
                  className="w-6 h-6 flex items-center justify-center"
                  style={{ color: "var(--color-primary)" }}
                >
                  {icon}
                </div>
              </div>

              <p className="text-xl font-semibold text-[var(--color-text)] truncate">{title}</p>
            </div>

            {/* Right: Value */}
            <p
              className="text-xl font-bold text-right leading-tight mr-2"
              style={{ color: valueColor || "var(--color-text)" }}
            >
              {value}
            </p>
          </div>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-sm text-[var(--color-textSecondary)] ml-10 mb-2">{subtitle}</p>
          )}

          {/* Percentage Bar
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-[var(--color-textSecondary)] flex items-center gap-1">
            <Activity size={14} className="text-blue-500" />
          </span>
          <span className="text-xs font-bold" style={{ color: "var(--color-primary)" }}>
            {(safePercentage ?? 0).toFixed(1)}%
          </span>
        </div>

        <div className="w-full h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${Math.min(safePercentage ?? 0, 100)}%`,
              backgroundColor: "var(--color-primary)"
            }}
          />
        </div>
      </div> */}

          {/* Pending / Completed */}
          {(pendingValue !== undefined || completedValue !== undefined) && (
            <div className="flex justify-between text-[11px] text-[var(--color-textSecondary)] pt-2 border-t border-[var(--color-border)]">
              {pendingValue !== undefined && (
                <div className="flex items-center ml-3 sm:ml-0 gap-1">
                  <Clock size={13} style={{ color: "#04b9ddff" }} />
                  <span className="text-xs font-bold text-[#04b9ddff]">{pendingValue}</span>
                </div>
              )}

              {completedValue !== undefined && (
                <div className="flex items-center mr-3 sm:mr-0 gap-1">
                  <CheckCircle size={13} style={{ color: "#5b88dbff" }} />
                  <span className="text-xs font-bold text-[#5b88dbff]">{completedValue}</span>
                </div>
              )}
            </div>
          )}

          {/* Sparkline */}
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-3 h-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData.map((v, i) => ({ value: v, index: i }))}>
                  <defs>
                    <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-primary)"
                    strokeWidth={1.5}
                    fill={`url(#gradient-${title})`}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ThemeCard>
        {openSelector === title && slug && (
          <div
            className="
          absolute 
          left-1/2 
          -translate-x-1/2 
          top-[102%]
          bg-[var(--color-surface)]
          border
          border-[var(--color-border)]
          shadow-xl 
          rounded-xl 
          p-3 
          z-[9999]
          w-44
        "
          >
            <p className="text-sm font-semibold mb-2">Choose Type</p>

            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPage("single", slug);
              }}
              className="block w-full text-left px-3 py-2 hover:bg-[var(--color-chat)] rounded-lg"
            >
              Single Tasks
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPage("recurring", slug);
              }}
              className="block w-full text-left px-3 py-2 hover:bg-[var(--color-chat)] rounded-lg"
            >
              Recurring Tasks
            </button>
          </div>
        )}
      </div>
    );
  };


  // --- CustomTooltip Component (kept as is, good utility component) ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <ThemeCard className="p-3" variant="elevated" hover={false}>
          <p className="text-sm font-semibold text-[var(--color-text)] mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: <span className="font-bold">{entry.value}</span>
            </p>
          ))}
        </ThemeCard>
      );
    }
    return null;
  };

  // --- Core Data Fetching Logic ---
  // Using useCallback for memoization of fetch functions
  const fetchDashboardAnalytics = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      const params: any = {
        userId: user?.id,
        isAdmin: (user?.role === "admin" || user?.role === "manager") ? "true" : "false"
      };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await axios.get(`${address}/api/dashboard/analytics`, { params });
      return response.data;
    } catch (error) {
      return null;
    }
  }, []);

  const fetchTeamPendingTasks = useCallback(async () => {
    try {
      if (!user?.companyId) return {};

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

      return grouped;
    } catch {
      return {};
    }
  }, []);


  const memoTeamPendingData = useMemo(() => teamPendingData, [teamPendingData]);

  const fetchTaskCounts = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      const params: any = {
        userId: user?.id,
        isAdmin: (user?.role === 'admin' || user?.role === 'manager') ? 'true' : 'false'
      };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await axios.get(`${address}/api/dashboard/counts`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching task counts:', error);
      return null;
    }
  }, []);

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

      const response = await axios.get(`${address}/api/dashboard/member-trend`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching member trend data:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        let analyticsData = null;
        let countsData = null;

        if (viewMode === 'current') {
          // For current month view, use date filters
          const monthStart = startOfMonth(selectedMonth);
          const monthEnd = endOfMonth(selectedMonth);
          analyticsData = await fetchDashboardAnalytics(monthStart.toISOString(), monthEnd.toISOString());
          countsData = await fetchTaskCounts(monthStart.toISOString(), monthEnd.toISOString());
        } else {
          // For all-time view, fetch without date filters
          analyticsData = await fetchDashboardAnalytics();
          countsData = await fetchTaskCounts();
        }

        setDashboardData(analyticsData);
        setTaskCounts(countsData);


      } catch (error) {
        console.error('Error in loadData:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      loadData();
    }
  }, [user, selectedMonth, viewMode]);

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
      .get(`${address}/api/settings/admin-approval?companyId=${user.companyId}`)
      .then(res => {
        setAdminApprovalEnabled(res.data.enabled === true);
      })
      .catch(() => setAdminApprovalEnabled(false));

  }, [user?.companyId]);

  useEffect(() => {
    if (!user?.companyId || !adminApprovalEnabled) return;

    axios
      .get(`${address}/api/tasks/pending-approval-count`, {
        params: {
          companyId: user.companyId,
          userId: user.id,
          role: user.role
        }
      })
      .then(res => {
        setPendingApprovalCount(res.data.count || 0);
      })
      .catch(() => setPendingApprovalCount(0));

  }, [user, adminApprovalEnabled]);

  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;

    const idleLoad = async () => {
      const data = await fetchTeamPendingTasks();
      if (isMounted) setTeamPendingData(data);
    };

    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(idleLoad);
      return () => {
        isMounted = false;
        cancelIdleCallback?.(id);
      };
    } else {
      const timeout = setTimeout(idleLoad, 300);
      return () => {
        isMounted = false;
        clearTimeout(timeout);
      };
    };
  }, [user?.id]);


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

  const gridColsClass = adminApprovalEnabled
    ? "xl:grid-cols-5"
    : "xl:grid-cols-4";

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
    if (!dashboardData?.teamPerformance || (user?.role !== 'admin' && user?.role === 'manager')) return [];

    return dashboardData.teamPerformance.map(member => ({
      username: member.username,
      totalTasks: member.totalTasks,
      completionRate: member.totalTasks > 0 ? (member.completedTasks / member.totalTasks) * 100 : 0
    }));
  };

  const teamMembersList = getTeamMembersList();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto mb-4"></div>
          <p className="text-[var(--color-textSecondary)]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--color-background)] p-6 space-y-6">
      {/* Professional Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-6 lg:space-y-0">
        <div className="flex items-center space-x-6">
          <div className="p-3 rounded-xl shadow-xl" style={{ background: `linear-gradient(135deg,  #6a11cb 0%, #2575fc 100%)` }}>
            <BarChart3 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)] mb-2">
              Analytics Dashboard
            </h1>
            <p className="text-xs text-[var(--color-textSecondary)]">
              Welcome back, <span className="font-bold text-[var(--color-text)]">{user?.username}</span>!
              {(user?.role === 'admin' || user?.role === 'manager') ? ' Team performance overview' : ' Here\'s your performance overview'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 w-full sm:w-auto"> {/* Adjusted for mobile stacking */}
          {/* View Mode Toggle */}
          <ThemeCard className="p-1 w-full sm:w-auto" variant="bordered" hover={false}> {/* Full width on mobile */}
            <div className="flex items-center justify-center"> {/* Centered buttons on mobile */}
              <button
                onClick={() => {
                  setViewMode('current');
                  setSelectedMonth(new Date());
                }}
                className={`px-2 py-2 rounded-xl text-xs font-semibold transition-all duration-200 w-1/2 sm:w-auto ${ /* Half width on mobile */
                  viewMode === 'current'
                    ? 'bg-[#3a2ee2ff]  text-white shadow-md'
                    : 'text-[var(--color-textSecondary)] hover:text-[var(--color-text)]'
                  }`}
              >
                Current Month
              </button>
              <button
                onClick={() => setViewMode('all-time')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 w-1/2 sm:w-auto ${ /* Half width on mobile */
                  viewMode === 'all-time'
                    ? 'bg-[#3a2ee2ff] text-white shadow-md'
                    : 'text-[var(--color-textSecondary)] hover:text-[var(--color-text)]'
                  }`}
              >
                All Time
              </button>
            </div>
          </ThemeCard>

          {/* Month Filter - Visible only in 'current' view mode */}
          {viewMode === 'current' && (
            <div className="relative z-10 w-full sm:w-auto"> {/* Full width on mobile */}
              <button
                onClick={() => setShowMonthFilter(!showMonthFilter)}
                className="flex items-center justify-center px-2 py-2 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-lg hover:shadow-xl transition-all duration-200 text-[var(--color-text)] font-md w-full" /* Full width on mobile, centered content */
              >
                <Calendar size={16} className="mr-3" />
                <span>
                  {isSameMonth(selectedMonth, new Date()) && isSameYear(selectedMonth, new Date())
                    ? 'Current Month'
                    : format(selectedMonth, 'MMMM yyyy')}
                </span>
                <ChevronDown size={16} className="ml-3" />
              </button>
              {showMonthFilter && (
                <div className="absolute left-0 right-0 top-full mt-2 w-full sm:w-52 z-20"> {/* Adjusted for full width on mobile, right-0 added for better positioning */}
                  <ThemeCard className="p-3 max-h-80 overflow-y-auto" variant="elevated" hover={false}>
                    <div ref={monthListRef} className="space-y-2">
                      {monthOptions.map((date, index) => {
                        const isSelected = format(date, 'yyyy-MM') === format(selectedMonth, 'yyyy-MM');
                        const isCurrent = isThisMonth(date);
                        return (
                          <button
                            key={index}
                            onClick={() => {
                              setSelectedMonth(date);
                              setShowMonthFilter(false);
                            }}
                            className={`w-full text-left px-2 py-3 rounded-xl transition-all duration-200 ${isSelected
                              ? 'selected-month bg-[#3a2ee2ff] text-white shadow-lg'
                              : 'hover:bg-[var(--color-border)] text-[var(--color-text)]'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{format(date, 'MMMM yyyy')}</span>
                              <div className="flex items-center space-x-0">
                                {isCurrent && (
                                  <div className="w-2 h-2 bg-[var(--color-success)] rounded-full"></div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ThemeCard>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Metrics Grid with Real Trends */}
      <div
        className={`
    grid grid-cols-1
    sm:grid-cols-2
    md:grid-cols-3
    lg:grid-cols-4
    ${gridColsClass}
    gap-4 sm:gap-6 lg:gap-8
    p-4 sm:p-2 lg:p-4
  `}
      >
        <MetricCard
          icon={<CheckSquare size={24} className="text-green-600" />}
          title="Total Tasks"
          slug="total"
          value={displayData?.totalTasks || 0}
          valueColor="#1f8825ff"
          subtitle={
            viewMode === 'current' && isSameMonth(selectedMonth, new Date()) && isSameYear(selectedMonth, new Date())
              ? 'Current Month'
              : viewMode === 'current'
                ? format(selectedMonth, 'MMMM yyyy')
                : 'All time'
          }
        />

        <MetricCard
          icon={<Clock size={24} className="text-cyan-500" />}
          title="Pending"
          slug="pending"
          value={displayData?.pendingTasks || 0}
          valueColor="#04b9ddff"
          subtitle="Awaiting completion"
        />

        <MetricCard
          icon={<CheckCircle size={24} className="text-blue-500" />}
          title="Completed"
          slug="completed"
          value={displayData?.completedTasks || 0}
          valueColor="#5b88dbff"
          subtitle="Successfully finished"
        />

        <MetricCard
          icon={<AlertTriangle size={24} className="text-red-500" />}
          title="Overdue"
          slug="overdue"
          value={displayData?.overdueTasks || 0}
          valueColor="#ef4444"
          subtitle={`${displayData?.overduePercentage?.toFixed(1)}% of total`}
        />

        {adminApprovalEnabled && user && (
          <MetricCard
            icon={<ClipboardCheck size={24} className="text-purple-600" />}
            title="Approval Due"
            value={pendingApprovalCount}
            valueColor="#7c3aed"
            subtitle="Tasks waiting for approval"
            onClick={
              canOpenApprovalPage
                ? () => navigate('/for-approval')
                : undefined
            }
          />
        )}
      </div>

      {/* Task Type Distribution - Now includes quarterly and updated to 6 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5 lg:gap-6 p-4 sm:p-2 lg:p-4">
        {taskTypeData.map((type) => (
          <MetricCard
            key={type.name}
            icon={
              type.name === 'One-time' ? <Target size={18} className="text-blue-600" /> :
                type.name === 'Daily' ? <Zap size={18} className="text-yellow-500" /> :
                  type.name === 'Weekly' ? <Calendar size={18} className="text-green-500" /> :
                    type.name === 'Monthly' ? <Timer size={18} className="text-purple-500" /> :
                      type.name === 'Quarterly' ? <RotateCcw size={18} className="text-orange-500" /> :
                        <Star size={18} className="text-gray-500" />
            }
            title={type.name}
            value={type.value}
            subtitle={`${((type.value / (displayData?.totalTasks || 1)) * 100).toFixed(1)}% of total`}
            percentage={(type.value / (displayData?.totalTasks || 1)) * 100}
            pendingValue={type.pending}
            completedValue={type.completed}
          />
        ))}
      </div>

      {/* Enhanced Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        {/* Task Status Distribution - Enhanced Pie Chart */}
        <ThemeCard className="p-4 sm:p-8 lg:col-span-3" variant="glass">
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2">
              <div className="flex items-center space-x-3">
                <div className="p-3 rounded-2xl text-white" style={{ background: `linear-gradient(135deg,  #6a11cb 0%, #2575fc 100%)` }}>
                  <PieChartIcon size={20} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
                    {(user?.role === 'admin' || user?.role === 'manager') ? 'Team Task Status' : 'Your Task Status'}
                  </h3>
                  <p className="text-xs text-[var(--color-textSecondary)]">
                    {(user?.role === 'admin' || user?.role === 'manager') ? 'Team distribution' : 'Your current distribution'}
                  </p>
                </div>
              </div>
              <div className="text-sm px-3 py-1.5 rounded-full font-bold whitespace-nowrap" style={{ backgroundColor: 'var(--color-primary)20', color: 'var(--color-primary)' }}>
                {statusData.reduce((sum, item) => sum + item.value, 0)} Total
              </div>
            </div>

            {/* Professional Pie Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <defs>
                  {/* Pending - Professional Amber */}
                  <linearGradient id="statusGrad-0" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00d4ff" stopOpacity={1} />
                    <stop offset="100%" stopColor="#a940f0ff" stopOpacity={1} />
                  </linearGradient>

                  {/* In Progress - Professional Blue */}
                  <linearGradient id="statusGrad-1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#A940F0" stopOpacity={1} />
                    <stop offset="100%" stopColor="#FF4FD3" stopOpacity={1} />
                  </linearGradient>

                  {/* Completed - Professional Green */}
                  <linearGradient id="statusGrad-2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7a36e9ff" stopOpacity={1} />
                    <stop offset="100%" stopColor="#592ca1ff" stopOpacity={1} />
                  </linearGradient>

                  <linearGradient id="statusGrad-3" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#2f9ad8ff" stopOpacity={1} />
                    <stop offset="100%" stopColor="#10718aff" stopOpacity={1} />
                  </linearGradient>

                  {/* Subtle Shadow */}
                  <filter id="subtleShadow">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
                  </filter>
                </defs>

                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                    const RADIAN = Math.PI / 180;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);

                    return (
                      <text
                        x={x}
                        y={y}
                        fill="white"
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fontSize: window.innerWidth > 640 ? '15px' : '13px',
                          fontWeight: '700',
                          textShadow: '0 1px 3px rgba(0,0,0,0.3)'
                        }}
                      >
                        {`${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}
                  outerRadius={window.innerWidth > 640 ? 125 : 95}
                  innerRadius={window.innerWidth > 640 ? 75 : 55}
                  dataKey="value"
                  stroke="var(--color-background)"
                  strokeWidth={3}
                  paddingAngle={2}
                  animationBegin={0}
                  animationDuration={800}
                  style={{ filter: 'url(#subtleShadow)' }}
                >
                  {statusData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`url(#statusGrad-${index})`}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Clean, Professional Legend */}
            <div className="mt-2 flex flex-wrap justify-center gap-1">
              {statusData.map((entry, index) => {
                const colors = [
                  { primary: '#516ff8ff', light: '#FEF3C7' },
                  { primary: '#c13bf6ff', light: '#DBEAFE' },
                  { primary: '#916fc7ff', light: '#D1FAE5' },
                  { primary: '#49b2ccff', light: '#D1FAE5' },
                ];

                const percentage = ((entry.value / statusData.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(0);

                return (
                  <div
                    key={index}
                    className="flex items-center space-x-3 px-3 py-1 rounded-lg transition-all duration-200 hover:scale-105"

                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: colors[index].primary }}
                    ></div>
                    <span className="text-sm font-semibold text-[var(--color-text)]">
                      {entry.name}
                    </span>
                    <span
                      className="text-lg font-bold ml-2"
                      style={{ color: colors[index].primary }}
                    >
                      {entry.value}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text)]">
                      ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </ThemeCard>

        {/* Task Type Breakdown - Enhanced Bar Chart */}
        <ThemeCard className="p-6 sm:p-8 lg:col-span-7" variant="glass">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3">
            <div className="flex items-center space-x-3">
              <div
                className="p-3 rounded-2xl text-white"
                style={{ background: `linear-gradient(135deg,  #6a11cb 0%, #2575fc 100%)` }}
              >
                <BarChart3 size={22} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
                  {(user?.role === 'admin' || user?.role === 'manager')
                    ? 'Team Pending Tasks'
                    : 'Your Pending Tasks'}
                </h3>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  {(user?.role === 'admin' || user?.role === 'manager')
                    ? 'A quick view of each team member’s today pending and overdue tasks.'
                    : 'A quick view of your today pending and overdue tasks.'}
                </p>
              </div>
            </div>
          </div>

          {user && (
            <TeamPendingTasksChart
              teamPendingData={memoTeamPendingData}
              user={user}
            />
          )}
        </ThemeCard>


      </div>
      {/* Enhanced Completion Trend and Recent Activity - Split 7:3 for non-admin users */}
      <div className={`grid grid-cols-1 gap-8 xl:grid-cols-10`}>
        {/* Completion Trend */}
        <ThemeCard className="p-4 sm:p-8 xl:col-span-7" variant="glass">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="p-4 rounded-3xl text-white" style={{ background: `linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)` }}>
                  <TrendingUp size={24} />
                </div>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text)] mb-1">
                  {(user?.role === 'admin' || user?.role === 'manager') ? 'Team Completion Trend' : 'Your Completion Trend'}
                </h3>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  {(user?.role === 'admin' || user?.role === 'manager') ? 'Team performance insights over the last 6 months' : 'Your performance insights over the last 6 months'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
              {(user?.role === 'admin' || user?.role === 'manager') && teamMembersList.length > 0 && (
                <div className="relative z-10 w-full sm:w-auto">
                  <button
                    onClick={() => setShowTeamMemberFilter(!showTeamMemberFilter)}
                    className="flex items-center justify-center px-4 py-2 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-lg hover:shadow-xl transition-all duration-200 text-[var(--color-text)] font-semibold w-full"
                  >
                    <Users size={16} className="mr-2" />
                    <span>
                      {selectedTeamMember === 'all' ? 'All Team' : selectedTeamMember}
                    </span>
                    <ChevronDown size={16} className="ml-2" />
                  </button>
                  {showTeamMemberFilter && (
                    <div className="absolute left-0 right-0 top-full mt-2 w-full sm:w-64 z-20">
                      <ThemeCard className="p-3 max-h-80 overflow-y-auto" variant="elevated" hover={false}>
                        <div ref={monthListRef} className="space-y-2">
                          <button
                            onClick={() => {
                              setSelectedTeamMember('all');
                              setShowTeamMemberFilter(false);
                            }}
                            className={`w-full text-left px-3 py-3 rounded-xl transition-all duration-200 ${selectedTeamMember === 'all'
                              ? 'bg-[var(--color-primary)] text-white shadow-lg'
                              : 'hover:bg-[var(--color-border)] text-[var(--color-text)]'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                  <Users size={16} />
                                </div>
                                <div>
                                  <span className="font-semibold">All Team</span>
                                  <p className="text-xs opacity-75">Overall team data</p>
                                </div>
                              </div>
                            </div>
                          </button>
                          {teamMembersList.map((member, index) => (
                            <button
                              key={member.username}
                              onClick={() => {
                                setSelectedTeamMember(member.username);
                                setShowTeamMemberFilter(false);
                              }}
                              className={`w-full text-left px-3 py-3 rounded-xl transition-all duration-200 ${selectedTeamMember === member.username
                                ? 'bg-[var(--color-primary)] text-white shadow-lg'
                                : 'hover:bg-[var(--color-border)] text-[var(--color-text)]'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                    {member.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="font-semibold">{member.username}</span>
                                    <p className="text-xs opacity-75">{member.totalTasks} tasks {member.completionRate.toFixed(1)}% completion</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold opacity-75">{index + 1}</div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </ThemeCard>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-around sm:justify-between flex-wrap gap-2 sm:gap-6 bg-[var(--color-surface)]/50 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-[var(--color-border)] w-full sm:w-auto">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="relative">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full shadow-lg" style={{ background: `linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)` }}></div>
                    <div className="absolute inset-0 w-3 h-3 sm:w-4 sm:h-4 rounded-full animate-pulse opacity-50" style={{ background: `linear-gradient(135deg, var(--color-success), var(--color-primary))` }}></div>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">Completed</span>
                  <div className="text-base sm:text-lg font-bold" style={{ color: '#5598fcff' }}>
                    {trendData.reduce((sum, item) => sum + item.completed, 0)}
                  </div>
                </div>
                <div className="w-px h-6 sm:h-8 bg-[var(--color-border)]"></div>
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="relative">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full shadow-lg" style={{ background: `linear-gradient(135deg, #6a11cb 0%, #22dcf5ff 100%)` }}></div>
                    <div className="absolute inset-0 w-3 h-3 sm:w-4 sm:h-4 rounded-full animate-pulse opacity-50" style={{ background: `linear-gradient(135deg, #40d5daff 0%, #22dcf5ff 100%)` }}></div>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">Planned</span>
                  <div className="text-base sm:text-lg font-bold" style={{ color: '#04b9ddff' }}>
                    {trendData.reduce((sum, item) => sum + item.planned, 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {
            (user?.role === 'admin' || user?.role === 'manager') && selectedTeamMember !== 'all' && (
              <div className="mb-6 p-4 rounded-2xl border border-[var(--color-primary)]/30" style={{ backgroundColor: 'var(--color-primary)05' }}>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-blue-400 to-purple-600 flex items-center justify-center text-white font-bold">
                    {selectedTeamMember.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-[var(--color-text)]">
                      {selectedTeamMember}'s Performance Trend
                    </h4>
                    <p className="text-sm text-[var(--color-textSecondary)]">
                      Showing individual completion data for {selectedTeamMember}
                    </p>
                  </div>
                </div>
              </div>
            )
          }

          <div className="relative">
            <ResponsiveContainer width="100%" height={470}>
              <AreaChart
                data={trendData}
                margin={{ top: 40, right: 20, left: 0, bottom: 20 }}
              >
                <defs>
                  {/* COMPLETED AREA GRADIENT */}
                  <linearGradient id="completedArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1614b1ff" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#1614b1ff" stopOpacity={0.05} />
                  </linearGradient>

                  {/* COMPLETED STROKE GRADIENT */}
                  <linearGradient id="completedStroke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#1614b1ff" />
                    <stop offset="100%" stopColor="#182fb1ff" />
                  </linearGradient>

                  {/* PLANNED AREA GRADIENT */}
                  <linearGradient id="plannedArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0.05} />
                  </linearGradient>

                  {/* PLANNED STROKE GRADIENT */}
                  <linearGradient id="plannedStroke" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00d4ff" />
                    <stop offset="100%" stopColor="#04b9ddff" />
                  </linearGradient>

                  {/* Soft Glow Effect */}
                  <filter id="chartGlow">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  opacity={0.35}
                  vertical={false}
                />

                <XAxis
                  dataKey="month"
                  stroke="var(--color-textSecondary)"
                  fontSize={12}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />

                <YAxis
                  stroke="var(--color-textSecondary)"
                  fontSize={12}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                />

                {/* Modern Glass Tooltip */}
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="backdrop-blur-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl rounded-2xl p-4">
                          <p className="text-sm font-bold text-[var(--color-text)] mb-2">
                            {label} {new Date().getFullYear()}
                          </p>
                          <div className="space-y-1">
                            {payload.map((entry: any, i: number) => (
                              <div
                                key={i}
                                className="flex justify-between items-center text-sm"
                              >
                                <span className="text-[var(--color-textSecondary)]">
                                  {entry.name}
                                </span>
                                <span style={{ color: entry.color }} className="font-bold">
                                  {entry.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* PLANNED LINE */}
                <Area
                  type="monotone"
                  dataKey="planned"
                  name="Planned Tasks"
                  stroke="url(#plannedStroke)"
                  strokeWidth={3}
                  fill="url(#plannedArea)"
                  fillOpacity={1}
                  filter="url(#chartGlow)"
                  dot={{
                    r: 5,
                    stroke: "var(--color-background)",
                    strokeWidth: 2,
                    fill: "#04b9ddff",
                  }}
                  activeDot={{
                    r: 7,
                    stroke: "var(--color-background)",
                    strokeWidth: 3,
                    fill: "#04b9ddff",
                  }}
                />

                {/* COMPLETED LINE */}
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed Tasks"
                  stroke="url(#completedStroke)"
                  strokeWidth={3}
                  fill="url(#completedArea)"
                  fillOpacity={1}
                  filter="url(#chartGlow)"
                  dot={{
                    r: 5,
                    stroke: "var(--color-background)",
                    strokeWidth: 2,
                    fill: "#182fb1ff",
                  }}
                  activeDot={{
                    r: 7,
                    stroke: "var(--color-background)",
                    strokeWidth: 3,
                    fill: "#182fb1ff",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="absolute top-4 right-4 opacity-20">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-primary)' }}></div>
            </div>
            <div className="absolute bottom-8 left-8 opacity-15">
              <div className="w-3 h-3 rounded-full animate-pulse delay-1000" style={{ backgroundColor: 'var(--color-accent)' }}></div>
            </div>
          </div>
        </ThemeCard >

        {/* Recent Activity */}
        < ThemeCard className="p-4 sm:p-8 xl:col-span-3" variant="glass" >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-2xl text-white" style={{ background: `linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)` }}>
                <Activity size={20} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
                  {(user?.role === 'admin' || user?.role === 'manager') ? 'Recent Activity' : 'Your Recent Activity'}
                </h3>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  {(user?.role === 'admin' || user?.role === 'manager') ? 'Latest team task updates' : 'Your latest task updates'}
                </p>
              </div>
            </div>
            <div className="text-sm px-3 py-1.5 rounded-full font-bold whitespace-nowrap" style={{ backgroundColor: 'var(--color-success)20', color: 'var(--color-success)' }}>
              Last {dashboardData?.recentActivity?.slice(0, 10).length || 0}
            </div>
          </div>
          <div className="space-y-3 max-h-[480px] sm:max-h-[480px] overflow-y-auto">
            {dashboardData?.recentActivity?.slice(0, 10).map((activity) => (
              <div
                key={activity._id}
                className="flex items-start space-x-4 p-3 sm:p-4 rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-all duration-200"
                style={{ backgroundColor: 'var(--color-surface)' }}
              >
                <div className="p-2 rounded-xl shadow-sm" style={{ backgroundColor: 'var(--color-background)' }}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text)] mb-1">
                    {(user?.role === 'admin' || user?.role === 'manager') ? (
                      <>
                        <span className="font-bold">{activity.username}</span>
                        <span className="mx-1 text-[var(--color-textSecondary)]">
                          {activity.type === 'assigned' && 'was assigned'}
                          {activity.type === 'completed' && 'completed'}
                          {activity.type === 'overdue' && 'has overdue'}
                        </span>
                      </>
                    ) : (
                      <span className="mx-1 text-[var(--color-textSecondary)]">
                        {activity.type === 'assigned' && 'You were assigned'}
                        {activity.type === 'completed' && 'You completed'}
                        {activity.type === 'overdue' && 'You have overdue'}
                      </span>
                    )}
                    <span className="font-bold">{activity.title}</span>
                  </p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
                    <span className="text-xs px-2 py-0.5 sm:px-3 sm:py-1 rounded-full font-semibold" style={{ backgroundColor: 'var(--color-primary)20', color: 'var(--color-primary)' }}>
                      {activity.taskType}
                    </span>
                    <span className="text-xs text-[var(--color-textSecondary)]">
                      {format(new Date(activity.date), 'MMM d, h:mm a')}
                    </span>
                  </div>
                </div>
              </div>
            )) || (
                <div className="text-center py-12 text-[var(--color-textSecondary)]">
                  <Activity size={48} className="mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-semibold opacity-60">No recent activity</p>
                  <p className="text-sm opacity-40">Activity will appear here as tasks are updated</p>
                </div>
              )}
          </div>
        </ThemeCard >
      </div >
    </div >
  );
};

export default Dashboard;