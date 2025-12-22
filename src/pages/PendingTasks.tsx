import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CheckSquare, Clock, RefreshCcw, Search, Users, Calendar, ArrowUpDown, ArrowUp, ArrowDown, Filter, Paperclip, FileText, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import PriorityBadge from '../components/PriorityBadge';
import TaskCompletionModal from '../components/TaskCompletionModal';
import { useTaskSettings } from '../hooks/useTaskSettings';
import { useTheme } from '../contexts/ThemeContext';
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
  const { theme } = useTheme();
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

    if (filter.search) {
      filteredTasks = filteredTasks.filter(task =>
        task.title.toLowerCase().includes(filter.search.toLowerCase()) ||
        task.description.toLowerCase().includes(filter.search.toLowerCase()) ||
        task.assignedTo.username.toLowerCase().includes(filter.search.toLowerCase())
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
    setFilter({ priority: '', assignedBy: '', assignedTo: '', search: '', dateFrom: '', dateTo: '' });
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

  const isImage = (filename: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const lowercasedFilename = filename.toLowerCase();
    return imageExtensions.some(ext => lowercasedFilename.endsWith(ext));
  };

  const handleDownload = async (attachment: Attachment) => {
    const downloadKey = `${attachment.filename}-${Date.now()}`;

    try {
      setDownloading(prev => ({ ...prev, [downloadKey]: true }));

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

  // Enhanced Pagination Component
  const renderEnhancedPagination = () => (
    <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] p-4 mt-2">
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Items per page selector */}
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

        {/* Page info */}
        <div className="flex items-center">
          <p className="text-sm text-[--color-textSecondary]">
            Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
            <span className="font-medium">{Math.min(endIndex, tasks.length)}</span> of{' '}
            <span className="font-medium">{tasks.length}</span> results
          </p>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center space-x-1">
          {/* First page */}
          <button
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
            className="p-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-border] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="First page"
          >
            <ChevronsLeft size={16} />
          </button>

          {/* Previous page */}
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-border] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Page numbers */}
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

          {/* Next page */}
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-border] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>

          {/* Last page */}
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
  );

  const renderCardView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        {currentTasks.map((task) => {
          const isInProgress = task.status === 'in-progress';
          const disableForHighPriority =
            revisionSettings?.enableRevisions === true &&   // 🔥 Only restrict when revisions ON
            revisionSettings?.restrictHighPriorityRevision === true &&
            task.priority?.toLowerCase() === "high" &&
            task.taskType === "one-time";

          return (
            <div
              key={task._id}
              className={`group rounded-xl shadow-sm border hover:shadow-lg transition-all duration-300 overflow-hidden transform hover:-translate-y-1 ${task.dueDate && isOverdue(task.dueDate)
                ? 'border-l-4 border-[--color-error]'
                : task.dueDate && isDueToday(task.dueDate)
                  ? 'border-l-4 border-[--color-accent]'
                  : 'border-[--color-border]'
                } ${theme === 'light' ? 'bg-white' : 'bg-[--color-background]'}`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[--color-text] transition-colors group-hover:text-[--color-primary]">
                    {showFullTitle[task._id] ? task.title : truncateText(task.title, 70)}
                    {task.title.length > 70 && (
                      <button
                        onClick={() => toggleTitleVisibility(task._id)}
                        className="ml-1 text-xs font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                      >
                        Show {showFullTitle[task._id] ? 'Less' : 'More'}
                      </button>
                    )}
                  </h3>
                  <div className="flex space-x-1 ml-2 group-hover:opacity-100 transition-opacity">
                    <button
                      disabled={
                        isInProgress || disableForHighPriority ||
                        (
                          revisionSettings?.enableRevisions &&
                          revisionSettings?.enableMaxRevision &&
                          task.revisionCount >= revisionSettings?.limit
                        )
                      }
                      onClick={() => {
                        if (disableForHighPriority) {
                          alert("Revision is restricted for High Priority one-time tasks.");
                          return;
                        }

                        if (!revisionSettings) {
                          setShowReviseModal(task._id);
                          return;
                        }

                        // Apply limit ONLY if enableMaxRevision = true
                        if (revisionSettings.enableRevisions && revisionSettings.enableMaxRevision) {
                          if (task.revisionCount >= revisionSettings.limit) {
                            alert(`You cannot revise more than ${revisionSettings.limit} times`);
                            return;
                          }
                        }

                        setShowReviseModal(task._id);
                      }}
                      className={`transition-all transform hover:scale-110 ${isInProgress || disableForHighPriority ||
                        (
                          revisionSettings?.enableRevisions &&
                          revisionSettings?.enableMaxRevision &&
                          task.revisionCount >= revisionSettings?.limit
                        )
                        ? "opacity-50 cursor-not-allowed text-gray-400"
                        : "text-[--color-warning]"
                        }`}
                        title={isInProgress ? "Task is under approval" : "Revise task"}
                    >
                      <RefreshCcw size={16} />
                    </button>

                    <button
                      onClick={() => setShowCompleteModal(task._id)}
                      disabled={isInProgress || !canManageTask(task) || task.status !== 'pending'}
                      className={`... ${isInProgress || !canManageTask(task) ? 'opacity-50 cursor-not-allowed' : 'transition-all transform hover:scale-110 text-[--color-success]'}`}
                      title={
                        isInProgress
                          ? "Task is under approval"
                          : "Complete task"
                      }
                    >
                      <CheckSquare size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {task.status === 'in-progress' && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-500 text-white">
                      ⏳ IN PROGRESS
                    </span>
                  )}
                  <PriorityBadge priority={task.priority} />
                  {task.revisionCount > 0 && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-[--color-warning] text-[--color-background]">
                      Revised {task.revisionCount}x
                    </span>
                  )}
                  {task.status !== 'in-progress' && task.dueDate && isOverdue(task.dueDate) && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full shadow-sm animate-pulse bg-[--color-error] text-[--color-background]">
                      🚨 OVERDUE
                    </span>
                  )}

                  {task.status !== 'in-progress' && task.dueDate && isDueToday(task.dueDate) && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full shadow-sm animate-pulse bg-[--color-accent] text-[--color-background]">
                      🗓️ DUE TODAY
                    </span>
                  )}
                </div>

                <p className="text-sm mb-2 text-[--color-textSecondary]">
                  {showFullDescription[task._id] ? task.description : truncateText(task.description, 150)}
                  {task.description.length > 150 && (
                    <button
                      onClick={() => toggleDescriptionVisibility(task._id)}
                      className="ml-1 text-sm font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                    >
                      Show {showFullDescription[task._id] ? 'Less' : 'More'}
                    </button>
                  )}
                </p>

                <div className="space-y-3 text-sm">
                  <div className={`flex items-center justify-between p-2 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-[--color-background]'}`}>
                    <span className="flex items-center text-[--color-textSecondary]">
                      <Users size={14} className="mr-1" />
                      Assigned By:
                    </span>
                    <span className="font-medium text-[--color-text]">{task.assignedBy.username}</span>
                  </div>
                  <div className={`flex items-center justify-between p-2 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-[--color-background]'}`}>
                    <span className="flex items-center text-[--color-textSecondary]">
                      <Users size={14} className="mr-1" />
                      Assigned To:
                    </span>
                    <span className="font-medium text-[--color-text]">{task.assignedTo.username}</span>
                  </div>
                  <div className={`flex items-center justify-between p-2 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-[--color-background]'}`}>
                    <span className="flex items-center text-[--color-textSecondary]">
                      <Calendar size={14} className="mr-1" />
                      Due date:
                    </span>
                    <span className={`font-medium ${task.dueDate && isOverdue(task.dueDate) ? 'text-[--color-error]' : task.dueDate && isDueToday(task.dueDate) ? 'text-[--color-accent]' : 'text-[--color-text]'}`}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      }) : 'N/A'}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between p-2 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-[--color-background]'}`}>
                    <span className="flex items-center text-[--color-textSecondary]">
                      <Clock size={14} className="mr-1" />
                      Created:
                    </span>
                    <span className="font-medium text-[--color-text]">
                      {new Date(task.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between p-2 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-[--color-background]'}`}>
                    <span className="flex items-center text-[--color-textSecondary]">
                      <Paperclip size={14} className="mr-1" />
                      Attachments:
                    </span>
                    {task.attachments && task.attachments.length > 0 ? (
                      <button
                        onClick={() => setShowAttachmentsModal(task.attachments)}
                        className="font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                      >
                        Click Here ({task.attachments.length})
                      </button>
                    ) : (
                      <span className="text-[--color-textSecondary]">No Attachments</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {totalPages > 1 && renderEnhancedPagination()}
    </div>
  );

  const renderTableView = () => (
    <div className="space-y-6">
      <div className={`rounded-xl shadow-sm border border-[--color-border] overflow-hidden ${theme === 'light' ? 'bg-white' : 'bg-[--color-surface]'}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[--color-border]">
            <thead className={theme === 'light' ? 'bg-gray-50' : 'bg-[--color-surface]'}>
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Assigned By
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Attachments
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  <button
                    onClick={toggleSort}
                    className="flex items-center space-x-1 transition-colors hover:text-[--color-primary]"
                    title="Sort by due date"
                  >
                    <span>DUE DATE</span>
                    {getSortIcon()}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-[--color-textSecondary] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-border]">
              {currentTasks.map((task, index) => {
                const isInProgress = task.status === 'in-progress';
                const disableForHighPriority =
                  revisionSettings?.enableRevisions === true &&   // 🔥 Only restrict when revisions ON
                  revisionSettings?.restrictHighPriorityRevision === true &&
                  task.priority?.toLowerCase() === "high" &&
                  task.taskType === "one-time";

                return (
                  <tr
                    key={task._id}
                    className={`transition-all duration-200 hover:bg-[--color-surface] ${theme === 'light'
                      ? index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      : index % 2 === 0 ? 'bg-[--color-background]' : 'bg-[--color-background]'
                      }`}
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-[--color-text] mb-1">
                          {showFullTitle[task._id] ? task.title : truncateText(task.title, 150)}
                          {task.title.length > 150 && (
                            <button
                              onClick={() => toggleTitleVisibility(task._id)}
                              className="ml-1 text-xs font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                            >
                              Show {showFullTitle[task._id] ? 'Less' : 'More'}
                            </button>
                          )}
                        </div>
                        <div className="text-sm text-[--color-textSecondary]">
                          {showFullDescription[task._id] ? task.description : truncateText(task.description, 100)}
                          {task.description.length > 100 && (
                            <button
                              onClick={() => toggleDescriptionVisibility(task._id)}
                              className="ml-1 text-sm font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                            >
                              Show {showFullDescription[task._id] ? 'Less' : 'More'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center mt-2 space-x-2">
                          {task.status === 'in-progress' && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-500 text-white">
                              ⏳ IN PROGRESS
                            </span>
                          )}
                          {task.revisionCount > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[--color-warning] text-[--color-background]">
                              Revised {task.revisionCount}x
                            </span>
                          )}
                          {task.status !== 'in-progress' && task.dueDate && isOverdue(task.dueDate) && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium shadow-sm animate-pulse bg-[--color-error] text-[--color-background]">
                              🚨 OVERDUE
                            </span>
                          )}
                          {task.status !== 'in-progress' && task.dueDate && isDueToday(task.dueDate) && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium shadow-sm animate-pulse bg-[--color-accent] text-[--color-background]">
                              🗓️ DUE TODAY
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-semibold text-[--color-text]">{task.assignedBy.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm text-[--color-text]">{task.assignedTo.username}</div>
                          <div className="text-sm text-[--color-textSecondary]">{task.assignedTo.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {task.attachments && task.attachments.length > 0 ? (
                        <button
                          onClick={() => setShowAttachmentsModal(task.attachments)}
                          className="font-medium text-[--color-primary] hover:text-[--color-primary-dark]"
                        >
                          Click Here ({task.attachments.length})
                        </button>
                      ) : (
                        <span className="text-[--color-textSecondary]">No Attachments</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${task.dueDate && isOverdue(task.dueDate) ? 'text-[--color-error]' : task.dueDate && isDueToday(task.dueDate) ? 'text-[--color-accent]' : 'text-[--color-text]'}`}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        }) : 'N/A'}
                      </div>
                      <div className="text-xs text-[--color-textSecondary]">
                        Created: {new Date(task.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          disabled={
                            isInProgress || disableForHighPriority ||
                            (
                              revisionSettings?.enableRevisions &&
                              revisionSettings?.enableMaxRevision &&
                              task.revisionCount >= revisionSettings?.limit
                            )
                          }
                          onClick={() => {
                            if (disableForHighPriority) {
                              alert("Revision is restricted for High Priority one-time tasks.");
                              return;
                            }

                            if (!revisionSettings) {
                              setShowReviseModal(task._id);
                              return;
                            }

                            // Apply limit ONLY if enableMaxRevision = true
                            if (revisionSettings.enableRevisions && revisionSettings.enableMaxRevision) {
                              if (task.revisionCount >= revisionSettings.limit) {
                                alert(`You cannot revise more than ${revisionSettings.limit} times`);
                                return;
                              }
                            }

                            setShowReviseModal(task._id);
                          }}
                          className={`transition-all transform hover:scale-110 ${isInProgress || disableForHighPriority ||
                            (
                              revisionSettings?.enableRevisions &&
                              revisionSettings?.enableMaxRevision &&
                              task.revisionCount >= revisionSettings?.limit
                            )
                            ? "opacity-50 cursor-not-allowed text-gray-400"
                            : "text-[--color-warning]"
                            }`}
                            title={isInProgress ? "Task is under approval" : "Revise task"}
                        >
                          <RefreshCcw size={16} />
                        </button>

                        <button
                          onClick={() => setShowCompleteModal(task._id)}
                          disabled={isInProgress || !canManageTask(task) || task.status !== 'pending'}
                          className={`... ${isInProgress || !canManageTask(task) ? 'opacity-50 cursor-not-allowed' : 'transition-all transform hover:scale-110 text-[--color-success]'}`}
                          title={
                            isInProgress
                              ? "Task is under approval"
                              : "Complete task"
                          }
                        >
                          <CheckSquare size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
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
    <div className="min-h-full bg-[var(--color-background)] p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
        <div className="flex items-center">
          <div>
            <h1 className="text-lg font-bold text-[--color-text]">
              Pending Tasks
            </h1>
            <p className="mt-0 text-xs text-[--color-textSecondary]">
              {tasks.length} pending task(s) found
              {sortOrder !== 'none' && (
                <span className="ml-2 text-[--color-primary]">
                  • Sorted by due date ({sortOrder === 'asc' ? 'earliest first' : 'latest first'})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="ml-2 p-2 rounded-full transition-colors hover:bg-[--color-background] bg-[--color-surface] text-[--color-textSecondary]"
            aria-expanded={showFilters}
            aria-controls="filters-panel"
          >
            <Filter size={20} />
          </button>
        </div>
        {!isMobile && <ViewToggle view={view} onViewChange={setView} />}
      </div>

      {/* Enhanced Filters Section */}
      {showFilters && (
        <div
          id="filters-panel"
          className="rounded-xl shadow-sm border border-[--color-border] p-3 mt-2 bg-[--color-surface]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {/* Date From */}
            <div>
              <label className="block text-sm font-medium mb-1 text-[--color-textSecondary]">
                <Calendar size={14} className="inline mr-1" />
                Date From
              </label>
              <input
                type="date"
                value={filter.dateFrom}
                onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
                className="w-full text-sm px-2 py-1 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] transition-colors bg-[--color-background] text-[--color-text]"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-sm font-medium mb-1 text-[--color-textSecondary]">
                <Calendar size={14} className="inline mr-1" />
                Date To
              </label>
              <input
                type="date"
                value={filter.dateTo}
                onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
                className="w-full text-sm px-2 py-1 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] transition-colors bg-[--color-background] text-[--color-text]"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1 text-[--color-textSecondary]">
                Priority
              </label>
              <select
                value={filter.priority}
                onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                className="w-full text-sm px-1 py-1 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] transition-colors bg-[--color-background] text-[--color-text]"
              >
                <option value="">All Priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>

            {user?.permissions.canViewAllTeamTasks && (
              <div>
                <label className="block text-sm font-medium mb-1 text-[--color-textSecondary]">
                  <Users size={14} className="inline mr-1" />
                  Assigned By
                </label>

                <select
                  value={filter.assignedBy}
                  onChange={(e) => setFilter({ ...filter, assignedBy: e.target.value })}
                  className="w-full text-sm px-1 py-1 border border-[--color-border] rounded-lg 
      bg-[--color-background] text-[--color-text] focus:ring-2 
      focus:ring-[--color-primary] focus:border-[--color-primary]"
                >
                  <option value="">All</option>

                  {/* Auto populate based on tasks */}
                  {[...new Set(allTasks.map(t => t.assignedBy.username))].map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {user?.permissions.canViewAllTeamTasks && (
              <div>
                <label className="block text-sm font-medium mb-1 text-[--color-textSecondary]">
                  <Users size={14} className="inline mr-1" />
                  Team Member
                </label>
                <select
                  value={filter.assignedTo}
                  onChange={(e) => setFilter({ ...filter, assignedTo: e.target.value })}
                  className="w-full text-sm px-1 py-1 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] transition-colors bg-[--color-background] text-[--color-text]"
                >
                  <option value="">All Members</option>
                  {users.map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.username}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 text-[--color-textSecondary]">
                Sort by Due Date
              </label>
              <button
                onClick={toggleSort}
                className="w-full text-sm px-1 py-1 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] transition-colors flex items-center justify-between hover:bg-[--color-background] bg-[--color-surface] text-[--color-text]"
              >
                <span>
                  {sortOrder === 'none' ? 'No sorting' :
                    sortOrder === 'asc' ? 'Earliest first' : 'Latest first'}
                </span>
                {getSortIcon()}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-[--color-textSecondary]">
                <Search size={14} className="inline mr-1" />
                Search
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[--color-textSecondary]" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={filter.search}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  className="w-full pl-8 text-sm pr-1 py-1 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] transition-colors bg-[--color-background] text-[--color-text]"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="px-2 py-2 text-sm font-medium rounded-lg transition-all transform hover:scale-105 hover:bg-[--color-background] bg-[--color-surface] border border-[--color-border] text-[--color-text]"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4 bg-gradient-to-r from-[--color-primary] to-[--color-accent]">
            <CheckSquare size={48} className="text-[--color-background]" />
          </div>
          <p className="text-lg text-[--color-textSecondary]">No pending tasks found</p>
          <p className="text-sm mt-2 text-[--color-textSecondary]">Try adjusting your filters or check back later</p>
        </div>
      ) : (
        <>
          {isMobile || view === 'card' ? renderCardView() : renderTableView()}
        </>
      )}

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
        <>
          {(() => {
            if (!revisionSettings) return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">Loading revision settings...</div>;

            const selectedTask = allTasks.find(t => t._id === showReviseModal);
            if (!selectedTask) return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">Task not found...</div>;

            const currentRevisionCount = selectedTask?.revisionCount || 0;
            const enableRevisions = revisionSettings.enableRevisions ?? false;
            const enableDaysRule = revisionSettings.enableDaysRule ?? false;

            // Compute effective max days (Infinity if revisions disabled OR days rule disabled)
            let effectiveMaxDays = Infinity;
            if (enableRevisions && enableDaysRule) {
              effectiveMaxDays = revisionSettings.maxDays ?? 7; // Fallback to global maxDays
              const revisionIndex = currentRevisionCount + 1;
              if (revisionSettings.days && revisionSettings.days[revisionIndex] !== undefined && revisionSettings.days[revisionIndex] !== null) {
                effectiveMaxDays = revisionSettings.days[revisionIndex]; // Override with revision-specific days
              }
            }

            let rawBase = selectedTask?.lastPlannedDate || selectedTask?.dueDate || null;
            let parsed = rawBase ? parseDate(rawBase) : null;
            let baseDate = parsed ? parsed : new Date();

            let allowedMaxDate = new Date(baseDate.getTime());
            if (effectiveMaxDays !== Infinity) {
              allowedMaxDate.setDate(allowedMaxDate.getDate() + effectiveMaxDays);
            } else {
              // If no restriction, allow up to 1 year from base or today + 1 year
              allowedMaxDate.setFullYear(allowedMaxDate.getFullYear() + 1);
            }

            // Ensure valid dates for input attributes
            const minDate = !isNaN(baseDate.getTime()) ? baseDate.toISOString().split("T")[0] : undefined;
            const maxDate = !isNaN(allowedMaxDate.getTime()) ? allowedMaxDate.toISOString().split("T")[0] : undefined;

            // Format dates for display (en-GB: DD/MM/YYYY)
            const formatDate = (date: Date) => !isNaN(date.getTime()) ? date.toLocaleDateString("en-GB") : 'Invalid Date';

            return (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="rounded-xl max-w-md w-full shadow-2xl bg-[--color-surface]">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center text-[--color-text]">
                      <RefreshCcw size={20} className="text-[--color-warning] mr-2" />
                      Revise Task
                    </h3>

                    <div className="space-y-4">
                      {/* Date Input */}
                      <div>
                        <label className="block text-sm font-medium mb-2 text-[--color-textSecondary]">
                          New Due Date
                        </label>
                        <input
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
                          className="w-full px-3 py-2 text-[--color-text] bg-[--color-background] border border-[--color-border] rounded-lg"
                        />
                        <div className="text-xs text-[--color-textSecondary] mt-1">
                          Allowed Range: {formatDate(baseDate)} → {effectiveMaxDays === Infinity ? 'No Limit' : formatDate(allowedMaxDate)} ({effectiveMaxDays === Infinity ? 'Unlimited' : `${effectiveMaxDays} days max for revision #${currentRevisionCount + 1}`})
                        </div>
                      </div>

                      {/* Remarks */}
                      <div>
                        <label className="block text-sm font-medium mb-2 text-[--color-textSecondary]">
                          Revision Remarks
                        </label>
                        <textarea
                          rows={3}
                          value={revisionRemarks}
                          onChange={(e) => setRevisionRemarks(e.target.value)}
                          className="w-full px-3 py-2 text-[--color-text] bg-[--color-background] border border-[--color-border] rounded-lg"
                          placeholder="Reason for revision..."
                        />
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex space-x-3 mt-6">
                      <button
                        onClick={() => handleReviseTask(showReviseModal)}
                        className="flex-1 py-2 px-4 rounded-lg text-white bg-gradient-to-r from-[--color-warning] to-[--color-accent]"
                      >
                        Revise Task
                      </button>

                      <button
                        onClick={() => {
                          setShowReviseModal(null);
                          setRevisionDate('');
                          setRevisionRemarks('');
                        }}
                        className="flex-1 py-2 px-4 rounded-lg bg-[--color-surface] border border-[--color-border] text-[--color-text]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Attachments Modal */}
      {showAttachmentsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="rounded-xl max-w-xl w-full shadow-2xl transform transition-all bg-[--color-surface]">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center text-[--color-text]">
                <Paperclip size={20} className="mr-2" />
                Task Attachments
              </h3>
              {showAttachmentsModal.length > 0 ? (
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {showAttachmentsModal.map((attachment, index) => {
                    const downloadKey = `${attachment.filename}-${Date.now()}`;
                    return (
                      <li key={index} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg ${theme === 'light' ? 'bg-gray-50' : 'bg-[--color-background]'} text-[--color-text]`}>
                        <div className="flex items-center mb-2 sm:mb-0 sm:mr-4">
                          {isImage(attachment.filename) ? (
                            <>
                              <img
                                src={`${address}/uploads/${attachment.filename}`}
                                alt={attachment.originalName}
                                className="w-16 h-16 object-cover rounded-md mr-3 border border-[--color-border] cursor-pointer"
                                onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)}
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
                        {isImage(attachment.filename) ? (
                          <div className="flex items-center shrink-0 mt-2 sm:mt-0 space-x-2">
                            <button
                              onClick={() => window.open(`${address}/uploads/${attachment.filename}`, '_blank')}
                              className="text-sm font-medium text-[--color-primary] hover:text-[--color-primary-dark] flex items-center"
                            >
                              View
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDownload(attachment)}
                              disabled={downloading[downloadKey]}
                              className="text-sm font-medium text-[--color-primary] hover:text-[--color-primary-dark] flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {downloading[downloadKey] ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-[--color-primary] border-t-transparent rounded-full animate-spin mr-1"></div>
                                  Downloading...
                                </>
                              ) : (
                                <>
                                  Download
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownload(attachment)}
                            disabled={downloading[downloadKey]}
                            className="text-sm font-medium text-[--color-primary] hover:text-[--color-primary-dark] flex items-center shrink-0 mt-2 sm:mt-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {downloading[downloadKey] ? (
                              <>
                                <div className="w-4 h-4 border-2 border-[--color-primary] border-t-transparent rounded-full animate-spin mr-1"></div>
                                Downloading...
                              </>
                            ) : (
                              <>
                                Download
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[--color-textSecondary]">No attachments for this task.</p>
              )}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowAttachmentsModal(null)}
                  className="py-2 px-4 rounded-lg font-medium transition-colors hover:bg-[--color-background] bg-[--color-surface] border border-[--color-border] text-[--color-text]"
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
  );
};

export default PendingTasks;