import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  HardDrive,
  FileText,
  TrendingUp,
  BarChart3,
  PieChart,
  RefreshCw,
  Download,
  Calendar
} from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';

interface DataUsageStats {
  _id: {
    companyId: string;
    year: number;
    month: number;
    day?: number;
    week?: number;
  };
  totalFileStorage: number;
  totalFileCount: number;
  totalDatabaseSize: number;
  totalDocuments: number;
  company: Array<{
    companyName: string;
    companyId: string;
  }>;
}

interface Company {
  companyId: string;
  companyName: string;
}

interface UsageEntry {
  date: string;
  fileStorage: {
    totalSize: number;
    fileCount: number;
    uploads: Array<{
      filename: string;
      originalName: string;
      size: number;
      uploadedAt: string;
      uploadedBy: string;
    }>;
  };
  databaseUsage: {
    totalSize: number;
    totalDocuments: number;
    collections: {
      tasks: { count: number; size: number };
      users: { count: number; size: number };
      messages: { count: number; size: number };
      other: { count: number; size: number };
    };
  };
}

interface DetailedCompanyUsage {
  company: {
    companyId: string;
    companyName: string;
  };
  usage: UsageEntry[];
  summary: {
    totalFileStorage: number;
    totalFileCount: number;
    totalDatabaseSize: number;
    totalDocuments: number;
    dateRange: {
      start: string | null;
      end: string | null;
    };
  };
}

interface DetailedUsageResponse {
  companies: DetailedCompanyUsage[];
  summary: {
    totalFileStorage: number;
    totalFileCount: number;
    totalDatabaseSize: number;
    totalDocuments: number;
    companyCount: number;
  };
}

const getCurrentMonthRange = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: formatInputDate(first),
    endDate: formatInputDate(last)
  };
};

const formatInputDate = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
};

