import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RotateCcw, Calendar, Filter, Search, Trash2, Users, Paperclip, FileText, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, Download, ExternalLink, Settings, Loader, Archive, Undo2 as Restore } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import TaskTypeBadge from '../components/TaskTypeBadge';
import { useTheme } from '../contexts/ThemeContext';
import { address } from '../../utils/ipAddress';
import { ToastContainer, toast } from 'react-toastify';
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
    taskId?: string;
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
        return <p className="text-[--color-textSecondary] text-sm mb-4 whitespace-pre-wrap break-words">{text}</p>;
    }

    return (
        <p className="text-[--color-textSecondary] text-sm mb-4 whitespace-pre-wrap break-words">
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
        <div className="mb-4 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between mb-4">
                <div className="h-6 w-3/4 rounded-full bg-[var(--color-border)]"></div>
                <div className="h-8 w-8 rounded-full bg-[var(--color-border)]"></div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
                <div className="h-6 w-16 rounded-full bg-[var(--color-border)]"></div>
                <div className="h-6 w-20 rounded-full bg-[var(--color-border)]"></div>
                <div className="h-6 w-24 rounded-full bg-[var(--color-border)]"></div>
            </div>
            <div className="space-y-2">
                <div className="h-4 w-full rounded-full bg-[var(--color-border)]"></div>
                <div className="h-4 w-2/3 rounded-full bg-[var(--color-border)]"></div>
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
    const { isDark } = useTheme();

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
    const dateFromRef = useRef<HTMLInputElement>(null);
    const dateToRef = useRef<HTMLInputElement>(null);
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
        } finally {
            setLoading(false);
            setInitialLoading(false);
        }
    }, [currentPage, itemsPerPage, filter, debouncedSearch, debouncedDateFrom, debouncedDateTo, user, isAdmin, binSettings.retentionDays]);

    const fetchIndividualTasks = useCallback(
        async (page: number = currentPage, useCache: boolean = true) => {

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

            const cacheKey = `bin-individual-tasks-${page}-${itemsPerPage}-${isAdmin}-${filter.status}-${filter.assignedTo}-${filter.assignedBy}-${debouncedDateFrom}-${debouncedDateTo}`;

            if (useCache) {
                const cachedData = cacheRef.current.get(cacheKey, params);
                if (cachedData) {
                    setIndividualTasks(cachedData.tasks || []);
                    setTotalPages(cachedData.totalPages || 1);
                    setTotalCount(cachedData.total || 0);
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

                const response = await axios.get(
                    `${address}/api/tasks/bin/recurring-instances?${queryParams}`,
                    { timeout: 10000 }
                );

                const data = response.data;

                const processedTasks = (data.tasks || []).map((task: any) => ({
                    ...task,
                    autoDeleteAt: new Date(
                        new Date(task.deletedAt).getTime() +
                        binSettings.retentionDays * 24 * 60 * 60 * 1000
                    ).toISOString()
                }));

                setIndividualTasks(processedTasks);
                setTotalPages(data.totalPages || 1);
                setTotalCount(data.total || 0);
                cacheRef.current.set(
                    cacheKey,
                    { ...data, tasks: processedTasks },
                    params
                );

            } catch (error) {
                console.error('Error fetching bin individual tasks:', error);
                toast.error('Failed to load bin tasks');
                setIndividualTasks([]);
                setTotalPages(1);
                setTotalCount(0);
            } finally {
                setLoading(false);
                setInitialLoading(false);
            }
        },
        [
            currentPage,
            itemsPerPage,
            filter,
            debouncedSearch,
            debouncedDateFrom,
            debouncedDateTo,
            user,
            isAdmin,
            binSettings.retentionDays
        ]
    );




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

    useEffect(() => {
        if (isEditMode) {
            setFilter(prev => ({
                ...prev,
                dateFrom: '',
                dateTo: ''
            }));
        }
    }, [isEditMode]);

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
        <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_12px_34px_rgba(15,23,42,0.06)] transition-all duration-200 hover:shadow-[0_16px_42px_rgba(15,23,42,0.1)]">
            <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="text-lg font-semibold text-[--color-text] mb-2">
                        <ReadMore text={masterTask.title} maxLength={60} />
                    </div>
                    {canDeleteTasks && (
                        <div className="flex items-center space-x-2 ml-2">
                            <button
                                onClick={() => handleRestoreMasterTask(masterTask)}
                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-success)] transition hover:bg-[rgba(34,197,94,0.08)]"
                                title="Restore master task"
                            >
                                <Restore size={16} />
                            </button>
                            <button
                                onClick={() => handlePermanentDeleteMasterTask(masterTask)}
                                className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-red-500 transition hover:bg-[rgba(239,68,68,0.08)]"
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
                    <span className="rounded-full border border-[rgba(14,165,233,0.16)] bg-[rgba(14,165,233,0.10)] px-2 py-1 text-xs font-medium text-[var(--color-primary)]">
                        {masterTask.instanceCount} instances
                    </span>
                    <span className="rounded-full border border-[rgba(34,197,94,0.16)] bg-[rgba(34,197,94,0.10)] px-2 py-1 text-xs font-medium text-[var(--color-success)]">
                        {masterTask.completedCount} completed
                    </span>
                    <span className="rounded-full border border-[rgba(245,158,11,0.16)] bg-[rgba(245,158,11,0.10)] px-2 py-1 text-xs font-medium text-[var(--color-warning)]">
                        {masterTask.pendingCount} pending
                    </span>
                    <span className="rounded-full border border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.10)] px-2 py-1 text-xs font-medium text-[var(--color-danger)]">
                        {masterTask.deletedCount} deleted
                    </span>
                    {masterTask.parentTaskInfo?.isForever && (
                        <span className="rounded-full border border-[rgba(14,165,233,0.16)] bg-[rgba(14,165,233,0.10)] px-2 py-1 text-xs font-medium text-[var(--color-primary)]">
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
        <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_12px_34px_rgba(15,23,42,0.06)] transition-all duration-200 hover:shadow-[0_16px_42px_rgba(15,23,42,0.1)]">
            <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <TaskTypeBadge taskType={task.taskType} />
                            <StatusBadge status={task.status} />
                            <PriorityBadge priority={task.priority} />
                            {task.parentTaskInfo?.isForever && (
                                <span className="inline-flex items-center rounded-full border border-[rgba(14,165,233,0.18)] bg-[rgba(14,165,233,0.10)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                                    FOREVER
                                </span>
                            )}
                        </div>
                        <h3 className="mt-3 text-[1rem] font-semibold leading-snug text-[var(--color-text)]">
                            <ReadMore text={task.title} maxLength={70} />
                        </h3>
                    </div>
                    {canDeleteTasks && (
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                onClick={() => handleRestoreTask(task._id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-success)] transition hover:bg-[rgba(34,197,94,0.08)]"
                                title="Restore task"
                            >
                                <Restore size={16} />
                            </button>
                            <button
                                onClick={() => handlePermanentDeleteTask(task._id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-danger)] transition hover:bg-[rgba(239,68,68,0.08)]"
                                title="Permanently delete task"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <p className="mt-3 text-sm leading-6 whitespace-pre-wrap break-words text-[var(--color-textSecondary)]">
                    <ReadMore text={task.description} maxLength={descriptionMaxLength} />
                </p>

                <div className="space-y-2 text-sm text-[--color-textSecondary]">
                    <div className="flex justify-between">
                        <span>Task ID:</span>
                        <span className="font-medium">{task.taskId || '—'}</span>
                    </div>
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
        <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
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
                        <tr key={masterTask.taskGroupId} className="transition-colors hover:bg-[var(--color-background)]/70">
                                <td className="px-6 py-4">
                                    <div>
                                        <div className="text-sm font-medium text-[--color-text] mb-1">
                                            <ReadMore text={masterTask.title} maxLength={60} />
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
                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-success)] transition hover:bg-[rgba(34,197,94,0.08)]"
                                title="Restore master task"
                            >
                                <Restore size={16} />
                            </button>
                            <button
                                onClick={() => handlePermanentDeleteMasterTask(masterTask)}
                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-red-500 transition hover:bg-[rgba(239,68,68,0.08)]"
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
        <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[--color-border]">
                    <thead className="bg-[--color-surface]">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                                Task ID
                            </th>
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
                            <tr key={task._id} className="transition-colors hover:bg-[var(--color-background)]/70">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-[--color-text]">
                                    {task.taskId || '—'}
                                </td>
                                <td className="px-6 py-4">
                                    <div>
                                        <div className="text-sm font-medium text-[--color-text] mb-1">
                                            <ReadMore text={task.title} maxLength={70} />
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
                                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-success)] transition hover:bg-[rgba(34,197,94,0.08)]"
                                                title="Restore task"
                                            >
                                                <Restore size={16} />
                                            </button>
                                            <button
                                                onClick={() => handlePermanentDeleteTask(task._id)}
                                                className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-red-500 transition hover:bg-[rgba(239,68,68,0.08)]"
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
            <div className="h-full min-h-0 bg-[var(--color-background)] p-4 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                    <div>
                        <div className="h-8 rounded-full bg-[var(--color-border)] w-64 mb-2"></div>
                        <div className="h-4 rounded-full bg-[var(--color-border)] w-48"></div>
                    </div>
                    <div className="flex items-center mt-4 sm:mt-0 space-x-3">
                        <div className="h-10 rounded-full bg-[var(--color-border)] w-32"></div>
                        <div className="h-10 rounded-full bg-[var(--color-border)] w-32"></div>
                        <div className="h-10 rounded-full bg-[var(--color-border)] w-24"></div>
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
            <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
                <div className="max-w-md rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)]">
                        <Archive size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Recycle Bin Disabled</h2>
                    <p className="text-[var(--color-textSecondary)] mb-4">
                        The recycle bin feature is currently disabled. Please enable it in the settings to view deleted tasks.
                    </p>
                    <button
                        onClick={() => navigate('/settings-page')}
                        className="rounded-2xl bg-[var(--color-primary)] px-6 py-3 text-white transition hover:opacity-95"
                    >
                        Go to Settings
                    </button>
                </div>
            </div>
        );
    }

    const currentData = isEditMode ? masterTasks : individualTasks;

    return (
        <div className="relative h-full min-h-0 bg-[var(--color-background)] p-4 sm:p-6">
            {/* Header */}
            <div className="mb-4 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)] sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="flex items-center text-2xl font-semibold text-[var(--color-text)]">
                        <Archive size={20} className="mr-2 mt-1 text-[var(--color-primary)]" />
                        Recycle Bin
                    </h1>
                    <p className="mt-1 flex items-center text-xs text-[var(--color-textSecondary)]">
                        {isEditMode ? `${masterTasks.length} deleted master task series` : `${individualTasks.length} deleted task(s) found`}
                        {isAdmin ? ' (All team members)' : ' (Your tasks)'}
                        {totalCount > currentData.length && ` - Showing ${currentData.length} of ${totalCount}`}
                        {loading && (
                            <Loader className="ml-2 h-3 w-3 animate-spin text-[var(--color-primary)]" />
                        )}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-danger)]">
                        Auto-delete after {binSettings.retentionDays} days
                    </p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => {
                            setIsEditMode(!isEditMode);
                            cacheRef.current.clear();
                        }}
                        className={`flex items-center rounded-2xl px-4 py-2 text-sm font-medium transition ${isEditMode
                            ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(14,165,233,0.18)]'
                            : 'border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)] hover:bg-[var(--color-background)]'
                            }`}
                    >
                        <Settings size={16} className="inline mr-2" />
                        {isEditMode ? 'Exit Master View' : 'Master View'}
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)]"
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
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="mb-6 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-4">
                        {!isEditMode && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-[--color-text] mb-1">
                                        Date From
                                    </label>
                                    <div className="relative">
                                        <input
                                            ref={dateFromRef}
                                            type="date"
                                            value={filter.dateFrom}
                                            onClick={() => dateToRef.current?.showPicker()}
                                            onChange={(e) =>
                                                setFilter({ ...filter, dateFrom: e.target.value })
                                            }
                                            className="w-full cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                        />
                                        <Calendar
                                            size={16}
                                            onClick={() => dateFromRef.current?.showPicker()}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                                            style={{
                                                color: "var(--color-text)",   // 🔥 THIS FIXES DARK MODE
                                                opacity: 0.9
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[--color-text] mb-1">
                                        <Calendar size={14} className="inline mr-1" />
                                        Date To
                                    </label>
                                    <div className="relative">
                                    <input
                                        ref={dateToRef}
                                        type="date"
                                        value={filter.dateTo}
                                        onClick={() => dateToRef.current?.showPicker()}
                                        onChange={(e) =>
                                            setFilter({ ...filter, dateTo: e.target.value })
                                        }
                                        className="w-full cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                    />
                                    <Calendar
                    size={16}
                    onClick={() => dateFromRef.current?.showPicker()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{
                      color: "var(--color-text)",   // 🔥 THIS FIXES DARK MODE
                      opacity: 0.9
                    }}
                  />
                </div>
                                </div>
                            </>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-[--color-text] mb-1">Task Type</label>
                            <select
                                value={filter.taskType}
                                onChange={(e) => setFilter({ ...filter, taskType: e.target.value })}
                            className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                            >
                                <option value="">All Types</option>
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
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]" />
                                <input
                                    type="text"
                                    placeholder="Search tasks, descriptions, or Task ID..."
                                    value={filter.search}
                                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-10 pr-3 text-sm text-[var(--color-text)] transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                />
                            </div>
                        </div>

                        <div className="flex items-end">
                            <button
                                onClick={resetFilters}
                                className="flex items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
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
                <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center justify-center">
                        <Loader className="mr-3 h-8 w-8 animate-spin text-[var(--color-primary)]" />
                        <span className="text-[var(--color-textSecondary)]">Loading deleted tasks...</span>
                    </div>
                </div>
            )}

            {/* Content */}
            {currentData.length === 0 && !loading ? (
                <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
                    <Archive size={48} className="mx-auto mb-4 text-[var(--color-textSecondary)]" />
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
                            className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition hover:bg-[var(--color-background)]"
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
                <div className="mt-2 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm text-[--color-textSecondary]">Show:</span>
                                            <select
                                                value={itemsPerPage}
                                                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-sm font-medium text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
                                                title="First page"
                                            >
                                                <ChevronsLeft size={16} />
                                            </button>

                                            <button
                                                onClick={() => handlePageChange(currentPage - 1)}
                                                disabled={currentPage === 1}
                                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-sm font-medium text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
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
                                                            className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${currentPage === pageNumber
                                                                ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(14,165,233,0.18)]'
                                                                : 'border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] hover:bg-[var(--color-background)]'
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
                                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-sm font-medium text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Next page"
                                            >
                                                <ChevronRight size={16} />
                                            </button>

                                            <button
                                                onClick={() => handlePageChange(totalPages)}
                                                disabled={currentPage === totalPages}
                                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-sm font-medium text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg transform rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(15,23,42,0.18)] transition-all">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-4 flex items-center text-[--color-text]">
                                <Info size={20} className="mr-2" />
                                Completion Remarks
                            </h3>
                            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                                <p className="leading-relaxed text-[var(--color-text)]">
                                    {showRemarksModal.completionRemarks}
                                </p>
                            </div>
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setShowRemarksModal(null)}
                                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 font-medium text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-full max-w-4xl transform overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                        <div className="border-b border-[var(--color-border)] p-6">
                            <h3 className="text-lg font-semibold flex items-center text-[--color-text]">
                                <Paperclip size={20} className="mr-2" />
                                {showAttachmentsModal.type === 'completion' ? 'Completion Attachments' : 'Task Attachments'}
                            </h3>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto">
                            {showAttachmentsModal.attachments.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {showAttachmentsModal.attachments.map((attachment, index) => (
                                        <div key={index} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background)] p-4 transition-shadow hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                                            <div className="flex flex-col h-full">
                                                <div className="flex-1 mb-3">
                                                    {isImage(attachment.filename) ? (
                                                        <div className="relative group">
                                                            <img
                                                                src={`${address}/uploads/${attachment.filename}`}
                                                                alt={attachment.originalName}
                                                                className="h-32 w-full cursor-pointer rounded-[18px] border border-[var(--color-border)] object-cover"
                                                                onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)}
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center rounded-[18px] bg-black/0 transition-all duration-200 group-hover:bg-black/20">
                                                                <ExternalLink size={24} className="opacity-0 text-white transition-opacity group-hover:opacity-100" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex h-32 w-full items-center justify-center rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)]">
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
                                                                className="flex flex-1 items-center justify-center rounded-2xl bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white transition hover:opacity-95"
                                                            >
                                                                <ExternalLink size={14} className="mr-1" />
                                                                View
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownload(attachment)}
                                                                className="flex flex-1 items-center justify-center rounded-2xl bg-[var(--color-success)] px-3 py-2 text-xs font-medium text-white transition hover:opacity-95"
                                                            >
                                                                <Download size={14} className="mr-1" />
                                                                Download
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleDownload(attachment)}
                                                            className="flex w-full items-center justify-center rounded-2xl bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white transition hover:opacity-95"
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
                        <div className="flex justify-end border-t border-[var(--color-border)] p-6">
                            <button
                                onClick={() => setShowAttachmentsModal(null)}
                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 font-medium text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
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
                            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-3xl text-white transition-opacity hover:bg-black/70"
                            title="Close"
                        >
                            &times;
                        </button>
                    </div>
                </div>
            )}

            {/* Action Modal */}
            {showActionModal && actionConfig && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                        <h2 className="mb-4 font-semibold text-[var(--color-text)]">
                            {actionConfig.type === "restore" ? "Confirm Restore" : "Confirm Permanent Delete"}
                        </h2>
                        {actionConfig.target === "master" ? (
                            <p className="mb-6 text-[var(--color-textSecondary)]">
                                Are you sure you want to {actionConfig.type === "restore" ? "restore" : "permanently delete"} all{" "}
                                {actionConfig.masterTask?.instanceCount} instances of this task series?
                                {actionConfig.type === "permanentDelete" && " This action cannot be undone."}
                            </p>
                        ) : (
                            <p className="mb-6 text-[var(--color-textSecondary)]">
                                Are you sure you want to {actionConfig.type === "restore" ? "restore" : "permanently delete"} this task?
                                {actionConfig.type === "permanentDelete" && " This action cannot be undone."}
                            </p>
                        )}
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowActionModal(false)}
                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 font-medium text-[var(--color-text)] transition hover:bg-[var(--color-background)]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeAction}
                                className={`rounded-2xl px-4 py-2 font-medium text-white transition ${actionConfig.type === "restore"
                                    ? "bg-[var(--color-success)] hover:opacity-95"
                                    : "bg-red-500 hover:opacity-95"
                                    }`}
                            >
                                {actionConfig.type === "restore" ? "Restore" : "Permanently Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ToastContainer
                position="top-right"
                autoClose={2000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme={isDark ? "dark" : "light"}
            />
        </div>
    );
};

export default RecycleBin;
