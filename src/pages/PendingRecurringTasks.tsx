// PendingRecurringTasks.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, Clock, CheckSquare, Filter, Search, ChevronDown, ChevronUp, AlertCircle, CalendarDays, Paperclip, FileText, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import axios from 'axios';
import ViewToggle from '../components/ViewToggle';
import PriorityBadge from '../components/PriorityBadge';
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

// Function to handle file download
const downloadFile = async (filename: string, originalName: string) => {
  try {
    const response = await fetch(`${address}/uploads/${filename}`);
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
    window.open(`${address}/uploads/${filename}`, '_blank');
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
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'table'>(getInitialViewPreference);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeSection, setActiveSection] = useState<'daily' | 'cyclic'>('daily');
  const [filter, setFilter] = useState({
    taskType: '',
    priority: '',
    assignedTo: '',
    search: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState<string | null>(null);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState<Attachment[] | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState<{ [key: string]: boolean }>({});
  const [showFullTitle, setShowFullTitle] = useState<{ [key: string]: boolean }>({});
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
  const isImage = (filename: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    const lowercasedFilename = filename.toLowerCase();
    return imageExtensions.some(ext => lowercasedFilename.endsWith(ext));
  };

  // Function to toggle full description visibility for a task
  const toggleDescription = (taskId: string) => {
    setShowFullDescription(prevState => ({
      ...prevState,
      [taskId]: !prevState[taskId]
    }));
  };

  // Filter tasks based on all criteria
  const filterTasks = (tasks: Task[]) => {
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

      // Task type filter
      if (filter.taskType && task.taskType !== filter.taskType) {
        return false;
      }

      // Priority filter
      if (filter.priority && task.priority !== filter.priority) {
        return false;
      }

      // Assigned to filter
      if (filter.assignedTo && task.assignedTo._id !== filter.assignedTo) {
        return false;
      }

      return true;
    });
  };

  const getDailyTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today's date to start of day
    return filteredTasks.filter(task => {
      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0); // Normalize task due date to start of day

      return task.taskType === 'daily' && dueDate.getTime() === today.getTime();
    });
  };

  const getCyclicTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fiveDaysFromNow = new Date(today);
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    return filteredTasks.filter(task => {
      if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(task.taskType)) {
        return false;
      }

      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      // ✅ Show only overdue or due within the next 5 days
      return isOverdue(task.dueDate) || (dueDate >= today && dueDate <= fiveDaysFromNow);
    });
  };

  const getCurrentTasks = () => {
    return activeSection === 'daily' ? getDailyTasks() : getCyclicTasks();
  };

  // Calculate pagination
  const totalPages = Math.ceil(getCurrentTasks().length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTasks = getCurrentTasks().slice(startIndex, endIndex);

  useEffect(() => {
    fetchTasks();
    if (isAdmin) {
      fetchUsers();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (location.state?.highlightTaskId && location.state?.openCompleteModal) {
      const taskId = location.state.highlightTaskId;
      setShowCompleteModal(taskId);

      window.history.replaceState({}, document.title);
    }
  }, [allTasks]);

  useEffect(() => {
    if (!loading && location.state?.highlightTaskId && location.state?.openCompleteModal) {
      setShowCompleteModal(location.state.highlightTaskId);
      window.history.replaceState({}, document.title);
    }
  }, [loading]);

  // Apply filters whenever filter state or allTasks changes
  useEffect(() => {
    const filtered = filterTasks(allTasks);
    setFilteredTasks(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [allTasks, filter]);

  useEffect(() => {
    localStorage.setItem('taskViewPreference', view);
  }, [view]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      // Add companyId to params if it exists on the user object
      if (user?.company?.companyId) {
        params.append('companyId', user.company.companyId);
      }

      // ✅ Use specific userId field that matches backend expectations
      if (!isAdmin && user?.id) {
        params.append('userId', user.id);
      }

      // ✅ Use the optimized pending-recurring endpoint for faster queries
      const response = await axios.get(`${address}/api/tasks/pending-recurring?${params}`);

      // ✅ Data is already filtered on the backend, no need to filter again
      setAllTasks(response.data);
    } catch (error) {
      console.error("Error fetching tasks:", error);
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

  const handleTaskCompletion = () => {
    setAllTasks(prev => prev.filter(task => task._id !== showCompleteModal));
    setShowCompleteModal(null);
  };
  const getTaskToComplete = () => {
    return allTasks.find(task => task._id === showCompleteModal);
  };

  const resetFilters = () => {
    setFilter({ taskType: '', priority: '', assignedTo: '', search: '' });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page
  };

  const renderCardView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
      {currentTasks.map((task) => {
        const daysUntilDue = getDaysUntilDue(task.dueDate);
        const overdue = isOverdue(task.dueDate);
        const descriptionIsLong = task.description.length > 150; // Define a threshold for "long" description
        const displayDescription = showFullDescription[task._id] || !descriptionIsLong
          ? task.description
          : `${task.description.substring(0, 150)}...`;

        return (
          <div
            key={task._id}
            className={`bg-[var(--color-background)] rounded-xl shadow-sm border hover:shadow-lg transition-all duration-300 overflow-hidden transform hover:-translate-y-1 ${overdue
              ? 'border-l-4 border-l-[var(--color-error)] bg-gradient-to-r from-[var(--color-error)]/10 to-[var(--color-background)]'
              : daysUntilDue <= 1
                ? 'border-l-4 border-l-[var(--color-warning)] bg-gradient-to-r from-[var(--color-warning)]/10 to-[var(--color-background)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
              }`}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--color-text)] pr-2">
                  {showFullTitle[task._id] ? task.title : task.title.length > 70 ? `${task.title.substring(0, 70)}...` : task.title}
                  {task.title.length > 70 && (
                    <button
                      onClick={() => toggleTitleVisibility(task._id)}
                      className="ml-1 text-xs text-[var(--color-primary)] hover:underline font-medium"
                    >
                      {showFullTitle[task._id] ? 'Show Less' : 'Show More'}
                    </button>
                  )}
                </h3>
                <button
                  onClick={() => setShowCompleteModal(task._id)}
                  className="p-2 text-[var(--color-success)] hover:bg-[var(--color-success)]/10 rounded-lg transition-colors flex-shrink-0 hover:scale-110"
                  title="Complete task"
                >
                  <CheckSquare size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <TaskTypeBadge taskType={task.taskType} />
                <PriorityBadge priority={task.priority} />
                {overdue ? (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[var(--color-error)]/20 text-[var(--color-error)] animate-pulse">
                    <AlertCircle size={12} className="inline mr-1" />
                    {getDaysOverdue(task.dueDate)} days overdue
                  </span>
                ) : daysUntilDue <= 0 ? ( // Due today or already passed today
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[var(--color-warning)]/20 text-[var(--color-warning)]">
                    <Clock size={12} className="inline mr-1" />
                    Due today
                  </span>
                ) : daysUntilDue === 1 ? (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[var(--color-warning)]/20 text-[var(--color-warning)]">
                    <Clock size={12} className="inline mr-1" />
                    Due tomorrow
                  </span>
                ) : null}
              </div>
              <p className="text-[var(--color-textSecondary)] text-sm mb-4">
                {displayDescription}
                {descriptionIsLong && (
                  <button
                    onClick={() => toggleDescription(task._id)}
                    className="ml-1 text-[var(--color-primary)] hover:underline text-xs font-medium"
                  >
                    {showFullDescription[task._id] ? 'See Less' : 'See More'}
                  </button>
                )}
              </p>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 px-3 bg-[var(--color-surface)] rounded-lg">
                  <span className="text-[var(--color-textSecondary)]">Assigned by:</span>
                  <span className="font-medium text-[var(--color-text)]">{task.assignedBy.username}</span>
                </div>
                {isAdmin && (
                  <div className="flex justify-between items-center py-2 px-3 bg-[var(--color-primary)]/10 rounded-lg">
                    <span className="text-[var(--color-textSecondary)]">Assigned to:</span>
                    <span className="font-medium text-[var(--color-primary)]">{task.assignedTo.username}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 px-3 bg-[var(--color-accent)]/10 rounded-lg">
                  <span className="text-[var(--color-textSecondary)]">Due date:</span>
                  <span className="font-medium text-[var(--color-accent)]">
                    {new Date(task.dueDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {task.lastCompletedDate && (
                  <div className="flex justify-between items-center py-2 px-3 bg-[var(--color-success)]/10 rounded-lg">
                    <span className="text-[var(--color-textSecondary)]">Last completed:</span>
                    <span className="font-medium text-[var(--color-success)]">
                      {new Date(task.lastCompletedDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {/* Attachments in Card View */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface)]">
                  <span className="flex items-center text-[var(--color-textSecondary)]">
                    <Paperclip size={14} className="mr-1" />
                    Attachments:
                  </span>
                  {task.attachments && task.attachments.length > 0 ? (
                    <button
                      onClick={() => setShowAttachmentsModal(task.attachments)}
                      className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 flex items-center gap-1"
                    >
                      <Paperclip size={12} />
                      View ({task.attachments.length})
                    </button>
                  ) : (
                    <span className="text-[var(--color-textSecondary)]">No Attachments</span>
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
    <div className="bg-[var(--color-background)] rounded-xl shadow-sm border border-[var(--color-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--color-border)]">
          <thead className="bg-[var(--color-surface)]">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--color-textSecondary)] uppercase tracking-wider">Task</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--color-textSecondary)] uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--color-textSecondary)] uppercase tracking-wider">Priority</th>
              {isAdmin && <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--color-textSecondary)] uppercase tracking-wider">Assigned To</th>}
              {/* Attachments Header */}
              <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--color-textSecondary)] uppercase tracking-wider">Attachments</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--color-textSecondary)] uppercase tracking-wider">Due Date</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[var(--color-textSecondary)] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-[var(--color-background)] divide-y divide-[var(--color-border)]">
            {currentTasks.map((task) => {
              const overdue = isOverdue(task.dueDate);
              const daysUntilDue = getDaysUntilDue(task.dueDate);
              const descriptionIsLong = task.description.length > 150; // Define a threshold for "long" description
              const displayDescription = showFullDescription[task._id] || !descriptionIsLong
                ? task.description
                : `${task.description.substring(0, 150)}...`;

              return (
                <tr
                  key={task._id}
                  className={`hover:bg-[var(--color-surface)] transition-colors ${overdue ? 'bg-[var(--color-error)]/10 hover:bg-[var(--color-error)]/20'
                    : daysUntilDue <= 0 ? 'bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/20' // Due today
                      : ''
                    }`}
                >
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-[var(--color-text)] mb-1">
                        {showFullTitle[task._id] ? task.title : task.title.length > 150 ? `${task.title.substring(0, 150)}...` : task.title}
                        {task.title.length > 150 && (
                          <button
                            onClick={() => toggleTitleVisibility(task._id)}
                            className="ml-1 text-xs text-[var(--color-primary)] hover:underline font-medium"
                          >
                            {showFullTitle[task._id] ? 'Show Less' : 'Show More'}
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-[var(--color-textSecondary)]">
                        {displayDescription}
                        {descriptionIsLong && (
                          <button
                            onClick={() => toggleDescription(task._id)}
                            className="ml-1 text-[var(--color-primary)] hover:underline text-xs font-medium"
                          >
                            {showFullDescription[task._id] ? 'See Less' : 'See More'}
                          </button>
                        )}
                      </div>
                      {overdue && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--color-error)]/20 text-[var(--color-error)] mt-1">
                          <AlertCircle size={12} className="mr-1" />
                          {getDaysOverdue(task.dueDate)} days overdue
                        </span>
                      )}
                      {!overdue && daysUntilDue <= 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--color-warning)]/20 text-[var(--color-warning)] mt-1">
                          <Clock size={12} className="mr-1" />
                          Due today
                        </span>
                      )}
                      {!overdue && daysUntilDue === 1 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--color-warning)]/20 text-[var(--color-warning)] mt-1">
                          <Clock size={12} className="mr-1" />
                          Due tomorrow
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap"><TaskTypeBadge taskType={task.taskType} /></td>
                  <td className="px-6 py-4 whitespace-nowrap"><PriorityBadge priority={task.priority} /></td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[var(--color-text)]">{task.assignedTo.username}</div>
                      <div className="text-sm text-[var(--color-textSecondary)]">{task.assignedTo.email}</div>
                    </td>
                  )}
                  {/* Attachments in Table View */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {task.attachments && task.attachments.length > 0 ? (
                      <button
                        onClick={() => setShowAttachmentsModal(task.attachments)}
                        className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 flex items-center gap-1"
                      >
                        <Paperclip size={12} />
                        View ({task.attachments.length})
                      </button>
                    ) : (
                      <span className="text-[var(--color-textSecondary)]">No Attachments</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-[var(--color-text)]">{new Date(task.dueDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'numeric',
                      year: 'numeric',
                    })}</div>
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
                      className="text-[var(--color-success)] hover:opacity-80 transition-all hover:scale-110"
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
  );

  if (loading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
      </div>
    );
  }

  const dailyTasksCount = getDailyTasks().length;
  const cyclicTasksCount = getCyclicTasks().length;
  const completingTask = getTaskToComplete();

  return (
    <div className="min-h-full bg-[var(--color-background)] p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-[--color-text]">
            {isAdmin ? 'Team Pending Tasks' : 'My Pending Tasks'}
          </h1>
          <p className="mt-0 text-xs text-[var(--color-textSecondary)]">
            {getCurrentTasks().length} of {filteredTasks.length} task(s) found
            {isAdmin ? ' (All team members)' : ' (Your tasks)'}
          </p>
        </div>
        <div className="hidden sm:block">
          <ViewToggle view={view} onViewChange={setView} />
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl shadow-sm border border-[var(--color-border)] p-2 mt-2 mb-2">
        <div className="flex flex-wrap gap-2 mb-1 items-center">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveSection('daily')}
              className={`px-4 py-1 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 text-xs ${activeSection === 'daily'
                ? 'bg-[var(--color-primary)] text-white shadow-md'
                : 'bg-[var(--color-background)] text-[var(--color-textSecondary)] hover:bg-[var(--color-border)]'
                }`}
            >
              <CalendarDays size={10} />
              Daily Tasks
              {dailyTasksCount > 0 && (
                <span className={`px-1 py-1 rounded-full text-xs font-bold ${activeSection === 'daily' ? 'bg-[var(--color-background)] text-[var(--color-primary)]' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  }`}>
                  {dailyTasksCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSection('cyclic')}
              className={`px-4 py-1 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 text-xs ${activeSection === 'cyclic'
                ? 'bg-[var(--color-accent)] text-white shadow-md'
                : 'bg-[var(--color-background)] text-[var(--color-textSecondary)] hover:bg-[var(--color-border)]'
                }`}
            >
              <RefreshCw size={10} />
              Cyclic Tasks
              {cyclicTasksCount > 0 && (
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${activeSection === 'cyclic' ? 'bg-white text-[var(--color-accent)]' : 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  }`}>
                  {cyclicTasksCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="ml-auto px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-border)] rounded-lg transition-colors text-sm font-medium text-[var(--color-text)] flex items-center gap-2"
          >
            <Filter size={12} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {showFilters ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)]">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Task Type</label>
              <select
                value={filter.taskType}
                onChange={(e) => setFilter({ ...filter, taskType: e.target.value })}
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
                onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                className="w-full text-sm px-1 py-1 border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-colors"
              >
                <option value="">All Priorities</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Team Member</label>
                <select
                  value={filter.assignedTo}
                  onChange={(e) => setFilter({ ...filter, assignedTo: e.target.value })}
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
                  placeholder="Search tasks..."
                  value={filter.search}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  className="w-full pl-10 text-sm pr-1 py-1 border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-colors"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters} className="px-2 py-2 text-sm font-medium text-[var(--color-text)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] rounded-lg transition-colors">
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {getCurrentTasks().length === 0 ? (
        <div className="text-center py-16 bg-[var(--color-background)] rounded-xl shadow-sm border border-[var(--color-border)]">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-[var(--color-primary)]/20 to-[var(--color-accent)]/20 rounded-full flex items-center justify-center">
            {activeSection === 'daily' ? (
              <CalendarDays size={32} className="text-[var(--color-primary)]" />
            ) : (
              <RefreshCw size={32} className="text-[var(--color-accent)]" />
            )}
          </div>
          <h3 className="text-xl font-semibold text-[var(--color-text)] mb-2">
            No {activeSection === 'daily' ? 'daily tasks for today' : 'pending cyclic tasks'}
          </h3>
          <p className="text-[var(--color-textSecondary)] mb-4">
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
                    <span className="font-medium">{Math.min(endIndex, getCurrentTasks().length)}</span> of{' '}
                    <span className="font-medium">{getCurrentTasks().length}</span> results
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

      {/* Task Completion Modal */}
      {showCompleteModal && completingTask && (
        <TaskCompletionModal
          taskId={showCompleteModal}
          taskTitle={completingTask.title}
          isRecurring={true}
          allowAttachments={taskSettings.pendingRecurringTasks.allowAttachments}
          mandatoryAttachments={taskSettings.pendingRecurringTasks.mandatoryAttachments}
          mandatoryRemarks={taskSettings.pendingRecurringTasks.mandatoryRemarks}
          onClose={() => setShowCompleteModal(null)}
          onComplete={handleTaskCompletion}
        />
      )}

      {/* Attachments Modal */}
      {showAttachmentsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="rounded-xl max-w-2xl w-full shadow-2xl transform transition-all bg-[var(--color-surface)] max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center text-[var(--color-text)]">
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
                          {isImage(attachment.filename) ? (
                            <>
                              {/* Small preview image in the list */}
                              <img
                                src={`${address}/uploads/${attachment.filename}`}
                                alt={attachment.originalName}
                                className="w-16 h-16 object-cover rounded-md mr-3 border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors shadow-sm"
                                onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)} // Set for full screen
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
                          {isImage(attachment.filename) && (
                            <button
                              onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)}
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
                  className="py-2 px-6 rounded-lg font-medium transition-colors hover:bg-[var(--color-background)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]/50"
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
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImagePreview(null)} // Close on click outside
        >
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()} // Prevent modal from closing when clicking on the image
          >
            <img
              src={selectedImagePreview}
              alt="Full Screen Preview"
              className="max-w-full max-h-[90vh] object-contain cursor-pointer rounded-lg shadow-2xl" // Adjusted styling for full screen
              onClick={() => setSelectedImagePreview(null)} // Close on image click
            />
            <button
              onClick={() => setSelectedImagePreview(null)}
              className="absolute -top-2 -right-2 text-white text-2xl bg-red-500 hover:bg-red-600 rounded-full w-8 h-8 flex items-center justify-center transition-colors shadow-lg"
              title="Close"
            >
              &times;
            </button>
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg text-sm">
              Click anywhere to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingRecurringTasks;