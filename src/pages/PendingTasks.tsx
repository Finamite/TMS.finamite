import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CheckSquare, Clock, RefreshCcw, Search, Users, Calendar, ArrowUpDown, ArrowUp, ArrowDown, Filter, Paperclip, FileText, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import PriorityBadge from '../components/PriorityBadge';
import TaskCompletionModal from '../components/TaskCompletionModal';
import { useTaskSettings } from '../hooks/useTaskSettings';
import { address } from '../../utils/ipAddress';
import { useLocation } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';

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
  dueDate?: string;
  priority: string;
  status: string;
  revisionCount: number;
  createdAt: string;
  attachments: Attachment[];
  lastPlannedDate?: string;
  requiresApproval?: boolean;
}

interface User {
  _id: string;
  username: string;
  email: string;
}

type SortOrder = 'asc' | 'desc' | 'none';

// Helper function to detect mobile devices
const isMobileDevice = () => {
  return window.innerWidth < 768; // md breakpoint in Tailwind
};

// Helper function to check if currently on mobile
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(isMobileDevice);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};



// Helper function to get initial view preference
const getInitialViewPreference = (): 'table' | 'card' => {
  const savedView = localStorage.getItem('taskViewPreference');

  // If there's a saved preference, use it
  if (savedView === 'table' || savedView === 'card') {
    return savedView;
  }

  // If no saved preference, default to 'card' on mobile, 'table' on desktop
  return isMobileDevice() ? 'card' : 'table';
};

