import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RotateCcw, Calendar, Filter, Search, Trash2, Users, Paperclip, FileText, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, Download, ExternalLink, Settings, Loader, Archive, Undo2 as Restore } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import TaskTypeBadge from '../components/TaskTypeBadge';
import { address } from '../../utils/ipAddress';
import { toast } from 'react-toastify';
import { useNavigate } from "react-router-dom";

interface Attachment {
    filename: string;
    originalName: string;
    path: string;
    size: number;
    uploadedAt: string;
}

interface Task {
    _id: string;
    title: string;
    description: string;
    taskType: string;
    assignedBy: { username: string; email: string };
    assignedTo: {
        _id: any;
        username: string;
        email: string;
    };
    dueDate: string;
    priority: string;
    status: string;
    taskGroupId?: string;
    sequenceNumber?: number;
    parentTaskInfo?: {
        originalStartDate?: string;
        originalEndDate?: string;
        includeSunday: boolean;
        isForever: boolean;
        weeklyDays?: number[];
        weekOffDays?: number[];
        monthlyDay?: number;
        yearlyDuration?: number;
    };
    weekOffDays?: number[];
    lastCompletedDate?: string;
    completedAt?: string;
    completionRemarks?: string;
    createdAt: string;
    attachments: Attachment[];
    completionAttachments?: Attachment[];
    deletedAt: string;
    autoDeleteAt: string;
}

interface User {
    _id: string;
    username: string;
    email: string;
}

interface MasterTask {
    taskGroupId: string;
    title: string;
    description: string;
    taskType: string;
    assignedBy: { username: string; email: string };
    assignedTo: {
        _id: any;
        username: string;
        email: string;
    };
    priority: string;
    parentTaskInfo?: {
        [x: string]: any;
        originalStartDate?: string;
        originalEndDate?: string;
        includeSunday: boolean;
        isForever: boolean;
        weeklyDays?: number[];
        weekOffDays?: number[];
        monthlyDay?: number;
        yearlyDuration?: number;
    };
    weekOffDays?: number[];
    attachments: Attachment[];
    instanceCount: number;
    completedCount: number;
    pendingCount: number;
    deletedCount: number;
    tasks: Task[];
    dateRange: {
        start: string;
        end: string;
    };
    deletedAt: string;
    autoDeleteAt: string;
}

interface CacheEntry {
    data: any;
    timestamp: number;
    params: string;
}

// Cache manager for API responses
class CacheManager {
    private cache: Map<string, CacheEntry> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    set(key: string, data: any, params: any): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            params: JSON.stringify(params)
        });
    }

    get(key: string, params: any): any | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        const isExpired = Date.now() - entry.timestamp > this.CACHE_DURATION;
        const paramsChanged = entry.params !== JSON.stringify(params);

        if (isExpired || paramsChanged) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    clear(): void {
        this.cache.clear();
    }

    clearByPattern(pattern: string): void {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }
}

// Custom hook for debounced values
const useDebounce = (value: any, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
};

// Memoized ReadMore component
const ReadMore = memo<{ text: string; maxLength: number }>(({ text, maxLength }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const displayText = useMemo(() => {
        if (text.length <= maxLength) return text;
        return isExpanded ? text : `${text.substring(0, maxLength)}...`;
    }, [text, maxLength, isExpanded]);

    if (text.length <= maxLength) {
        return <p className="text-[--color-textSecondary] text-sm mb-4">{text}</p>;
    }

    return (
        <p className="text-[--color-textSecondary] text-sm mb-4">
            {displayText}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="ml-1 text-[--color-primary] hover:text-[--color-primary-dark] font-medium"
            >
                {isExpanded ? 'See Less' : 'See More'}
            </button>
        </p>
    );
});

ReadMore.displayName = 'ReadMore';

// Skeleton loader component
const SkeletonLoader = memo(() => (
    <div className="animate-pulse">
        <div className="bg-[--color-surface] rounded-xl shadow-sm border border-[--color-border] p-6 mb-4">
            <div className="flex items-start justify-between mb-4">
                <div className="h-6 bg-[--color-border] rounded w-3/4"></div>
                <div className="h-8 w-8 bg-[--color-border] rounded"></div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
                <div className="h-6 bg-[--color-border] rounded w-16"></div>
                <div className="h-6 bg-[--color-border] rounded w-20"></div>
                <div className="h-6 bg-[--color-border] rounded w-24"></div>
            </div>
            <div className="space-y-2">
                <div className="h-4 bg-[--color-border] rounded w-full"></div>
                <div className="h-4 bg-[--color-border] rounded w-2/3"></div>
            </div>
        </div>
    </div>
));

SkeletonLoader.displayName = 'SkeletonLoader';

// Helper functions
const isMobileDevice = () => window.innerWidth < 768;

const getInitialViewPreference = (): 'table' | 'card' => {
    const savedView = localStorage.getItem('binViewPreference');
    if (savedView === 'table' || savedView === 'card') {
        return savedView;
    }
    return isMobileDevice() ? 'card' : 'table';
};

const isImage = (filename: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const lowercasedFilename = filename.toLowerCase();
    return imageExtensions.some(ext => lowercasedFilename.endsWith(ext));
};

const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTimeRemaining = (autoDeleteAt: string) => {
    const now = new Date();
    const deleteDate = new Date(autoDeleteAt);
    const diffMs = deleteDate.getTime() - now.getTime();

    if (diffMs <= 0) return 'Expired';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
    return 'Less than 1 hour';
};

