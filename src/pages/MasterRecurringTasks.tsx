import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RotateCcw, Calendar, Filter, Search, Trash2, Users, Paperclip, FileText, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CreditCard as Edit, Info, Download, ExternalLink, Settings, Loader, AlertTriangle, XCircle, Edit3, RefreshCw, X } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import TaskTypeBadge from '../components/TaskTypeBadge';
import EditMasterTaskModal from '../components/EditMasterTaskModal';
import { address } from '../../utils/ipAddress';
import { motion, AnimatePresence } from "framer-motion";
import { toast } from 'react-toastify';

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
}

interface User {
  _id: string;
  username: string;
  email: string;
}

interface LightMasterTask {
  taskGroupId: string;
  title: string;
  description: string;
  taskType: string;
  priority: string;
  assignedTo?: { _id: string; username?: string };
  assignedBy?: { _id: string; username?: string };
  dateRange: { start: string | Date; end: string | Date };
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
  tasks: Task[];
  dateRange: {
    start: string;
    end: string;
  };
}

interface EditFormData {
  title: string;
  description: string;
  priority: string;
  assignedTo: string;
  taskType: string;
  startDate: string;
  endDate: string;
  isForever: boolean;
  includeSunday: boolean;
  weeklyDays: number[];
  monthlyDay?: number;
  yearlyDuration: number;
  weekOffDays: number[];
}


interface CacheEntry {
  data: any;
  timestamp: number;
  params: string;
}

