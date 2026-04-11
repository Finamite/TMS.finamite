// PendingRecurringTasks.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, CheckSquare, Filter, Search, ChevronDown, ChevronUp, CalendarDays, Paperclip, FileText, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import PriorityBadge from '../components/PriorityBadge';
import StatusBadge from '../components/StatusBadge';
import TaskTypeBadge from '../components/TaskTypeBadge';
import TaskCompletionModal from '../components/TaskCompletionModal';
import { useTaskSettings } from '../hooks/useTaskSettings';
import { address } from '../../utils/ipAddress';
import { useLocation } from 'react-router-dom';

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
    _id: string; username: string; email: string
  };
  dueDate: string;
  priority: string;
  status: string;
  lastCompletedDate?: string;
  createdAt: string;
  attachments: Attachment[]; // Added attachments property
}

interface User {
  _id?: string;
  username: string;
  email: string;
}

interface PendingRecurringTasksResponse {
  tasks: Task[];
  total: number;
  totalPages: number;
  currentPage: number;
  counts: {
    daily: number;
    cyclic: number;
  };
}

// Function to handle file download
const downloadFile = async (filename: string, originalName: string) => {
  try {
    const response = await fetch(`${address}/api/files/${encodeURIComponent(filename)}`);
    const blob = await response.blob();

    // Create a temporary URL for the blob
    const url = window.URL.createObjectURL(blob);

    // Create a temporary anchor element and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = originalName; // Use original filename
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading file:', error);
    // Fallback to opening in new tab if download fails
    window.open(`${address}/api/files/${encodeURIComponent(filename)}`, '_blank');
  }
};



// Helper function to detect mobile devices
const isMobileDevice = () => {
  return window.innerWidth < 768; // md breakpoint in Tailwind
};

// Helper function to get initial view preference
const getInitialViewPreference = (): 'card' | 'table' => {
  const savedView = localStorage.getItem('taskViewPreference');

  // If there's a saved preference, use it
  if (savedView === 'card' || savedView === 'table') {
    return savedView;
  }

  // If no saved preference, default to 'card' on mobile, 'table' on desktop
  return isMobileDevice() ? 'card' : 'table';
};

