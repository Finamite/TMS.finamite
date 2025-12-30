import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Archive, History, Filter, Search, Trash2, Users, Calendar, ChevronDown, ChevronUp, ArrowUpDown, Eye, Paperclip, FileText, Edit3, RotateCcw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, Download, ExternalLink, Check } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import { useTheme } from '../contexts/ThemeContext';
import { EditTaskModal } from '../components/EditTaskModal';
import { address } from '../../utils/ipAddress';
import { Task } from "../types/Task";
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

interface Attachment {
  filename: string;
  originalName: string;
  path: string;
  size: number;
  uploadedAt: string;
}

interface User {
  _id: string;
  username: string;
  email: string;
}

const timeAgo = (date?: string) => {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const intervals: [number, string][] = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];

  for (const [secs, label] of intervals) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
};


// Replace the filterTasks helper function with this updated version:
const filterTasks = (tasks: Task[], filter: any) => {
  return tasks.filter((task: Task) => {
    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const matchesSearch =
        task.title.toLowerCase().includes(searchLower) ||
        task.description.toLowerCase().includes(searchLower) ||
        task.assignedTo.username.toLowerCase().includes(searchLower) ||
        task.assignedBy.username.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;
    }

    // Status filter (handle 'overdue' as computed status)
    if (filter.status) {
      if (filter.status === 'overdue') {
        if (task.status !== 'pending' || !task.dueDate) return false;

        const dueDateTime = new Date(task.dueDate);
        dueDateTime.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dueDateTime >= today) return false;
      } else if (task.status !== filter.status) {
        return false;
      }
    }

    // Priority filter
    if (filter.priority && task.priority !== filter.priority) {
      return false;
    }
    if (filter.assignedBy && task.assignedBy.username !== filter.assignedBy) {
      return false;
    }
    // Assigned to filter
    if (filter.assignedTo && task.assignedTo._id !== filter.assignedTo) {
      return false;
    }
    // Date range filter for due date
    if (filter.dateFrom || filter.dateTo) {
      if (!task.dueDate) return false; // Skip tasks without due date when date filter is applied
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
    }
    return true;
  });
};