// ⚡ ULTRA-FAST Cache manager with instant edit mode support
class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for edit mode data
  private readonly LIGHT_CACHE_DURATION = 60 * 60 * 1000; // 1 hour for light data

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

    const duration = key.includes('light') ? this.LIGHT_CACHE_DURATION : this.CACHE_DURATION;
    const isExpired = Date.now() - entry.timestamp > duration;
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

  // ⚡ Instant cache check for edit mode
  hasEditModeCache(companyId: string): boolean {
    const key = `master-tasks-light-${companyId}`;
    const entry = this.cache.get(key);
    return entry !== null;
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

// Memoized ReadMore component with better performance
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
        className="ml-1 text-[--color-primary] hover:text-[--color-primary] font-medium"
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
  const savedView = localStorage.getItem('taskViewPreference');
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

const MasterRecurringTasks: React.FC = () => {
  const { user } = useAuth();

  // Cache instance
  const cacheRef = useRef(new CacheManager());

  // State management
  const [masterTasks, setMasterTasks] = useState<MasterTask[]>([]);
  const [individualTasks, setIndividualTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [editModeLoading, setEditModeLoading] = useState(false);
  const [view, setView] = useState<'table' | 'card'>(getInitialViewPreference);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMasterTask, setEditingMasterTask] = useState<MasterTask | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    title: '',
    description: '',
    priority: '',
    assignedTo: '',
    taskType: '',
    startDate: '',
    endDate: '',
    isForever: false,
    includeSunday: true,
    weeklyDays: [],
    monthlyDay: undefined,
    yearlyDuration: 1,
    weekOffDays: []
  });

  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [fullMasterTasks, setFullMasterTasks] = useState<MasterTask[]>([]);
  const [showIncludeFilesModal, setShowIncludeFilesModal] = useState(false);
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [binEnabled, setBinEnabled] = useState(false);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTask, setReassignTask] = useState<MasterTask | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkReassignModal, setShowBulkReassignModal] = useState(false);
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const [bulkIncludeFiles, setBulkIncludeFiles] = useState<Record<string, boolean>>({});
  const [deleteConfig, setDeleteConfig] = useState<{
    type: "single" | "master" | "permanent";
    taskId?: string;
    taskGroupId?: string; // Add this to store the taskGroupId for master task deletion
    title?: string;
  } | null>(null);

  // Debounced filter values for performance
  const debouncedSearch = useDebounce(filter.search, 500);
  const debouncedDateFrom = useDebounce(filter.dateFrom, 300);
  const debouncedDateTo = useDebounce(filter.dateTo, 300);

  const descriptionMaxLength = 100;

  // Permission checks
  const isAdmin = user?.role === 'admin' || user?.permissions?.canViewAllTeamTasks || false;
  const canEditRecurringTaskSchedules = user?.permissions?.canEditRecurringTaskSchedules || false;
  const canDeleteTasks = user?.permissions?.canDeleteTasks || false;
  const hasMasterTaskActions = canEditRecurringTaskSchedules || canDeleteTasks;

  // ⚡ LIGHTNING FAST: Ultra-optimized edit mode data fetching
  const fetchMasterTasksUltraFast = useCallback(async (useCache: boolean = true) => {
    const companyId = user?.company?.companyId || '';
    if (!companyId) return;

    const cacheKey = `master-tasks-light-${companyId}`;

    // ⚡ INSTANT: Check cache first for lightning speed
    if (useCache && cacheRef.current.hasEditModeCache(companyId)) {
      const cachedData = cacheRef.current.get(cacheKey, { companyId });
      if (cachedData) {
        setFullMasterTasks(cachedData);
        setTotalCount(cachedData.length);
        setTotalPages(Math.ceil(cachedData.length / itemsPerPage));
        setMasterTasks(cachedData.slice(0, itemsPerPage));
        setEditModeLoading(false);
        return;
      }
    }

    try {
      setEditModeLoading(true);

      // ⚡ Use the ultra-fast light endpoint
      const response = await axios.get(
        `${address}/api/tasks/master-recurring-light?companyId=${companyId}`,
        {
          timeout: 100000 // Quick timeout for immediate response
        }
      );

      let lightData = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.masterTasks)
          ? response.data.masterTasks
          : [];

      // Prevent runtime errors
      if (!Array.isArray(lightData)) {
        console.warn("Unexpected API format:", response.data);
        lightData = [];
      }


      if (lightData.length === 0) {

        // Try to fetch regular master tasks as fallback
        try {
          const fallbackResponse = await axios.get(
            `${address}/api/tasks/master-recurring?companyId=${companyId}&limit=1000`,
            { timeout: 100000 }
          );

          const fallbackData = fallbackResponse.data?.masterTasks || [];

          if (fallbackData.length > 0) {
            // Use fallback data
            let filteredData = fallbackData;
            if (!isAdmin && user?.id) {
              filteredData = fallbackData.filter((task: MasterTask) =>
                task.assignedTo._id.toString() === user.id.toString()
              );
            }

            filteredData = filteredData.filter(
              (task: MasterTask) => task.taskType !== "one-time"
            );

            filteredData = filteredData.map((task: any) => ({
              ...task,
              tasks:
                task.tasks?.sort(
                  (a: any, b: any) =>
                    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
                ) || []
            }));



            setFullMasterTasks(filteredData);
            setTotalCount(filteredData.length);
            setTotalPages(Math.ceil(filteredData.length / itemsPerPage));
            setMasterTasks(filteredData.slice(0, itemsPerPage));

            // Cache the fallback data
            cacheRef.current.set(cacheKey, fallbackData, { companyId });

            setEditModeLoading(false);
            return;
          }
        } catch (fallbackError) {
          console.error('❌ Fallback fetch failed:', fallbackError);
        }
      }

      // ⚡ INSTANT: Apply user filter if needed
      let filteredData = lightData;

      // Apply AssignedTo filter for non admins
      if (!isAdmin && user?.id) {
        filteredData = filteredData.filter(
          (task: LightMasterTask) =>
            task.assignedTo?._id?.toString() === user.id.toString()
        );
      }

      // Admin filter by assignedTo
      if (isAdmin && filter.assignedTo) {
        filteredData = filteredData.filter(
          (task: LightMasterTask) =>
            task.assignedTo?._id?.toString() === filter.assignedTo.toString()
        );
      }

      // Filter by task type
      if (filter.taskType) {
        filteredData = filteredData.filter(
          (task: LightMasterTask) => task.taskType === filter.taskType
        );
      }

      // Filter by priority
      if (filter.priority) {
        filteredData = filteredData.filter(
          (task: LightMasterTask) => task.priority === filter.priority
        );
      }

      // Filter by assignedBy
      if (filter.assignedBy) {
        filteredData = filteredData.filter(
          (task: LightMasterTask) =>
            task.assignedBy?.username?.toLowerCase() ===
            filter.assignedBy.toLowerCase()
        );
      }

      // Search filter
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        filteredData = filteredData.filter(
          (task: LightMasterTask) =>
            task.title?.toLowerCase().includes(s) ||
            task.description?.toLowerCase().includes(s)
        );
      }

      // Filter by date range
      if (debouncedDateFrom && debouncedDateTo) {
        const from = new Date(debouncedDateFrom);
        const to = new Date(debouncedDateTo);

        filteredData = filteredData.filter((task: LightMasterTask) => {
          const date = new Date(task.dateRange.start);
          return date >= from && date <= to;
        });
      }

      // ⚡ INSTANT: Set all data immediately
      setFullMasterTasks(filteredData);
      setTotalCount(filteredData.length);
      setTotalPages(Math.ceil(filteredData.length / itemsPerPage));
      setMasterTasks(filteredData.slice(0, itemsPerPage));

      // ⚡ CACHE: Store for instant future access
      cacheRef.current.set(cacheKey, Array.isArray(lightData) ? lightData : [], { companyId });


    } catch (error) {
      console.error('❌ Error in ultra-fast fetch:', error);
      toast.error('Failed to load master tasks');
      setMasterTasks([]);
      setFullMasterTasks([]);
      setTotalPages(1);
      setTotalCount(0);
    } finally {
      setEditModeLoading(false);
    }
  }, [
    user,
    itemsPerPage,
    isAdmin,
    filter.taskType,
    filter.priority,
    filter.assignedBy,
    filter.assignedTo,
    debouncedSearch,
    debouncedDateFrom,
    debouncedDateTo
  ]);


  // Replace the existing useEffect for pagination changes
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

  useEffect(() => {
    const fetchBinSettings = async () => {
      try {
        const res = await axios.get(`${address}/api/settings/bin?companyId=${user?.company?.companyId}`);
        setBinEnabled(res.data.enabled ?? false);
      } catch (err) {
        console.error("Error loading bin settings", err);
      }
    };

    fetchBinSettings();

    // Update when settings saved from Settings page
    const listener = () => fetchBinSettings();
    window.addEventListener("bin-settings-updated", listener);

    return () => window.removeEventListener("bin-settings-updated", listener);
  }, [user]);

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

    const cacheKey = `individual-tasks-${page}-${itemsPerPage}-${isAdmin}`;

    // Check cache first
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

      const response = await axios.get(`${address}/api/tasks/recurring-instances?${queryParams}`);

      const data = response.data;
      setIndividualTasks(data.tasks || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
      setHasMore(data.hasMore || false);

      // Cache the result
      cacheRef.current.set(cacheKey, data, params);

    } catch (error) {
      console.error('❌ Error fetching individual tasks:', error);
      toast.error('Failed to load tasks');
      setIndividualTasks([]);
      setTotalPages(1);
      setTotalCount(0);
      setHasMore(false);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [currentPage, itemsPerPage, filter, debouncedSearch, debouncedDateFrom, debouncedDateTo, user, isAdmin]);

  // ⚡ LIGHTNING FAST: Ultra-optimized edit mode toggle
  const handleEditModeToggle = useCallback(async () => {
    const newEditMode = !isEditMode;

    setIsEditMode(newEditMode);
    setIsSelectionMode(false);
    setSelectedTasks(new Set());
    setCurrentPage(1);

    if (newEditMode) {
      // ⚡ INSTANT: Use ultra-fast light endpoint for edit mode
      setEditModeLoading(true);
      setMasterTasks([]); // Clear current data to show loading
      await fetchMasterTasksUltraFast(true); // Use cache if available
    } else {
      // Switching back to normal mode
      cacheRef.current.clearByPattern('individual');
      await fetchIndividualTasks(1, false);
    }
  }, [isEditMode, fetchMasterTasksUltraFast, fetchIndividualTasks]);

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
    if (isEditMode) {
      setEditModeLoading(true);
      fetchMasterTasksUltraFast(true); // ⚡ Use ultra-fast method
    } else {
      fetchIndividualTasks(1, false);
    }

    if (isAdmin) {
      fetchUsers();
    }
  }, [isEditMode]);

  // Effect for filter changes (with debouncing)
  useEffect(() => {
    setCurrentPage(1);
    cacheRef.current.clear(); // Clear cache when filters change

    if (isEditMode) {
      setEditModeLoading(true);
      fetchMasterTasksUltraFast(false); // ⚡ Force fresh data with filters
    } else {
      fetchIndividualTasks(1, false);
    }
  }, [filter.taskType, filter.status, filter.priority, filter.assignedBy, filter.assignedTo, debouncedSearch, debouncedDateFrom, debouncedDateTo, isEditMode]);

  // Effect for pagination changes
  useEffect(() => {
    if (isEditMode) {
      if (fullMasterTasks.length === 0) {
        setEditModeLoading(true);
        fetchMasterTasksUltraFast(true); // ⚡ Use cached if available
      }
    } else {
      fetchIndividualTasks(currentPage);
    }
  }, [currentPage, itemsPerPage]);

  // Event handlers
  const handleDeleteTask = useCallback((taskId: string) => {
    setDeleteConfig({ type: "single", taskId });
    setShowDeleteModal(true);
  }, []);

  // ✅ FIXED: Updated handleDeleteMasterTask to store taskGroupId instead of full task data
  const handleDeleteMasterTask = useCallback((masterTask: MasterTask) => {
    setDeleteConfig({
      type: "master",
      taskGroupId: masterTask.taskGroupId, // Store the taskGroupId, not the full task object
      title: masterTask.title.substring(0, 60)
    });
    setShowDeleteModal(true);
  }, []);

  const handleEditMasterTask = useCallback((masterTask: MasterTask) => {
    setEditingMasterTask(masterTask);
    const formData: EditFormData = {
      title: masterTask.title,
      description: masterTask.description,
      priority: masterTask.priority,
      assignedTo: masterTask.assignedTo._id,
      taskType: masterTask.taskType,
      startDate: masterTask.parentTaskInfo?.originalStartDate || masterTask.dateRange.start,
      endDate: masterTask.parentTaskInfo?.originalEndDate || masterTask.dateRange.end,
      isForever: masterTask.parentTaskInfo?.isForever || false,
      includeSunday: masterTask.parentTaskInfo?.includeSunday ?? true,
      weeklyDays: masterTask.parentTaskInfo?.weeklyDays || [],
      monthlyDay: masterTask.parentTaskInfo?.monthlyDay,
      yearlyDuration: masterTask.parentTaskInfo?.yearlyDuration || 1,
      weekOffDays: masterTask.parentTaskInfo?.weekOffDays || masterTask.weekOffDays || []
    };
    setEditFormData(formData);
    setShowEditModal(true);
  }, []);

  const openReassignModal = (task: MasterTask) => {
    setReassignTask(task);
    setShowReassignModal(true);
  };

  // Selection handlers
  const handleTaskSelection = useCallback((taskGroupId: string, isSelected: boolean) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(taskGroupId);
      } else {
        newSet.delete(taskGroupId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const foreverTasks = masterTasks.filter(task => task.parentTaskInfo?.isForever);
    const allForeverTaskIds = new Set(foreverTasks.map(task => task.taskGroupId));
    setSelectedTasks(allForeverTaskIds);
  }, [masterTasks]);

  const handleDeselectAll = useCallback(() => {
    setSelectedTasks(new Set());
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedTasks(new Set());
  }, [isSelectionMode]);

  const handleBulkReassign = useCallback(async () => {
    if (selectedTasks.size === 0) {
      toast.error("Please select at least one task to reassign");
      return;
    }

    const companyId = user?.company?.companyId;
    if (!companyId) {
      toast.error("Company ID missing");
      return;
    }

    // 🔒 VALIDATION: force Add / Don’t Add selection
    const invalidTasks: string[] = [];

    selectedTasks.forEach(taskGroupId => {
      const task = masterTasks.find(t => t.taskGroupId === taskGroupId);
      const hasAttachments =
        task && Array.isArray(task.attachments) && task.attachments.length > 0;

      if (hasAttachments && bulkIncludeFiles[taskGroupId] === undefined) {
        invalidTasks.push(task?.title || taskGroupId);
      }
    });

    if (invalidTasks.length > 0) {
      toast.error(
        `Please choose "Add" or "Don't Add" for attachments`
      );
      return; // ⛔ STOP REASSIGN
    }

    try {
      setIsSaving(true);

      const taskGroupIds = Array.from(selectedTasks);

      await Promise.all(
        taskGroupIds.map(async (taskGroupId) => {
          const includeFiles = bulkIncludeFiles[taskGroupId] === true;

          await axios.post(
            `${address}/api/tasks/reassign/${taskGroupId}`,
            {
              includeFiles,
              companyId
            }
          );
        })
      );

      toast.success(`Successfully reassigned ${taskGroupIds.length} task(s)`);

      // cleanup
      cacheRef.current.clearByPattern("master-tasks-light");
      cacheRef.current.clearByPattern("master-tasks");

      await fetchMasterTasksUltraFast(false);

      setSelectedTasks(new Set());
      setBulkIncludeFiles({});
      setIsSelectionMode(false);
      setShowBulkReassignModal(false);

    } catch (error) {
      console.error("❌ Bulk reassign failed:", error);
      toast.error("Failed to reassign tasks");
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedTasks,
    bulkIncludeFiles,
    masterTasks,
    user,
    fetchMasterTasksUltraFast
  ]);


  const handleReassign = async () => {
    if (!reassignTask) {
      toast.error("Task data not loaded");
      return;
    }

    const hasAttachments =
      Array.isArray(reassignTask.attachments) &&
      reassignTask.attachments.length > 0;

    if (hasAttachments) {
      // ✅ Ask user only if attachments exist
      setShowIncludeFilesModal(true);
    } else {
      // ✅ No attachments → directly reassign
      proceedReassign(false);
    }
  };

  const proceedReassign = async (includeFiles: boolean) => {
    if (!reassignTask || !user?.company?.companyId) return;

    try {
      const res = await axios.post(
        `${address}/api/tasks/reassign/${reassignTask.taskGroupId}`,
        {
          includeFiles,
          companyId: user.company.companyId
        }
      );

      toast.success("Task reassigned successfully!");

      // clear cache properly
      cacheRef.current.clearByPattern("master-tasks-light");
      cacheRef.current.clearByPattern("master-tasks");

      await fetchMasterTasksUltraFast(false);

      setShowIncludeFilesModal(false);
      setReassignTask(null);

    } catch (err) {
      toast.error("Failed to reassign task");
      console.error(err);
    }
  };

  const handleSaveMasterTask = useCallback(async () => {
    if (!editingMasterTask) return;

    try {
      setIsSaving(true);

      const payload: any = {
        title: editFormData.title,
        description: editFormData.description,
        priority: editFormData.priority,
        assignedTo: editFormData.assignedTo,
        taskType: editFormData.taskType,
        startDate: editFormData.startDate,
        endDate: editFormData.endDate,
        isForever: editFormData.isForever,
        includeSunday: editFormData.includeSunday,
        weeklyDays: editFormData.weeklyDays,
        monthlyDay: editFormData.monthlyDay,
        yearlyDuration: editFormData.yearlyDuration,
        weekOffDays: editFormData.weekOffDays
      };

      await axios.put(`${address}/api/tasks/reschedule/${editingMasterTask.taskGroupId}`, payload);

      toast.success('Master task updated and rescheduled successfully.');

      // Clear cache and refresh data
      cacheRef.current.clearByPattern("master-tasks-light");
      cacheRef.current.clearByPattern("master-tasks");
      await fetchMasterTasksUltraFast(false); // ⚡ Refresh with ultra-fast method
      setCurrentPage(1);

      // Close modal
      setShowEditModal(false);
      setEditingMasterTask(null);
      setEditFormData({
        title: '',
        description: '',
        priority: '',
        assignedTo: '',
        taskType: '',
        startDate: '',
        endDate: '',
        isForever: false,
        includeSunday: true,
        weeklyDays: [],
        monthlyDay: undefined,
        yearlyDuration: 1,
        weekOffDays: []
      });
    } catch (err) {
      console.error('Error rescheduling master task:', err);
      toast.error('Failed to update master task. Check server logs for details.');
    } finally {
      setIsSaving(false);
    }
  }, [editFormData, editingMasterTask, fetchMasterTasksUltraFast]);

  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
    setEditingMasterTask(null);
    setEditFormData({
      title: '',
      description: '',
      priority: '',
      assignedTo: '',
      taskType: '',
      startDate: '',
      endDate: '',
      isForever: false,
      includeSunday: true,
      weeklyDays: [],
      monthlyDay: undefined,
      yearlyDuration: 1,
      weekOffDays: []
    });
  }, []);

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
    cacheRef.current.clear(); // Clear cache when page size changes
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


  // ✅ FIXED: Function to get actual task IDs for a master task group
  const getTaskIdsForMasterTask = useCallback(async (taskGroupId: string): Promise<string[]> => {
    try {

      const companyId = user?.company?.companyId;
      if (!companyId) {
        throw new Error("Company ID is missing");
      }

      // Fetch the full master task details with all task instances
      const response = await axios.get(
        `${address}/api/tasks/master-recurring?companyId=${companyId}&limit=1000`
      );

      const masterTasks = response.data?.masterTasks || [];
      const targetMasterTask = masterTasks.find((mt: MasterTask) => mt.taskGroupId === taskGroupId);

      if (!targetMasterTask) {
        throw new Error(`Master task with taskGroupId ${taskGroupId} not found`);
      }

      if (!targetMasterTask.tasks || targetMasterTask.tasks.length === 0) {
        throw new Error(`No task instances found for master task ${taskGroupId}`);
      }

      const taskIds = targetMasterTask.tasks.map((task: Task) => task._id);

      return taskIds;
    } catch (error) {
      console.error('❌ Error getting task IDs for master task:', error);
      throw error;
    }
  }, [user?.company?.companyId]);

  // Memoized components for better performance
  const MasterTaskCard = memo<{ masterTask: MasterTask }>(({ masterTask }) => (
    <div
      onClick={() => {
        if (!isSelectionMode) return;
        if (!masterTask.parentTaskInfo?.isForever) return;

        const isSelected = selectedTasks.has(masterTask.taskGroupId);
        handleTaskSelection(masterTask.taskGroupId, !isSelected);
      }}
      className={`cursor-pointer bg-[--color-background] rounded-xl shadow-sm border transition-all duration-200 overflow-hidden ${isSelectionMode && masterTask.parentTaskInfo?.isForever
        ? selectedTasks.has(masterTask.taskGroupId)
          ? 'border-blue-400 bg-[--color-surface] shadow-lg'
          : 'border-[--color-border] hover:border-blue-300'
        : 'border-[--color-border] hover:shadow-md'
        }`}
    >
      <div className="p-6">
        {/* Selection checkbox for forever tasks */}
        {isSelectionMode && masterTask.parentTaskInfo?.isForever && (
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              checked={selectedTasks.has(masterTask.taskGroupId)}
              onChange={(e) => handleTaskSelection(masterTask.taskGroupId, e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
            />
            <label className="ml-2 text-sm font-medium text-blue-600">
              Select for reassign
            </label>
          </div>
        )}

        <div className="flex items-start justify-between mb-4">
          <div className="text-lg font-semibold text-[--color-text] mb-2">
            <ReadMore text={masterTask.title} maxLength={60} />
          </div>
          {hasMasterTaskActions && (
            <div className="flex items-center space-x-2 ml-2">
              {canEditRecurringTaskSchedules && (
                <button
                  onClick={() => handleEditMasterTask(masterTask)}
                  className="p-2 text-[--color-primary] hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
                  title="Edit master task"
                >
                  <Edit size={16} />
                </button>
              )}
              {canDeleteTasks && (
                <button
                  onClick={() => handleDeleteMasterTask(masterTask)}
                  className="flex items-center gap-1 p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                  title="Move to recycle bin"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                className="p-2 text-[--color-success] hover:bg-[--color-success] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                onClick={() => openReassignModal(masterTask)}
              >
                <RotateCcw size={18} />
              </button>

            </div>
          )}
        </div>

        {/* Selection indicator for non-forever tasks */}
        {isSelectionMode && !masterTask.parentTaskInfo?.isForever && (
          <div className="mb-4 p-2 bg-[--color-cardcolor] rounded-lg">
            <span className="text-xs text-red-500">
              Not available for reassign (not a forever task)
            </span>
          </div>
        )}

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
            <span className="flex items-center">
              <Paperclip size={14} className="mr-1" />
              Attachments:
            </span>
            {masterTask.attachments && masterTask.attachments.length > 0 ? (
              <button
                onClick={() => setShowAttachmentsModal({ attachments: masterTask.attachments, type: 'task' })}
                className="font-medium text-[--color-primary] hover:text-[--color-primary]"
              >
                Click Here ({masterTask.attachments.length})
              </button>
            ) : (
              <span>No Attachments</span>
            )}
          </div>
          <div className="flex justify-between">
            <span>Date range:</span>
            <span className="font-medium">
              {new Date(masterTask.dateRange.start).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'numeric',
                year: 'numeric',
              })} - {new Date(masterTask.dateRange.end).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          {masterTask.parentTaskInfo && (
            <>
              <div className="flex justify-between">
                <span>Include Sunday:</span>
                <span className="font-medium">
                  {masterTask.parentTaskInfo.includeSunday ? 'Yes' : 'No'}
                </span>
              </div>
              {(masterTask.parentTaskInfo?.weekOffDays || masterTask.weekOffDays || []).length > 0 && (
                <div className="flex justify-between">
                  <span>Week Off:</span>
                  <span className="font-medium">
                    {(masterTask.parentTaskInfo?.weekOffDays || masterTask.weekOffDays || [])
                      .map((d: number) =>
                        ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]
                      )
                      .join(', ')}
                  </span>
                </div>
              )}
            </>
          )}
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
            <button
              onClick={() => handleDeleteTask(task._id)}
              className="flex items-center gap-1 p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
              title="Delete task"
            >
              <Trash2 size={16} />
            </button>
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
            <span className="flex items-center">
              <Paperclip size={14} className="mr-1" />
              Task Attachments:
            </span>
            {task.attachments && task.attachments.length > 0 ? (
              <button
                onClick={() => setShowAttachmentsModal({ attachments: task.attachments, type: 'task' })}
                className="font-medium text-[--color-primary] hover:text-[--color-primary]"
              >
                Click Here ({task.attachments.length})
              </button>
            ) : (
              <span>No Attachments</span>
            )}
          </div>
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
          {task.completedAt && (
            <div className="flex justify-between">
              <span className="flex items-center">
                Completed:
                {task.completionRemarks && (
                  <button
                    onClick={() => setShowRemarksModal(task)}
                    className="ml-1 text-[--color-primary] hover:text-[--color-primary]"
                    title="View completion remarks"
                  >
                    <Info size={14} />
                  </button>
                )}
              </span>
              <span className="font-medium">
                {new Date(task.completedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
          {task.completionAttachments && task.completionAttachments.length > 0 && (
            <div className="flex justify-between">
              <span className="flex items-center">
                <Paperclip size={14} className="mr-1" />
                Completion Files:
              </span>
              <button
                onClick={() => setShowAttachmentsModal({ attachments: task.completionAttachments!, type: 'completion' })}
                className="font-medium text-[--color-success] hover:text-[--color-success]"
              >
                Click Here ({task.completionAttachments.length})
              </button>
            </div>
          )}
          {task.lastCompletedDate && (
            <div className="flex justify-between">
              <span>Last completed:</span>
              <span className="font-medium">
                {new Date(task.lastCompletedDate).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
          {task.parentTaskInfo && (
            <>
              <div className="flex justify-between">
                <span>Include Sunday:</span>
                <span className="font-medium">{task.parentTaskInfo.includeSunday ? 'Yes' : 'No'}</span>
              </div>
              {(task.parentTaskInfo.weekOffDays || task.weekOffDays || []).length > 0 && (
                <div className="flex justify-between">
                  <span>Week Off:</span>
                  <span className="font-medium">
                    {(task.parentTaskInfo.weekOffDays || task.weekOffDays || [])
                      .map((d: number) =>
                        ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]
                      )
                      .join(', ')}
                  </span>
                </div>
              )}
            </>
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
              {isSelectionMode && (
                <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Select
                </th>
              )}
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
                Task Attachments
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                Date Range
              </th>
              {hasMasterTaskActions && (
                <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-[--color-background] divide-y divide-[--color-border]">
            {masterTasks.map((masterTask: MasterTask) => (
              <tr
                onClick={() => {
                  if (!isSelectionMode) return;
                  if (!masterTask.parentTaskInfo?.isForever) return;

                  const isSelected = selectedTasks.has(masterTask.taskGroupId);
                  handleTaskSelection(masterTask.taskGroupId, !isSelected);
                }}
                className={`cursor-pointer transition-colors ${isSelectionMode && masterTask.parentTaskInfo?.isForever
                  ? selectedTasks.has(masterTask.taskGroupId)
                    ? 'bg-[--color-chat] hover:bg-[--color-surfacechat]'
                    : 'hover:bg-[--color-surface]'
                  : 'hover:bg-[--color-surface]'
                  }`}
              >
                {isSelectionMode && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {masterTask.parentTaskInfo?.isForever ? (
                      <input
                        type="checkbox"
                        checked={selectedTasks.has(masterTask.taskGroupId)}
                        onChange={(e) => handleTaskSelection(masterTask.taskGroupId, e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )}
                  </td>
                )}
                <td className="px-6 py-4">
                  <div>
                    <div className="text-sm font-medium text-[--color-text] mb-1">
                      <ReadMore text={masterTask.title} maxLength={80} />
                    </div>
                    {isSelectionMode && !masterTask.parentTaskInfo?.isForever && (
                      <div className="mt-1 text-xs text-red-500 font-medium">
                        Not available for reassign (not a forever task)
                      </div>
                    )}
                    <ReadMore text={masterTask.description} maxLength={descriptionMaxLength} />
                    <div className="flex items-center mt-2 space-x-2">
                      {masterTask.parentTaskInfo?.isForever && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[--color-primary-light] text-[--color-primary]">
                          FOREVER
                        </span>
                      )}
                      {masterTask.parentTaskInfo && (
                        <div className="flex flex-col space-y-1 text-xs text-[--color-textSecondary]">
                          <span>
                            Sunday: {masterTask.parentTaskInfo.includeSunday ? 'Yes' : 'No'}
                          </span>
                          {(masterTask.parentTaskInfo.weekOffDays || masterTask.weekOffDays || []).length > 0 && (
                            <span>
                              Week Off:{' '}
                              {(masterTask.parentTaskInfo.weekOffDays || masterTask.weekOffDays || [])
                                .map((d: number) =>
                                  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]
                                )
                                .join(', ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
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
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {masterTask.attachments && masterTask.attachments.length > 0 ? (
                    <button
                      onClick={() => setShowAttachmentsModal({ attachments: masterTask.attachments, type: 'task' })}
                      className="font-medium text-[--color-primary] hover:text-[--color-primary]"
                    >
                      Click Here ({masterTask.attachments.length})
                    </button>
                  ) : (
                    <span className="text-[--color-textSecondary]">No Attachments</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[--color-text]">
                    {new Date(masterTask.dateRange.start).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                  <div className="text-xs text-[--color-textSecondary]">
                    to {new Date(masterTask.dateRange.end).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </td>
                {hasMasterTaskActions && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {canEditRecurringTaskSchedules && (
                        <button
                          onClick={() => handleEditMasterTask(masterTask)}
                          className="p-2 text-[--color-primary] hover:bg-[--color-primary] hover:text-white rounded-lg transition-colors"
                          title="Edit master task"
                        >
                          <Edit size={16} />
                        </button>
                      )}
                      {canDeleteTasks && (
                        <button
                          onClick={() => handleDeleteMasterTask(masterTask)}
                          className="p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                          title="Move to recycle bin"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                      <button
                        className="p-2 text-[--color-success] hover:bg-[--color-success] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                        onClick={() => openReassignModal(masterTask)}
                        title="Reassign Tasks"
                      >
                        <RotateCcw size={18} />
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
                Task Attachments
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                Completed Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                Completion Files
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
                      <ReadMore text={task.title} maxLength={70} />
                    </div>
                    <ReadMore text={task.description} maxLength={descriptionMaxLength} />
                    <div className="flex items-center mt-2 space-x-2">
                      {task.parentTaskInfo?.isForever && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[--color-primary-light] text-[--color-primary]">
                          FOREVER
                        </span>
                      )}
                      {task.parentTaskInfo && (
                        <div className="flex flex-col space-y-1 text-xs text-[--color-textSecondary]">
                          <span>Sunday: {task.parentTaskInfo.includeSunday ? 'Yes' : 'No'}</span>
                          {(task.parentTaskInfo.weekOffDays || task.weekOffDays || []).length > 0 && (
                            <span>
                              Week Off:{' '}
                              {(task.parentTaskInfo.weekOffDays || task.weekOffDays || [])
                                .map((d: number) =>
                                  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]
                                )
                                .join(', ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
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
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {task.attachments && task.attachments.length > 0 ? (
                    <button
                      onClick={() => setShowAttachmentsModal({ attachments: task.attachments, type: 'task' })}
                      className="font-medium text-[--color-primary] hover:text-[--color-primary]"
                    >
                      Click Here ({task.attachments.length})
                    </button>
                  ) : (
                    <span className="text-[--color-textSecondary]">No Attachments</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[--color-text]">
                    {new Date(task.dueDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                  {task.lastCompletedDate && (
                    <div className="text-xs text-[--color-textSecondary]">
                      Last: {new Date(task.lastCompletedDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm flex items-center text-[--color-text]">
                    {task.completedAt ? new Date(task.completedAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    }) : ''}
                    {task.completionRemarks && task.completedAt && (
                      <button
                        onClick={() => setShowRemarksModal(task)}
                        className="ml-2 text-[--color-primary] hover:text-[--color-primary]"
                        title="View completion remarks"
                      >
                        <Info size={14} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {task.completionAttachments && task.completionAttachments.length > 0 ? (
                    <button
                      onClick={() => setShowAttachmentsModal({ attachments: task.completionAttachments!, type: 'completion' })}
                      className="font-medium text-[--color-success] hover:text-[--color-success]"
                    >
                      Click Here ({task.completionAttachments.length})
                    </button>
                  ) : (
                    <span className="text-[--color-textSecondary]">No Files</span>
                  )}
                </td>
                {canDeleteTasks && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleDeleteTask(task._id)}
                      className="flex items-center gap-1 p-2 text-[--color-error] hover:bg-[--color-error] hover:text-white hover:scale-105 rounded-lg transition-all duration-150 ease-in-out"
                      title="Move to recycle bin"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ✅ OPTIMIZED: Show loading for edit mode instead of "No master tasks found"
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

  const currentData = isEditMode ? masterTasks : individualTasks;

  return (
    <div className="min-h-full bg-[var(--color-background)] p-6">
      {/* Header */}
      <div className="mb-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">

          {/* LEFT: Title + Meta */}
          <div className="flex flex-col">
            <h1 className="text-lg lg:text-xl font-bold text-[--color-text] leading-tight whitespace-nowrap">
              Master Recurring Tasks
              {isAdmin && (
                <span className="hidden lg:inline text-xs font-normal text-[--color-primary] ml-2">
                  (Admin View - All Team)
                </span>
              )}
            </h1>

            <p className="
  text-xs text-[--color-textSecondary]
  flex flex-wrap items-center gap-1
  max-w-full
  break-words
  sm:flex-nowrap sm:whitespace-nowrap
">
              {isEditMode
                ? `${masterTasks.length} master task series`
                : `${individualTasks.length} recurring task(s) found`}

              <span className="shrink-0">
                {isAdmin ? ' (All team members)' : ' (Your tasks)'}
              </span>

              {totalCount > currentData.length && (
                <span className="shrink-0">
                  {` - Showing ${currentData.length} of ${totalCount}`}
                </span>
              )}

              {(loading || editModeLoading) && (
                <Loader className="h-3 w-3 animate-spin text-[--color-primary] shrink-0" />
              )}
            </p>
          </div>

          {/* RIGHT: Actions */}
          <div className="flex flex-wrap lg:flex-nowrap items-center gap-2">
            {canEditRecurringTaskSchedules && (
              <button
                onClick={handleEditModeToggle}
                disabled={editModeLoading}
                className={`
    px-3 py-2 text-xs lg:text-sm font-medium rounded-lg
    flex items-center whitespace-nowrap
    transition-all duration-300 ease-out
    active:scale-95
    ${isEditMode
                    ? 'bg-[--color-primary] text-white shadow-lg'
                    : 'bg-[--color-surface] text-[--color-text] hover:bg-[--color-border]'
                  }
    ${editModeLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.04]'}
  `}
              >
                <Settings
                  size={14}
                  className={`
      mr-1 transition-transform duration-500
      ${isEditMode ? 'rotate-180' : 'rotate-0'}
    `}
                />
                {isEditMode ? 'Exit Edit' : 'Edit Mode'}
              </button>
            )}

            {isEditMode && canEditRecurringTaskSchedules && (
              <div className="flex items-center gap-2">
                {/* Bulk Reassign Button */}
                <motion.button
                  layout="position"
                  onClick={toggleSelectionMode}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className={`px-3 py-2 text-xs lg:text-sm font-medium rounded-lg flex items-center whitespace-nowrap ${isSelectionMode
                    ? "bg-blue-600 text-white"
                    : "bg-[--color-surface] text-[--color-text] hover:bg-[--color-border]"
                    }`}
                >
                  <Users size={14} className="mr-1" />
                  {isSelectionMode ? "Exit Selection" : "Bulk Reassign"}
                </motion.button>

                {/* Animated group */}
                <AnimatePresence mode="wait">
                  {isSelectionMode && (
                    <motion.div
                      key="bulk-actions"
                      layout
                      className="flex items-center gap-2 overflow-hidden"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{
                        opacity: 1,
                        width: "auto",
                        transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
                      }}
                      exit={{
                        opacity: 0,
                        width: 0,
                        transition: {
                          duration: 0.3,
                          ease: [0.4, 0, 0.2, 1],
                          delay: 0.12 // ⭐ wait for children to exit
                        }
                      }}
                    >
                      {/* Select All */}
                      <motion.button
                        layout
                        initial={{ y: 8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{
                          y: 8,
                          opacity: 0,
                          transition: { duration: 0.18 }
                        }}
                        onClick={handleSelectAll}
                        className="px-3 py-2 text-xs lg:text-sm font-medium text-blue-600 bg-blue-50 rounded-lg whitespace-nowrap"
                      >
                        Select All
                      </motion.button>

                      {/* Clear */}
                      <motion.button
                        layout
                        initial={{ y: 8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{
                          y: 8,
                          opacity: 0,
                          transition: { duration: 0.18 }
                        }}
                        onClick={handleDeselectAll}
                        className="px-3 py-2 text-xs lg:text-sm font-medium text-gray-600 bg-gray-100 rounded-lg whitespace-nowrap"
                      >
                        Clear
                      </motion.button>

                      {/* Reassign */}
                      <AnimatePresence>
                        {selectedTasks.size > 0 && (
                          <motion.button
                            layout
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{
                              scale: 0.94,
                              opacity: 0,
                              transition: { duration: 0.18 }
                            }}
                            onClick={() => setShowBulkReassignModal(true)}
                            className="px-3 py-2 text-xs lg:text-sm font-medium text-white bg-green-600 rounded-lg flex items-center whitespace-nowrap"
                          >
                            <RotateCcw size={14} className="mr-1" />
                            Reassign ({selectedTasks.size})
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}



            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-2 text-xs lg:text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] rounded-lg flex items-center whitespace-nowrap"
            >
              <Filter size={14} className="mr-1" />
              Filters
            </button>

            {/* Desktop only */}
            <div className="hidden lg:block">
              <ViewToggle view={view} onViewChange={setView} />
            </div>
          </div>
        </div>
      </div>


      {/* Filters */}
      {showFilters && (
        <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-4">
            {!isEditMode && (
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-1">
                  Date From
                </label>
                <div className="relative">
                  <input
                    ref={dateFromRef}
                    type="date"
                    value={filter.dateFrom}
                    onClick={() => dateFromRef.current?.showPicker()}
                    onChange={(e) =>
                      setFilter({ ...filter, dateFrom: e.target.value })
                    }
                    className="w-full cursor-pointer text-sm px-3 py-2
                 border border-[--color-border] rounded-lg
                 bg-[--color-surface] text-[--color-text]"
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
            )}

            {!isEditMode && (
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-1">
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
                    className="w-full cursor-pointer text-sm px-3 py-2
                 border border-[--color-border] rounded-lg
                 bg-[--color-surface] text-[--color-text]"
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
            )}

            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-1">Task Type</label>
              <select
                value={filter.taskType}
                onChange={(e) => setFilter({ ...filter, taskType: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
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
                  className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
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

      {/* ✅ OPTIMIZED: Show loading for edit mode instead of "No master tasks found" */}
      {(loading || editModeLoading) && !initialLoading && (
        <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] p-8">
          <div className="flex items-center justify-center">
            <Loader className="h-8 w-8 animate-spin text-[--color-primary] mr-3" />
            <span className="text-[--color-textSecondary]">
              {editModeLoading ? 'loading edit mode...' : 'Loading tasks...'}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      {currentData.length === 0 && !loading && !editModeLoading ? (
        <div className="text-center py-12">
          <RotateCcw size={48} className="mx-auto mb-4 text-[--color-textSecondary]" />
          <p className="text-lg text-[--color-textSecondary]">
            {isEditMode
              ? 'No master tasks found'
              : Object.values(filter).some(value => value !== '')
                ? 'No recurring tasks match your filters'
                : 'No recurring tasks found'}
          </p>
          {!isEditMode && Object.values(filter).some(value => value !== '') && (
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 text-sm font-medium text-[--color-primary] hover:text-[--color-primary] transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {!loading && !editModeLoading && (
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

      {/* Edit Master Task Modal */}
      <EditMasterTaskModal
        showEditModal={showEditModal}
        editingMasterTask={editingMasterTask}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        users={users}
        isAdmin={isAdmin}
        isSaving={isSaving}
        onSave={handleSaveMasterTask}
        onCancel={handleCancelEdit}
      />

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

      {/* Delete Modal */}
      {showDeleteModal && deleteConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[--color-surface] rounded-2xl shadow-2xl w-full max-w-md transform transition-all">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600 " />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[--color-text]">
                    Delete Task
                  </h2>
                  {deleteConfig?.title && (
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-semibold">Task:</span> {deleteConfig.title}
                    </p>
                  )}
                  <p className="text-sm text-[--color-textsecondary] mt-0.5">
                    This action requires confirmation
                  </p>
                  {!binEnabled && (
                    <div className="bg-yellow-100 text-yellow-700 p-2 rounded mt-2 text-sm">
                      Recycle Bin is turned off. Please enable it from Settings to use the Move to Bin feature.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer - Buttons */}
            <div className="p-6 border-t border-gray-200 space-y-4">

              {/* Row: Move to Bin + Permanent Delete */}
              <div className="grid grid-cols-2 gap-3">

                {/* Move to Bin */}
                <button
                  onClick={async () => {
                    if (!binEnabled) {
                      toast.error("Recycle Bin is turned OFF. Please enable it from Settings.");
                      return;
                    }

                    setIsProcessingDelete(true);
                    setProcessingId('bin');

                    try {
                      if (!user?.company?.companyId) {
                        toast.error("Company ID is missing");
                        return;
                      }

                      let taskIds: string[] = [];

                      // ✅ FIXED: Proper handling for both single and master task deletion
                      if (deleteConfig?.type === "single" && deleteConfig.taskId) {
                        taskIds = [deleteConfig.taskId];
                      } else if (deleteConfig?.type === "master" && deleteConfig.taskGroupId) {
                        taskIds = await getTaskIdsForMasterTask(deleteConfig.taskGroupId);
                      }

                      if (taskIds.length === 0) {
                        toast.error("No tasks found to delete.");
                        return;
                      }

                      // Delete each task individually
                      await axios.delete(`${address}/api/tasks/bulk/master`, {
                        params: {
                          taskGroupId: deleteConfig.taskGroupId,
                          companyId: user.company.companyId,
                          permanent: false
                        }
                      });
                      // Clear cache and refresh data
                      cacheRef.current.clear();
                      if (isEditMode) {
                        await fetchMasterTasksUltraFast(false);
                      } else {
                        await fetchIndividualTasks(1, false);
                      }
                      setCurrentPage(1);

                      toast.success(`Moved ${taskIds.length} task(s) to Bin Successfully`);
                      setShowDeleteModal(false);
                      setDeleteConfig(null);
                    } catch (err) {
                      console.error('❌ Error moving to bin:', err);
                      toast.error("Error moving to bin");
                    } finally {
                      setIsProcessingDelete(false);
                      setProcessingId(null);
                    }
                  }}
                  disabled={isProcessingDelete || !binEnabled}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-medium transition-all shadow-lg
    ${binEnabled && !isProcessingDelete
                      ? "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 cursor-pointer"
                      : "bg-gray-400 cursor-not-allowed opacity-60 shadow-none"
                    }`}
                >
                  {isProcessingDelete && processingId === 'bin' ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isProcessingDelete && processingId === 'bin' ? 'Moving...' : 'Move to Bin'}
                </button>

                {/* Permanent Delete */}
                <button
                  onClick={async () => {
                    setIsProcessingDelete(true);
                    setProcessingId("delete");

                    try {
                      if (!user?.company?.companyId) {
                        toast.error("Company ID is missing");
                        return;
                      }

                      let taskIds: string[] = [];

                      // ✅ FIXED: Proper handling for both single and master task deletion
                      if (deleteConfig?.type === "single" && deleteConfig.taskId) {
                        taskIds = [deleteConfig.taskId];
                      } else if (deleteConfig?.type === "master" && deleteConfig.taskGroupId) {
                        taskIds = await getTaskIdsForMasterTask(deleteConfig.taskGroupId);
                      }

                      if (taskIds.length === 0) {
                        toast.error("No tasks found to delete.");
                        return;
                      }

                      // Delete each task permanently
                      await axios.delete(`${address}/api/tasks/bulk/master`, {
                        params: {
                          taskGroupId: deleteConfig.taskGroupId,
                          companyId: user.company.companyId,
                          permanent: true
                        }
                      });

                      // Clear cache and refresh data
                      cacheRef.current.clear();
                      if (isEditMode) {
                        await fetchMasterTasksUltraFast(false);
                      } else {
                        await fetchIndividualTasks(1, false);
                      }
                      setCurrentPage(1);

                      toast.success(`Permanently deleted ${taskIds.length} task(s)`);
                      setShowDeleteModal(false);
                      setDeleteConfig(null);
                    } catch (err) {
                      console.error('❌ Error deleting permanently:', err);
                      toast.error("Error deleting permanently");
                    } finally {
                      setIsProcessingDelete(false);
                      setProcessingId(null);
                    }
                  }}
                  disabled={isProcessingDelete}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-medium transition-all shadow-lg
    ${isProcessingDelete
                      ? "bg-gray-400 cursor-not-allowed opacity-60 shadow-none"
                      : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-500/25"
                    }`}
                >
                  {isProcessingDelete && processingId === "delete" ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  {isProcessingDelete && processingId === "delete"
                    ? "Deleting..."
                    : "Delete"}
                </button>


              </div>

              {/* Cancel Button (full width below) */}
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isProcessingDelete}
                className={`w-full px-4 py-3 rounded-xl text-gray-700  bg-gray-100 font-medium transition-all
    ${isProcessingDelete ? "cursor-not-allowed opacity-50" : "hover:bg-gray-200 "}`}
              >
                Cancel
              </button>

            </div>

          </div>
        </div>
      )}

      {showReassignModal && reassignTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[--color-surface] rounded-2xl shadow-2xl w-full max-w-md transform transition-all">
            {/* Header */}
            <div className="relative p-6 pb-4 border-b border-gray-100">
              <button
                onClick={() => setShowReassignModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
              <h2 className="text-2xl font-bold text-[--color-text] pr-8">
                Reassign Task
              </h2>
              <p className="text-sm text-[--color-textsecondary] mt-2 font-medium">
                {reassignTask.title}
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-3">
              {/* Reassign Button */}
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mt-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="text-sm text-blue-800">
                    <p className="text-blue-600">
                      <span className="font-bold">Reassign for Next Year:</span> Use the same task details for the next year.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mt-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="text-sm text-blue-800">
                    <p className="text-blue-600">
                      <span className="font-bold">Reassign With Edit:</span> Use for edit to customize before reassigning.
                    </p>
                  </div>
                </div>
              </div>

              <button
                disabled={!reassignTask.parentTaskInfo?.isForever}
                className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${reassignTask.parentTaskInfo?.isForever
                  ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  : "bg-gray-300 cursor-not-allowed opacity-60"
                  }`}
                onClick={handleReassign}
              >
                <RefreshCw className="w-5 h-5" />
                <span>Reassign for Next Year</span>
              </button>

              {!reassignTask.parentTaskInfo?.isForever && (
                <p className="text-xs text-[--color-text] text-center -mt-1">
                  Only available for forever recurring tasks
                </p>
              )}

              {/* Reassign With Edit Button */}
              <button
                className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 transform hover:scale-[1.02]"
                onClick={() =>
                  window.location.href = `/assign-task?mode=reassign&taskGroupId=${reassignTask.taskGroupId}`
                }
              >
                <Edit3 className="w-5 h-5" />
                <span>Reassign With Edit</span>
              </button>


              {/* Cancel Button */}
              <button
                className="w-full mt-4 py-3 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all duration-200"
                onClick={() => setShowReassignModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reassign Confirmation Modal */}
      {showBulkReassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[--color-surface] rounded-2xl shadow-2xl w-full max-w-[680px] max-h[650px] transform transition-all">
            {/* Header */}
            <div className="relative p-6 pb-4 border-b border-gray-100">
              <button
                onClick={() => setShowBulkReassignModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
              <h2 className="text-2xl font-bold text-[--color-text] pr-8">
                Bulk Reassign Tasks
              </h2>
              <p className="text-sm text-[--color-textsecondary] mt-2 font-medium">
                {selectedTasks.size} task(s) selected for reassignment
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold text-blue-900 mb-1">Bulk Reassign for Next Year</p>
                    <p className="text-blue-700">
                      All selected forever tasks will be reassigned for the next year period.
                      This will create new task instances starting from the day after the current end date.
                    </p>
                  </div>
                </div>
              </div>

              {/* Selected Tasks List */}
              <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Selected Tasks:
                </h4>

                <ul className="space-y-2">
                  {Array.from(selectedTasks).map(taskGroupId => {
                    const task = masterTasks.find(t => t.taskGroupId === taskGroupId);
                    const hasAttachments =
                      !!task && Array.isArray(task.attachments) && task.attachments.length > 0;
                    return (
                      <li
                        key={taskGroupId}
                        className={`flex items-center justify-between text-xs text-gray-700 bg-white p-2 rounded border transition-all duration-200
    ${hasAttachments && bulkIncludeFiles[taskGroupId] === undefined
                            ? 'border-red-500 bg-red-50 animate-pulse'
                            : 'border-gray-200 hover:bg-gray-50'
                          }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="truncate font-medium">
                            • {task?.title || taskGroupId}
                          </span>

                          {hasAttachments && (
                            <span className="flex items-center gap-1 text-blue-600 mr-2">
                              <Paperclip size={14} />
                              <span>Attachment</span>
                            </span>
                          )}
                        </div>

                        {/* Attachment option */}
                        {hasAttachments && (
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() =>
                                setBulkIncludeFiles(prev => ({
                                  ...prev,
                                  [taskGroupId]: true
                                }))
                              }
                              className={`px-2 py-1 rounded border transition-all duration-200
    ${bulkIncludeFiles[taskGroupId] === true
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : bulkIncludeFiles[taskGroupId] === undefined && hasAttachments
                                    ? 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100 font-semibold'
                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                                }`}
                            >
                              Add
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setBulkIncludeFiles(prev => ({
                                  ...prev,
                                  [taskGroupId]: false
                                }))
                              }
                              className={`px-2 py-1 rounded border transition-all duration-200
    ${bulkIncludeFiles[taskGroupId] === false
                                  ? 'bg-red-500 text-white border-red-500'
                                  : bulkIncludeFiles[taskGroupId] === undefined && hasAttachments
                                    ? 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100 font-semibold'
                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                                }`}
                            >
                              Don’t Add
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleBulkReassign}
                  disabled={isSaving}
                  className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${isSaving
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                    }`}
                >
                  {isSaving ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-5 h-5" />
                  )}
                  <span>{isSaving ? 'Processing...' : `Reassign ${selectedTasks.size} Task(s)`}</span>
                </button>

                <button
                  onClick={() => setShowBulkReassignModal(false)}
                  disabled={isSaving}
                  className="flex-1 py-3 rounded-xl font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showIncludeFilesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[--color-surface] rounded-xl shadow-lg w-full max-w-md p-6">

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[--color-text]">
                Include attachments & voice recordings?
              </h2>
              <button
                onClick={() => setShowIncludeFilesModal(false)}
                className="text-[--color-text] hover:text-[--color-textSecondary]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-[--color-] mb-6">
              Do you want to include all existing attachments and voice recordings
              while reassigning this task?
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => proceedReassign(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300
                     text-[--color-text] hover:bg-[--color-chat]"
              >
                No, continue without
              </button>

              <button
                onClick={() => proceedReassign(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg
                     bg-blue-600 text-white hover:bg-blue-700"
              >
                Yes, include
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default MasterRecurringTasks;