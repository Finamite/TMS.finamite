import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  Calendar, CheckCircle, ChevronDown, Award, Star, BarChart3, Trophy, CalendarRange,
  Clock, CalendarDays, RefreshCw, UserCheck, RotateCcw, Users,
  XCircle, Download, FileSpreadsheet, FileText
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isThisMonth, isSameMonth, isSameYear, startOfDay, endOfDay } from 'date-fns';
import { address } from '../../utils/ipAddress';

interface DashboardData {
  teamPerformance: Array<{
    username: string;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    
    oneTimeTasks: number;
    oneTimePending: number;
    oneTimeCompleted: number;
    revisedOneTimeTasks?: number;
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
    rejectedOneTimeTasks?: number;
  }>;
  userPerformance?: {
    username: string;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    oneTimeTasks: number;
    oneTimePending: number;
    oneTimeCompleted: number;
    revisedOneTimeTasks?: number;
    rejectedOneTimeTasks?: number;
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

const Performance: React.FC = () => {
  const { user } = useAuth();
  useTheme();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showMonthFilter, setShowMonthFilter] = useState(false);
  const [viewMode, setViewMode] = useState<'current' | 'all-time' | 'custom'>('current');
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const monthListRef = React.useRef<HTMLDivElement>(null);
  const fromDateRef = useRef<HTMLInputElement>(null);
  const toDateRef = useRef<HTMLInputElement>(null);

  const ThemeCard = ({ children, className = "", variant = "default", hover = false }: {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'glass' | 'elevated' | 'bordered';
    hover?: boolean;
  }) => {
    const baseClasses = "relative overflow-hidden transition-all duration-300 ease-out";
    const variants = {
      default: `rounded-2xl bg-[var(--color-surface)] `,
      glass: `rounded-2xl bg-[var(--color-surface)]/80 backdrop-blur-xl border border-[var(--color-border)] shadow-lg`,
      elevated: `rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl`,
      bordered: `rounded-2xl bg-[var(--color-primary)]/10 border-2 border-[var(--color-primary)]/20`
    };
    const hoverClasses = hover ? "hover:shadow-xl hover:scale-[1.02] hover:border-[var(--color-primary)]/30" : "";
    return (
      <div className={`${baseClasses} ${variants[variant]} ${hoverClasses} ${className}`}>
        {children}
      </div>
    );
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      
      const exportData = {
        teamPerformance: dashboardData?.teamPerformance || [],
        userPerformance: dashboardData?.userPerformance || null,
        dateRange: {
          viewMode,
          selectedMonth: format(selectedMonth, 'yyyy-MM-dd'),
          dateFrom,
          dateTo
        },
        userInfo: {
          username: user?.username,
          role: user?.role,
          companyId: user?.companyId
        }
      };

      const response = await axios.post(`${address}/api/performance/export-excel`, exportData, {
        responseType: 'blob',
        headers: {
          'userid': user?.id
        }
      });

      // Create and download the file
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileName = `performance-report-${viewMode === 'current' ? format(selectedMonth, 'yyyy-MM') : 
        viewMode === 'custom' ? `${dateFrom}-to-${dateTo}` : 'all-time'}.xlsx`;
      link.download = fileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export Excel file. Please try again.');
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      
      const exportData = {
        teamPerformance: dashboardData?.teamPerformance || [],
        userPerformance: dashboardData?.userPerformance || null,
        dateRange: {
          viewMode,
          selectedMonth: format(selectedMonth, 'yyyy-MM-dd'),
          dateFrom,
          dateTo
        },
        userInfo: {
          username: user?.username,
          role: user?.role,
          companyId: user?.companyId
        }
      };

      const response = await axios.post(`${address}/api/performance/export-pdf`, exportData, {
        responseType: 'blob',
        headers: {
          'userid': user?.id
        }
      });

      // Create and download the file
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileName = `performance-scorecard-${viewMode === 'current' ? format(selectedMonth, 'yyyy-MM') : 
        viewMode === 'custom' ? `${dateFrom}-to-${dateTo}` : 'all-time'}.pdf`;
      link.download = fileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Failed to export PDF file. Please try again.');
    } finally {
      setExporting(false);
      setShowExportMenu(false);
    }
  };

  useEffect(() => {
    if (showMonthFilter && monthListRef.current) {
      const selectedEl = monthListRef.current.querySelector(".selected-month");
      if (selectedEl) {
        selectedEl.scrollIntoView({
          block: "center",
          behavior: "auto",
        });
      }
    }
  }, [showMonthFilter]);

  const PerformanceCard = ({ member, rank, isUser = false }: {
    member: DashboardData['teamPerformance'][0] | NonNullable<DashboardData['userPerformance']>;
    rank?: number;
    isUser?: boolean;
  }) => {
    const getRankBadge = (rank: number) => {
      const badges = {
        1: { icon: <Trophy size={18} />, gradient: 'from-yellow-400 to-yellow-600', bg: 'bg-yellow-50', text: 'text-yellow-700' },
        2: { icon: <Award size={18} />, gradient: 'from-gray-300 to-gray-500', bg: 'bg-gray-50', text: 'text-gray-700' },
        3: { icon: <Star size={18} />, gradient: 'from-amber-400 to-amber-600', bg: 'bg-amber-50', text: 'text-amber-700' },
      };
      return badges[rank as keyof typeof badges] || {
        icon: <UserCheck size={18} />,
        gradient: 'from-blue-400 to-blue-600',
        bg: 'bg-blue-50',
        text: 'text-blue-700'
      };
    };

    const badge = rank ? getRankBadge(rank) : { icon: <Users size={18} />, gradient: 'from-blue-400 to-blue-600', bg: 'bg-blue-50', text: 'text-blue-700' };
    const completed =
      (member.oneTimeCompleted || 0) +
      (member.dailyCompleted || 0) +
      (member.weeklyCompleted || 0) +
      (member.monthlyCompleted || 0) +
      (member.quarterlyCompleted || 0) +
      (member.yearlyCompleted || 0);

    const actualCompletionRate = member.completionRate ?? 0;
    const actualOnTimeRate = member.onTimeRate ?? 0;

    // Score uses backend rates
    const totalPerformanceRate = (actualCompletionRate * 0.5) + (actualOnTimeRate * 0.5);

    const taskTypes = [
      { label: 'One-time', total: member.oneTimeTasks, pending: member.oneTimePending, completed: member.oneTimeCompleted, revised: member.revisedOneTimeTasks, rejected: member.rejectedOneTimeTasks, color: '#3b82f6' },
      { label: 'Daily', total: member.dailyTasks, pending: member.dailyPending, completed: member.dailyCompleted, icon: <RefreshCw size={16} />, color: '#10b981' },
      { label: 'Weekly', total: member.weeklyTasks, pending: member.weeklyPending, completed: member.weeklyCompleted, icon: <Calendar size={16} />, color: '#f59e0b' },
      { label: 'Monthly', total: member.monthlyTasks, pending: member.monthlyPending, completed: member.monthlyCompleted, icon: <CalendarDays size={16} />, color: '#8b5cf6' },
      { label: 'Quarterly', total: member.quarterlyTasks, pending: member.quarterlyPending, completed: member.quarterlyCompleted, icon: <RotateCcw size={16} />, color: '#ec4899' },
      { label: 'Yearly', total: member.yearlyTasks, pending: member.yearlyPending, completed: member.yearlyCompleted, icon: <Star size={16} />, color: '#6366f1' },
    ];

    return (
      <ThemeCard className="p-6" variant="glass" hover={false}>
        {/* Header Section */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${badge.gradient} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                {member.username.charAt(0).toUpperCase()}
              </div>
              {rank && (
                <div className={`absolute -top-1 -right-1 ${badge.bg} rounded-full p-1 shadow-md`}>
                  <div className={badge.text}>{badge.icon}</div>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-0.5">
                <h4 className="font-bold text-lg text-[var(--color-text)]">{member.username}</h4>
                {rank && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.bg} ${badge.text}`}>
                    #{rank}
                  </span>
                )}
                {isUser && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700">
                    You
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-[var(--color-textSecondary)]">{member.totalTasks} tasks</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold mb-1" style={{ color: '#10b981' }}>{totalPerformanceRate.toFixed(1)}%</div>
            <p className="text-xs text-[var(--color-textSecondary)]">Score</p>
          </div>
        </div>

        {/* Status Bars - Compact */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* Completed */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text)]">Done</span>
              <span className="text-sm font-bold" style={{ color: '#5b88dbff' }}>
                {completed}
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${actualCompletionRate}%`,
                  background: 'linear-gradient(to right, #1614b1ff, #5b88dbff)'
                }}
              />
            </div>
            <p className="text-xs text-[var(--color-textSecondary)]">{actualCompletionRate.toFixed(0)}%</p>
          </div>

          {/* On-Time */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text)]">On-Time</span>
              {member.totalTasks > 0 && (
                <span className="text-sm font-bold" style={{ color: '#04b9ddff' }}>
                  {member.onTimeCompletedTasks || 0}
                </span>
              )}
            </div>
            <div className="w-full h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${actualOnTimeRate}%`,
                  background: 'linear-gradient(to right, #04b9ddff, #2575fc)'
                }}
              />
            </div>
            <p className="text-xs text-[var(--color-textSecondary)]">{actualOnTimeRate.toFixed(0)}%</p>
          </div>
        </div>

        {/* Task Types Compact Display */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 gap-2 mb-4">
          {taskTypes.map((item, index) => (
            <div
              key={index}
              className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-center"
            >
              {/* Icon + Label Row */}
              <div className="flex items-center justify-center gap-1 mb-1">
                <span style={{ color: item.color }} className="text-base">
                  {item.icon}
                </span>
                <span className="text-md font-medium text-[var(--color-textSecondary)]">
                  {item.label}
                </span>

                {/* Total */}
                <div className="text-lg font-bold text-[var(--color-text)] mb-1 ml-2">
                  {item.total}
                </div>
              </div>

              {/* Pending / Completed */}
              <div className="flex justify-center gap-2 lg:gap-4 text-xs items-center">
                {/* Pending */}
                <div className="flex items-center gap-1 text-[#04b9ddff] font-semibold"
                  title="Pending">
                  <Clock size={12} strokeWidth={2} />
                  <span>{item.pending}</span>
                </div>

                {/* Completed */}
                <div className="flex items-center gap-1 text-[#5b88dbff] font-semibold "
                  title="Completed">
                  <CheckCircle size={12} strokeWidth={2} />
                  <span>{item.completed}</span>
                </div>

                {/* Revised count (ONLY for One-time tasks) */}
                {item.label === "One-time" && (
                  <div className="flex items-center gap-1 text-orange-500 font-semibold "
                    title="Revised">
                    <RotateCcw size={12} strokeWidth={2} />
                    <span>{item.revised || 0}</span>
                  </div>
                )}

                {/* Rejected count (ONLY for One-time tasks) */}
                {item.label === "One-time" && item.rejected !== undefined && (
                  <div className="flex items-center gap-1 text-red-500 font-semibold "
                    title="Rejected">
                    <XCircle size={12} strokeWidth={2} />
                    <span>{item.rejected}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Stats - More Compact */}
        <div className="pt-3 border-t border-[var(--color-border)]">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-sm text-[var(--color-textSecondary)] mb-0.5">Total</p>
              <p className="text-base font-bold text-[var(--color-text)]">{member.totalTasks}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-textSecondary)] mb-0.5">Recurring</p>
              <p className="text-base font-bold text-[var(--color-text)]">{member.recurringTasks}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-textSecondary)] mb-0.5">Complete</p>
              <p className="text-base font-bold" style={{ color: '#10b981' }}>{actualCompletionRate.toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-textSecondary)] mb-0.5">On-Time</p>
              <p className="text-base font-bold" style={{ color: '#f59e0b' }}>{actualOnTimeRate.toFixed(0)}%</p>
            </div>
          </div>
        </div>
      </ThemeCard>
    );
  };

  const fetchPerformanceAnalytics = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      const params: any = {
        userId: user?.id,
        isAdmin: (user?.role === 'admin' || user?.role === 'manager') ? 'true' : 'false',
      };

      // Only add date parameters if both are provided
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
  }, [user]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        let analyticsData = null;

        if (viewMode === 'current') {
          const monthStart = startOfMonth(selectedMonth);
          const monthEnd = endOfMonth(selectedMonth);
          analyticsData = await fetchPerformanceAnalytics(monthStart.toISOString(), monthEnd.toISOString());
        } else if (viewMode === 'custom') {
          const fromDate = startOfDay(new Date(dateFrom));
          const toDate = endOfDay(new Date(dateTo));
          analyticsData = await fetchPerformanceAnalytics(fromDate.toISOString(), toDate.toISOString());
        } else {
          // For all-time, don't pass any date parameters
          analyticsData = await fetchPerformanceAnalytics();
        }

        setDashboardData(analyticsData);
      } catch (error) {
        console.error('Error in loadData:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      loadData();
    }
  }, [user, selectedMonth, viewMode, dateFrom, dateTo, fetchPerformanceAnalytics]);

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

  const top10Users = dashboardData?.teamPerformance && dashboardData.teamPerformance.length > 0
    ? [...dashboardData.teamPerformance]
      .filter(member => (member.totalTasks || 0) > 0)
      .sort((a, b) => {
        const getPerformance = (member: any) => {
          const total = member.totalTasks || 0;
          const completionRate = member.completionRate ?? 0;
          const onTimeRate = member.onTimeRate ?? 0;
          const performanceRate = completionRate * 0.5 + onTimeRate * 0.5;
          return { performanceRate, totalTasks: total };
        };

        const aData = getPerformance(a);
        const bData = getPerformance(b);

        // CASE 1: Both have percentage (>0)
        if (aData.performanceRate > 0 && bData.performanceRate > 0) {
          return bData.performanceRate - aData.performanceRate;
        }

        // CASE 2: Both have 0% → sort by totalTasks
        if (aData.performanceRate === 0 && bData.performanceRate === 0) {
          return bData.totalTasks - aData.totalTasks;
        }

        // CASE 3: One has percentage, one doesn't → one with % goes higher
        return bData.performanceRate - aData.performanceRate;
      })
      .slice(0, 10)
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto mb-4"></div>
          <p className="text-[var(--color-textSecondary)]">Loading performance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-6 lg:space-y-0">
        <div className="flex items-center space-x-6">
          <div className="p-4 rounded-2xl shadow-xl" style={{ background: `linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)` }}>
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)] ">Performance Dashboard</h1>
            <p className="text-sm text-[var(--color-textSecondary)]">
              Welcome back, <span className="font-bold text-[var(--color-text)]">{user?.username}</span>!
              {(user?.role === 'admin' || user?.role === 'manager') ? ' Team performance overview' : ' Here\'s your performance overview'}
              {viewMode === 'current' ?
                ` for ${isSameMonth(selectedMonth, new Date()) && isSameYear(selectedMonth, new Date()) ? 'this month' : format(selectedMonth, 'MMMM yyyy')}` :
                viewMode === 'custom' ?
                  ` from ${format(new Date(dateFrom), 'MMM dd')} to ${format(new Date(dateTo), 'MMM dd, yyyy')}` :
                  ' (all time)'
              }
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
          {/* Export Button */}
          {(dashboardData?.teamPerformance?.length || dashboardData?.userPerformance) && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={exporting}
                className="flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Download size={18} className="mr-2" />
                )}
                {exporting ? 'Exporting...' : 'Export'}
                {!exporting && <ChevronDown size={16} className="ml-1" />}
              </button>
              
              {showExportMenu && !exporting && (
                <div className="absolute right-0 top-full mt-2 w-48 z-50">
                  <ThemeCard className="p-2" variant="elevated" hover={false}>
                    <div className="space-y-1">
                      <button
                        onClick={handleExportExcel}
                        className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-[var(--color-border)] transition-colors"
                      >
                        <FileSpreadsheet size={18} className="mr-3 text-green-600" />
                        <div>
                          <div className="font-semibold text-[var(--color-text)]">Excel Report</div>
                          <div className="text-xs text-[var(--color-textSecondary)]">Detailed data sheets</div>
                        </div>
                      </button>
                      <button
                        onClick={handleExportPDF}
                        className="w-full flex items-center px-3 py-2 rounded-xl text-left hover:bg-[var(--color-border)] transition-colors"
                      >
                        <FileText size={18} className="mr-3 text-red-600" />
                        <div>
                          <div className="font-semibold text-[var(--color-text)]">PDF Scorecard</div>
                          <div className="text-xs text-[var(--color-textSecondary)]">Performance summary</div>
                        </div>
                      </button>
                    </div>
                  </ThemeCard>
                </div>
              )}
            </div>
          )}

          <ThemeCard className="p-1 w-full sm:w-auto" variant="bordered" hover={false}>
            <div className="flex items-center justify-center">
              <button
                onClick={() => {
                  setViewMode('current');
                  setSelectedMonth(new Date());
                  setShowDateFilter(false);
                }}
                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none ${viewMode === 'current' ? 'bg-[#3a2ee2ff] text-white shadow-md' : 'text-[var(--color-textSecondary)] hover:text-[var(--color-text)]'}`}
              >
                Current Month
              </button>
              <button
                onClick={() => {
                  setViewMode('custom');
                  setShowDateFilter(false);
                }}
                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none ${viewMode === 'custom' ? 'bg-[#3a2ee2ff] text-white shadow-md' : 'text-[var(--color-textSecondary)] hover:text-[var(--color-text)]'}`}
              >
                Date Range
              </button>
              <button
                onClick={() => {
                  setViewMode('all-time');
                  setShowDateFilter(false);
                }}
                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none ${viewMode === 'all-time' ? 'bg-[#3a2ee2ff] text-white shadow-md' : 'text-[var(--color-textSecondary)] hover:text-[var(--color-text)]'}`}
              >
                All Time
              </button>
            </div>
          </ThemeCard>

          {viewMode === 'custom' && (
            <div className="relative z-10 w-full sm:w-auto">
              <button
                onClick={() => setShowDateFilter(!showDateFilter)}
                className="flex items-center justify-center px-4 py-2.5 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-lg hover:shadow-xl transition-all duration-200 text-[var(--color-text)] font-md w-full"
              >
                <CalendarRange size={18} className="mr-3" />
                <span className='font-semibold'>
                  {dateFrom === dateTo
                    ? format(new Date(dateFrom), 'MMM dd, yyyy')
                    : `${format(new Date(dateFrom), 'MMM dd')} - ${format(new Date(dateTo), 'MMM dd, yyyy')}`
                  }
                </span>
                <ChevronDown size={18} className="ml-3" />
              </button>
              {showDateFilter && (
                <div className="absolute right-0 top-full mt-2 w-full sm:w-80 z-50">
                  <ThemeCard className="p-4" variant="elevated" hover={false}>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-[var(--color-text)] mb-2">From Date</label>
                        <input
                          ref={fromDateRef}
                          type="date"
                          value={dateFrom}
                          onClick={() => fromDateRef.current?.showPicker()}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="w-full cursor-pointer px-3 py-2
               bg-[var(--color-background)]
               border border-[var(--color-border)]
               rounded-xl text-[var(--color-text)]
               focus:outline-none
               focus:ring-2 focus:ring-[var(--color-primary)]
               focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[var(--color-text)] mb-2">To Date</label>
                        <input
                          ref={toDateRef}
                          type="date"
                          value={dateTo}
                          min={dateFrom}
                          onClick={() => toDateRef.current?.showPicker()}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="w-full cursor-pointer px-3 py-2
               bg-[var(--color-background)]
               border border-[var(--color-border)]
               rounded-xl text-[var(--color-text)]
               focus:outline-none
               focus:ring-2 focus:ring-[var(--color-primary)]
               focus:border-transparent"
                        />
                      </div>
                      <div className="flex space-x-2 pt-2">
                        <button
                          onClick={() => setShowDateFilter(false)}
                          className="flex-1 px-4 py-2 bg-[var(--color-border)] text-[var(--color-text)] rounded-xl hover:bg-[var(--color-border)]/80 transition-colors font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </ThemeCard>
                </div>
              )}
            </div>
          )}

          {viewMode === 'current' && (
            <div className="relative z-10 w-full sm:w-auto">
              <button
                onClick={() => setShowMonthFilter(!showMonthFilter)}
                className="flex items-center justify-center px-4 py-2  bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-lg hover:shadow-xl transition-all duration-200 text-[var(--color-text)] font-md w-full"
              >
                <Calendar size={18} className="mr-3" />
                <span className='font-semibold'>
                  {isSameMonth(selectedMonth, new Date()) && isSameYear(selectedMonth, new Date())
                    ? 'Current Month'
                    : format(selectedMonth, 'MMMM yyyy')}
                </span>
                <ChevronDown size={18} className="ml-3" />
              </button>
              {showMonthFilter && (
                <div className="absolute right-0 top-full mt-2 w-full sm:w-52 z-50">
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
                            className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 
  ${isSelected ? 'selected-month bg-[#3a2ee2ff] text-white shadow-lg'
                                : 'hover:bg-[var(--color-border)] text-[var(--color-text)]'}`}
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

      {/* Performance Content */}
      {(user?.role !== 'admin' && user?.role !== 'manager') && dashboardData?.userPerformance && (
        <div className="grid grid-cols-1 gap-6">
          <PerformanceCard member={dashboardData.userPerformance} isUser={true} />
        </div>
      )}

      {(user?.role === 'admin' || user?.role === 'manager') && (
        <ThemeCard className="" variant="default">
          {top10Users.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
              {top10Users.map((member, i) => (
                <PerformanceCard key={member.username} member={member} rank={i + 1} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="p-6 rounded-2xl bg-[var(--color-border)]/30 inline-block mb-4">
                <BarChart3 size={48} className="text-[var(--color-textSecondary)]" />
              </div>
              <h4 className="text-lg font-semibold text-[var(--color-text)] mb-2">No Performance Data</h4>
              <p className="text-[var(--color-textSecondary)]">
                No team performance data available for the selected time period.
                {viewMode === 'current' ? ' Try selecting a different month or switch to "All Time" view.' :
                  viewMode === 'custom' ? ' Try selecting a different date range or switch to "All Time" view.' :
                    ' Team members may not have any tasks assigned yet.'}
              </p>
            </div>
          )}
        </ThemeCard>
      )}

      {!dashboardData?.userPerformance && !dashboardData?.teamPerformance?.length && (
        <ThemeCard className="p-8 text-center" variant="glass">
          <div className="p-6 rounded-2xl bg-[var(--color-border)]/30 inline-block mb-4">
            <BarChart3 size={48} className="text-[var(--color-textSecondary)]" />
          </div>
          <h3 className="text-xl font-semibold text-[var(--color-text)] mb-2">No Performance Data Available</h3>
          <p className="text-[var(--color-textSecondary)]">
            {viewMode === 'current'
              ? 'No performance data found for the selected month. Try selecting a different time period or switch to "All Time" view.'
              : viewMode === 'custom'
                ? 'No performance data found for the selected date range. Try selecting a different date range or switch to "All Time" view.'
                : 'No performance data available. Tasks need to be assigned and completed to generate performance metrics.'
            }
          </p>
        </ThemeCard>
      )}
    </div>
  );
};

export default Performance;