const MasterTasks: React.FC = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'table'>(() => {
    const savedView = localStorage.getItem('taskViewPreference');
    return savedView === 'card' || savedView === 'table' ? savedView : 'table';
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState<'dueDate' | 'created' | 'priority' | 'status'>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState({
    status: '',
    priority: '',
    assignedBy: '',
    assignedTo: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  });
  const [showRevisionModal, setShowRevisionModal] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState<{ attachments: Attachment[], type: 'task' | 'completion' } | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showRemarksModal, setShowRemarksModal] = useState<Task | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [taskIdToDelete, setTaskIdToDelete] = useState<string | null>(null);
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());
  const [showRejectInfoModal, setShowRejectInfoModal] = useState<Task | null>(null);
  const [showApproveInfoModal, setShowApproveInfoModal] = useState<Task | null>(null);
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);

  // Calculate pagination
  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTasks = filteredTasks.slice(startIndex, endIndex);

  const toggleTitleExpansion = (taskId: string) => {
    setExpandedTitles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  };

  // Helper function to check if actions column should be shown
  const shouldShowActionsColumn = () => {
    // Show actions column if user has edit or delete permissions
    if (user?.permissions.canEditTasks || user?.permissions.canDeleteTasks) {
      return true;
    }
    // Show actions column if any of the current tasks have revisions (for revision history)
    return currentTasks.some(task => task.revisionCount > 0);
  };

  useEffect(() => {
    fetchTasks();
    if (user?.permissions.canViewAllTeamTasks) {
      fetchUsers();
    }
  }, [user]);

  // Apply filters whenever filter state or allTasks changes
  useEffect(() => {
    let filtered = filterTasks(allTasks, filter);

    // Sort tasks
    filtered.sort((a: Task, b: Task) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'dueDate':
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          break;
        case 'created':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'priority':
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1, normal: 1 };
          aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
          bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
          break;
        case 'status':
          const statusOrder = { overdue: 4, pending: 3, 'in-progress': 2, completed: 1 };
          aValue = statusOrder[a.status as keyof typeof statusOrder] || 0;
          bValue = statusOrder[b.status as keyof typeof statusOrder] || 0;
          break;
        default:
          aValue = a.createdAt;
          bValue = b.createdAt;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredTasks(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [allTasks, filter, sortBy, sortOrder]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        taskType: 'one-time',
        page: '1',
        limit: '1000000' // Fetch all tasks to handle filtering on frontend
      });

      if (user?.company?.companyId) {
        params.append('companyId', user.company.companyId);
      }
      if (!user?.permissions.canViewAllTeamTasks && user?.id) {
        params.append('assignedTo', user.id);
        params.append('assignedBy', user.id);
      }
      const response = await axios.get(`${address}/api/tasks?${params}`);
      let tasks = response.data.tasks.filter((task: Task) => task.taskType === 'one-time');
      setAllTasks(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
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

  const handleDeleteTask = (taskId: string) => {
    setTaskIdToDelete(taskId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!taskIdToDelete) return;

    try {
      await axios.delete(`${address}/api/tasks/onetime/${taskIdToDelete}`);
      fetchTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
    } finally {
      setShowDeleteModal(false);
      setTaskIdToDelete(null);
    }
  };

  const handleEditTask = async (taskId: string, updates: any) => {
    try {
      const response = await fetch(`${address}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        await fetchTasks();
      } else {
        throw new Error('Failed to update task');
      }
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  };

  const viewRevisionHistory = (task: Task) => {
    setSelectedTask(task);
    setShowRevisionModal(task._id);
  };

  const resetFilters = () => {
    setFilter({
      status: '',
      priority: '',
      assignedBy: '',
      assignedTo: '',
      search: '',
      dateFrom: '',
      dateTo: ''
    });
    setCurrentPage(1);
    setSortBy('dueDate');
    setSortOrder('asc');
  };

  const handleSort = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const getSortIcon = (column: typeof sortBy) => {
    if (sortBy !== column) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortOrder === 'asc' ?
      <ChevronUp size={14} className="text-blue-600" /> :
      <ChevronDown size={14} className="text-blue-600" />;
  };

  const isTaskOverdue = (dueDate?: string, status?: string) => {
    if (status !== 'pending' || !dueDate) return false;

    const dueDateTime = new Date(dueDate);
    dueDateTime.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return dueDateTime < today;
  };

  const toggleDescriptionExpansion = (taskId: string) => {
    setExpandedDescriptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
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

  const renderCardView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
      {currentTasks.map((task) => {
        const isExpanded = expandedDescriptions.has(task._id);
        const showReadMore = task.description.length > 150;
        const displayedDescription = isExpanded || !showReadMore
          ? task.description
          : `${task.description.substring(0, 150)}...`;

        return (
          <div
            key={task._id}
            className={`rounded-xl shadow-sm border hover:shadow-lg transition-all duration-300 overflow-hidden transform hover:-translate-y-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              } ${isTaskOverdue(task.dueDate, task.status)
                ? (isDark ? 'border-red-600 ring-1 ring-red-400' : 'border-red-300 ring-1 ring-red-100')
                : ''
              }`}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className={`text-lg font-semibold flex-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {expandedTitles.has(task._id) || task.title.length <= 70
                    ? task.title
                    : `${task.title.substring(0, 70)}...`}
                  {task.title.length > 70 && (
                    <button
                      onClick={() => toggleTitleExpansion(task._id)}
                      className="ml-1 text-blue-500 hover:underline text-xs"
                    >
                      {expandedTitles.has(task._id) ? 'Show Less' : 'Show More'}
                    </button>
                  )}
                </div>
                <div className="flex space-x-1 ml-2 opacity-80 hover:opacity-100 transition-opacity">
                  {task.revisionCount > 0 && (
                    <button
                      onClick={() => viewRevisionHistory(task)}
                      className={`p-2 rounded-lg transition-colors ${isDark ? 'text-blue-400 hover:bg-blue-900' : 'text-blue-600 hover:bg-blue-50'}`}
                      title="View revision history"
                    >
                      <History size={16} />
                    </button>
                  )}
                  {task.status !== 'completed' && user?.permissions.canEditTasks && (
                    <button
                      onClick={() => setEditingTask(task)}
                      className={`p-2 rounded-lg transition-colors ${isDark ? 'text-green-400 hover:bg-green-900' : 'text-green-600 hover:bg-green-50'}`}
                      title="Edit task"
                    >
                      <Edit3 size={16} />
                    </button>
                  )}
                  {user?.permissions.canDeleteTasks && (
                    <button
                      onClick={() => handleDeleteTask(task._id)}
                      className={`p-2 rounded-lg transition-colors ${isDark ? 'text-red-400 hover:bg-red-900' : 'text-red-600 hover:bg-red-50'}`}
                      title="Delete task"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <StatusBadge status={task.status} />
                {task.status === 'rejected' && (
                  <button
                    onClick={() => setShowRejectInfoModal(task)}
                    className="ml-1 p-1 rounded-full hover:bg-red-100"
                    title="View rejection details"
                  >
                    <Info size={14} className="text-red-600" />
                  </button>
                )}
                {task.status === 'completed' && task.approvedAt && task.approvedBy && (
                  <button
                    onClick={() => setShowApproveInfoModal(task)}
                    className="ml-1 p-1 rounded-full hover:bg-green-100"
                    title="View approval details"
                  >
                    <Info size={14} className="text-green-600" />
                  </button>
                )}
                <PriorityBadge priority={task.priority} />
                {task.revisionCount > 0 && (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${isDark ? 'bg-orange-700 text-orange-200 border-orange-600' : 'bg-orange-100 text-orange-800 border border-orange-200'}`}>
                    <History size={12} className="inline mr-1" />
                    Revised {task.revisionCount}x
                  </span>
                )}
                {isTaskOverdue(task.dueDate, task.status) && (
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${isDark ? 'bg-red-700 text-red-200 border-red-600' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                    Overdue
                  </span>
                )}
              </div>

              <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {displayedDescription}
                {showReadMore && (
                  <button
                    onClick={() => toggleDescriptionExpansion(task._id)}
                    className="ml-1 text-blue-500 hover:underline text-xs"
                  >
                    {isExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </p>

              <div className="space-y-3 text-sm">
                <div className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <span className={`flex items-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Users size={14} className="mr-2" />
                    Assigned by:
                  </span>
                  <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{task.assignedBy.username}</span>
                </div>
                <div className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-blue-900' : 'bg-blue-50'}`}>
                  <span className={`flex items-center ${isDark ? 'text-blue-300' : 'text-gray-500'}`}>
                    <Eye size={14} className="mr-2" />
                    Assigned to:
                  </span>
                  <span className={`font-medium ${isDark ? 'text-blue-100' : 'text-blue-900'}`}>{task.assignedTo.username}</span>
                </div>
                <div className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <span className={`flex items-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Paperclip size={14} className="mr-2" />
                    Attachments:
                  </span>
                  {task.attachments && task.attachments.length > 0 ? (
                    <button
                      onClick={() => setShowAttachmentsModal({ attachments: task.attachments, type: 'task' })}
                      className={`font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                    >
                      Click Here ({task.attachments.length})
                    </button>
                  ) : (
                    <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No Attachments</span>
                  )}
                </div>
                <div className={`flex items-center justify-between p-2 rounded-lg ${isTaskOverdue(task.dueDate, task.status)
                  ? (isDark ? 'bg-red-900' : 'bg-red-50')
                  : (isDark ? 'bg-green-900' : 'bg-green-50')
                  }`}>
                  <span className={`flex items-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Calendar size={14} className="mr-2" />
                    Due date:
                  </span>
                  <span className={`font-medium ${isTaskOverdue(task.dueDate, task.status)
                    ? (isDark ? 'text-red-100' : 'text-red-900')
                    : (isDark ? 'text-green-100' : 'text-green-900')
                    }`}>
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    }) : 'N/A'}
                  </span>
                </div>
                {task.completedAt && (
                  <div className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-purple-900' : 'bg-purple-50'}`}>
                    <span className={`flex items-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Completed:
                      {task.completionRemarks && (
                        <button
                          onClick={() => setShowRemarksModal(task)}
                          className={`ml-1 ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                          title="View completion remarks"
                        >
                          <Info size={14} />
                        </button>
                      )}
                    </span>
                    <span className={`font-medium ${isDark ? 'text-purple-100' : 'text-purple-900'}`}>
                      {new Date(task.completedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {task.completionAttachments && task.completionAttachments.length > 0 && (
                  <div className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-green-900' : 'bg-green-50'}`}>
                    <span className={`flex items-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      <Paperclip size={14} className="mr-2" />
                      Completion Files:
                    </span>
                    <button
                      onClick={() => setShowAttachmentsModal({ attachments: task.completionAttachments!, type: 'completion' })}
                      className={`font-medium ${isDark ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'}`}
                    >
                      Click Here ({task.completionAttachments.length})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTableView = () => (
    <div className={`rounded-xl shadow-sm border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className={`${isDark ? 'bg-gray-700' : 'bg-gradient-to-r from-gray-50 to-gray-100'}`}>
            <tr>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                <button
                  onClick={() => handleSort('created')}
                  className={`flex items-center space-x-1 transition-colors ${isDark ? 'hover:text-white' : 'hover:text-gray-700'}`}
                >
                  <span>TASK</span>
                  {getSortIcon('created')}
                </button>
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                <button
                  onClick={() => handleSort('status')}
                  className={`flex items-center space-x-1 transition-colors ${isDark ? 'hover:text-white' : 'hover:text-gray-700'}`}
                >
                  <span>STATUS</span>
                  {getSortIcon('status')}
                </button>
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                <button
                  onClick={() => handleSort('priority')}
                  className={`flex items-center space-x-1 transition-colors ${isDark ? 'hover:text-white' : 'hover:text-gray-700'}`}
                >
                  <span>PRIORITY</span>
                  {getSortIcon('priority')}
                </button>
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                Assigned By
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                Assigned To
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                Task Attachments
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                <button
                  onClick={() => handleSort('dueDate')}
                  className={`flex items-center space-x-1 transition-colors ${isDark ? 'hover:text-white' : 'hover:text-gray-700'}`}
                >
                  <span>DUE DATE</span>
                  {getSortIcon('dueDate')}
                </button>
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                Completed Date
              </th>
              <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                Completion Files
              </th>
              {shouldShowActionsColumn() && (
                <th className={`px-6 py-4 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'}`}>
            {currentTasks.map((task, index) => {
              const isExpanded = expandedDescriptions.has(task._id);
              const showReadMore = task.description.length > 100;
              const displayedDescription = isExpanded || !showReadMore
                ? task.description
                : `${task.description.substring(0, 100)}...`;

              return (
                <tr
                  key={task._id}
                  className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition-colors ${index % 2 === 0
                    ? (isDark ? 'bg-gray-800' : 'bg-white')
                    : (isDark ? 'bg-gray-900' : 'bg-gray-25')
                    } ${isTaskOverdue(task.dueDate, task.status)
                      ? (isDark ? '' : 'bg-red-25 hover:bg-red-50')
                      : ''
                    }`}
                >
                  <td className="px-6 py-4">
                    <div>
                      <div className={`text-sm font-medium mb-1 flex items-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {expandedTitles.has(task._id) || task.title.length <= 150
                          ? task.title
                          : `${task.title.substring(0, 150)}...`}
                        {task.title.length > 150 && (
                          <button
                            onClick={() => toggleTitleExpansion(task._id)}
                            className="ml-1 text-blue-500 hover:underline text-xs"
                          >
                            {expandedTitles.has(task._id) ? 'Show Less' : 'Show More'}
                          </button>
                        )}
                        {isTaskOverdue(task.dueDate, task.status) && (
                          <span className="ml-2 w-2 h-2 bg-red-500 rounded-full"></span>
                        )}
                      </div>

                      <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {displayedDescription}
                        {showReadMore && (
                          <button
                            onClick={() => toggleDescriptionExpansion(task._id)}
                            className="ml-1 text-blue-500 hover:underline text-xs"
                          >
                            {isExpanded ? 'Show Less' : 'Show More'}
                          </button>
                        )}
                      </div>
                      {task.revisionCount > 0 && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-1 ${isDark ? 'bg-orange-700 text-orange-200 border-orange-600' : 'bg-orange-100 text-orange-800 border border-orange-200'}`}>
                          <History size={10} className="mr-1" />
                          Revised {task.revisionCount}x
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={task.status} />

                      {task.status === 'rejected' && (
                        <button
                          onClick={() => setShowRejectInfoModal(task)}
                          className="p-1 rounded-full hover:bg-red-100 transition"
                          title="View rejection details"
                        >
                          <Info size={14} className="text-red-600" />
                        </button>
                      )}
                      {task.status === 'completed' && task.approvedAt && task.approvedBy && (
                        <button
                          onClick={() => setShowApproveInfoModal(task)}
                          className="p-1 rounded-full hover:bg-green-100"
                          title="View approval details"
                        >
                          <Info size={14} className="text-green-600" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{task.assignedBy.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{task.assignedTo.username}</div>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{task.assignedTo.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {task.attachments && task.attachments.length > 0 ? (
                      <button
                        onClick={() => setShowAttachmentsModal({ attachments: task.attachments, type: 'task' })}
                        className={`font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                      >
                        Click Here ({task.attachments.length})
                      </button>
                    ) : (
                      <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No Attachments</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${isTaskOverdue(task.dueDate, task.status)
                      ? (isDark ? 'text-red-400' : 'text-red-600')
                      : (isDark ? 'text-white' : 'text-gray-900')
                      }`}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      }) : 'N/A'}
                    </div>
                    {isTaskOverdue(task.dueDate, task.status) && (
                      <div className={`text-xs ${isDark ? 'text-red-300' : 'text-red-500'}`}>Overdue</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm flex items-center ${isDark ? 'text-gray-300' : 'text-gray-900'}`}>
                      {task.completedAt ? new Date(task.completedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      }) : ''}
                      {task.completionRemarks && task.completedAt && (
                        <button
                          onClick={() => setShowRemarksModal(task)}
                          className={`ml-2 ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
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
                        className={`font-medium ${isDark ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'}`}
                      >
                        Click Here ({task.completionAttachments.length})
                      </button>
                    ) : (
                      <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No Files</span>
                    )}
                  </td>
                  {shouldShowActionsColumn() && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {task.revisionCount > 0 && (
                          <button
                            onClick={() => viewRevisionHistory(task)}
                            className={`p-1 rounded transition-colors ${isDark ? 'text-blue-400 hover:bg-blue-900' : 'text-blue-600 hover:bg-blue-50'}`}
                            title="View revision history"
                          >
                            <History size={16} />
                          </button>
                        )}
                        {task.status !== 'completed' && user?.permissions.canEditTasks && (
                          <button
                            onClick={() => setEditingTask(task)}
                            className={`p-1 rounded transition-colors ${isDark ? 'text-green-400 hover:bg-green-900' : 'text-green-600 hover:bg-green-50'}`}
                            title="Edit task"
                          >
                            <Edit3 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTask(task._id)}
                          className={`p-1 rounded transition-colors ${isDark ? 'text-red-400 hover:bg-red-900' : 'text-red-600 hover:bg-red-50'}`}
                          title="Delete task"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const handleDownload = async (attachment: Attachment) => {
    // const downloadKey = `${attachment.filename}-${Date.now()}`;

    try {
      // setDownloading(prev => ({ ...prev, [downloadKey]: true }));

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
      // setDownloading(prev => ({ ...prev, [downloadKey]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[--color-primary]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--color-background)] p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-[--color-text]">
            Master Tasks
            {user?.permissions.canViewAllTeamTasks && <span className="text-xs font-normal text-[--color-primary] ml-2">(Admin View - All Team)</span>}
          </h1>
          <p className="mt-1 text-xs text-[--color-textSecondary]">
            {filteredTasks.length} of {allTasks.length} task(s) found
            {user?.permissions.canViewAllTeamTasks ? ' (All team members)' : ' (Your tasks)'}
          </p>
        </div>
        <div className="flex items-center mt-4 sm:mt-0">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 text-sm font-medium text-[--color-textSecondary] bg-[--color-surface] hover:bg-[--color-border] rounded-lg transition-colors flex items-center mr-4"
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
        <div className="bg-[--color-background] rounded-xl shadow-sm border border-[--color-border] p-4 mb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {/* Date From */}
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
               focus:ring-2 focus:ring-[--color-primary]
               focus:border-[--color-primary]
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

            {/* Date To */}
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
               focus:ring-2 focus:ring-[--color-primary]
               focus:border-[--color-primary]
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

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-1">
                Status
              </label>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                className="w-full text-sm px-3 py-2 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-1">
                Priority
              </label>
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
                  className="w-full text-sm px-3 py-2 border border-[--color-border] 
      rounded-lg bg-[--color-surface] text-[--color-text] 
      focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary]"
                >
                  <option value="">All Assigners</option>

                  {[...new Set(allTasks.map(t => t.assignedBy.username))].map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

            {/* Team Member Filter (Admin only) */}
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

            {/* Search */}
            <div className={`${user?.permissions.canViewAllTeamTasks ? 'md:col-span-2' : 'md:col-span-1'}`}>
              <label className="block text-sm font-medium text-[--color-text] mb-1">
                <Search size={14} className="inline mr-1" />
                Search
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[--color-textSecondary]" />
                <input
                  type="text"
                  placeholder="Search tasks, descriptions, users..."
                  value={filter.search}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-surface] text-[--color-text]"
                />
              </div>
            </div>

            {/* Clear Filters Button */}
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

      {/* Content */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <Archive size={48} className="mx-auto mb-4 text-[--color-textSecondary]" />
          <p className="text-lg text-[--color-textSecondary]">
            {Object.values(filter).some(value => value !== '')
              ? 'No tasks match your filters'
              : 'No tasks found'}
          </p>
          {Object.values(filter).some(value => value !== '') && (
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
          {view === 'card' ? renderCardView() : renderTableView()}

          {/* Enhanced Pagination */}
          {totalPages > 1 && (
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
                    <span className="font-medium">{Math.min(endIndex, filteredTasks.length)}</span> of{' '}
                    <span className="font-medium">{filteredTasks.length}</span> results
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
          )}
        </>
      )}

      {/* Revision History Modal */}
      {showRevisionModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className={`rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl transform transition-all duration-300 scale-100 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold flex items-center">
                    <History size={24} className="mr-3" />
                    Revision History
                  </h3>
                  <p className="text-blue-100 text-sm mt-1 truncate">
                    {selectedTask.title}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRevisionModal(null);
                    setSelectedTask(null);
                  }}
                  className="text-white hover:text-gray-200 text-2xl p-1 hover:bg-white hover:bg-opacity-20 rounded-full transition-all duration-200"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="space-y-4">
                {selectedTask.revisions.length === 0 ? (
                  <div className="text-center py-8">
                    <History size={48} className={`mx-auto text-gray-300 mb-4 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No revisions found for this task</p>
                  </div>
                ) : (
                  selectedTask.revisions.map((revision, index) => (
                    <div
                      key={index}
                      className={`relative p-5 rounded-xl border hover:shadow-md transition-all duration-200 ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-gradient-to-r from-gray-50 to-white border-gray-200'}`}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 rounded-l-xl"></div>

                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                            #{index + 1}
                          </div>
                          <span className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Revision #{index + 1}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {revision.revisedBy.username}
                          </div>
                          <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {new Date(revision.revisedAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg border ${isDark ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'}`}>
                            <div className={`text-sm font-medium mb-1 flex items-center ${isDark ? 'text-red-200' : 'text-red-800'}`}>
                              <Calendar size={14} className="mr-2" />
                              Original Date
                            </div>
                            <div className={`font-semibold ${isDark ? 'text-red-100' : 'text-red-900'}`}>
                              {new Date(revision.oldDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                          </div>

                          <div className={`p-3 rounded-lg border ${isDark ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'}`}>
                            <div className={`text-sm font-medium mb-1 flex items-center ${isDark ? 'text-green-200' : 'text-green-800'}`}>
                              <Calendar size={14} className="mr-2" />
                              Revised Date
                            </div>
                            <div className={`font-semibold ${isDark ? 'text-green-100' : 'text-green-900'}`}>
                              {new Date(revision.newDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                          </div>
                        </div>

                        {revision.remarks && (
                          <div className={`p-3 rounded-lg border ${isDark ? 'bg-blue-900 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                            <div className={`text-sm font-medium mb-2 ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>
                              Remarks:
                            </div>
                            <div className={`text-sm leading-relaxed ${isDark ? 'text-blue-100' : 'text-blue-900'}`}>
                              {revision.remarks}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={`px-6 py-4 border-t text-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <button
                onClick={() => {
                  setShowRevisionModal(null);
                  setSelectedTask(null);
                }}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Remarks Modal */}
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

      {/* Enhanced Attachments Modal */}
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
                        {/* File preview */}
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

                        {/* File info */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-[--color-text] truncate" title={attachment.originalName}>
                            {attachment.originalName}
                          </h4>
                          <div className="text-xs text-[--color-textSecondary] space-y-1">
                            <div>Size: {formatFileSize(attachment.size)}</div>
                            <div>Uploaded: {new Date(attachment.uploadedAt).toLocaleDateString()}</div>
                          </div>
                        </div>

                        {/* Action buttons */}
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

      {editingTask && (
        <EditTaskModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          task={editingTask}
          users={users}
          onSave={handleEditTask}
        />
      )}
      <ConfirmDeleteModal
        open={showDeleteModal}
        message="Are you sure you want to delete this task?"
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
      />

      {showRejectInfoModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-lg px-4">

          {/* Animated container */}
          <div
            className={`w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.4)]
      border 
      ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}
    `}
          >

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b
        ${isDark ? 'border-gray-700' : 'border-gray-200'}
      ">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-red-100
            flex items-center justify-center">
                  <Info size={22} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--color-text)]">
                    Task Rejected
                  </h3>
                  <p className="text-xs text-[var(--color-textSecondary)]">
                    Action required / review details
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowRejectInfoModal(null)}
                className="h-9 w-9 rounded-full flex items-center justify-center
          text-gray-400 hover:text-gray-600
          hover:bg-gray-100 transition"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">

              {/* Timeline */}
              <div className="relative pl-6">
                <div className="absolute left-2 top-1 bottom-1 w-px bg-red-300" />

                <div className="flex-1 space-y-3">

                  {/* Meta cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* Date */}
                    <div className={`rounded-xl p-4 border
                  ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}
                `}>
                      <p className="text-xs text-[var(--color-textSecondary)] mb-1">Rejected On</p>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {showRejectInfoModal.rejectedAt
                          ? new Date(showRejectInfoModal.rejectedAt).toLocaleString('en-GB')
                          : '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {timeAgo(showRejectInfoModal.rejectedAt)}
                      </p>
                    </div>

                    {/* Rejected By */}
                    <div className={`rounded-xl p-4 border flex items-center gap-3
                  ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}
                `}>
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-red-500 to-red-700
                    flex items-center justify-center text-white font-semibold">
                        {showRejectInfoModal.rejectedBy?.username?.charAt(0).toUpperCase() || 'A'}
                      </div>

                      <div>
                        <p className="text-xs text-[var(--color-textSecondary)]">Rejected By</p>
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {showRejectInfoModal.rejectedBy?.username || 'Admin'}
                        </p>
                      </div>
                    </div>

                  </div>

                  {/* Remark */}
                  <div>
                    <p className="text-xs text-[var(--color-textSecondary)] mb-2">Rejection Remark</p>
                    <div className={`rounded-xl p-4 border text-sm leading-relaxed
                  ${isDark
                        ? 'bg-gray-800 border-gray-700 text-gray-200'
                        : 'bg-gray-50 border-gray-200 text-gray-800'}
                `}>
                      {showRejectInfoModal.rejectionRemarks || 'No remarks provided'}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t flex justify-end
        ${isDark ? 'border-gray-700' : 'border-gray-200'}
      `}>
              <button
                onClick={() => setShowRejectInfoModal(null)}
                className="px-6 py-2 rounded-xl bg-red-600 text-white
          hover:bg-red-700 active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>

          {/* Animations */}
          <style>
            {`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes shake {
          0% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          50% { transform: translateX(2px); }
          75% { transform: translateX(-1px); }
          100% { transform: translateX(0); }
        }
      `}
          </style>

        </div>
      )}

      {showApproveInfoModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
    bg-black/70 backdrop-blur-lg px-4">

          <div className={`w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border
      ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}
    `}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b
        ${isDark ? 'border-gray-700' : 'border-gray-200'}
      ">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-green-100
            flex items-center justify-center">
                  <Check size={22} className="text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Task Approved</h3>
                  <p className="text-xs text-gray-500">Approval details</p>
                </div>
              </div>

              <button
                onClick={() => setShowApproveInfoModal(null)}
                className="h-9 w-9 rounded-full text- [var(--color-text)] hover:bg-[var(--color-chat)] "
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Approved Date */}
                <div className={`rounded-xl p-4 border
            ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}
          `}>
                  <p className="text-xs text-gray-500">Approved On</p>
                  <p className="text-sm font-medium">
                    {new Date(showApproveInfoModal.approvedAt!).toLocaleString('en-GB')}
                  </p>
                  <p className="text-xs text-gray-400">
                    {timeAgo(showApproveInfoModal.approvedAt)}
                  </p>
                </div>

                {/* Approved By */}
                <div className={`rounded-xl p-4 border flex items-center gap-3
            ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}
          `}>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br
              from-green-500 to-green-700 text-white flex items-center justify-center font-semibold">
                    {showApproveInfoModal.approvedBy?.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Approved By</p>
                    <p className="text-sm font-medium">
                      {showApproveInfoModal.approvedBy?.username}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-end">
              <button
                onClick={() => setShowApproveInfoModal(null)}
                className="
    relative flex items-center gap-2
    px-6 py-2.5 rounded-xl
    bg-green-600 text-white
    border border-green-700
    overflow-hidden
    transition-colors duration-300
    hover:bg-green-700
    group
  "
              >
                {/* Sliding fill bar */}
                <span
                  className="
      absolute left-0 top-0 h-full w-full
      bg-green-800
      -translate-x-full
      group-hover:translate-x-0
      transition-transform duration-500 ease-in-out
    "
                />

                {/* Icon */}
                <Check
                  size={16}
                  className="relative z-10 opacity-90"
                />

                {/* Label */}
                <span className="relative z-10 font-medium tracking-wide">
                  Close
                </span>
              </button>


            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default MasterTasks;