const PendingTasks: React.FC = () => {
  const { user } = useAuth();
  const { settings: taskSettings, loading: settingsLoading } = useTaskSettings();
  const isMobile = useIsMobile();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'card'>(getInitialViewPreference);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortOrder, setSortOrder] = useState<SortOrder>('none');
  const location = useLocation();
  const [filter, setFilter] = useState({
    status: '',
    priority: '',
    assignedTo: '',
    assignedBy: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showCompleteModal, setShowCompleteModal] = useState<string | null>(null);
  const [showReviseModal, setShowReviseModal] = useState<string | null>(null);
  const [revisionDate, setRevisionDate] = useState('');
  const [revisionRemarks, setRevisionRemarks] = useState('');
  const [showFullDescription, setShowFullDescription] = useState<{ [key: string]: boolean }>({});

  const [showFilters, setShowFilters] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState<Attachment[] | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<{ [key: string]: boolean }>({});
  const [revisionSettings, setRevisionSettings] = useState<any>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const [tableHasScrolled, setTableHasScrolled] = useState(false);

  // Calculate pagination
  const totalPages = Math.ceil(tasks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTasks = tasks.slice(startIndex, endIndex);
  const [showFullTitle, setShowFullTitle] = useState<{ [key: string]: boolean }>({});

  const toggleTitleVisibility = (taskId: string) => {
    setShowFullTitle(prevState => ({
      ...prevState,
      [taskId]: !prevState[taskId]
    }));
  };

  useEffect(() => {
    if (location.state?.highlightTaskId && location.state?.openCompleteModal) {
      const taskId = location.state.highlightTaskId;
      setShowCompleteModal(taskId);

      // Clear state so modal won't reopen on refresh
      window.history.replaceState({}, document.title);
    }
  }, [allTasks]);

  useEffect(() => {
    if (!loading && location.state?.highlightTaskId && location.state?.openCompleteModal) {
      const taskId = location.state.highlightTaskId;
      setShowCompleteModal(taskId);

      window.history.replaceState({}, document.title);
    }
  }, [loading]);

  // Force card view on mobile
  useEffect(() => {
    if (isMobile && view === 'table') {
      setView('card');
    }
  }, [isMobile, view]);

  useEffect(() => {
    const scrollEl = document.querySelector('main');
    if (!(scrollEl instanceof HTMLElement) || view === 'card' || isMobile) {
      setTableHasScrolled(false);
      return;
    }

    const updateScrolledState = () => {
      setTableHasScrolled(scrollEl.scrollTop > 8);
    };

    updateScrolledState();
    scrollEl.addEventListener('scroll', updateScrolledState, { passive: true });
    return () => scrollEl.removeEventListener('scroll', updateScrolledState);
  }, [view, isMobile, tasks.length]);

  useEffect(() => {
    localStorage.setItem('taskViewPreference', view);
  }, [view]);

  useEffect(() => {
    fetchTasks();
    if (user?.permissions.canViewAllTeamTasks) {
      fetchUsers();
    }
  }, [user]);

  useEffect(() => {
    const fetchRevisionSettings = async () => {
      if (user?.company?.companyId && !revisionSettings) {
        try {
          const response = await axios.get(`${address}/api/settings/revision?companyId=${user.company.companyId}`);
          setRevisionSettings(response.data);
        } catch (error) {
          console.error('Error fetching revision settings:', error);
        }
      }
    };
    fetchRevisionSettings();
  }, [user, revisionSettings]);

  useEffect(() => {
    if (showReviseModal) {
      const selectedTask = allTasks.find(t => t._id === showReviseModal);
      if (!selectedTask) {
        // If task not found yet, default to today
        setRevisionDate(new Date().toISOString().split("T")[0]);
        setRevisionRemarks('');
        return;
      }
      let rawBase = selectedTask?.lastPlannedDate || selectedTask?.dueDate || null;
      let parsed = rawBase ? parseDate(rawBase) : null;
      let baseDate = parsed ? parsed : new Date();
      setRevisionDate(baseDate.toISOString().split("T")[0]);
      setRevisionRemarks('');
    } else {
      setRevisionDate('');
      setRevisionRemarks('');
    }
  }, [showReviseModal, allTasks]);

  useEffect(() => {
    applyFiltersAndSort();
    setCurrentPage(1);
  }, [allTasks, filter, sortOrder]);


  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        taskType: 'one-time'
      });

      if (user?.company?.companyId) {
        params.append('companyId', user.company.companyId);
      }

      if (!user?.permissions.canViewAllTeamTasks && user?.id) {
        params.append('userId', user.id);
      }

      const response = await axios.get(`${address}/api/tasks/pending?${params}`);
      setAllTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };



  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;

    // Handle DD-MM-YYYY or DD/MM/YYYY format
    const ddmmyyyyRegex = /^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/;
    if (ddmmyyyyRegex.test(dateStr)) {
      const separator = dateStr.includes('/') ? '/' : (dateStr.includes('-') ? '-' : null);
      if (separator) {
        const parts = dateStr.split(separator);
        if (parts.length === 3) {
          let [day, month, year] = parts.map(Number);
          if (year < 100) year += 2000; // Assume 20xx for 2-digit years
          const d = new Date(year, month - 1, day);
          return isNaN(d.getTime()) ? null : d;
        }
      }
    }

    // Fallback to standard Date parsing (ISO, etc.)
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  const canManageTask = (task: Task) => {
    if (user?.role === 'manager') {
      return task.assignedTo._id === user.id;
    }
    return true;
  };

  const fetchUsers = async () => {
    try {
      const params: any = {};
      if (user?.company?.companyId) {
        params.companyId = user.company.companyId;
      }
      if (user?.role) {
        params.role = user.role; // helps exclude superadmins automatically
      }

      const response = await axios.get(`${address}/api/users`, { params });
      const sortedUsers = response.data.sort((a: User, b: User) =>
        a.username.localeCompare(b.username)
      );
      setUsers(sortedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };


  const applyFiltersAndSort = () => {
    let filteredTasks = [...allTasks];

    if (filter.assignedTo) {
      filteredTasks = filteredTasks.filter(task => task.assignedTo._id === filter.assignedTo);
    }
    if (filter.assignedBy) {
      filteredTasks = filteredTasks.filter(
        task => task.assignedBy.username === filter.assignedBy
      );
    }

    if (filter.priority) {
      filteredTasks = filteredTasks.filter(task => task.priority === filter.priority);
    }

    // ✅ Status filter (match MasterTasks logic)
    if (filter.status) {
      filteredTasks = filteredTasks.filter(task => {
        if (filter.status === 'overdue') {
          if (task.status !== 'pending' || !task.dueDate) return false;

          const dueDate = new Date(task.dueDate);
          dueDate.setHours(0, 0, 0, 0);

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          return dueDate < today; // ❌ today excluded
        }

        return task.status === filter.status;
      });
    }

    if (filter.search) {
      filteredTasks = filteredTasks.filter(task =>
        task.title.toLowerCase().includes(filter.search.toLowerCase()) ||
        task.description.toLowerCase().includes(filter.search.toLowerCase()) ||
        task.assignedTo.username.toLowerCase().includes(filter.search.toLowerCase()) ||
        (task.taskId || '').toLowerCase().includes(filter.search.toLowerCase())
      );
    }

    // Date range filter
    if (filter.dateFrom || filter.dateTo) {
      filteredTasks = filteredTasks.filter(task => {
        if (!task.dueDate) return false;

        const taskDate = new Date(task.dueDate);

        if (filter.dateFrom) {
          const fromDate = new Date(filter.dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (taskDate < fromDate) return false;
        }

        if (filter.dateTo) {
          const toDate = new Date(filter.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (taskDate > toDate) return false;
        }

        return true;
      });
    }

    if (sortOrder !== 'none') {
      filteredTasks.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate).setHours(0, 0, 0, 0) : Infinity;
        const dateB = b.dueDate ? new Date(b.dueDate).setHours(0, 0, 0, 0) : Infinity;

        if (sortOrder === 'asc') {
          return dateA - dateB;
        } else {
          return dateB - dateA;
        }
      });
    }

    setTasks(filteredTasks);
  };

  const handleReviseTask = async (taskId: string) => {
    if (!revisionDate) {
      alert('Please select a new due date.');
      return;
    }
    if (!revisionRemarks || revisionRemarks.trim().length === 0) {
      toast.error('Revision remarks are mandatory.');
      return;
    }
    try {
      await axios.post(`${address}/api/tasks/${taskId}/revise`, {
        newDate: revisionDate,
        remarks: revisionRemarks,
        revisedBy: user?.id,
        companyId: user?.company?.companyId
      });
      setShowReviseModal(null);
      setRevisionDate('');
      setRevisionRemarks('');
      fetchTasks();
    } catch (error: any) {
      console.error('Error revising task:', error);
      if (error.response?.status === 400) {
        alert(error.response.data?.message || 'Invalid revision date. Please try again.');
      } else {
        alert('Failed to revise task. Please try again.');
      }
    }
  };

  const resetFilters = () => {
    setFilter({ priority: '', assignedBy: '', assignedTo: '', search: '', dateFrom: '', dateTo: '', status: '' });
    setSortOrder('none');
    setCurrentPage(1);
  };

  const toggleSort = () => {
    if (sortOrder === 'none') {
      setSortOrder('asc');
    } else if (sortOrder === 'asc') {
      setSortOrder('desc');
    } else {
      setSortOrder('none');
    }
  };

  const getSortIcon = () => {
    if (sortOrder === 'asc') return <ArrowUp size={16} className="text-[--color-primary]" />;
    if (sortOrder === 'desc') return <ArrowDown size={16} className="text-[--color-primary]" />;
    return <ArrowUpDown size={16} className="text-[--color-textSecondary]" />;
  };

  const isOverdue = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const taskDueDate = new Date(dueDate);
    taskDueDate.setHours(0, 0, 0, 0);

    return taskDueDate < today;
  };

  const isDueToday = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const taskDueDate = new Date(dueDate);
    taskDueDate.setHours(0, 0, 0, 0);

    return taskDueDate.getTime() === today.getTime();
  };

  const toggleDescriptionVisibility = (taskId: string) => {
    setShowFullDescription(prevState => ({
      ...prevState,
      [taskId]: !prevState[taskId]
    }));
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const isImage = (filename?: string, originalName?: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const targetName = (filename || originalName || '').toLowerCase().split('?')[0];
    return imageExtensions.some(ext => targetName.endsWith(ext));
  };

  const handleDownload = async (attachment: Attachment) => {
    const downloadKey = getAttachmentDownloadKey(attachment);

    try {
      setDownloading(prev => ({ ...prev, [downloadKey]: true }));

      const response = await fetch(`${address}/api/files/${encodeURIComponent(attachment.filename)}`);

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
      alert('Failed to download file. Please try again.');
    } finally {
      setDownloading(prev => ({ ...prev, [downloadKey]: false }));
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handleTaskCompletion = () => {
    setShowCompleteModal(null);
    fetchTasks();
  };

  const getTaskToComplete = () => {
    return allTasks.find(task => task._id === showCompleteModal);
  };

  const getAttachmentDownloadKey = (attachment: Attachment) =>
    attachment.filename || attachment.originalName;

  const activeFilterCount = [
    filter.status,
    filter.priority,
    filter.assignedTo,
    filter.assignedBy,
    filter.search,
    filter.dateFrom,
    filter.dateTo,
  ].filter(Boolean).length;

  // Enhanced Pagination Component
  const renderEnhancedPagination = () => (
    <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4 shadow-lg shadow-black/5 backdrop-blur-xl">
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
            Showing <span className="font-semibold text-[var(--color-text)]">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-[var(--color-text)]">{Math.min(endIndex, tasks.length)}</span> of{' '}
            <span className="font-semibold text-[var(--color-text)]">{tasks.length}</span> results
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
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition ${
                    currentPage === pageNumber
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
  );

  const renderCardView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {currentTasks.map((task) => {
          const isInProgress = task.status === 'in-progress';
          const disableForHighPriority =
            revisionSettings?.enableRevisions === true &&
            revisionSettings?.restrictHighPriorityRevision === true &&
            task.priority?.toLowerCase() === 'high' &&
            task.taskType === 'one-time';
          const isTaskOverdue = Boolean(task.dueDate && isOverdue(task.dueDate));
          const isTaskDueToday = Boolean(task.dueDate && isDueToday(task.dueDate));
          const revisionDisabled =
            isInProgress ||
            disableForHighPriority ||
            Boolean(
              revisionSettings?.enableRevisions &&
              revisionSettings?.enableMaxRevision &&
              task.revisionCount >= revisionSettings?.limit
            );
          const completionDisabled = isInProgress || !canManageTask(task) || task.status !== 'pending';

          return (
            <article
              key={task._id}
              className={`group relative overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.88))] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-primary)]/25 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] ${
                isTaskOverdue
                  ? 'ring-1 ring-[var(--color-error)]/25'
                  : isTaskDueToday
                    ? 'ring-1 ring-[var(--color-warning)]/25'
                    : ''
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[var(--color-primary)] via-cyan-500 to-emerald-500 opacity-80" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={task.priority} />
                    {task.status === 'in-progress' && (
                      <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                        In progress
                      </span>
                    )}
                    {task.revisionCount > 0 && (
                      <span className="inline-flex items-center rounded-full border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warning)]">
                        Revised {task.revisionCount}x
                      </span>
                    )}
                    {isTaskOverdue && (
                      <span className="inline-flex items-center rounded-full border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-error)]">
                        Overdue
                      </span>
                    )}
                    {isTaskDueToday && !isTaskOverdue && (
                      <span className="inline-flex items-center rounded-full border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warning)]">
                        Due today
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-textSecondary)]">
                      {task.taskType}
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

                  <p className="mt-2 text-[13px] leading-6 text-[var(--color-textSecondary)] whitespace-pre-wrap break-words">
                    {showFullDescription[task._id] ? task.description : truncateText(task.description, 145)}
                    {task.description.length > 145 && (
                      <button
                        onClick={() => toggleDescriptionVisibility(task._id)}
                        className="ml-2 text-[13px] font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        Show {showFullDescription[task._id] ? 'less' : 'more'}
                      </button>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    disabled={revisionDisabled}
                    onClick={() => {
                      if (disableForHighPriority) {
                        alert('Revision is restricted for High Priority one-time tasks.');
                        return;
                      }

                      if (!revisionSettings) {
                        setShowReviseModal(task._id);
                        return;
                      }

                      if (revisionSettings.enableRevisions && revisionSettings.enableMaxRevision) {
                        if (task.revisionCount >= revisionSettings.limit) {
                          alert(`You cannot revise more than ${revisionSettings.limit} times`);
                          return;
                        }
                      }

                      setShowReviseModal(task._id);
                    }}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                      revisionDisabled
                        ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] opacity-60'
                        : 'border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 text-[var(--color-warning)] hover:-translate-y-0.5 hover:border-[var(--color-warning)]/30 hover:bg-[var(--color-warning)]/15'
                    }`}
                    title={isInProgress ? 'Task is under approval' : 'Revise task'}
                  >
                    <RefreshCcw size={14} />
                    Revise
                  </button>
                  <button
                    onClick={() => setShowCompleteModal(task._id)}
                    disabled={completionDisabled}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                      completionDisabled
                        ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] opacity-60'
                        : 'border-[var(--color-success)]/20 bg-[var(--color-success)]/10 text-[var(--color-success)] hover:-translate-y-0.5 hover:border-[var(--color-success)]/30 hover:bg-[var(--color-success)]/15'
                    }`}
                    title={isInProgress ? 'Task is under approval' : 'Complete task'}
                  >
                    <CheckSquare size={14} />
                    Complete
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)]">Task ID</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{task.taskId || '—'}</p>
                </div>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)]">Assigned by</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{task.assignedBy.username}</p>
                </div>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)]">Assigned to</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{task.assignedTo.username}</p>
                </div>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)]">Due date</p>
                  <p className={`mt-1 text-sm font-semibold ${
                    task.dueDate && isOverdue(task.dueDate)
                      ? 'text-[var(--color-error)]'
                      : task.dueDate && isDueToday(task.dueDate)
                        ? 'text-[var(--color-warning)]'
                        : 'text-[var(--color-text)]'
                  }`}>
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        })
                      : 'N/A'}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)]">Created</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                    {new Date(task.createdAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)]">Attachments</p>
                  {task.attachments && task.attachments.length > 0 ? (
                    <button
                      onClick={() => setShowAttachmentsModal(task.attachments)}
                      className="mt-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      View {task.attachments.length} file{task.attachments.length > 1 ? 's' : ''}
                    </button>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-[var(--color-textSecondary)]">No attachments</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {totalPages > 1 && renderEnhancedPagination()}
    </div>
  );

  const renderTableView = () => (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)]/85 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--color-border)]">
            <thead
              className={`sticky top-[-1rem] z-40 transition-[box-shadow,background-color,border-color,transform] duration-300 ease-out ${
                tableHasScrolled
                  ? 'bg-[var(--color-surface)] shadow-[0_18px_36px_rgba(15,23,42,0.14)] border-b border-[var(--color-border)] backdrop-blur-md'
                  : 'bg-[var(--color-surface)]'
              }`}
            >
              <tr>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Task ID
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Task
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Priority
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Assigned By
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Assigned To
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Attachments
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  <button
                    onClick={toggleSort}
                    className="flex items-center gap-1 transition-colors hover:text-[var(--color-primary)]"
                    title="Sort by due date"
                  >
                    <span>DUE DATE</span>
                    {getSortIcon()}
                  </button>
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
              {currentTasks.map((task, index) => {
                const isInProgress = task.status === 'in-progress';
                const disableForHighPriority =
                  revisionSettings?.enableRevisions === true &&
                  revisionSettings?.restrictHighPriorityRevision === true &&
                  task.priority?.toLowerCase() === 'high' &&
                  task.taskType === 'one-time';
                const isTaskOverdue = Boolean(task.dueDate && isOverdue(task.dueDate));
                const isTaskDueToday = Boolean(task.dueDate && isDueToday(task.dueDate));
                const revisionDisabled =
                  isInProgress ||
                  disableForHighPriority ||
                  Boolean(
                    revisionSettings?.enableRevisions &&
                    revisionSettings?.enableMaxRevision &&
                    task.revisionCount >= revisionSettings?.limit
                  );
                const completionDisabled = isInProgress || !canManageTask(task) || task.status !== 'pending';

                return (
                  <tr
                    key={task._id}
                    className="transition-all duration-200 hover:bg-[var(--color-background)]/70"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                      {task.taskId || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-[420px]">
                        <div className="text-sm font-semibold text-[var(--color-text)] mb-1">
                          {showFullTitle[task._id] ? task.title : truncateText(task.title, 150)}
                          {task.title.length > 150 && (
                            <button
                              onClick={() => toggleTitleVisibility(task._id)}
                              className="ml-2 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              Show {showFullTitle[task._id] ? 'less' : 'more'}
                            </button>
                          )}
                        </div>
                        <div className="text-sm leading-6 text-[var(--color-textSecondary)] whitespace-pre-wrap break-words">
                          {showFullDescription[task._id] ? task.description : truncateText(task.description, 120)}
                          {task.description.length > 100 && (
                            <button
                              onClick={() => toggleDescriptionVisibility(task._id)}
                              className="ml-2 text-sm font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              Show {showFullDescription[task._id] ? 'less' : 'more'}
                            </button>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {task.status === 'in-progress' && (
                            <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                              In progress
                            </span>
                          )}
                          {task.revisionCount > 0 && (
                            <span className="inline-flex items-center rounded-full border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warning)]">
                              Revised {task.revisionCount}x
                            </span>
                          )}
                          {isTaskOverdue && (
                            <span className="inline-flex items-center rounded-full border border-[var(--color-error)]/20 bg-[var(--color-error)]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-error)]">
                              Overdue
                            </span>
                          )}
                          {isTaskDueToday && !isTaskOverdue && (
                            <span className="inline-flex items-center rounded-full border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warning)]">
                              Due today
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-[var(--color-text)]">{task.assignedBy.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-[var(--color-text)]">{task.assignedTo.username}</div>
                      <div className="text-xs text-[var(--color-textSecondary)]">{task.assignedTo.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {task.attachments && task.attachments.length > 0 ? (
                        <button
                          onClick={() => setShowAttachmentsModal(task.attachments)}
                          className="font-semibold text-[var(--color-primary)] hover:underline"
                        >
                          View {task.attachments.length}
                        </button>
                      ) : (
                        <span className="text-[var(--color-textSecondary)]">No attachments</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-semibold ${
                        isTaskOverdue
                          ? 'text-[var(--color-error)]'
                          : isTaskDueToday
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-text)]'
                      }`}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        }) : 'N/A'}
                      </div>
                      <div className="text-xs text-[var(--color-textSecondary)]">
                        Created: {new Date(task.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          disabled={revisionDisabled}
                          onClick={() => {
                            if (disableForHighPriority) {
                              alert('Revision is restricted for High Priority one-time tasks.');
                              return;
                            }

                            if (!revisionSettings) {
                              setShowReviseModal(task._id);
                              return;
                            }

                            if (revisionSettings.enableRevisions && revisionSettings.enableMaxRevision) {
                              if (task.revisionCount >= revisionSettings.limit) {
                                alert(`You cannot revise more than ${revisionSettings.limit} times`);
                                return;
                              }
                            }

                            setShowReviseModal(task._id);
                          }}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                            revisionDisabled
                              ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] opacity-60'
                              : 'border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 text-[var(--color-warning)] hover:border-[var(--color-warning)]/30 hover:bg-[var(--color-warning)]/15'
                          }`}
                          title={isInProgress ? "Task is under approval" : "Revise task"}
                        >
                          <RefreshCcw size={16} />
                        </button>

                        <button
                          onClick={() => setShowCompleteModal(task._id)}
                          disabled={completionDisabled}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                            completionDisabled
                              ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] opacity-60'
                              : 'border-[var(--color-success)]/20 bg-[var(--color-success)]/10 text-[var(--color-success)] hover:border-[var(--color-success)]/30 hover:bg-[var(--color-success)]/15'
                          }`}
                          title={isInProgress ? 'Task is under approval' : 'Complete task'}
                        >
                          <CheckSquare size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {totalPages > 1 && renderEnhancedPagination()}
    </div>
  );

  const renderStickyTableView = () => (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)]/85 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div
          className={`sticky top-3 z-40 mx-3 mt-3 overflow-hidden rounded-[22px] transition-[box-shadow,background-color,border-color,transform] duration-300 ease-out ${
            tableHasScrolled
              ? 'bg-[var(--color-surface)] shadow-[0_18px_36px_rgba(15,23,42,0.14)] border border-[var(--color-border)] backdrop-blur-md'
              : 'bg-[var(--color-surface)]'
          }`}
        >
          <table className="min-w-full table-fixed">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Task ID
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Task
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Priority
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Assigned By
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Assigned To
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Attachments
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  <button
                    onClick={toggleSort}
                    className="flex items-center gap-1 transition-colors hover:text-[var(--color-primary)]"
                    title="Sort by due date"
                  >
                    <span>DUE DATE</span>
                    {getSortIcon()}
                  </button>
                </th>
                <th className={`bg-[var(--color-surface)] px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)] transition-all duration-300 ${
                  tableHasScrolled ? 'border-b border-[var(--color-border)]/60' : ''
                }`}>
                  Actions
                </th>
              </tr>
            </thead>
          </table>
        </div>

        <div className="mx-3 mb-3 overflow-x-auto rounded-b-[28px]">
          <table className="min-w-full table-fixed divide-y divide-[var(--color-border)]">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
              {currentTasks.map((task) => {
                const isInProgress = task.status === 'in-progress';
                const disableForHighPriority =
                  revisionSettings?.enableRevisions === true &&
                  revisionSettings?.restrictHighPriorityRevision === true &&
                  task.priority?.toLowerCase() === 'high' &&
                  task.taskType === 'one-time';
                const isTaskOverdue = Boolean(task.dueDate && isOverdue(task.dueDate));
                const isTaskDueToday = Boolean(task.dueDate && isDueToday(task.dueDate));
                const revisionDisabled =
                  isInProgress ||
                  disableForHighPriority ||
                  Boolean(
                    revisionSettings?.enableRevisions &&
                    revisionSettings?.enableMaxRevision &&
                    task.revisionCount >= revisionSettings?.limit
                  );
                const completionDisabled = isInProgress || !canManageTask(task) || task.status !== 'pending';

                return (
                  <tr
                    key={task._id}
                    className="transition-all duration-200 hover:bg-[var(--color-background)]/70"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                      {task.taskId || 'â€”'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-[420px]">
                        <div className="text-sm font-semibold text-[var(--color-text)] mb-1">
                          {showFullTitle[task._id] ? task.title : truncateText(task.title, 150)}
                          {task.title.length > 150 && (
                            <button
                              onClick={() => toggleTitleVisibility(task._id)}
                              className="ml-2 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              Show {showFullTitle[task._id] ? 'less' : 'more'}
                            </button>
                          )}
                        </div>
                        <div className="text-sm leading-6 text-[var(--color-textSecondary)] whitespace-pre-wrap break-words">
                          {showFullDescription[task._id] ? task.description : truncateText(task.description, 120)}
                          {task.description.length > 100 && (
                            <button
                              onClick={() => toggleDescriptionVisibility(task._id)}
                              className="ml-2 text-sm font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              Show {showFullDescription[task._id] ? 'less' : 'more'}
                            </button>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {task.status === 'in-progress' && (
                            <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
                              In progress
                            </span>
                          )}
                          {task.revisionCount > 0 && (
                            <span className="inline-flex items-center rounded-full border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warning)]">
                              Revised {task.revisionCount}x
                            </span>
                          )}
                          {isTaskOverdue && (
                            <span className="inline-flex items-center rounded-full border border-[var(--color-error)]/20 bg-[var(--color-error)]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-error)]">
                              Overdue
                            </span>
                          )}
                          {isTaskDueToday && !isTaskOverdue && (
                            <span className="inline-flex items-center rounded-full border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warning)]">
                              Due today
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-[var(--color-text)]">{task.assignedBy.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-[var(--color-text)]">{task.assignedTo.username}</div>
                      <div className="text-xs text-[var(--color-textSecondary)]">{task.assignedTo.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {task.attachments && task.attachments.length > 0 ? (
                        <button
                          onClick={() => setShowAttachmentsModal(task.attachments)}
                          className="font-semibold text-[var(--color-primary)] hover:underline"
                        >
                          View {task.attachments.length}
                        </button>
                      ) : (
                        <span className="text-[var(--color-textSecondary)]">No attachments</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-semibold ${
                        isTaskOverdue
                          ? 'text-[var(--color-error)]'
                          : isTaskDueToday
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-text)]'
                      }`}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        }) : 'N/A'}
                      </div>
                      <div className="text-xs text-[var(--color-textSecondary)]">
                        Created: {new Date(task.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          disabled={revisionDisabled}
                          onClick={() => {
                            if (disableForHighPriority) {
                              alert('Revision is restricted for High Priority one-time tasks.');
                              return;
                            }

                            if (!revisionSettings) {
                              setShowReviseModal(task._id);
                              return;
                            }

                            if (revisionSettings.enableRevisions && revisionSettings.enableMaxRevision) {
                              if (task.revisionCount >= revisionSettings.limit) {
                                alert(`You cannot revise more than ${revisionSettings.limit} times`);
                                return;
                              }
                            }

                            setShowReviseModal(task._id);
                          }}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                            revisionDisabled
                              ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] opacity-60'
                              : 'border-[var(--color-warning)]/20 bg-[var(--color-warning)]/10 text-[var(--color-warning)] hover:border-[var(--color-warning)]/30 hover:bg-[var(--color-warning)]/15'
                          }`}
                          title={isInProgress ? "Task is under approval" : "Revise task"}
                        >
                          <RefreshCcw size={16} />
                        </button>

                        <button
                          onClick={() => setShowCompleteModal(task._id)}
                          disabled={completionDisabled}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                            completionDisabled
                              ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)] opacity-60'
                              : 'border-[var(--color-success)]/20 bg-[var(--color-success)]/10 text-[var(--color-success)] hover:border-[var(--color-success)]/30 hover:bg-[var(--color-success)]/15'
                          }`}
                          title={isInProgress ? 'Task is under approval' : 'Complete task'}
                        >
                          <CheckSquare size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {totalPages > 1 && renderEnhancedPagination()}
    </div>
  );

  if (loading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[--color-textSecondary]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[--color-primary]"></div>
        <span className="ml-3 text-lg">Loading tasks...</span>
      </div>
    );
  }

  const completingTask = getTaskToComplete();

  return (
    <div
      className="min-h-full w-full bg-[var(--color-background)] px-3 py-4 sm:px-4 lg:px-6"
    >
      <div className="flex w-full flex-col gap-3">
        <section className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 py-3 shadow-sm backdrop-blur-xl sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)] sm:text-[1.65rem]">
                Pending Tasks
              </h1>
              <p className="mt-0.5 text-sm text-[var(--color-textSecondary)]">
                Review and complete pending work.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                className="min-w-[140px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/85 px-3 py-2 text-sm font-semibold text-[var(--color-text)] shadow-sm outline-none transition focus:border-[var(--color-primary)]"
              >
                <option value="">All status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In progress</option>
                <option value="overdue">Overdue</option>
              </select>

              <button
                onClick={fetchTasks}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/85 px-3 py-2 text-sm font-semibold text-[var(--color-text)] shadow-sm transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-primary)]"
              >
                <RefreshCcw size={16} />
                Refresh
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition ${
                  showFilters
                    ? 'border-[var(--color-primary)]/30 bg-[var(--color-primary)] text-white'
                    : 'border-[var(--color-border)] bg-[var(--color-background)]/85 text-[var(--color-text)] hover:border-[var(--color-primary)]/30 hover:text-[var(--color-primary)]'
                }`}
                title="Filters"
              >
                <Filter size={16} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {!isMobile && (
                <ViewToggle
                  view={view}
                  onViewChange={setView}
                />
              )}
            </div>
          </div>
        </section>

      {showFilters && (
        <section
          id="filters-panel"
          className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]/85 p-4 shadow-sm backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)]">Filters</p>
            </div>
            <button
              onClick={resetFilters}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/85 px-3 py-1.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-primary)]"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-textSecondary)]">Date From</label>
              <div className="relative">
                <input
                  ref={dateFromRef}
                  type="date"
                  value={filter.dateFrom}
                  onClick={() => dateFromRef.current?.showPicker()}
                  onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 pr-9 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                />
                <Calendar
                  size={15}
                  onClick={() => dateFromRef.current?.showPicker()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--color-textSecondary)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-textSecondary)]">Date To</label>
              <div className="relative">
                <input
                  ref={dateToRef}
                  type="date"
                  value={filter.dateTo}
                  onClick={() => dateToRef.current?.showPicker()}
                  onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 pr-9 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                />
                <Calendar
                  size={15}
                  onClick={() => dateToRef.current?.showPicker()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--color-textSecondary)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-textSecondary)]">Priority</label>
              <select
                value={filter.priority}
                onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
              >
                <option value="">All priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>

            {user?.permissions.canViewAllTeamTasks && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--color-textSecondary)]">Assigned By</label>
                <select
                  value={filter.assignedBy}
                  onChange={(e) => setFilter({ ...filter, assignedBy: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                >
                  <option value="">All</option>
                  {[...new Set(allTasks.map((t) => t.assignedBy.username))].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {user?.permissions.canViewAllTeamTasks && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--color-textSecondary)]">Team Member</label>
                <select
                  value={filter.assignedTo}
                  onChange={(e) => setFilter({ ...filter, assignedTo: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                >
                  <option value="">All members</option>
                  {users.map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.username}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-textSecondary)]">Sort by due date</label>
              <button
                onClick={toggleSort}
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text)] outline-none transition hover:border-[var(--color-primary)]/30"
              >
                <span>
                  {sortOrder === 'none'
                    ? 'No sorting'
                    : sortOrder === 'asc'
                      ? 'Earliest first'
                      : 'Latest first'}
                </span>
                {getSortIcon()}
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--color-textSecondary)]">Search</label>
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]" />
                <input
                  type="text"
                  placeholder="Search tasks or Task ID..."
                  value={filter.search}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2.5 pl-11 pr-4 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-3">
        {tasks.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/75 px-6 py-14 text-center shadow-lg shadow-black/5 backdrop-blur-xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
              <CheckSquare size={36} />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-[var(--color-text)]">No pending tasks found</h2>
            <p className="mt-2 text-sm text-[var(--color-textSecondary)]">
              Try adjusting the filters or clear them to bring tasks back into view.
            </p>
            <button
              onClick={resetFilters}
              className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-primary)]"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <>{isMobile || view === 'card' ? renderCardView() : renderStickyTableView()}</>
        )}
      </section>

      {/* Task Completion Modal */}
      {showCompleteModal && completingTask && (
        <TaskCompletionModal
          taskId={showCompleteModal}
          taskTitle={completingTask.title}
          isRecurring={false}
          allowAttachments={
            taskSettings.enabled
              ? taskSettings.pendingTasks.allowAttachments
              : false
          }
          mandatoryAttachments={
            taskSettings.enabled
              ? taskSettings.pendingTasks.mandatoryAttachments
              : false
          }
          mandatoryRemarks={
            taskSettings.enabled
              ? taskSettings.pendingTasks.mandatoryRemarks
              : false
          }
          onClose={() => setShowCompleteModal(null)}
          onComplete={handleTaskCompletion}
        />
      )}

      {/* Revise Task Modal */}
      {showReviseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          {(() => {
            if (!revisionSettings) {
              return (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 text-[var(--color-text)] shadow-2xl">
                  Loading revision settings...
                </div>
              );
            }

            const selectedTask = allTasks.find((task) => task._id === showReviseModal);
            if (!selectedTask) {
              return (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 text-[var(--color-text)] shadow-2xl">
                  Task not found...
                </div>
              );
            }

            const currentRevisionCount = selectedTask.revisionCount || 0;
            const enableRevisions = revisionSettings.enableRevisions ?? false;
            const enableDaysRule = revisionSettings.enableDaysRule ?? false;
            let effectiveMaxDays = Infinity;

            if (enableRevisions && enableDaysRule) {
              effectiveMaxDays = revisionSettings.maxDays ?? 7;
              const revisionIndex = currentRevisionCount + 1;
              const revisionSpecificDays = revisionSettings.days?.[revisionIndex];
              if (revisionSpecificDays !== undefined && revisionSpecificDays !== null) {
                effectiveMaxDays = revisionSpecificDays;
              }
            }

            const rawBase = selectedTask.lastPlannedDate || selectedTask.dueDate || null;
            const parsed = rawBase ? parseDate(rawBase) : null;
            const baseDate = parsed || new Date();
            const allowedMaxDate = new Date(baseDate.getTime());

            if (effectiveMaxDays !== Infinity) {
              allowedMaxDate.setDate(allowedMaxDate.getDate() + effectiveMaxDays);
            } else {
              allowedMaxDate.setFullYear(allowedMaxDate.getFullYear() + 1);
            }

            const minDate = !isNaN(baseDate.getTime()) ? baseDate.toISOString().split('T')[0] : undefined;
            const maxDate = !isNaN(allowedMaxDate.getTime()) ? allowedMaxDate.toISOString().split('T')[0] : undefined;
            const formatDate = (date: Date) => (!isNaN(date.getTime()) ? date.toLocaleDateString('en-GB') : 'Invalid Date');

            return (
              <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl shadow-black/20">
                <div className="border-b border-[var(--color-border)] px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-warning)]/12 text-[var(--color-warning)]">
                      <RefreshCcw size={18} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--color-text)]">Revise Task</h3>
                      <p className="text-sm text-[var(--color-textSecondary)]">Pick a new due date and add remarks.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 px-6 py-6">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[var(--color-textSecondary)]">New Due Date</label>
                    <div
                      onClick={() => {
                        if (!dateInputRef.current) return;
                        if (dateInputRef.current.showPicker) {
                          dateInputRef.current.showPicker();
                        } else {
                          dateInputRef.current.focus();
                        }
                      }}
                      className="w-full cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5"
                    >
                      <input
                        ref={dateInputRef}
                        type="date"
                        min={minDate}
                        max={maxDate}
                        value={revisionDate}
                        onChange={(e) => {
                          const picked = new Date(e.target.value);
                          if (effectiveMaxDays !== Infinity && picked > allowedMaxDate) {
                            alert(`You cannot choose a date beyond ${effectiveMaxDays} days from the base date`);
                            return;
                          }
                          setRevisionDate(e.target.value);
                        }}
                        className="w-full cursor-pointer bg-transparent outline-none text-[var(--color-text)]"
                      />
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-textSecondary)]">
                      Allowed range: {formatDate(baseDate)} to {effectiveMaxDays === Infinity ? 'No limit' : formatDate(allowedMaxDate)}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[var(--color-textSecondary)]">Revision Remarks</label>
                    <textarea
                      rows={3}
                      value={revisionRemarks}
                      onChange={(e) => setRevisionRemarks(e.target.value)}
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                      placeholder="Reason for revision..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReviseTask(showReviseModal)}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-[var(--color-warning)] to-[var(--color-primary)] px-4 py-3 font-semibold text-white transition hover:opacity-95"
                    >
                      Revise Task
                    </button>
                    <button
                      onClick={() => {
                        setShowReviseModal(null);
                        setRevisionDate('');
                        setRevisionRemarks('');
                      }}
                      className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/30"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Attachments Modal */}
      {showAttachmentsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl shadow-black/20">
            <div className="border-b border-[var(--color-border)] px-6 py-5">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text)]">
                <Paperclip size={20} />
                Task Attachments
              </h3>
            </div>
            <div className="px-6 py-6">
              {showAttachmentsModal.length > 0 ? (
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {showAttachmentsModal.map((attachment, index) => {
                    const downloadKey = getAttachmentDownloadKey(attachment);
                    return (
                      <li key={attachment.filename || index} className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/80 p-3 text-[var(--color-text)] sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center mb-2 sm:mb-0 sm:mr-4">
                          {isImage(attachment.filename, attachment.originalName) ? (
                            <>
                              <img
                                src={`${address}/api/files/${encodeURIComponent(attachment.filename)}`}
                                alt={attachment.originalName}
                                className="w-16 h-16 object-cover rounded-md mr-3 border border-[--color-border] cursor-pointer"
                                onClick={() => setSelectedImagePreview(`${address}/api/files/${encodeURIComponent(attachment.filename)}`)}
                              />
                              <span className="text-sm font-medium break-all">{attachment.originalName}</span>
                            </>
                          ) : (
                            <>
                              <FileText size={40} className="mr-3 text-[--color-primary]" />
                              <span className="text-sm font-medium break-all">{attachment.originalName}</span>
                            </>
                          )}
                        </div>
                        {isImage(attachment.filename, attachment.originalName) ? (
                          <div className="flex items-center shrink-0 mt-2 sm:mt-0 gap-2">
                            <button
                              onClick={() => window.open(`${address}/api/files/${encodeURIComponent(attachment.filename)}`, '_blank')}
                              className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/30"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleDownload(attachment)}
                              disabled={downloading[downloadKey]}
                              className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/30 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {downloading[downloadKey] ? (
                                <>
                                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                                  Downloading...
                                </>
                              ) : (
                                <>Download</>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownload(attachment)}
                            disabled={downloading[downloadKey]}
                            className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {downloading[downloadKey] ? (
                              <>
                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                                Downloading...
                              </>
                            ) : (
                              <>Download</>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[var(--color-textSecondary)]">No attachments for this task.</p>
              )}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAttachmentsModal(null)}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/30"
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
      <ToastContainer
        position="top-right"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        pauseOnHover
      />
      </div>
    </div>
  );
};

export default PendingTasks;