const DataUsagePanel: React.FC = () => {
  const [usageData, setUsageData] = useState<DataUsageStats[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [detailedUsage, setDetailedUsage] = useState<DetailedUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [dateRange, setDateRange] = useState(getCurrentMonthRange());
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('month');
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');
  const [activePreset, setActivePreset] = useState<'currentMonth' | 'all' | 'last7' | 'last15' | 'last30' | 'custom'>('currentMonth');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (companies.length > 0) {
      if (viewMode === 'detailed') {
        fetchDetailedUsage();
      } else {
        fetchUsageData();
      }
    }
  }, [dateRange, groupBy, selectedCompany, companies, viewMode]);

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${address}/api/data-usage/companies`);
      setCompanies(response.data);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ groupBy });

      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      if (selectedCompany) params.append('companyId', selectedCompany);

      const response = await axios.get(`${address}/api/data-usage?${params}`);
      setUsageData(response.data);
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedUsage = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      if (selectedCompany) params.append('companyId', selectedCompany);

      const response = await axios.get(`${address}/api/data-usage/detailed?${params}`);
      setDetailedUsage(response.data);
      setViewMode('detailed');
    } catch (error) {
      console.error('Error fetching detailed usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = async () => {
    try {
      setExportingPdf(true);
      const response = await axios.post(
        `${address}/api/data-usage/export-pdf`,
        {
          groupBy,
          startDate: dateRange.startDate || undefined,
          endDate: dateRange.endDate || undefined,
          companyId: selectedCompany || undefined
        },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `data-usage-report-${groupBy}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting usage PDF:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  const setPresetRange = (days: number | null) => {
    if (days === null) {
      setDateRange({ startDate: '', endDate: '' });
      setActivePreset('all');
      return;
    }

    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - (days - 1));
    setDateRange({
      startDate: formatInputDate(start),
      endDate: formatInputDate(today)
    });
  };

  const setCurrentMonthPreset = () => {
    const now = new Date();
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
    setDateRange(getCurrentMonthRange());
    setActivePreset('currentMonth');
  };

  const setMonthYearRange = (month: number, year: number) => {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    setDateRange({
      startDate: formatInputDate(first),
      endDate: formatInputDate(last)
    });
  };

  const openDatePicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    if (!inputRef.current) return;
    if (typeof inputRef.current.showPicker === 'function') {
      inputRef.current.showPicker();
      return;
    }
    inputRef.current.focus();
  };

  const monthOptions = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const yearOptions = Array.from({ length: 12 }, (_, index) => new Date().getFullYear() - 8 + index);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => new Date(dateString).toLocaleDateString();

  const getDateLabel = (item: DataUsageStats['_id']): string => {
    if (groupBy === 'month') {
      return new Date(item.year, item.month - 1, 1).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric'
      });
    }
    if (groupBy === 'week') return `Week ${item.week}, ${item.year}`;
    const dd = String(item.day ?? 1).padStart(2, '0');
    const mm = String(item.month).padStart(2, '0');
    const yyyy = String(item.year);
    return `${dd}/${mm}/${yyyy}`;
  };

  const sumCompanyWiseMax = (field: 'totalDatabaseSize' | 'totalDocuments') => {
    const maxByCompany: Record<string, number> = {};
    for (const item of usageData) {
      const companyId = item._id.companyId;
      const value = item[field] || 0;
      if (!maxByCompany[companyId] || value > maxByCompany[companyId]) {
        maxByCompany[companyId] = value;
      }
    }
    return Object.values(maxByCompany).reduce((sum, val) => sum + val, 0);
  };

  const getDayTimestamp = (item: DataUsageStats): number => {
    const year = item._id.year;
    const month = item._id.month ?? 1;
    const day = item._id.day ?? 1;
    return new Date(year, month - 1, day).getTime();
  };

  const dailyTasksAddedByKey = useMemo(() => {
    if (groupBy !== 'day' || usageData.length === 0) return new Map<string, number>();

    const byCompany: Record<string, DataUsageStats[]> = {};
    for (const item of usageData) {
      const companyId = item._id.companyId;
      if (!byCompany[companyId]) byCompany[companyId] = [];
      byCompany[companyId].push(item);
    }

    const result = new Map<string, number>();
    for (const [companyId, records] of Object.entries(byCompany)) {
      const sorted = [...records].sort((a, b) => getDayTimestamp(a) - getDayTimestamp(b));
      let previousTotal = 0;

      for (const current of sorted) {
        const currentTotal = current.totalDocuments || 0;
        const added = Math.max(currentTotal - previousTotal, 0);
        const key = `${companyId}-${current._id.year}-${current._id.month}-${current._id.day ?? 1}`;
        result.set(key, added);
        previousTotal = currentTotal;
      }
    }

    return result;
  }, [groupBy, usageData]);

  const tasksAddedToday = useMemo(() => {
    if (groupBy !== 'day') return 0;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    return usageData.reduce((sum, item) => {
      if (item._id.year === year && item._id.month === month && item._id.day === day) {
        const key = `${item._id.companyId}-${item._id.year}-${item._id.month}-${item._id.day ?? 1}`;
        return sum + (dailyTasksAddedByKey.get(key) || 0);
      }
      return sum;
    }, 0);
  }, [groupBy, usageData, dailyTasksAddedByKey]);

  const flattenedDetailedRows = useMemo(() => {
    if (!detailedUsage) return [];
    return detailedUsage.companies
      .flatMap((company) =>
        company.usage.map((day) => ({
          companyId: company.company.companyId,
          companyName: company.company.companyName,
          date: day.date,
          fileStorage: day.fileStorage,
          databaseUsage: day.databaseUsage
        }))
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailedUsage]);

  if (loading && companies.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Database size={28} className="text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Data Usage Analytics</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setViewMode('overview')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'overview'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
          >
            <BarChart3 size={16} className="inline mr-2" />
            Overview
          </button>
          <button
            onClick={fetchDetailedUsage}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'detailed'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
          >
            <PieChart size={16} className="inline mr-2" />
            Detailed
          </button>
          <button
            onClick={exportPdf}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            disabled={exportingPdf}
          >
            <Download size={16} className={`inline mr-2 ${exportingPdf ? 'animate-pulse' : ''}`} />
            PDF
          </button>
          <button
            onClick={() => (viewMode === 'detailed' ? fetchDetailedUsage() : fetchUsageData())}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            <RefreshCw size={16} className={`inline mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 p-4 rounded-lg border bg-white">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Start Date</label>
          <div className="relative overflow-hidden rounded-lg">
            <input
              ref={startDateInputRef}
              type="date"
              value={dateRange.startDate}
              onChange={(e) => {
                setActivePreset('custom');
                setDateRange((prev) => ({ ...prev, startDate: e.target.value }));
              }}
              className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => openDatePicker(startDateInputRef)}
              className="absolute inset-y-0 right-0 w-10 flex items-center justify-center border-l border-gray-200 bg-gray-50 text-gray-500 hover:text-gray-700"
              aria-label="Open start date calendar"
            >
              <Calendar size={16} />
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">End Date</label>
          <div className="relative overflow-hidden rounded-lg">
            <input
              ref={endDateInputRef}
              type="date"
              value={dateRange.endDate}
              onChange={(e) => {
                setActivePreset('custom');
                setDateRange((prev) => ({ ...prev, endDate: e.target.value }));
              }}
              className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => openDatePicker(endDateInputRef)}
              className="absolute inset-y-0 right-0 w-10 flex items-center justify-center border-l border-gray-200 bg-gray-50 text-gray-500 hover:text-gray-700"
              aria-label="Open end date calendar"
            >
              <Calendar size={16} />
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => {
              const month = Number(e.target.value);
              setSelectedMonth(month);
              setActivePreset('custom');
              setGroupBy('month');
              setMonthYearRange(month, selectedYear);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Year</label>
          <select
            value={selectedYear}
            onChange={(e) => {
              const year = Number(e.target.value);
              setSelectedYear(year);
              setActivePreset('custom');
              setGroupBy('month');
              setMonthYearRange(selectedMonth, year);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Group By</label>
          <select
            value={groupBy}
            onChange={(e) => {
              const next = e.target.value as 'day' | 'week' | 'month';
              setGroupBy(next);
              if (next === 'month' && !dateRange.startDate && !dateRange.endDate) {
                setCurrentMonthPreset();
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">Company Filter</label>
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Companies</option>
            {companies.map((company) => (
              <option key={company.companyId} value={company.companyId}>
                {company.companyName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={setCurrentMonthPreset}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activePreset === 'currentMonth'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
        >
          Current Month
        </button>
        <button
          onClick={() => {
            setPresetRange(null);
            setActivePreset('all');
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activePreset === 'all'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
        >
          All
        </button>
        <button
          onClick={() => {
            setPresetRange(7);
            setActivePreset('last7');
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activePreset === 'last7'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
        >
          Last Week
        </button>
        <button
          onClick={() => {
            setPresetRange(15);
            setActivePreset('last15');
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activePreset === 'last15'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
        >
          Last 15 Days
        </button>
        <button
          onClick={() => {
            setPresetRange(30);
            setActivePreset('last30');
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activePreset === 'last30'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
        >
          Last Month
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : viewMode === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 rounded-lg border bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total File Storage</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatBytes(usageData.reduce((sum, item) => sum + item.totalFileStorage, 0))}
                  </p>
                </div>
                <HardDrive size={24} className="text-blue-600" />
              </div>
            </div>

            <div className="p-6 rounded-lg border bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Files</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {usageData.reduce((sum, item) => sum + item.totalFileCount, 0).toLocaleString()}
                  </p>
                </div>
                <FileText size={24} className="text-teal-600" />
              </div>
            </div>

            <div className="p-6 rounded-lg border bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Database Size</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatBytes(sumCompanyWiseMax('totalDatabaseSize'))}
                  </p>
                </div>
                <Database size={24} className="text-green-600" />
              </div>
            </div>

            <div className="p-6 rounded-lg border bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {groupBy === 'day' ? 'Tasks Added Today' : 'Total Tasks'}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(groupBy === 'day' ? tasksAddedToday : sumCompanyWiseMax('totalDocuments')).toLocaleString()}
                  </p>
                </div>
                <TrendingUp size={24} className="text-orange-600" />
              </div>
            </div>
          </div>

          {usageData.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg border">
              <Database size={48} className="mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2 text-gray-900">No usage data found</h3>
              <p className="text-sm text-gray-600 mb-4">
                No data usage records were found for the selected filters.
              </p>
            </div>
          )}

          {usageData.length > 0 && (
            <div className="rounded-lg border overflow-hidden bg-white">
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Company</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Period</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">File Storage</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Database Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {usageData.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{item.company[0]?.companyName || item._id.companyId}</div>
                          <div className="text-sm text-gray-600">ID: {item._id.companyId}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{getDateLabel(item._id)}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{formatBytes(item.totalFileStorage)}</div>
                          <div className="text-xs text-gray-600">{item.totalFileCount} files</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{formatBytes(item.totalDatabaseSize)}</div>
                          <div className="text-xs text-gray-600">
                            {groupBy === 'day'
                              ? `${dailyTasksAddedByKey.get(`${item._id.companyId}-${item._id.year}-${item._id.month}-${item._id.day ?? 1}`) || 0} tasks added`
                              : `${item.totalDocuments} tasks`}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        detailedUsage && (
          <div className="space-y-6">
            <div className="p-6 rounded-lg border bg-white">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">
                {selectedCompany ? 'Company Detailed Usage' : 'All Companies Detailed Usage'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Companies</p>
                  <p className="text-xl font-bold text-indigo-600">{detailedUsage.summary.companyCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Total File Storage</p>
                  <p className="text-xl font-bold text-blue-600">{formatBytes(detailedUsage.summary.totalFileStorage)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Total Files</p>
                  <p className="text-xl font-bold text-teal-600">{detailedUsage.summary.totalFileCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Database Size</p>
                  <p className="text-xl font-bold text-green-600">{formatBytes(detailedUsage.summary.totalDatabaseSize)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Tasks</p>
                  <p className="text-xl font-bold text-orange-600">{detailedUsage.summary.totalDocuments}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden bg-white">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Usage Breakdown</h3>
              </div>
              {flattenedDetailedRows.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">No detailed usage data available for this period.</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Company</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">File Storage</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Database Usage</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Collection Breakdown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {flattenedDetailedRows.map((day, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{day.companyName}</div>
                            <div className="text-xs text-gray-600">{day.companyId}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{formatDate(day.date)}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{formatBytes(day.fileStorage.totalSize)}</div>
                            <div className="text-xs text-gray-600">{day.fileStorage.fileCount} files uploaded</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{formatBytes(day.databaseUsage.totalSize)}</div>
                            <div className="text-xs text-gray-600">{day.databaseUsage.totalDocuments} documents</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs space-y-1">
                              <div className="text-gray-900">
                                Tasks: {day.databaseUsage.collections?.tasks?.count || 0} ({formatBytes(day.databaseUsage.collections?.tasks?.size || 0)})
                              </div>
                              <div className="text-gray-900">
                                Users: {day.databaseUsage.collections?.users?.count || 0} ({formatBytes(day.databaseUsage.collections?.users?.size || 0)})
                              </div>
                              <div className="text-gray-900">
                                Messages: {day.databaseUsage.collections?.messages?.count || 0} ({formatBytes(day.databaseUsage.collections?.messages?.size || 0)})
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default DataUsagePanel;
