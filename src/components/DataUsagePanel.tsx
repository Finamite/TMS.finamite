import React, { useState, useEffect } from 'react';
import {
    Database,
    HardDrive,
    FileText,
    TrendingUp,
    BarChart3,
    PieChart,
    RefreshCw
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

interface DetailedUsage {
    company: {
        companyName: string;
    };
    usage: Array<{
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
    }>;
    summary: {
        totalFileStorage: number;
        totalFileCount: number;
        totalDatabaseSize: number;
        totalDocuments: number;
        dateRange: {
            start: string;
            end: string;
        };
    };
}

const DataUsagePanel: React.FC = () => {
    const [usageData, setUsageData] = useState<DataUsageStats[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [detailedUsage, setDetailedUsage] = useState<DetailedUsage | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCompany, setSelectedCompany] = useState<string>('');
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: ''
    });
    const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
    const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');
    const [activePreset, setActivePreset] = useState<'all' | 'last7' | 'last15' | 'last30' | 'custom'>('all');

    useEffect(() => {
        fetchCompanies();
    }, []);

    useEffect(() => {
        if (companies.length > 0) {
            fetchUsageData();
        }
    }, [dateRange, groupBy, selectedCompany, companies]);

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
            const params = new URLSearchParams({
                groupBy
            });

            if (dateRange.startDate && dateRange.endDate) {
                params.append('startDate', dateRange.startDate);
                params.append('endDate', dateRange.endDate);
            }

            if (selectedCompany) {
                params.append('companyId', selectedCompany);
            }

            const response = await axios.get(`${address}/api/data-usage?${params}`);
            setUsageData(response.data);
        } catch (error) {
            console.error('Error fetching usage data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDetailedUsage = async (companyId: string) => {
        try {
            setLoading(true);
            const params = new URLSearchParams();

            if (dateRange.startDate && dateRange.endDate) {
                params.append('startDate', dateRange.startDate);
                params.append('endDate', dateRange.endDate);
            }

            const response = await axios.get(`${address}/api/data-usage/detailed/${companyId}?${params}`);
            setDetailedUsage(response.data);
            setViewMode('detailed');
        } catch (error) {
            console.error('Error fetching detailed usage:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString: string): string => {
        return new Date(dateString).toLocaleDateString();
    };

    const formatInputDate = (date: Date): string => {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${yyyy}-${mm}-${dd}`;
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

    const formatDDMMYYYY = (date: Date): string => {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    };

    const getDateLabel = (item: DataUsageStats['_id']): string => {
        if (groupBy === 'month') {
            // First day of the month
            const date = new Date(item.year, item.month - 1, 1);
            return formatDDMMYYYY(date);
        }

        if (groupBy === 'week') {
            // Show year + week clearly (weeks don’t map cleanly to dates)
            return `Week ${item.week}, ${item.year}`;
        }

        // day
        const date = new Date(item.year, item.month - 1, item.day ?? 1);
        return formatDDMMYYYY(date);
    };


    if (loading && companies.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                    <Database size={28} className="text-blue-600" />
                    <h1 className="text-3xl font-bold text-gray-900">
                        Data Usage Analytics
                    </h1>
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
                        onClick={() => {
                            const companyId = selectedCompany || usageData[0]?._id.companyId;
                            if (companyId) fetchDetailedUsage(companyId);
                        }}
                        disabled={!selectedCompany && usageData.length === 0}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${viewMode === 'detailed'
                                ? 'bg-blue-600 text-white'
                                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        <PieChart size={16} className="inline mr-2" />
                        Detailed
                    </button>

                    <button
                        onClick={fetchUsageData}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={`inline mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-lg border bg-white">
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">
                        Start Date
                    </label>
                    <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => {
                            setActivePreset('custom');
                            setDateRange(prev => ({ ...prev, startDate: e.target.value }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">
                        End Date
                    </label>
                    <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => {
                            setActivePreset('custom');
                            setDateRange(prev => ({ ...prev, endDate: e.target.value }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">
                        Group By
                    </label>
                    <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="day">Daily</option>
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">
                        Company Filter
                    </label>
                    <select
                        value={selectedCompany}
                        onChange={(e) => setSelectedCompany(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="">All Companies</option>
                        {companies.map(company => (
                            <option key={company.companyId} value={company.companyId}>
                                {company.companyName}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
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
                /* Overview Mode */
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="p-6 rounded-lg border bg-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">
                                        Total File Storage
                                    </p>
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
                                    <p className="text-sm font-medium text-gray-600">
                                        Total Files
                                    </p>
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
                                    <p className="text-sm font-medium text-gray-600">
                                        Database Size
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatBytes(usageData.reduce((max, item) => Math.max(max, item.totalDatabaseSize), 0))}
                                    </p>
                                </div>
                                <Database size={24} className="text-green-600" />
                            </div>
                        </div>

                        <div className="p-6 rounded-lg border bg-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-gray-600">
                                        Total Documents
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {usageData.reduce((max, item) => Math.max(max, item.totalDocuments), 0).toLocaleString()}
                                    </p>
                                </div>
                                <TrendingUp size={24} className="text-orange-600" />
                            </div>
                        </div>
                    </div>

                    {/* No Data Message */}
                    {usageData.length === 0 && (
                        <div className="text-center py-12 bg-white rounded-lg border">
                            <Database size={48} className="mx-auto mb-4 text-gray-400" />
                            <h3 className="text-lg font-medium mb-2 text-gray-900">
                                No usage data found
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                No data usage records were found for the selected filters.
                            </p>
                        </div>
                    )}

                    {/* Usage Table */}
                    {usageData.length > 0 && (
                        <div className="rounded-lg border overflow-hidden bg-white">
                            <div className="max-h-[600px] overflow-auto">
                                <table className="w-full">
                                    <thead className="sticky top-0 bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                                Company
                                            </th>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                                Period
                                            </th>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                                File Storage
                                            </th>
                                            <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                                                Database Size
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {usageData.map((item, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">
                                                        {item.company[0]?.companyName || item._id.companyId}
                                                    </div>
                                                    <div className="text-sm text-gray-600">
                                                        ID: {item._id.companyId}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-900">
                                                        {getDateLabel(item._id)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-900">
                                                        {formatBytes(item.totalFileStorage)}
                                                    </div>
                                                    <div className="text-xs text-gray-600">
                                                        {item.totalFileCount} files
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-900">
                                                        {formatBytes(item.totalDatabaseSize)}
                                                    </div>
                                                    <div className="text-xs text-gray-600">
                                                        {item.totalDocuments} documents
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
                /* Detailed Mode */
                detailedUsage && (
                    <div className="space-y-6">
                        {/* Company Header */}
                        <div className="p-6 rounded-lg border bg-white">
                            <h2 className="text-2xl font-bold mb-4 text-gray-900">
                                {detailedUsage.company.companyName} - Detailed Usage
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="text-center">
                                    <p className="text-sm text-gray-600">Total File Storage</p>
                                    <p className="text-xl font-bold text-blue-600">
                                        {formatBytes(detailedUsage.summary.totalFileStorage)}
                                    </p>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-gray-600">Total Files</p>
                                    <p className="text-xl font-bold text-teal-600">
                                        {detailedUsage.summary.totalFileCount}
                                    </p>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-gray-600">Database Size</p>
                                    <p className="text-xl font-bold text-green-600">
                                        {formatBytes(detailedUsage.summary.totalDatabaseSize)}
                                    </p>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-gray-600">Documents</p>
                                    <p className="text-xl font-bold text-orange-600">
                                        {detailedUsage.summary.totalDocuments}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Daily Usage Table */}
                        <div className="rounded-lg border overflow-hidden bg-white">
                            <div className="p-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Daily Usage Breakdown
                                </h3>
                            </div>

                            {detailedUsage.usage.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-gray-600">No detailed usage data available for this period.</p>
                                </div>
                            ) : (
                                <div className="max-h-[500px] overflow-auto">
                                    <table className="w-full">
                                        <thead className="sticky top-0 bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                                                    Date
                                                </th>
                                                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                                                    File Storage
                                                </th>
                                                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                                                    Database Usage
                                                </th>
                                                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                                                    Collection Breakdown
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {detailedUsage.usage.map((day, index) => (
                                                <tr key={index} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-gray-900">
                                                            {formatDate(day.date)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-gray-900">
                                                            {formatBytes(day.fileStorage.totalSize)}
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            {day.fileStorage.fileCount} files uploaded
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-gray-900">
                                                            {formatBytes(day.databaseUsage.totalSize)}
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            {day.databaseUsage.totalDocuments} documents
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-xs space-y-1">
                                                            <div className="text-gray-900">
                                                                Tasks: {day.databaseUsage.collections.tasks.count} ({formatBytes(day.databaseUsage.collections.tasks.size)})
                                                            </div>
                                                            <div className="text-gray-900">
                                                                Users: {day.databaseUsage.collections.users.count} ({formatBytes(day.databaseUsage.collections.users.size)})
                                                            </div>
                                                            <div className="text-gray-900">
                                                                Messages: {day.databaseUsage.collections.messages.count} ({formatBytes(day.databaseUsage.collections.messages.size)})
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