const PendingRecurringTasks: React.FC = () => {
  const { user } = useAuth();
  const { settings: taskSettings, loading: settingsLoading } = useTaskSettings();

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [highlightedTask, setHighlightedTask] = useState<Task | null>(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [sectionCounts, setSectionCounts] = useState({ daily: 0, cyclic: 0 });
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'table'>(getInitialViewPreference);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeSection, setActiveSection] = useState<'daily' | 'cyclic'>('daily');
  const [filter, setFilter] = useState({
    taskType: '',
    priority: '',
    assignedBy: '',
    assignedTo: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState<string | null>(null);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState<Attachment[] | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState<{ [key: string]: boolean }>({});
  const [showFullTitle, setShowFullTitle] = useState<{ [key: string]: boolean }>({});
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const cacheRef = useRef<Map<string, PendingRecurringTasksResponse>>(new Map());
  const location = useLocation();

  const toggleTitleVisibility = (taskId: string) => {
    setShowFullTitle(prev => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const isAdmin = user?.role === 'admin' || user?.permissions?.canViewAllTeamTasks;

  // Helper functions for date calculations - DEFINED FIRST
  const isOverdue = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today's date to start of day
    const taskDueDate = new Date(dueDate);
    taskDueDate.setHours(0, 0, 0, 0); // Normalize task due date to start of day
    return taskDueDate < today;
  };

  const getDaysOverdue = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = new Date(dueDate);
    taskDueDate.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - taskDueDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDueDate = new Date(dueDate);
    taskDueDate.setHours(0, 0, 0, 0);
    const diffTime = taskDueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Helper to determine if a filename is an image based on its extension
  const isImage = (filename?: string, originalName?: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const targetName = (filename || originalName || '').toLowerCase().split('?')[0];
    return imageExtensions.some(ext => targetName.endsWith(ext));
  };

  // Function to toggle full description visibility for a task
  const toggleDescription = (taskId: string) => {
    setShowFullDescription(prevState => ({
      ...prevState,
      [taskId]: !prevState[taskId]
    }));
  };
  const getTaskDueStatus = (task: Task) => {
    if (isOverdue(task.dueDate)) return 'overdue';
    const daysUntilDue = getDaysUntilDue(task.dueDate);
    if (daysUntilDue <= 0) return 'due today';
    if (daysUntilDue === 1) return 'due tomorrow';
    return task.taskType === 'daily' ? 'daily' : 'cyclic';
  };
  const totalPages = Math.max(1, Math.ceil(totalTasks / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + allTasks.length;
  const currentTasks = allTasks;
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
  };
  useEffect(() => {
    localStorage.setItem('taskViewPreference', view);
  }, [view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filter.search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filter.search]);

  const buildRequestParams = useCallback((sectionValue: 'daily' | 'cyclic', pageValue: number) => {
    const params: any = {
      companyId: user?.company?.companyId,
      paginated: true,
      page: pageValue,
      limit: itemsPerPage,
      section: sectionValue
    };

    if (!isAdmin && user?.id) {
      params.userId = user.id;
    }

    if (filter.taskType) params.taskType = filter.taskType;
    if (filter.priority) params.priority = filter.priority;
    if (filter.assignedBy) params.assignedBy = filter.assignedBy;
    if (filter.assignedTo) params.assignedTo = filter.assignedTo;
    if (debouncedSearch) params.search = debouncedSearch;

    return params;
  }, [
    user?.company?.companyId,
    user?.id,
    isAdmin,
    itemsPerPage,
    filter.taskType,
    filter.priority,
    filter.assignedBy,
    filter.assignedTo,
    debouncedSearch
  ]);

  const buildCacheKey = useCallback((sectionValue: 'daily' | 'cyclic', pageValue: number) => {
    return JSON.stringify(buildRequestParams(sectionValue, pageValue));
  }, [buildRequestParams]);

  const applyPayload = useCallback((payload: PendingRecurringTasksResponse, pageValue: number) => {
    setAllTasks(payload.tasks || []);
    setTotalTasks(payload.total || 0);
    setSectionCounts(payload.counts || { daily: 0, cyclic: 0 });

    const safeTotalPages = Math.max(1, payload.totalPages || 1);
    if (pageValue > safeTotalPages) {
      setCurrentPage(safeTotalPages);
    }
  }, []);

  const prefetchSection = useCallback(async (sectionValue: 'daily' | 'cyclic') => {
    if (!user?.company?.companyId) return;

    const prefetchPage = 1;
    const prefetchKey = buildCacheKey(sectionValue, prefetchPage);
    if (cacheRef.current.has(prefetchKey)) return;

    try {
      const prefetchParams = buildRequestParams(sectionValue, prefetchPage);
      const response = await axios.get<PendingRecurringTasksResponse>(
        `${address}/api/tasks/pending-recurring`,
        { params: prefetchParams }
      );
      cacheRef.current.set(prefetchKey, response.data);
    } catch (error) {
      // Prefetch is best-effort only.
    }
  }, [user?.company?.companyId, buildCacheKey, buildRequestParams]);

  const fetchTaskById = useCallback(async (taskId: string) => {
    try {
      if (!user?.company?.companyId) return;
      const params: any = {
        companyId: user.company.companyId
      };
      if (!isAdmin && user?.id) {
        params.userId = user.id;
      }
      const response = await axios.get<Task>(`${address}/api/tasks/by-id/${taskId}`, { params });
      setHighlightedTask(response.data);
    } catch (error) {
      setHighlightedTask(null);
      console.error('Error fetching highlighted task:', error);
    }
  }, [isAdmin, user?.company?.companyId, user?.id]);
  const fetchTasks = useCallback(async () => {
    try {
      if (!user?.company?.companyId) {
        setAllTasks([]);
        setTotalTasks(0);
        setSectionCounts({ daily: 0, cyclic: 0 });
        setLoading(false);
        return;
      }

      const cacheKey = buildCacheKey(activeSection, currentPage);
      const cachedPayload = cacheRef.current.get(cacheKey);

      if (cachedPayload) {
        applyPayload(cachedPayload, currentPage);
        setLoading(false);
        void prefetchSection(activeSection === 'daily' ? 'cyclic' : 'daily');
        return;
      }

      setLoading(true);
      const params = buildRequestParams(activeSection, currentPage);
      const response = await axios.get<PendingRecurringTasksResponse>(
        `${address}/api/tasks/pending-recurring`,
        { params }
      );
      cacheRef.current.set(cacheKey, response.data);
      applyPayload(response.data, currentPage);
      void prefetchSection(activeSection === 'daily' ? 'cyclic' : 'daily');
    } catch (error) {
      setAllTasks([]);
      setTotalTasks(0);
      setSectionCounts({ daily: 0, cyclic: 0 });
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  }, [
    user?.company?.companyId,
    user?.id,
    currentPage,
    activeSection,
    buildCacheKey,
    buildRequestParams,
    applyPayload,
    prefetchSection
  ]);
  const handleRefresh = useCallback(() => {
    cacheRef.current.clear();
    void fetchTasks();
  }, [fetchTasks]);
  const fetchUsers = useCallback(async () => {
    try {
      if (!user?.company?.companyId) return;
      const params: any = {
        companyId: user.company.companyId
      };
      if (user?.role) {
        params.role = user.role;
      }
      const response = await axios.get(`${address}/api/users`, { params });
      const sortedUsers = response.data.sort((a: User, b: User) =>
        a.username.localeCompare(b.username)
      );
      setUsers(sortedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, [user?.company?.companyId, user?.role]);
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);
  useEffect(() => {
    const taskId = location.state?.highlightTaskId;
    const shouldOpen = location.state?.openCompleteModal;
    if (taskId && shouldOpen) {
      setShowCompleteModal(taskId);
      fetchTaskById(taskId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.highlightTaskId, location.state?.openCompleteModal, fetchTaskById]);
  const handleTaskCompletion = () => {
    if (!showCompleteModal) return;
    const completedTaskId = showCompleteModal;
    cacheRef.current.clear();
    setAllTasks(prev => prev.filter(task => task._id !== completedTaskId));
    setHighlightedTask(prev => (prev?._id === completedTaskId ? null : prev));
    setTotalTasks(prev => Math.max(0, prev - 1));
    setSectionCounts(prev => ({
      ...prev,
      [activeSection]: Math.max(0, prev[activeSection] - 1)
    }));
    setShowCompleteModal(null);
  };
  const getTaskToComplete = () => {
    const fromPage = allTasks.find(task => task._id === showCompleteModal);
    if (fromPage) return fromPage;
    if (highlightedTask?._id === showCompleteModal) return highlightedTask;
    return null;
  };
  const setFilterValue = (key: 'taskType' | 'priority' | 'assignedBy' | 'assignedTo' | 'search', value: string) => {
    cacheRef.current.clear();
    setFilter(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };
  const resetFilters = () => {
    cacheRef.current.clear();
    setFilter({ taskType: '', priority: '', assignedBy: '', assignedTo: '', search: '' });
    setCurrentPage(1);
  };
  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    cacheRef.current.clear();
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const renderCardView = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {currentTasks.map((task) => {
        const daysUntilDue = getDaysUntilDue(task.dueDate);
        const overdue = isOverdue(task.dueDate);
        const descriptionIsLong = task.description.length > 145;
        const displayDescription = showFullDescription[task._id] || !descriptionIsLong
          ? task.description
          : truncateText(task.description, 145);

        return (
          <div
            key={task._id}
            className={`group relative overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_12px_34px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-primary)]/25 hover:shadow-[0_16px_42px_rgba(15,23,42,0.1)] ${
              overdue
                ? 'ring-1 ring-[var(--color-error)]/25'
                : daysUntilDue <= 1
                  ? 'ring-1 ring-[var(--color-warning)]/25'
                  : ''
            }`}
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TaskTypeBadge taskType={task.taskType} />
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={getTaskDueStatus(task)} />
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-textSecondary)]">
                      ID {task.taskId || '-'}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[1rem] font-semibold leading-snug text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)]">
                    {showFullTitle[task._id] ? task.title : truncateText(task.title, 64)}
                    {task.title.length > 64 && (
                      <button
                        onClick={() => toggleTitleVisibility(task._id)}
                        className="ml-2 text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        Show {showFullTitle[task._id] ? 'less' : 'more'}
                      </button>
                    )}
                  </h3>
                </div>
                <button
                  onClick={() => setShowCompleteModal(task._id)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-success)] transition hover:bg-[rgba(34,197,94,0.08)]"
                  title="Complete task"
                >
                  <CheckSquare size={16} />
                </button>
              </div>

              <p className="mt-2 text-sm leading-6 text-[var(--color-textSecondary)] whitespace-pre-wrap break-words">
                {displayDescription}
                {descriptionIsLong && (
                  <button
                    onClick={() => toggleDescription(task._id)}
                    className="ml-2 text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {showFullDescription[task._id] ? 'See less' : 'See more'}
                  </button>
                )}
              </p>

              <div className="mt-5 space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--color-textSecondary)]">Task ID:</span>
                  <span className="font-semibold text-[var(--color-text)]">{task.taskId || '-'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--color-textSecondary)]">Assigned by:</span>
                  <span className="font-semibold text-[var(--color-text)]">{task.assignedBy.username}</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[var(--color-textSecondary)]">Assigned to:</span>
                    <span className="font-semibold text-[var(--color-text)]">{task.assignedTo.username}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--color-textSecondary)]">Due date:</span>
                  <span
                    className={`font-semibold ${
                      overdue
                        ? 'text-[var(--color-error)]'
                        : daysUntilDue <= 1
                          ? 'text-[var(--color-warning)]'
                          : 'text-[var(--color-text)]'
                    }`}
                  >
                    {new Date(task.dueDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {task.lastCompletedDate && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[var(--color-textSecondary)]">Last completed:</span>
                    <span className="font-semibold text-[var(--color-text)]">
                      {new Date(task.lastCompletedDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1 text-[var(--color-textSecondary)]">
                    <Paperclip size={14} />
                    Attachments
                  </span>
                  {task.attachments && task.attachments.length > 0 ? (
                    <button
                      onClick={() => setShowAttachmentsModal(task.attachments)}
                      className="font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      View ({task.attachments.length})
                    </button>
                  ) : (
                    <span className="text-[var(--color-textSecondary)]">No attachments</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTableView = () => (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="mx-3 mt-3 overflow-x-auto rounded-[22px] bg-[var(--color-surface)]">
          <table className="min-w-full table-fixed">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              {isAdmin && <col className="w-[14%]" />}
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Task ID
                </th>
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Task
                </th>
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Type
                </th>
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Priority
                </th>
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Assigned By
                </th>
                {isAdmin && (
                  <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                    Assigned To
                  </th>
                )}
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Attachments
                </th>
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Due Date
                </th>
                <th className="border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
              {currentTasks.map((task) => {
                const overdue = isOverdue(task.dueDate);
                const daysUntilDue = getDaysUntilDue(task.dueDate);
                const descriptionIsLong = task.description.length > 145;
                const displayDescription = showFullDescription[task._id] || !descriptionIsLong
                  ? task.description
                  : truncateText(task.description, 145);

                return (
                  <tr
                    key={task._id}
                    className={`transition-colors hover:bg-[var(--color-surface)] ${overdue ? 'bg-[var(--color-error)]/5 hover:bg-[var(--color-error)]/10'
                      : daysUntilDue <= 0 ? 'bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/20'
                        : ''
                      }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                      {task.taskId || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text)] mb-1">
                          {showFullTitle[task._id] ? task.title : truncateText(task.title, 64)}
                          {task.title.length > 64 && (
                            <button
                              onClick={() => toggleTitleVisibility(task._id)}
                              className="ml-2 text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              {showFullTitle[task._id] ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>
                        <div className="text-sm text-[var(--color-textSecondary)] whitespace-pre-wrap break-words">
                          {displayDescription}
                          {descriptionIsLong && (
                            <button
                              onClick={() => toggleDescription(task._id)}
                              className="ml-2 text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              {showFullDescription[task._id] ? 'See less' : 'See more'}
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {overdue && <StatusBadge status="overdue" />}
                          {!overdue && daysUntilDue <= 0 && <StatusBadge status="due today" />}
                          {!overdue && daysUntilDue === 1 && <StatusBadge status="due tomorrow" />}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap"><TaskTypeBadge taskType={task.taskType} /></td>
                    <td className="px-6 py-4 whitespace-nowrap"><PriorityBadge priority={task.priority} /></td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-[var(--color-text)]">{task.assignedBy.username}</div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[var(--color-text)]">{task.assignedTo.username}</div>
                        <div className="text-sm text-[var(--color-textSecondary)]">{task.assignedTo.email}</div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {task.attachments && task.attachments.length > 0 ? (
                        <button
                          onClick={() => setShowAttachmentsModal(task.attachments)}
                          className="font-semibold text-[var(--color-primary)] hover:underline"
                        >
                          View ({task.attachments.length})
                        </button>
                      ) : (
                        <span className="text-[var(--color-textSecondary)]">No attachments</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-semibold ${overdue ? 'text-[var(--color-error)]' : daysUntilDue <= 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text)]'}`}>
                        {new Date(task.dueDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                      <div className="text-xs text-[var(--color-textSecondary)]">
                        Created: {new Date(task.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                      {task.lastCompletedDate && (
                        <div className="text-xs text-[var(--color-textSecondary)]">
                          Last: {new Date(task.lastCompletedDate).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setShowCompleteModal(task._id)}
                        className="inline-flex items-center justify-center rounded-2xl border border-[var(--color-success)]/20 bg-[var(--color-success)]/10 p-2.5 text-[var(--color-success)] transition hover:-translate-y-0.5 hover:border-[var(--color-success)]/30 hover:bg-[var(--color-success)]/15"
                        title="Complete task"
                      >
                        <CheckSquare size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (loading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  const dailyTasksCount = sectionCounts.daily;
  const cyclicTasksCount = sectionCounts.cyclic;
  const completingTask = getTaskToComplete();

  return (
    <div className="min-h-full bg-[var(--color-background)] p-4 sm:p-6">
      <section className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 py-4 shadow-sm backdrop-blur-xl sm:px-5 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)] sm:text-[1.65rem]">
              {isAdmin ? 'Team Pending Recurring Tasks' : 'My Pending Recurring Tasks'}
            </h1>
            <p className="mt-1 truncate text-xs text-[var(--color-textSecondary)]">
              {totalTasks} tasks found
              {activeSection === 'daily' ? ' for today' : ' in the next 5 days'}
              {isAdmin ? ' (All team members)' : ' (Your tasks)'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/25 hover:text-[var(--color-primary)]"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <ViewToggle view={view} onViewChange={setView} />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative inline-grid grid-cols-2 items-center self-start rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <span
              aria-hidden="true"
              className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-0.25rem)] rounded-full bg-[var(--color-primary)] shadow-[0_6px_14px_rgba(14,165,233,0.24)] transition-transform duration-300 ease-out ${
                activeSection === 'cyclic' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            <button
              onClick={() => {
                setActiveSection('daily');
                setCurrentPage(1);
              }}
              className={`relative z-10 flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors duration-300 ${
                activeSection === 'daily'
                  ? 'text-white'
                  : 'text-text'
              }`}
            >
              <CalendarDays size={12} />
              <span>Daily</span>
              {dailyTasksCount > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  activeSection === 'daily'
                    ? 'bg-white/15 text-white'
                    : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                }`}>
                  {dailyTasksCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setActiveSection('cyclic');
                setCurrentPage(1);
              }}
              className={`relative z-10 flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors duration-300 ${
                activeSection === 'cyclic'
                  ? 'text-white'
                  : 'text-text'
              }`}
            >
              <RefreshCw size={12} />
              <span>Cyclic</span>
              {cyclicTasksCount > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  activeSection === 'cyclic'
                    ? 'bg-white/15 text-white'
                    : 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                }`}>
                  {cyclicTasksCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/25 hover:text-[var(--color-primary)]"
          >
            <Filter size={14} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-4 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background)] p-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Task Type</label>
              <select
                value={filter.taskType}
                onChange={(e) => setFilterValue('taskType', e.target.value)}
                className="w-full text-sm px-1 py-1 border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-colors"
              >
                <option value="">All Types</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Priority</label>
              <select
                value={filter.priority}
                onChange={(e) => setFilterValue('priority', e.target.value)}
                className="w-full text-sm px-1 py-1 border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-colors"
              >
                <option value="">All Priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
  <div>
    <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
      Assigned By
    </label>

    <select
      value={filter.assignedBy}
      onChange={(e) => setFilterValue('assignedBy', e.target.value)}
      className="w-full text-sm px-1 py-1 border border-[var(--color-border)] bg-[var(--color-surface)] 
      text-[var(--color-text)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] 
      focus:border-[var(--color-primary)] transition-colors"
    >
      <option value="">All</option>

      {users.filter((u) => u._id).map((u) => (
        <option key={u._id} value={u._id}>
          {u.username}
        </option>
      ))}
    </select>
  </div>

            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Team Member</label>
                  <select
                    value={filter.assignedTo}
                    onChange={(e) => setFilterValue('assignedTo', e.target.value)}
                  className="w-full text-sm px-1 py-1 border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-colors"
                >
                  <option value="">All Members</option>
                  {users.map((user) => (
                    <option key={user._id} value={user._id}>{user.username}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Search</label>
              <div className="relative">
                <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--color-textSecondary)]" />
                <input
                  type="text"
                  placeholder="Search tasks or Task ID..."
                  value={filter.search}
                  onChange={(e) => setFilterValue('search', e.target.value)}
                  className="w-full pl-10 text-sm pr-1 py-1 border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-colors"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters} className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/25 hover:text-[var(--color-primary)]">
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </section>

      {totalTasks === 0 ? (
        <div className="mt-4 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-6 py-16 text-center shadow-lg shadow-black/5 backdrop-blur-xl">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)]/20 to-[var(--color-accent)]/20">
            {activeSection === 'daily' ? (
              <CalendarDays size={32} className="text-[var(--color-primary)]" />
            ) : (
              <RefreshCw size={32} className="text-[var(--color-accent)]" />
            )}
          </div>
          <h3 className="mb-2 text-xl font-semibold text-[var(--color-text)]">
            No {activeSection === 'daily' ? 'daily tasks for today' : 'pending cyclic tasks'}
          </h3>
          <p className="mb-4 text-[var(--color-textSecondary)]">
            {activeSection === 'daily'
              ? "Great job! You don't have any daily tasks due today."
              : "No cyclic tasks are pending or due within the next 5 days."
            }
          </p>
          {!isAdmin && <p className="text-sm text-[var(--color-textSecondary)]/70">Contact your admin if you think you should have tasks assigned</p>}
        </div>
      ) : (
        <>
          {view === 'card' ? renderCardView() : renderTableView()}

          {/* Enhanced Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg shadow-black/5 backdrop-blur-xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-textSecondary)]">
                    <span className="font-semibold text-[var(--color-text)]">Show</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                    <span>per page</span>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm text-[var(--color-textSecondary)]">
                    Showing <span className="font-semibold text-[var(--color-text)]">{totalTasks === 0 ? 0 : startIndex + 1}</span> to{' '}
                    <span className="font-semibold text-[var(--color-text)]">{Math.min(endIndex, totalTasks)}</span> of{' '}
                    <span className="font-semibold text-[var(--color-text)]">{totalTasks}</span> results
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="First page"
                  >
                    <ChevronsLeft size={16} />
                  </button>

                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="flex items-center gap-2">
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
                          className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition ${currentPage === pageNumber
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-md'
                            : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] hover:border-[var(--color-primary)]/30 hover:text-[var(--color-text)]'
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
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                    title="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>

                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Task Completion Modal */}
      {showCompleteModal && completingTask && (
        <TaskCompletionModal
          taskId={showCompleteModal}
          taskTitle={completingTask.title}
          isRecurring={true}
          allowAttachments={
            taskSettings.enabled
              ? taskSettings.pendingRecurringTasks?.allowAttachments ?? false
              : false
          }
          mandatoryAttachments={
            taskSettings.enabled
              ? taskSettings.pendingRecurringTasks?.mandatoryAttachments ?? false
              : false
          }
          mandatoryRemarks={
            taskSettings.enabled
              ? taskSettings.pendingRecurringTasks?.mandatoryRemarks ?? false
              : false
          }
          onClose={() => setShowCompleteModal(null)}
          onComplete={handleTaskCompletion}
        />
      )}

      {/* Attachments Modal */}
      {showAttachmentsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
            <div className="p-6">
              <h3 className="mb-4 flex items-center text-lg font-semibold text-[var(--color-text)]">
                <Paperclip size={20} className="mr-2" />
                Task Attachments
                <span className="ml-2 text-sm font-normal text-[var(--color-textSecondary)]">
                  ({showAttachmentsModal.length} file{showAttachmentsModal.length !== 1 ? 's' : ''})
                </span>
              </h3>
              {showAttachmentsModal.length > 0 ? (
                <div className="max-h-96 overflow-y-auto pr-2">
                  <div className="grid grid-cols-1 gap-3">
                    {showAttachmentsModal.map((attachment, index) => (
                      <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors">
                        <div className="flex items-center mb-3 sm:mb-0 sm:mr-4 flex-1 min-w-0">
                          {isImage(attachment.filename, attachment.originalName) ? (
                            <>
                              {/* Small preview image in the list */}
                              <img
                                src={`${address}/api/files/${encodeURIComponent(attachment.filename)}`}
                                alt={attachment.originalName}
                                className="w-16 h-16 object-cover rounded-md mr-3 border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors shadow-sm"
                                onClick={() => setSelectedImagePreview(`${address}/api/files/${encodeURIComponent(attachment.filename)}`)} // Set for full screen
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-[var(--color-text)] truncate" title={attachment.originalName}>
                                  {attachment.originalName}
                                </div>
                                <div className="text-xs text-[var(--color-textSecondary)] mt-1">
                                  Image • {(attachment.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-md mr-3 flex items-center justify-center border border-[var(--color-border)]">
                                <FileText size={24} className="text-[var(--color-primary)]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-[var(--color-text)] truncate" title={attachment.originalName}>
                                  {attachment.originalName}
                                </div>
                                <div className="text-xs text-[var(--color-textSecondary)] mt-1">
                                  Document • {(attachment.size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {isImage(attachment.filename, attachment.originalName) && (
                            <button
                              onClick={() => setSelectedImagePreview(`${address}/api/files/${encodeURIComponent(attachment.filename)}`)}
                              className="px-3 py-2 text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 hover:bg-[var(--color-accent)]/10 rounded-lg transition-colors flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Preview
                            </button>
                          )}
                          <button
                            onClick={() => downloadFile(attachment.filename, attachment.originalName)}
                            className="px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 hover:bg-[var(--color-primary)]/10 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Paperclip size={48} className="mx-auto text-[var(--color-textSecondary)]/50 mb-3" />
                  <p className="text-sm text-[var(--color-textSecondary)]">No attachments for this task.</p>
                </div>
              )}
              <div className="mt-6 flex justify-end border-t border-[var(--color-border)] pt-4">
                <button
                  onClick={() => setShowAttachmentsModal(null)}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2 font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-background)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Image Preview Modal */}
      {selectedImagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedImagePreview(null)}
        >
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImagePreview}
              alt="Full Screen Preview"
              className="max-h-[90vh] max-w-full cursor-pointer rounded-lg object-contain shadow-2xl"
              onClick={() => setSelectedImagePreview(null)}
            />
            <button
              onClick={() => setSelectedImagePreview(null)}
              className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-2xl text-white shadow-lg transition-colors hover:bg-red-600"
              title="Close"
            >
              &times;
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/75 px-4 py-2 text-sm text-white">
              Click anywhere to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingRecurringTasks;