const RecycleBin: React.FC = () => {
    const { user } = useAuth();

    // Cache instance
    const cacheRef = useRef(new CacheManager());

    // State management
    const [masterTasks, setMasterTasks] = useState<MasterTask[]>([]);
    const [individualTasks, setIndividualTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [view, setView] = useState<'table' | 'card'>(getInitialViewPreference);
    const [isEditMode, setIsEditMode] = useState(false);
    const [binSettings, setBinSettings] = useState({
        enabled: false,
        retentionDays: 15
    });

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [fullMasterTasks, setFullMasterTasks] = useState<MasterTask[]>([]);

    const [filter, setFilter] = useState({
        taskType: '',
        status: '',
        priority: '',
        assignedBy: '',
        assignedTo: '',
        search: '',
        dateFrom: '',
        dateTo: ''
    });

    const [showFilters, setShowFilters] = useState(false);
    const [showAttachmentsModal, setShowAttachmentsModal] = useState<{ attachments: Attachment[], type: 'task' | 'completion' } | null>(null);
    const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
    const [showRemarksModal, setShowRemarksModal] = useState<Task | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [actionConfig, setActionConfig] = useState<{
        type: "restore" | "permanentDelete";
        target: "single" | "master";
        taskId?: string;
        masterTask?: MasterTask;
    } | null>(null);

    // Debounced filter values for performance
    const debouncedSearch = useDebounce(filter.search, 500);
    const debouncedDateFrom = useDebounce(filter.dateFrom, 300);
    const debouncedDateTo = useDebounce(filter.dateTo, 300);

    const descriptionMaxLength = 100;

    // Permission checks
    const isAdmin = user?.role === 'admin' || user?.permissions?.canViewAllTeamTasks || false;
    const canDeleteTasks = user?.permissions?.canDeleteTasks || false;

    // Save view preference
    useEffect(() => {
        localStorage.setItem('binViewPreference', view);
    }, [view]);

    // Fetch bin settings
    const fetchBinSettings = useCallback(async () => {
        if (!user?.company?.companyId) return;

        try {
            const response = await axios.get(`${address}/api/settings/bin?companyId=${user.company.companyId}`);
            setBinSettings(response.data);
        } catch (error) {
            console.error('Error fetching bin settings:', error);
        }
    }, [user]);

    const navigate = useNavigate();

    // Optimized fetch functions with caching
    const fetchMasterTasks = useCallback(async (page: number = currentPage, useCache: boolean = true) => {
        let effectivePage = isEditMode ? 1 : page;
        let effectiveLimit = isEditMode ? 1000 : itemsPerPage;
        const cacheKey = isEditMode
            ? `bin-master-tasks-edit-${effectiveLimit}-${isAdmin ? 1 : 0}`
            : `bin-master-tasks-${page}-${itemsPerPage}-${isAdmin ? 1 : 0}`;

        const params = {
            page: effectivePage,
            limit: effectiveLimit,
            taskType: filter.taskType,
            status: filter.status,
            priority: filter.priority,
            assignedBy: filter.assignedBy,
            search: debouncedSearch,
            dateFrom: debouncedDateFrom,
            dateTo: debouncedDateTo,
            companyId: user?.company?.companyId || '',
        };

        // Check cache first
        if (useCache) {
            const cachedData = cacheRef.current.get(cacheKey, params);
            if (cachedData) {
                if (!isEditMode) {
                    setMasterTasks(cachedData.masterTasks || []);
                    setTotalPages(cachedData.totalPages || 1);
                    setTotalCount(cachedData.total || 0);
                    setHasMore(cachedData.hasMore || false);
                    return;
                } else {
                    let processedFull = cachedData.masterTasks || [];
                    const targetUserId = isAdmin && filter.assignedTo && filter.assignedTo !== ''
                        ? filter.assignedTo
                        : !isAdmin
                            ? user?.id
                            : null;
                    if (targetUserId !== null && targetUserId !== undefined) {
                        processedFull = processedFull.filter((mt: MasterTask) => mt.assignedTo._id.toString() === targetUserId.toString());
                    }
                    setFullMasterTasks(processedFull);
                    const totalFiltered = processedFull.length;
                    setTotalCount(totalFiltered);
                    setTotalPages(Math.ceil(totalFiltered / itemsPerPage));
                    setHasMore(false);
                    const startIndex = (page - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    setMasterTasks(processedFull.slice(startIndex, endIndex));
                    return;
                }
            }
        }

        try {
            setLoading(effectivePage === 1);

            const queryParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== '') {
                    queryParams.append(key, value.toString());
                }
            });

            const response = await axios.get(`${address}/api/tasks/bin/master-recurring?${queryParams}`, {
                timeout: 10000,
            });

            const backendData = response.data;
            const rawMasterTasks = backendData.masterTasks || [];

            // 🔥 Recalculate autoDeleteAt for master + its tasks using current retentionDays
            const processedMasterTasks = rawMasterTasks.map((mt: { deletedAt: string | number | Date; tasks: any[]; }) => {
                const masterAutoDeleteAt = new Date(
                    new Date(mt.deletedAt).getTime() +
                    binSettings.retentionDays * 24 * 60 * 60 * 1000
                ).toISOString();

                return {
                    ...mt,
                    autoDeleteAt: masterAutoDeleteAt,
                    tasks: mt.tasks.map((task: { deletedAt: string | number | Date; }) => ({
                        ...task,
                        autoDeleteAt: new Date(
                            new Date(task.deletedAt).getTime() +
                            binSettings.retentionDays * 24 * 60 * 60 * 1000
                        ).toISOString()
                    }))
                };
            });
            const backendTotal = backendData.total || 0;
            const backendTotalPages = backendData.totalPages || 1;
            const backendHasMore = backendData.hasMore || false;

            if (!isEditMode) {
                setMasterTasks(processedMasterTasks);
                setTotalPages(backendTotalPages);
                setTotalCount(backendTotal);
                setHasMore(backendHasMore);

                cacheRef.current.set(cacheKey, { ...backendData, masterTasks: processedMasterTasks }, params);
            } else {
                let processedFull: MasterTask[] = processedMasterTasks;
                const targetUserId = isAdmin && filter.assignedTo && filter.assignedTo !== ''
                    ? filter.assignedTo
                    : !isAdmin
                        ? user?.id
                        : null;
                if (targetUserId !== null && targetUserId !== undefined) {
                    processedFull = rawMasterTasks.filter((mt: MasterTask) => mt.assignedTo._id.toString() === targetUserId.toString());
                }
                setFullMasterTasks(processedFull);
                const totalFiltered = processedFull.length;
                setTotalCount(totalFiltered);
                setTotalPages(Math.ceil(totalFiltered / itemsPerPage));
                setHasMore(false);
                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                setMasterTasks(processedFull.slice(startIndex, endIndex));

                const cacheData = {
                    masterTasks: processedMasterTasks,
                    totalPages: backendTotalPages,
                    total: backendTotal,
                    hasMore: backendHasMore,
                };
                cacheRef.current.set(cacheKey, cacheData, params);
            }

        } catch (error) {
            console.error('Error fetching bin master tasks:', error);
            if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
                toast.error('Request timeout. Please try again with fewer filters.');
            } else {
                toast.error('Failed to load bin tasks');
            }
            setMasterTasks([]);
            if (isEditMode) {
                setFullMasterTasks([]);
            }
            setTotalPages(1);
            setTotalCount(0);
            setHasMore(false);
        } finally {
            setLoading(false);
            setInitialLoading(false);
        }
    }, [currentPage, itemsPerPage, filter, debouncedSearch, debouncedDateFrom, debouncedDateTo, user, isAdmin, binSettings.retentionDays]);

    const fetchIndividualTasks = useCallback(async (page: number = currentPage, useCache: boolean = true) => {
        const params = {
            page,
            limit: itemsPerPage,
            taskType: filter.taskType,
            status: filter.status,
            priority: filter.priority,
            assignedTo: isAdmin ? filter.assignedTo : user?.id,
            assignedBy: filter.assignedBy,
            search: debouncedSearch,
            dateFrom: debouncedDateFrom,
            dateTo: debouncedDateTo,
            companyId: user?.company?.companyId || '',
        };

        const cacheKey = `bin-individual-tasks-${page}-${itemsPerPage}-${isAdmin}`;

        if (useCache) {
            const cachedData = cacheRef.current.get(cacheKey, params);
            if (cachedData) {
                setIndividualTasks(cachedData.tasks || []);
                setTotalPages(cachedData.totalPages || 1);
                setTotalCount(cachedData.total || 0);
                setHasMore(cachedData.hasMore || false);
                return;
            }
        }

        try {
            setLoading(page === 1);

            const queryParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== '') {
                    queryParams.append(key, value.toString());
                }
            });

            const response = await axios.get(`${address}/api/tasks/bin/recurring-instances?${queryParams}`, {
                timeout: 10000,
            });

            const data = response.data;
            const processedTasks = (data.tasks || []).map((task: { deletedAt: string | number | Date; }) => ({
                ...task,
                autoDeleteAt: new Date(
                    new Date(task.deletedAt).getTime() +
                    binSettings.retentionDays * 24 * 60 * 60 * 1000
                ).toISOString()
            }));

            setIndividualTasks(processedTasks);
            setTotalPages(data.totalPages || 1);
            setTotalCount(data.total || 0);
            setHasMore(data.hasMore || false);

            // Update cache with processed tasks
            cacheRef.current.set(cacheKey, { ...data, tasks: processedTasks }, params);

        } catch (error) {
            console.error('Error fetching bin individual tasks:', error);
            if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
                toast.error('Request timeout. Please try again with fewer filters.');
            } else {
                toast.error('Failed to load bin tasks');
            }
            setIndividualTasks([]);
            setTotalPages(1);
            setTotalCount(0);
            setHasMore(false);
        } finally {
            setLoading(false);
            setInitialLoading(false);
        }
    }, [currentPage, itemsPerPage, filter, debouncedSearch, debouncedDateFrom, debouncedDateTo, user, isAdmin, binSettings.retentionDays]);

    // Fetch users with caching
    const fetchUsers = useCallback(async () => {
        if (!isAdmin) return;

        const cacheKey = 'users';
        const cachedUsers = cacheRef.current.get(cacheKey, {});
        if (cachedUsers) {
            setUsers(cachedUsers);
            return;
        }

        try {
            const params: any = {};
            if (user?.company?.companyId) {
                params.companyId = user.company.companyId;
            }
            if (user?.role) {
                params.role = user.role;
            }

            const response = await axios.get(`${address}/api/users`, { params });
            const sortedUsers = response.data.sort((a: User, b: User) =>
                a.username.localeCompare(b.username)
            );

            setUsers(sortedUsers);
            cacheRef.current.set(cacheKey, response.data, {});
        } catch (error) {
            console.error('Error fetching users:', error);
            toast.error('Failed to load users');
        }
    }, [isAdmin, user]);

    // Effect for initial data loading
    useEffect(() => {
        fetchBinSettings();
        if (isEditMode) {
            fetchMasterTasks(1, false);
        } else {
            fetchIndividualTasks(1, false);
        }

        if (isAdmin) {
            fetchUsers();
        }
    }, [isEditMode, fetchBinSettings]);

    useEffect(() => {
        const refreshBin = () => fetchBinSettings();

        window.addEventListener("bin-settings-updated", refreshBin);
        return () => window.removeEventListener("bin-settings-updated", refreshBin);
    }, [fetchBinSettings]);

    // Effect for filter changes
    useEffect(() => {
        setCurrentPage(1);
        cacheRef.current.clear();

        if (isEditMode) {
            fetchMasterTasks(1, false);
        } else {
            fetchIndividualTasks(1, false);
        }
    }, [filter.taskType, filter.status, filter.priority, filter.assignedBy, filter.assignedTo, debouncedSearch, debouncedDateFrom, debouncedDateTo, isEditMode, binSettings.retentionDays]);

    // Effect for pagination changes
    useEffect(() => {
        if (isEditMode) {
            if (fullMasterTasks.length > 0) {
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                setMasterTasks(fullMasterTasks.slice(startIndex, endIndex));
                setTotalPages(Math.ceil(fullMasterTasks.length / itemsPerPage));
                setTotalCount(fullMasterTasks.length);
                setHasMore(false);
            }
        } else {
            fetchIndividualTasks(currentPage);
        }
    }, [currentPage, itemsPerPage, fullMasterTasks, isEditMode]);

    // Event handlers
    const handleRestoreTask = useCallback((taskId: string) => {
        setActionConfig({ type: "restore", target: "single", taskId });
        setShowActionModal(true);
    }, []);

    const handlePermanentDeleteTask = useCallback((taskId: string) => {
        setActionConfig({ type: "permanentDelete", target: "single", taskId });
        setShowActionModal(true);
    }, []);

    const handleRestoreMasterTask = useCallback((masterTask: MasterTask) => {
        setActionConfig({ type: "restore", target: "master", masterTask });
        setShowActionModal(true);
    }, []);

    const handlePermanentDeleteMasterTask = useCallback((masterTask: MasterTask) => {
        setActionConfig({ type: "permanentDelete", target: "master", masterTask });
        setShowActionModal(true);
    }, []);

    const executeAction = useCallback(async () => {
        if (!actionConfig) return;

        try {
            if (actionConfig.type === "restore") {
                if (actionConfig.target === "master" && actionConfig.masterTask) {
                    await axios.post(`${address}/api/tasks/bin/restore-master/${actionConfig.masterTask.taskGroupId}`);
                    toast.success('Master task series restored successfully');
                } else if (actionConfig.target === "single" && actionConfig.taskId) {
                    await axios.post(`${address}/api/tasks/bin/restore/${actionConfig.taskId}`);
                    toast.success('Task restored successfully');
                }
            } else if (actionConfig.type === "permanentDelete") {
                if (actionConfig.target === "master" && actionConfig.masterTask) {
                    await axios.delete(`${address}/api/tasks/bin/permanent/${actionConfig.masterTask.taskGroupId}`);
                    toast.success('Master task series permanently deleted');
                } else if (actionConfig.target === "single" && actionConfig.taskId) {
                    await axios.delete(`${address}/api/tasks/bin/permanent/${actionConfig.taskId}`);
                    toast.success('Task permanently deleted');
                }
            }

            // Clear cache and refresh data
            cacheRef.current.clear();
            if (isEditMode) {
                await fetchMasterTasks(1, false);
                setCurrentPage(1);
            } else {
                await fetchIndividualTasks(currentPage, false);
            }

            setShowActionModal(false);
            setActionConfig(null);
        } catch (error) {
            console.error('Error executing action:', error);
            toast.error('Failed to execute action');
        }
    }, [actionConfig, isEditMode, fetchMasterTasks, fetchIndividualTasks, currentPage]);

    const resetFilters = useCallback(() => {
        setFilter({
            taskType: '',
            status: '',
            priority: '',
            assignedBy: '',
            assignedTo: '',
            search: '',
            dateFrom: '',
            dateTo: ''
        });
        setCurrentPage(1);
        cacheRef.current.clear();
    }, []);

    const handlePageChange = useCallback((page: number) => {
        const newPage = Math.max(1, Math.min(page, totalPages));
        setCurrentPage(newPage);
    }, [totalPages]);

    const handleItemsPerPageChange = useCallback((newItemsPerPage: number) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1);
        cacheRef.current.clear();
    }, []);

    const handleDownload = useCallback(async (attachment: Attachment) => {
        try {
            const response = await fetch(`${address}/uploads/${attachment.filename}`);

            if (!response.ok) {
                throw new Error('Failed to download file');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const tempAnchor = document.createElement('a');
            tempAnchor.href = url;
            tempAnchor.download = attachment.originalName;
            tempAnchor.style.display = 'none';

            document.body.appendChild(tempAnchor);
            tempAnchor.click();
            document.body.removeChild(tempAnchor);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error downloading file:', error);
            toast.error('Failed to download file. Please try again.');
        }
    }, []);

    // Memoized components for better performance
    const MasterTaskCard = memo<{ masterTask: MasterTask }>(({ masterTask }) => (
        <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] hover:shadow-md transition-all duration-200 overflow-hidden">
            <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="text-lg font-semibold text-[--color-text] mb-2">
                        <ReadMore text={masterTask.title} maxLength={60} />
                    </div>
                    {canDeleteTasks && (
                        <div className="flex items-center space-x-2 ml-2">
                            <button
                                onClick={() => handleRestoreMasterTask(masterTask)}
                                className="p-2 text-[--color-success] hover:bg-green-500 hover:text-white rounded-lg transition-colors"
                                title="Restore master task"
                            >
                                <Restore size={16} />
                            </button>
                            <button
                                onClick={() => handlePermanentDeleteMasterTask(masterTask)}
                                className="flex items-center gap-1 p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                                title="Permanently delete master task"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                    <TaskTypeBadge taskType={masterTask.taskType} />
                    <PriorityBadge priority={masterTask.priority} />
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-[--color-info-light] text-[--color-info]">
                        {masterTask.instanceCount} instances
                    </span>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-[--color-success-light] text-[--color-success]">
                        {masterTask.completedCount} completed
                    </span>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-[--color-warning-light] text-[--color-warning]">
                        {masterTask.pendingCount} pending
                    </span>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-[--color-error-light] text-[--color-error]">
                        {masterTask.deletedCount} deleted
                    </span>
                    {masterTask.parentTaskInfo?.isForever && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-[--color-primary-light] text-[--color-primary]">
                            FOREVER
                        </span>
                    )}
                </div>

                <ReadMore text={masterTask.description} maxLength={descriptionMaxLength} />

                <div className="space-y-2 text-sm text-[--color-textSecondary]">
                    <div className="flex justify-between">
                        <span>Assigned by:</span>
                        <span className="font-medium">{masterTask.assignedBy.username}</span>
                    </div>
                    {isAdmin && (
                        <div className="flex justify-between">
                            <span>Assigned to:</span>
                            <span className="font-medium">{masterTask.assignedTo.username}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span>Deleted:</span>
                        <span className="font-medium">
                            {new Date(masterTask.deletedAt).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'numeric',
                                year: 'numeric',
                            })}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span>Auto-delete:</span>
                        <span className="font-medium text-[--color-error]">
                            {formatTimeRemaining(masterTask.autoDeleteAt)}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="flex items-center">
                            <Paperclip size={14} className="mr-1" />
                            Attachments:
                        </span>
                        {masterTask.attachments && masterTask.attachments.length > 0 ? (
                            <button
                                onClick={() => setShowAttachmentsModal({ attachments: masterTask.attachments, type: 'task' })}
                                className="font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                            >
                                Click Here ({masterTask.attachments.length})
                            </button>
                        ) : (
                            <span>No Attachments</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    ));

    MasterTaskCard.displayName = 'MasterTaskCard';

    const TaskCard = memo<{ task: Task }>(({ task }) => (
        <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] hover:shadow-md transition-all duration-200 overflow-hidden">
            <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="text-lg font-semibold text-[--color-text] mb-2">
                        <ReadMore text={task.title} maxLength={70} />
                    </div>
                    {canDeleteTasks && (
                        <div className="flex items-center space-x-2 ml-2">
                            <button
                                onClick={() => handleRestoreTask(task._id)}
                                className="p-2 text-[--color-success] hover:bg-green-500 hover:text-white rounded-lg transition-colors"
                                title="Restore task"
                            >
                                <Restore size={16} />
                            </button>
                            <button
                                onClick={() => handlePermanentDeleteTask(task._id)}
                                className="flex items-center gap-1 p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                                title="Permanently delete task"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                    <TaskTypeBadge taskType={task.taskType} />
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                    {task.parentTaskInfo?.isForever && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-[--color-primary-light] text-[--color-primary]">
                            FOREVER
                        </span>
                    )}
                </div>

                <ReadMore text={task.description} maxLength={descriptionMaxLength} />

                <div className="space-y-2 text-sm text-[--color-textSecondary]">
                    <div className="flex justify-between">
                        <span>Assigned by:</span>
                        <span className="font-medium">{task.assignedBy.username}</span>
                    </div>
                    {isAdmin && (
                        <div className="flex justify-between">
                            <span>Assigned to:</span>
                            <span className="font-medium">{task.assignedTo.username}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span>Due date:</span>
                        <span className="font-medium">
                            {new Date(task.dueDate).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'numeric',
                                year: 'numeric',
                            })}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span>Deleted:</span>
                        <span className="font-medium">
                            {new Date(task.deletedAt).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'numeric',
                                year: 'numeric',
                            })}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span>Auto-delete:</span>
                        <span className="font-medium text-[--color-error]">
                            {formatTimeRemaining(task.autoDeleteAt)}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="flex items-center">
                            <Paperclip size={14} className="mr-1" />
                            Task Attachments:
                        </span>
                        {task.attachments && task.attachments.length > 0 ? (
                            <button
                                onClick={() => setShowAttachmentsModal({ attachments: task.attachments, type: 'task' })}
                                className="font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                            >
                                Click Here ({task.attachments.length})
                            </button>
                        ) : (
                            <span>No Attachments</span>
                        )}
                    </div>
                    {task.completionAttachments && task.completionAttachments.length > 0 && (
                        <div className="flex justify-between">
                            <span className="flex items-center">
                                <Paperclip size={14} className="mr-1" />
                                Completion Files:
                            </span>
                            <button
                                onClick={() => setShowAttachmentsModal({ attachments: task.completionAttachments!, type: 'completion' })}
                                className="font-medium text-[--color-success] hover:text-[--color-success-dark]"
                            >
                                Click Here ({task.completionAttachments.length})
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    ));

    TaskCard.displayName = 'TaskCard';

    // Render functions
    const renderMasterTaskCardView = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {masterTasks.map((masterTask: MasterTask) => (
                <MasterTaskCard key={masterTask.taskGroupId} masterTask={masterTask} />
            ))}
        </div>
    );

    const renderMasterTaskTableView = () => (
        <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[--color-border]">
                    <thead className="bg-[--color-surface]">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Master Task
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Priority
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Instances
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Assigned By
                            </th>
                            {isAdmin && (
                                <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                    Assigned To
                                </th>
                            )}
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Deleted Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Auto-Delete
                            </th>
                            {canDeleteTasks && (
                                <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                    Actions
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-[--color-background] divide-y divide-[--color-border]">
                        {masterTasks.map((masterTask: MasterTask) => (
                            <tr key={masterTask.taskGroupId} className="hover:bg-[--color-surface] transition-colors">
                                <td className="px-6 py-4">
                                    <div>
                                        <div className="text-sm font-medium text-[--color-text] mb-1">
                                            {masterTask.title}
                                        </div>
                                        <ReadMore text={masterTask.description} maxLength={descriptionMaxLength} />
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <TaskTypeBadge taskType={masterTask.taskType} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <PriorityBadge priority={masterTask.priority} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-[--color-text]">
                                        Total: {masterTask.instanceCount}
                                    </div>
                                    <div className="text-xs text-[--color-success]">
                                        Completed: {masterTask.completedCount}
                                    </div>
                                    <div className="text-xs text-[--color-warning]">
                                        Pending: {masterTask.pendingCount}
                                    </div>
                                    <div className="text-xs text-[--color-error]">
                                        Deleted: {masterTask.deletedCount}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-semibold text-[--color-text]">{masterTask.assignedBy.username}</div>
                                </td>
                                {isAdmin && (
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-[--color-text]">{masterTask.assignedTo.username}</div>
                                        <div className="text-sm text-[--color-textSecondary]">{masterTask.assignedTo.email}</div>
                                    </td>
                                )}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-[--color-text]">
                                        {new Date(masterTask.deletedAt).toLocaleDateString('en-GB', {
                                            day: '2-digit',
                                            month: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-[--color-error] font-medium">
                                        {formatTimeRemaining(masterTask.autoDeleteAt)}
                                    </div>
                                </td>
                                {canDeleteTasks && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => handleRestoreMasterTask(masterTask)}
                                                className="p-2 text-[--color-success] hover:bg-[--color-success] hover:text-white rounded-lg transition-colors"
                                                title="Restore master task"
                                            >
                                                <Restore size={16} />
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDeleteMasterTask(masterTask)}
                                                className="p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                                                title="Permanently delete master task"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderCardView = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
            {individualTasks.map((task: Task) => (
                <TaskCard key={task._id} task={task} />
            ))}
        </div>
    );

    const renderTableView = () => (
        <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[--color-border]">
                    <thead className="bg-[--color-surface]">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Task
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Type
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Priority
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Assigned By
                            </th>
                            {isAdmin && (
                                <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                    Assigned To
                                </th>
                            )}
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Due Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Deleted Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Auto-Delete
                            </th>
                            {canDeleteTasks && (
                                <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                    Actions
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="bg-[--color-background] divide-y divide-[--color-border]">
                        {individualTasks.map((task: Task) => (
                            <tr key={task._id} className="hover:bg-[--color-surface] transition-colors">
                                <td className="px-6 py-4">
                                    <div>
                                        <div className="text-sm font-medium text-[--color-text] mb-1">
                                            {task.title}
                                        </div>
                                        <ReadMore text={task.description} maxLength={descriptionMaxLength} />
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <TaskTypeBadge taskType={task.taskType} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <StatusBadge status={task.status} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <PriorityBadge priority={task.priority} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-semibold text-[--color-text]">{task.assignedBy.username}</div>
                                </td>
                                {isAdmin && (
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-[--color-text]">{task.assignedTo.username}</div>
                                        <div className="text-sm text-[--color-textSecondary]">{task.assignedTo.email}</div>
                                    </td>
                                )}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-[--color-text]">
                                        {new Date(task.dueDate).toLocaleDateString('en-GB', {
                                            day: '2-digit',
                                            month: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-[--color-text]">
                                        {new Date(task.deletedAt).toLocaleDateString('en-GB', {
                                            day: '2-digit',
                                            month: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-[--color-error] font-medium">
                                        {formatTimeRemaining(task.autoDeleteAt)}
                                    </div>
                                </td>
                                {canDeleteTasks && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => handleRestoreTask(task._id)}
                                                className="p-2 text-[--color-success] hover:bg-[--color-success] hover:text-white rounded-lg transition-colors"
                                                title="Restore task"
                                            >
                                                <Restore size={16} />
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDeleteTask(task._id)}
                                                className="flex items-center gap-1 p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                                                title="Permanently delete task"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    if (initialLoading) {
        return (
            <div className="min-h-screen bg-[var(--color-background)] p-4 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                    <div>
                        <div className="h-8 bg-[--color-border] rounded w-64 mb-2"></div>
                        <div className="h-4 bg-[--color-border] rounded w-48"></div>
                    </div>
                    <div className="flex items-center mt-4 sm:mt-0 space-x-3">
                        <div className="h-10 bg-[--color-border] rounded w-32"></div>
                        <div className="h-10 bg-[--color-border] rounded w-32"></div>
                        <div className="h-10 bg-[--color-border] rounded w-24"></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <SkeletonLoader key={index} />
                    ))}
                </div>
            </div>
        );
    }

    if (!binSettings.enabled) {
        return (
            <div className="min-h-[90vh] bg-[var(--color-background)] p-6 flex items-center justify-center">
                <div className="text-center">
                    <Archive size={64} className="mx-auto mb-4 text-[--color-textSecondary]" />
                    <h2 className="text-2xl font-bold text-[--color-text] mb-2">Recycle Bin Disabled</h2>
                    <p className="text-[--color-textSecondary] mb-4">
                        The recycle bin feature is currently disabled. Please enable it in the settings to view deleted tasks.
                    </p>
                    <button
                         onClick={() => navigate('/settings-page')}
                        className="px-6 py-3 bg-[--color-primary] text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Go to Settings
                    </button>
                </div>
            </div>
        );
    }

    const currentData = isEditMode ? masterTasks : individualTasks;

    return (
        <div className="min-h-full bg-[var(--color-background)] p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                <div>
                    <h1 className="text-xl font-bold text-[--color-error] flex items-center">
                        <Archive size={24} className="mr-2" />
                        Recycle Bin
                    </h1>
                    <p className="mt-1 text-xs text-[--color-textSecondary] flex items-center">
                        {isEditMode ? `${masterTasks.length} deleted master task series` : `${individualTasks.length} deleted task(s) found`}
                        {isAdmin ? ' (All team members)' : ' (Your tasks)'}
                        {totalCount > currentData.length && ` - Showing ${currentData.length} of ${totalCount}`}
                        {loading && (
                            <Loader className="ml-2 h-3 w-3 animate-spin text-[--color-primary]" />
                        )}
                    </p>
                    <p className="text-xs text-[--color-error] mt-1">
                        Auto-delete after {binSettings.retentionDays} days
                    </p>
                </div>
                <div className="flex items-center mt-4 sm:mt-0 space-x-3">
                    <button
                        onClick={() => {
                            setIsEditMode(!isEditMode);
                            cacheRef.current.clear();
                        }}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center ${isEditMode
                            ? 'bg-[--color-primary] text-white hover:bg-[--color-primary]'
                            : 'text-[--color-text] bg-[--color-surface] hover:bg-[--color-border]'
                            }`}
                    >
                        <Settings size={16} className="inline mr-2" />
                        {isEditMode ? 'Exit Master View' : 'Master View'}
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="px-4 py-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] hover:bg-[--color-border] rounded-lg transition-colors flex items-center"
                        title={showFilters ? "Hide Filters" : "Show Filters"}
                    >
                        <Filter size={16} className="inline mr-2" />
                        {showFilters ? "Hide Filters" : "Show Filters"}
                    </button>
                    <div className="hidden sm:block">
                        <ViewToggle view={view} onViewChange={setView} />
                    </div>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[--color-text] mb-1">
                                <Calendar size={14} className="inline mr-1" />
                                Date From
                            </label>
                            <input
                                type="date"
                                value={filter.dateFrom}
                                onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
                                className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[--color-text] mb-1">
                                <Calendar size={14} className="inline mr-1" />
                                Date To
                            </label>
                            <input
                                type="date"
                                value={filter.dateTo}
                                onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
                                className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[--color-text] mb-1">Task Type</label>
                            <select
                                value={filter.taskType}
                                onChange={(e) => setFilter({ ...filter, taskType: e.target.value })}
                                className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                            >
                                <option value="">All Types</option>
                                <option value="one-time">One-time</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>

                        {!isEditMode && (
                            <div>
                                <label className="block text-sm font-medium text-[--color-text] mb-1">Status</label>
                                <select
                                    value={filter.status}
                                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                                    className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                                >
                                    <option value="">All Statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="completed">Completed</option>
                                    <option value="overdue">Overdue</option>
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-[--color-text] mb-1">Priority</label>
                            <select
                                value={filter.priority}
                                onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                                className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                            >
                                <option value="">All Priorities</option>
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                            </select>
                        </div>

                        {isAdmin && (
                            <div>
                                <label className="block text-sm font-medium text-[--color-text] mb-1">
                                    Assigned By
                                </label>
                                <select
                                    value={filter.assignedBy}
                                    onChange={(e) => setFilter({ ...filter, assignedBy: e.target.value })}
                                    className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg 
                             bg-[--color-surface] text-[--color-text]
                             focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
                                >
                                    <option value="">All Assigners</option>
                                    {[...new Set(
                                        [
                                            ...masterTasks.map(t => t.assignedBy?.username),
                                            ...individualTasks.map(t => t.assignedBy?.username)
                                        ].filter(Boolean)
                                    )].map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {isAdmin && (
                            <div>
                                <label className="block text-sm font-medium text-[--color-text] mb-1">
                                    <Users size={14} className="inline mr-1" />
                                    Team Member
                                </label>
                                <select
                                    value={filter.assignedTo}
                                    onChange={(e) => setFilter({ ...filter, assignedTo: e.target.value })}
                                    className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                                >
                                    <option value="">All Members</option>
                                    {users.map((teamUser) => (
                                        <option key={teamUser._id} value={teamUser._id}>
                                            {teamUser.username}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className={`${isAdmin ? 'md:col-span-2' : 'md:col-span-1'}`}>
                            <label className="block text-sm font-medium text-[--color-text] mb-1">
                                <Search size={14} className="inline mr-1" />
                                Search
                            </label>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[--color-textSecondary]" />
                                <input
                                    type="text"
                                    placeholder="Search tasks, descriptions..."
                                    value={filter.search}
                                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                    className="w-full pl-10 pr-3 py-2 text-sm border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                                />
                            </div>
                        </div>

                        <div className="flex items-end">
                            <button
                                onClick={resetFilters}
                                className="px-4 py-2 text-sm font-medium text-[--color-text] bg-[--color-surface] hover:bg-[--color-border] rounded-lg transition-colors flex items-center"
                            >
                                <RotateCcw size={16} className="inline mr-1" />
                                Clear Filters
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading overlay */}
            {loading && !initialLoading && (
                <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] p-8">
                    <div className="flex items-center justify-center">
                        <Loader className="h-8 w-8 animate-spin text-[--color-primary] mr-3" />
                        <span className="text-[--color-textSecondary]">Loading deleted tasks...</span>
                    </div>
                </div>
            )}

            {/* Content */}
            {currentData.length === 0 && !loading ? (
                <div className="text-center py-12">
                    <Archive size={48} className="mx-auto mb-4 text-[--color-textSecondary]" />
                    <p className="text-lg text-[--color-textSecondary]">
                        {isEditMode
                            ? 'No deleted master tasks found'
                            : Object.values(filter).some(value => value !== '')
                                ? 'No deleted tasks match your filters'
                                : 'Recycle bin is empty'}
                    </p>
                    {!isEditMode && Object.values(filter).some(value => value !== '') && (
                        <button
                            onClick={resetFilters}
                            className="mt-4 px-4 py-2 text-sm font-medium text-[--color-primary] hover:text-[--color-primary-dark] transition-colors"
                        >
                            Clear all filters
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {!loading && (
                        <>
                            {isEditMode
                                ? (view === 'card' ? renderMasterTaskCardView() : renderMasterTaskTableView())
                                : (view === 'card' ? renderCardView() : renderTableView())
                            }

                            {/* Enhanced Pagination */}
                            {totalPages > 1 && (
                                <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] p-4 mt-2">
                                    <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm text-[--color-textSecondary]">Show:</span>
                                            <select
                                                value={itemsPerPage}
                                                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                                                className="text-sm px-2 py-1 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                                            >
                                                <option value={10}>10</option>
                                                <option value={25}>25</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                            </select>
                                            <span className="text-sm text-[--color-textSecondary]">per page</span>
                                        </div>

                                        <div className="flex items-center">
                                            <p className="text-sm text-[--color-textSecondary]">
                                                Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
                                                <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of{' '}
                                                <span className="font-medium">{totalCount}</span> results
                                            </p>
                                        </div>

                                        <div className="flex items-center space-x-1">
                                            <button
                                                onClick={() => handlePageChange(1)}
                                                disabled={currentPage === 1}
                                                className="p-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-border] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                title="First page"
                                            >
                                                <ChevronsLeft size={16} />
                                            </button>

                                            <button
                                                onClick={() => handlePageChange(currentPage - 1)}
                                                disabled={currentPage === 1}
                                                className="p-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-border] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                title="Previous page"
                                            >
                                                <ChevronLeft size={16} />
                                            </button>

                                            <div className="flex items-center space-x-1">
                                                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                                                    let pageNumber;

                                                    if (totalPages <= 3) {
                                                        pageNumber = i + 1;
                                                    } else if (currentPage === 1) {
                                                        pageNumber = i + 1;
                                                    } else if (currentPage === totalPages) {
                                                        pageNumber = totalPages - 2 + i;
                                                    } else {
                                                        pageNumber = currentPage - 1 + i;
                                                    }

                                                    return (
                                                        <button
                                                            key={pageNumber}
                                                            onClick={() => handlePageChange(pageNumber)}
                                                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentPage === pageNumber
                                                                ? 'bg-[--color-primary] text-white'
                                                                : 'text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] hover:bg-[--color-border]'
                                                                }`}
                                                        >
                                                            {pageNumber}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <button
                                                onClick={() => handlePageChange(currentPage + 1)}
                                                disabled={currentPage === totalPages}
                                                className="p-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-border] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                title="Next page"
                                            >
                                                <ChevronRight size={16} />
                                            </button>

                                            <button
                                                onClick={() => handlePageChange(totalPages)}
                                                disabled={currentPage === totalPages}
                                                className="p-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-border] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                title="Last page"
                                            >
                                                <ChevronsRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* Remarks Modal */}
            {showRemarksModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-[--color-surface] rounded-xl max-w-lg w-full shadow-2xl transform transition-all">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-4 flex items-center text-[--color-text]">
                                <Info size={20} className="mr-2" />
                                Completion Remarks
                            </h3>
                            <div className="bg-[--color-background] rounded-lg p-4 border border-[--color-border]">
                                <p className="text-[--color-text] leading-relaxed">
                                    {showRemarksModal.completionRemarks}
                                </p>
                            </div>
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setShowRemarksModal(null)}
                                    className="py-2 px-4 rounded-lg font-medium transition-colors hover:bg-[--color-background] bg-[--color-surface] border border-[--color-border] text-[--color-text]"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Attachments Modal */}
            {showAttachmentsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-[--color-surface] rounded-xl max-w-4xl w-full max-h-[90vh] shadow-2xl transform transition-all overflow-hidden">
                        <div className="p-6 border-b border-[--color-border]">
                            <h3 className="text-lg font-semibold flex items-center text-[--color-text]">
                                <Paperclip size={20} className="mr-2" />
                                {showAttachmentsModal.type === 'completion' ? 'Completion Attachments' : 'Task Attachments'}
                            </h3>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto">
                            {showAttachmentsModal.attachments.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {showAttachmentsModal.attachments.map((attachment, index) => (
                                        <div key={index} className="border border-[--color-border] rounded-lg p-4 bg-[--color-background] hover:shadow-md transition-shadow">
                                            <div className="flex flex-col h-full">
                                                <div className="flex-1 mb-3">
                                                    {isImage(attachment.filename) ? (
                                                        <div className="relative group">
                                                            <img
                                                                src={`${address}/uploads/${attachment.filename}`}
                                                                alt={attachment.originalName}
                                                                className="w-full h-32 object-cover rounded-md border border-[--color-border] cursor-pointer"
                                                                onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)}
                                                            />
                                                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-md flex items-center justify-center">
                                                                <ExternalLink size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-32 bg-[--color-surface] border border-[--color-border] rounded-md flex items-center justify-center">
                                                            <FileText size={48} className="text-[--color-primary]" />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium text-[--color-text] truncate" title={attachment.originalName}>
                                                        {attachment.originalName}
                                                    </h4>
                                                    <div className="text-xs text-[--color-textSecondary] space-y-1">
                                                        <div>Size: {formatFileSize(attachment.size)}</div>
                                                        <div>Uploaded: {new Date(attachment.uploadedAt).toLocaleDateString('en-GB', {
                                                            day: '2-digit',
                                                            month: 'numeric',
                                                            year: 'numeric',
                                                        })}</div>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 mt-3">
                                                    {isImage(attachment.filename) ? (
                                                        <>
                                                            <button
                                                                onClick={() => window.open(`${address}/uploads/${attachment.filename}`, '_blank')}
                                                                className="flex-1 px-3 py-2 text-xs font-medium bg-[--color-primary] text-white rounded-lg hover:bg-[--color-primary] transition-colors flex items-center justify-center"
                                                            >
                                                                <ExternalLink size={14} className="mr-1" />
                                                                View
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownload(attachment)}
                                                                className="flex-1 px-3 py-2 text-xs font-medium bg-[--color-success] text-white rounded-lg hover:bg-[--color-success] transition-colors flex items-center justify-center"
                                                            >
                                                                <Download size={14} className="mr-1" />
                                                                Download
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleDownload(attachment)}
                                                            className="w-full px-3 py-2 text-xs font-medium bg-[--color-primary] text-white rounded-lg hover:bg-[--color-primary] transition-colors flex items-center justify-center"
                                                        >
                                                            <Download size={14} className="mr-1" />
                                                            Download
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <Paperclip size={48} className="mx-auto text-[--color-textSecondary] mb-4" />
                                    <p className="text-sm text-[--color-textSecondary]">No attachments found.</p>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-[--color-border] flex justify-end">
                            <button
                                onClick={() => setShowAttachmentsModal(null)}
                                className="py-2 px-4 rounded-lg font-medium transition-colors hover:bg-[--color-background] bg-[--color-surface] border border-[--color-border] text-[--color-text]"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Preview Modal */}
            {selectedImagePreview && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
                    onClick={() => setSelectedImagePreview(null)}
                >
                    <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={selectedImagePreview}
                            alt="Full Screen Preview"
                            className="max-w-full max-h-[90vh] object-contain cursor-pointer"
                            onClick={() => setSelectedImagePreview(null)}
                        />
                        <button
                            onClick={() => setSelectedImagePreview(null)}
                            className="absolute top-4 right-4 text-white text-3xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-75 transition-opacity"
                            title="Close"
                        >
                            &times;
                        </button>
                    </div>
                </div>
            )}

            {/* Action Modal */}
            {showActionModal && actionConfig && (
                <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-[var(--color-background)] rounded-lg shadow-lg p-6 w-96">
                        <h2 className="text-[var(--color-text)] font-semibold mb-4">
                            {actionConfig.type === "restore" ? "Confirm Restore" : "Confirm Permanent Delete"}
                        </h2>
                        {actionConfig.target === "master" ? (
                            <p className="mb-6 text-[var(--color-text)]">
                                Are you sure you want to {actionConfig.type === "restore" ? "restore" : "permanently delete"} all{" "}
                                {actionConfig.masterTask?.instanceCount} instances of this task series?
                                {actionConfig.type === "permanentDelete" && " This action cannot be undone."}
                            </p>
                        ) : (
                            <p className="mb-6 text-[var(--color-text)]">
                                Are you sure you want to {actionConfig.type === "restore" ? "restore" : "permanently delete"} this task?
                                {actionConfig.type === "permanentDelete" && " This action cannot be undone."}
                            </p>
                        )}
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowActionModal(false)}
                                className="px-4 py-2 text-gray-800 rounded bg-gray-200 hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeAction}
                                className={`px-4 py-2 rounded text-white ${actionConfig.type === "restore"
                                    ? "bg-green-500 hover:bg-green-600"
                                    : "bg-red-500 hover:bg-red-600"
                                    }`}
                            >
                                {actionConfig.type === "restore" ? "Restore" : "Permanently Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecycleBin;