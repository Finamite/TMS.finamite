import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Calendar, Paperclip, X, Users, Clock, ChevronDown, Search, Volume2, Plus, Copy, Trash2, Zap } from 'lucide-react';
import axios from 'axios';
import { useTheme } from '../contexts/ThemeContext';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import VoiceRecorder from '../components/VoiceRecorder';
import { address } from '../../utils/ipAddress';

// Add ref type for VoiceRecorder
interface VoiceRecorderRef {
  resetFromParent: () => void;
}

interface User {
  _id: string;
  username: string;
  email: string;
  companyId: string;
}

interface TaskForm {
  id: string;
  title: string;
  description: string;
  taskType: string;
  assignedTo: string[];
  priority: string;
  dueDate: string;
  startDate: string;
  endDate: string;
  isForever: boolean;
  includeSunday: boolean;
  weekOffDays: number[];
  weeklyDays: number[];
  monthlyDay: number;
  yearlyDuration: number;
  attachments: File[]; // Individual attachments per task
}

const AssignTask: React.FC = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [users, setUsers] = useState<User[]>([]);

  // Multi-task state - array of task forms
  const [taskForms, setTaskForms] = useState<TaskForm[]>([
    {
      id: '1',
      title: '',
      description: '',
      taskType: 'one-time',
      assignedTo: [],
      priority: 'normal',
      dueDate: '',
      startDate: '',
      endDate: '',
      isForever: false,
      includeSunday: false,
      weekOffDays: [],
      weeklyDays: [],
      monthlyDay: 1,
      yearlyDuration: 3,
      attachments: [] // Individual attachments
    }
  ]);

  const [showWeekOff, setShowWeekOff] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState<{ [key: string]: boolean }>({});
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Store refs for each task's voice recorder
  const voiceRecorderRefs = useRef<{ [key: string]: VoiceRecorderRef | null }>({});

  const weekDays = [
    { value: 1, label: 'Monday', short: 'Mon' },
    { value: 2, label: 'Tuesday', short: 'Tue' },
    { value: 3, label: 'Wednesday', short: 'Wed' },
    { value: 4, label: 'Thursday', short: 'Thu' },
    { value: 5, label: 'Friday', short: 'Fri' },
    { value: 6, label: 'Saturday', short: 'Sat' },
    { value: 0, label: 'Sunday', short: 'Sun' }
  ];

  const monthlyDayOptions = Array.from({ length: 31 }, (_, i) => i + 1);

  useEffect(() => {
    if (user) {
      fetchUsers();
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown({});
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();
      if (user?.companyId) {
        params.append('companyId', user.companyId);
      }
      if (user?.role) {
        params.append('role', user.role);
      }

      const response = await axios.get(`${address}/api/users?${params.toString()}`);
      setUsers(response.data.filter((u: User) => u._id !== user?.id));
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users.', { theme: isDark ? 'dark' : 'light' });
    }
  };

  // Add new task form
  const addNewTaskForm = () => {
    const newTask: TaskForm = {
      id: Date.now().toString(),
      title: '',
      description: '',
      taskType: 'one-time',
      assignedTo: [],
      priority: 'normal',
      dueDate: '',
      startDate: '',
      endDate: '',
      isForever: false,
      includeSunday: false,
      weekOffDays: [],
      weeklyDays: [],
      monthlyDay: 1,
      yearlyDuration: 3,
      attachments: [] // New task starts with empty attachments
    };
    setTaskForms([...taskForms, newTask]);
    toast.success('New task added!', { theme: isDark ? 'dark' : 'light' });
  };

  // Remove task form
  const removeTaskForm = (taskId: string) => {
    if (taskForms.length === 1) {
      toast.warning('At least one task is required!', { theme: isDark ? 'dark' : 'light' });
      return;
    }
    setTaskForms(taskForms.filter(task => task.id !== taskId));
    // Clean up voice recorder ref
    delete voiceRecorderRefs.current[taskId];
    toast.info('Task removed!', { theme: isDark ? 'dark' : 'light' });
  };

  // Duplicate task form
  const duplicateTaskForm = (taskId: string) => {
    const taskToDuplicate = taskForms.find(task => task.id === taskId);
    if (taskToDuplicate) {
      const duplicatedTask: TaskForm = {
        ...taskToDuplicate,
        id: Date.now().toString(),
        title: `${taskToDuplicate.title} (Copy)`,
        attachments: [] // Start with empty attachments for duplicated task
      };
      const taskIndex = taskForms.findIndex(task => task.id === taskId);
      const newTasks = [...taskForms];
      newTasks.splice(taskIndex + 1, 0, duplicatedTask);
      setTaskForms(newTasks);
      toast.success('Task duplicated!', { theme: isDark ? 'dark' : 'light' });
    }
  };

  // Update specific task form
  const updateTaskForm = (taskId: string, field: string, value: any) => {
    setTaskForms(taskForms.map(task =>
      task.id === taskId ? { ...task, [field]: value } : task
    ));
  };

  const handleUserSelection = (taskId: string, userId: string) => {
    const task = taskForms.find(t => t.id === taskId);
    if (task) {
      const newAssignedTo = task.assignedTo.includes(userId)
        ? task.assignedTo.filter(id => id !== userId)
        : [...task.assignedTo, userId];
      updateTaskForm(taskId, 'assignedTo', newAssignedTo);
    }
  };

  const handleWeekDaySelection = (taskId: string, dayValue: number) => {
    const task = taskForms.find(t => t.id === taskId);
    if (task) {
      const newWeeklyDays = task.weeklyDays.includes(dayValue)
        ? task.weeklyDays.filter(day => day !== dayValue)
        : [...task.weeklyDays, dayValue];
      updateTaskForm(taskId, 'weeklyDays', newWeeklyDays);
    }
  };

  // Handle file changes for specific task
  const handleFileChange = (taskId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => file.size <= 10 * 1024 * 1024);

    if (validFiles.length !== files.length) {
      toast.error('Some files were too large (max 10MB per file).', { theme: isDark ? 'dark' : 'light' });
    }

    const task = taskForms.find(t => t.id === taskId);
    if (task) {
      const newAttachments = [...task.attachments, ...validFiles];
      updateTaskForm(taskId, 'attachments', newAttachments);
    }
  };

  // Handle voice recording complete for specific task
  const handleVoiceRecordingComplete = (taskId: string, audioFile: File) => {
    const task = taskForms.find(t => t.id === taskId);
    if (task) {
      const newAttachments = [...task.attachments, audioFile];
      updateTaskForm(taskId, 'attachments', newAttachments);
      toast.success('Voice recording added to task attachments!', { theme: isDark ? 'dark' : 'light' });
    }
  };

  // Handle voice recording deleted for specific task
  const handleVoiceRecordingDeleted = (taskId: string, fileName: string) => {
    const task = taskForms.find(t => t.id === taskId);
    if (task) {
      const newAttachments = task.attachments.filter(file => file.name !== fileName);
      updateTaskForm(taskId, 'attachments', newAttachments);
    }
  };

  // Remove attachment for specific task
  const removeAttachment = (taskId: string, index: number) => {
    const task = taskForms.find(t => t.id === taskId);
    if (task) {
      const newAttachments = task.attachments.filter((_, i) => i !== index);
      updateTaskForm(taskId, 'attachments', newAttachments);
    }
  };

  const isAudioFile = (file: File) => {
    return file.type.startsWith('audio/') || file.name.includes('voice-recording');
  };

  const getSelectedUsers = (taskId: string) => {
    const task = taskForms.find(t => t.id === taskId);
    return task ? users.filter(u => task.assignedTo.includes(u._id)) : [];
  };

  const filteredUsers = users.filter(userItem =>
    userItem.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    userItem.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  // Optimized batch task creation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate all tasks at once
      for (const task of taskForms) {
        if (task.assignedTo.length === 0) {
          toast.error(`Please select users for task: "${task.title || 'Untitled'}"`, { theme: isDark ? 'dark' : 'light' });
          setLoading(false);
          return;
        }

        if (task.taskType === 'weekly' && task.weeklyDays.length === 0) {
          toast.error(`Please select days for weekly task: "${task.title || 'Untitled'}"`, { theme: isDark ? 'dark' : 'light' });
          setLoading(false);
          return;
        }

        // Date validations...
        if (task.taskType !== 'one-time') {
          if (task.taskType === 'yearly' || task.taskType === 'quarterly') {
            if (!task.startDate) {
              toast.error(`Please select start date for ${task.taskType} task: "${task.title || 'Untitled'}"`, { theme: isDark ? 'dark' : 'light' });
              setLoading(false);
              return;
            }
          } else if (!task.isForever) {
            if (!task.startDate || !task.endDate) {
              toast.error(`Please select both start and end dates for task: "${task.title || 'Untitled'}"`, { theme: isDark ? 'dark' : 'light' });
              setLoading(false);
              return;
            }

            if (new Date(task.startDate) >= new Date(task.endDate)) {
              toast.error(`End date must be after start date for task: "${task.title || 'Untitled'}"`, { theme: isDark ? 'dark' : 'light' });
              setLoading(false);
              return;
            }
          }
        }
      }

      // Process each task with its own attachments
      const allTaskPromises = taskForms.flatMap(async (task) => {
        // Upload attachments for this specific task
        let uploadedAttachments: any[] = [];
        if (task.attachments.length > 0) {
          const formDataFiles = new FormData();
          task.attachments.forEach(file => {
            formDataFiles.append('files', file);
          });
          const uploadResponse = await axios.post(`${address}/api/upload`, formDataFiles, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          uploadedAttachments = uploadResponse.data.files || [];
        }

        // Create tasks for all assigned users for this specific task
        return Promise.all(task.assignedTo.map(async (assignedUserId) => {
          const taskData = {
            ...task,
            assignedTo: assignedUserId,
            assignedBy: user?.id,
            companyId: user?.companyId,
            attachments: uploadedAttachments, // Use this task's specific attachments
            ...((task.taskType === 'yearly' || task.taskType === 'quarterly') && !task.isForever && {
              endDate: task.startDate
            })
          };
          return axios.post(`${address}/api/tasks/create-scheduled`, taskData);
        }));
      });

      // Execute all task creation in parallel for maximum speed
      const results = await Promise.all(allTaskPromises);
      const flatResults = results.flat();

      // Calculate totals
      const totalTasksCreated = flatResults.reduce((sum, result) => sum + result.data.tasksCreated, 0);
      const totalUsers = taskForms.reduce((sum, task) => sum + task.assignedTo.length, 0);
      const totalAttachments = taskForms.reduce((sum, task) => sum + task.attachments.length, 0);
      const totalVoiceRecordings = taskForms.reduce((sum, task) =>
        sum + task.attachments.filter(isAudioFile).length, 0);

      let successMessage = `🚀 Successfully created ${totalTasksCreated} task${totalTasksCreated > 1 ? 's' : ''} across ${taskForms.length} task type${taskForms.length > 1 ? 's' : ''} for ${totalUsers} user${totalUsers > 1 ? 's' : ''}.`;
      if (totalAttachments > 0) {
        successMessage += ` (${totalAttachments} attachment${totalAttachments > 1 ? 's' : ''} uploaded`;
        if (totalVoiceRecordings > 0) {
          successMessage += `, including ${totalVoiceRecordings} voice recording${totalVoiceRecordings > 1 ? 's' : ''}`;
        }
        successMessage += ')';
      }
      toast.success(successMessage, { theme: isDark ? 'dark' : 'light', autoClose: 3000 });

      // Reset forms
      setTaskForms([{
        id: '1',
        title: '',
        description: '',
        taskType: 'one-time',
        assignedTo: [],
        priority: 'normal',
        dueDate: '',
        startDate: '',
        endDate: '',
        isForever: false,
        includeSunday: false,
        weekOffDays: [],
        weeklyDays: [],
        monthlyDay: 1,
        yearlyDuration: 3,
        attachments: []
      }]);
      setUserSearchTerm('');
      setShowUserDropdown({});
      setShowWeekOff({});

      // Reset all voice recorders
      Object.values(voiceRecorderRefs.current).forEach(ref => {
        if (ref) {
          ref.resetFromParent();
        }
      });

    } catch (error) {
      console.error('Error creating tasks:', error);
      toast.error('Failed to assign tasks. Please try again.', { theme: isDark ? 'dark' : 'light' });
    } finally {
      setLoading(false);
    }
  };

  const resetAllForms = () => {
    setTaskForms([{
      id: '1',
      title: '',
      description: '',
      taskType: 'one-time',
      assignedTo: [],
      priority: 'normal',
      dueDate: '',
      startDate: '',
      endDate: '',
      isForever: false,
      includeSunday: false,
      weekOffDays: [],
      weeklyDays: [],
      monthlyDay: 1,
      yearlyDuration: 3,
      attachments: []
    }]);
    setUserSearchTerm('');
    setShowUserDropdown({});
    setShowWeekOff({});

    // Reset all voice recorders
    Object.values(voiceRecorderRefs.current).forEach(ref => {
      if (ref) {
        ref.resetFromParent();
      }
    });
    voiceRecorderRefs.current = {};

    toast.info('All forms reset!', { theme: isDark ? 'dark' : 'light' });
  };

  return (
    <div className={`min-h-screen transition-all duration-300 ${isDark ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
      <div className="max-w-7xl mx-auto p-6 space-y-8">

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Task Forms */}
          <div className="grid gap-8">
            {taskForms.map((task, index) => (
              <div key={task.id}
                className="relative rounded-2xl shadow-xl border transition-all duration-300 hover:shadow-2xl overflow-hidden"
                style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>

                {/* Task Header */}
                <div className="relative p-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5"></div>
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-lg"
                        style={{ backgroundColor: 'var(--color-primary)' }}>
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
                          {task.title || `Task ${index + 1}`}
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--color-textSecondary)' }}>
                          {task.taskType.charAt(0).toUpperCase() + task.taskType.slice(1)} Task
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => duplicateTaskForm(task.id)}
                        className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
                        style={{ backgroundColor: 'var(--color-info)', color: 'white' }}
                        title="Duplicate Task"
                      >
                        <Copy size={16} />
                      </button>
                      {taskForms.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTaskForm(task.id)}
                          className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
                          style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
                          title="Remove Task"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Task Content */}
                <div className="p-6 space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        Task Title *
                      </label>
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => updateTaskForm(task.id, 'title', e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200"
                        style={{
                          borderColor: 'var(--color-border)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text)'
                        }}
                        placeholder="Enter task title"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        Task Type *
                      </label>
                      <select
                        value={task.taskType}
                        onChange={(e) => updateTaskForm(task.id, 'taskType', e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200"
                        style={{
                          borderColor: 'var(--color-border)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text)'
                        }}
                      >
                        <option value="one-time">One Time</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>

                    <div className="lg:col-span-2 space-y-2">
                      <label className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        Description
                      </label>
                      <textarea
                        value={task.description}
                        onChange={(e) => updateTaskForm(task.id, 'description', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200 resize-none"
                        style={{
                          borderColor: 'var(--color-border)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text)'
                        }}
                        placeholder="Enter task description"
                      />
                    </div>
                  </div>

                  {/* User Assignment & Priority */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* User Assignment */}
                    <div className="space-y-3">
                      <label className="text-sm font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
                        <Users className="mr-2" size={16} />
                        Assign To Users *
                      </label>
                      <div className="relative" ref={dropdownRef}>
                        <button
                          type="button"
                          className="w-full flex justify-between items-center px-3 py-2 rounded-xl border-2 text-left transition-all duration-200"
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: 'var(--color-surface)',
                            color: 'var(--color-text)'
                          }}
                          onClick={() => setShowUserDropdown(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                        >
                          {task.assignedTo.length > 0 ? (
                            <span className="text-md">
                              {getSelectedUsers(task.id).map(u => u.username).join(', ')}
                            </span>
                          ) : (
                            <span className="text-md" style={{ color: 'var(--color-textSecondary)' }}>Select users...</span>
                          )}
                          <ChevronDown size={18} className={`transition-transform duration-200 ${showUserDropdown[task.id] ? 'rotate-180' : ''}`} />
                        </button>

                        {showUserDropdown[task.id] && (
                          <div className="absolute z-10 w-full mt-2 rounded-xl shadow-2xl border-2 max-h-64 overflow-hidden"
                            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                            <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-textSecondary)' }} size={16} />
                                <input
                                  type="text"
                                  placeholder="Search users..."
                                  className="w-full pl-10 pr-3 py-2 rounded-lg border transition-all duration-200"
                                  style={{
                                    borderColor: 'var(--color-border)',
                                    backgroundColor: 'var(--color-surface)',
                                    color: 'var(--color-text)'
                                  }}
                                  value={userSearchTerm}
                                  onChange={(e) => setUserSearchTerm(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredUsers.length === 0 && (
                                <p className="p-4 text-sm text-center" style={{ color: 'var(--color-textSecondary)' }}>No users found.</p>
                              )}
                              {filteredUsers.map(userItem => (
                                <label
                                  key={userItem._id}
                                  className="flex items-center p-3 cursor-pointer transition-all duration-200 hover:bg-opacity-80"
                                  style={{
                                    backgroundColor: task.assignedTo.includes(userItem._id) ? 'var(--color-primary)' : '',
                                    color: task.assignedTo.includes(userItem._id) ? 'white' : 'var(--color-text)'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={task.assignedTo.includes(userItem._id)}
                                    onChange={() => handleUserSelection(task.id, userItem._id)}
                                    className="mr-3 w-4 h-4 rounded"
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{userItem.username}</span>
                                    <span className="text-xs opacity-75">{userItem.email}</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {task.assignedTo.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {getSelectedUsers(task.id).map(selectedUser => (
                            <span
                              key={selectedUser._id}
                              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105"
                              style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
                            >
                              {selectedUser.username}
                              <button
                                type="button"
                                onClick={() => handleUserSelection(task.id, selectedUser._id)}
                                className="ml-2 hover:bg-white hover:bg-opacity-20 rounded-full p-1"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Priority */}
                    <div className="space-y-3">
                      <label className="text-sm font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
                        <Clock className="mr-2" size={16} />
                        Priority
                      </label>
                      <select
                        value={task.priority}
                        onChange={(e) => updateTaskForm(task.id, 'priority', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200 "
                        style={{
                          borderColor: 'var(--color-border)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text)'
                        }}
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  {/* Date Configuration */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
                      <Calendar className="mr-2" size={18} />
                      Date Configuration
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {task.taskType === 'one-time' ? (
                        <div className="space-y-2">
                          <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Due Date *</label>
                          <input
                            type="date"
                            value={task.dueDate}
                            onChange={(e) => updateTaskForm(task.id, 'dueDate', e.target.value)}
                            required
                            className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200 "
                            style={{
                              borderColor: 'var(--color-border)',
                              backgroundColor: 'var(--color-surface)',
                              color: 'var(--color-text)'
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                              {task.taskType === 'yearly' || task.taskType === 'quarterly' ? 'Task Date *' : 'Start Date *'}
                            </label>
                            <input
                              type="date"
                              value={task.startDate}
                              onChange={(e) => updateTaskForm(task.id, 'startDate', e.target.value)}
                              required
                              className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200 "
                              style={{
                                borderColor: 'var(--color-border)',
                                backgroundColor: 'var(--color-surface)',
                                color: 'var(--color-text)'
                              }}
                            />
                          </div>

                          {task.taskType !== 'yearly' && task.taskType !== 'quarterly' && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                                End Date {!task.isForever && '*'}
                              </label>
                              <input
                                type="date"
                                value={task.endDate}
                                onChange={(e) => updateTaskForm(task.id, 'endDate', e.target.value)}
                                required={!task.isForever}
                                disabled={task.isForever}
                                className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200 disabled:opacity-50"
                                style={{
                                  borderColor: 'var(--color-border)',
                                  backgroundColor: task.isForever ? 'var(--color-border)' : 'var(--color-surface)',
                                  color: 'var(--color-text)'
                                }}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Recurring Options */}
                    {task.taskType !== 'one-time' && (
                      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface)' }}>
                        {task.taskType !== 'yearly' && task.taskType !== 'quarterly' && (
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.isForever}
                              onChange={(e) => updateTaskForm(task.id, 'isForever', e.target.checked)}
                              className="mr-2 w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                              Forever (1 year)
                            </span>
                          </label>
                        )}

                        {task.taskType === 'yearly' && (
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.isForever}
                              onChange={(e) => updateTaskForm(task.id, 'isForever', e.target.checked)}
                              className="mr-2 w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                              Create for multiple years
                            </span>
                          </label>
                        )}

                        {(task.taskType === 'daily' || task.taskType === 'monthly' || task.taskType === 'quarterly' || task.taskType === 'yearly') && (
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.includeSunday}
                              onChange={(e) => updateTaskForm(task.id, 'includeSunday', e.target.checked)}
                              className="mr-2 w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Include Sunday</span>
                          </label>
                        )}

                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showWeekOff[task.id] || false}
                            onChange={(e) => setShowWeekOff(prev => ({ ...prev, [task.id]: e.target.checked }))}
                            className="mr-2 w-4 h-4 rounded"
                          />
                          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Week Off</span>
                        </label>
                      </div>
                    )}

                    {/* Week Off Days */}
                    {showWeekOff[task.id] && (
                      <div className="p-4 rounded-xl border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                        <h5 className="font-medium text-sm mb-3" style={{ color: 'var(--color-text)' }}>Select Week Off Days</h5>
                        <div className="grid grid-cols-7 gap-2">
                          {weekDays.map(day => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => {
                                const currentWeekOff = task.weekOffDays;
                                const newWeekOff = currentWeekOff.includes(day.value)
                                  ? currentWeekOff.filter(d => d !== day.value)
                                  : [...currentWeekOff, day.value];
                                updateTaskForm(task.id, 'weekOffDays', newWeekOff);
                              }}
                              className={`p-2 rounded-lg border text-center transition-all duration-200 hover:scale-105 ${task.weekOffDays.includes(day.value)
                                  ? 'bg-red-500 border-red-500 text-white'
                                  : 'border-gray-300'
                                }`}
                              style={{
                                backgroundColor: task.weekOffDays.includes(day.value) ? 'var(--color-error)' : 'var(--color-surface)',
                                borderColor: task.weekOffDays.includes(day.value) ? 'var(--color-error)' : 'var(--color-border)',
                                color: task.weekOffDays.includes(day.value) ? 'white' : 'var(--color-text)'
                              }}
                            >
                              <div className="text-xs font-semibold">{day.short}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Weekly Days Selection */}
                    {task.taskType === 'weekly' && (
                      <div className="space-y-3">
                        <h5 className="font-semibold" style={{ color: 'var(--color-text)' }}>Select Weekly Days *</h5>
                        <div className="grid grid-cols-7 gap-2">
                          {weekDays.map(day => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => handleWeekDaySelection(task.id, day.value)}
                              className={`p-3 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${task.weeklyDays.includes(day.value)
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-300'
                                }`}
                              style={{
                                borderColor: task.weeklyDays.includes(day.value) ? 'var(--color-primary)' : 'var(--color-border)',
                                backgroundColor: task.weeklyDays.includes(day.value) ? 'var(--color-primary)' : 'var(--color-surface)',
                                color: task.weeklyDays.includes(day.value) ? 'white' : 'var(--color-text)'
                              }}
                            >
                              <div className="text-sm font-bold">{day.short}</div>
                              <div className="text-xs">{day.label}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Monthly Day Selection */}
                    {task.taskType === 'monthly' && (
                      <div className="space-y-3">
                        <h5 className="font-semibold" style={{ color: 'var(--color-text)' }}>Day of Month *</h5>
                        <select
                          value={task.monthlyDay}
                          onChange={(e) => updateTaskForm(task.id, 'monthlyDay', parseInt(e.target.value))}
                          required
                          className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200 "
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: 'var(--color-surface)',
                            color: 'var(--color-text)'
                          }}
                        >
                          {monthlyDayOptions.map(day => (
                            <option key={day} value={day}>
                              {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of each month
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Yearly Duration */}
                    {task.taskType === 'yearly' && task.isForever && (
                      <div className="space-y-3">
                        <h5 className="font-semibold" style={{ color: 'var(--color-text)' }}>Number of Years</h5>
                        <select
                          value={task.yearlyDuration}
                          onChange={(e) => updateTaskForm(task.id, 'yearlyDuration', parseInt(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border-2 transition-all duration-200"
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: 'var(--color-surface)',
                            color: 'var(--color-text)'
                          }}
                        >
                          <option value={3}>3 years</option>
                          <option value={5}>5 years</option>
                          <option value={10}>10 years</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Voice Recording and Attachments for Each Task */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Voice Recording */}
                    <VoiceRecorder
                      ref={(ref) => {
                        if (ref) {
                          voiceRecorderRefs.current[task.id] = ref;
                        }
                      }}
                      onRecordingComplete={(audioFile) => handleVoiceRecordingComplete(task.id, audioFile)}
                      onRecordingDeleted={(fileName) => handleVoiceRecordingDeleted(task.id, fileName)}
                      isDark={isDark}
                    />

                    {/* File Attachments */}
                    <div className="rounded-2xl shadow-xl border p-6 transition-all duration-300 hover:shadow-2xl"
                      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                      <h3 className="text-lg font-semibold mb-4 flex items-center" style={{ color: 'var(--color-text)' }}>
                        <Paperclip className="mr-2" size={18} />
                        Task Attachments (Max 10MB per file)
                      </h3>

                      <input
                        type="file"
                        multiple
                        onChange={(e) => handleFileChange(task.id, e)}
                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all duration-200"
                      />

                      <div className="mt-4 space-y-2">
                        {task.attachments.map((file, fileIndex) => (
                          <div
                            key={fileIndex}
                            className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 ${isAudioFile(file)
                                ? 'bg-blue-50 border border-blue-200'
                                : 'bg-gray-50'
                              }`}
                            style={{
                              backgroundColor: isAudioFile(file)
                                ? (isDark ? 'var(--color-info)' : '#EBF8FF')
                                : 'var(--color-surface)',
                              borderColor: isAudioFile(file) ? 'var(--color-info)' : 'var(--color-border)'
                            }}
                          >
                            <span className="text-sm flex items-center" style={{ color: 'var(--color-text)' }}>
                              {isAudioFile(file) && (
                                <Volume2 size={16} className="mr-2 text-blue-500" />
                              )}
                              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(task.id, fileIndex)}
                              className="p-1 rounded-full transition-all duration-200 hover:scale-110"
                              style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {task.attachments.length === 0 && (
                          <p className="text-sm text-center py-4" style={{ color: 'var(--color-textSecondary)' }}>
                            No attachments for this task
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div
            className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pt-2 border-t"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {/* Reset Button (full width on mobile) */}
            <button
              type="button"
              onClick={resetAllForms}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 border-2"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
                backgroundColor: 'var(--color-surface)'
              }}
            >
              Reset All
            </button>

            {/* Right side buttons (Add Task + Create Tasks) */}
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto sm:items-center">

              {/* Add Task Button (moved near Create All Tasks) */}
              <button
                type="button"
                onClick={addNewTaskForm}
                className="w-full sm:w-auto flex items-center justify-center px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl"
                style={{ backgroundColor: 'var(--color-success)', color: 'white' }}
              >
                <Plus size={20} className="mr-2" />
                Add Task
              </button>

              {/* Create All Tasks */}
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white shadow-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Creating Tasks...</span>
                  </>
                ) : (
                  <>
                    <Zap size={20} />
                    <span>Create All Tasks</span>
                    <div className="px-2 py-1 rounded-full text-xs font-bold bg-white bg-opacity-20">
                      {taskForms.reduce((total, task) => total + task.assignedTo.length, 0)}
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

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
    </div>
  );
};

export default AssignTask;