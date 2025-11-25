import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Calendar, Paperclip, X, Users, CheckSquare, Clock, Hash, ChevronDown, Search, Volume2 } from 'lucide-react';
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

const AssignTask: React.FC = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    taskType: 'one-time',
    assignedTo: [] as string[],
    priority: 'normal',
    dueDate: '',
    startDate: '',
    endDate: '',
    isForever: false,
    includeSunday: false,
    weekOffDays: [] as number[],
    weeklyDays: [] as number[],
    monthlyDay: 1,
    yearlyDuration: 3
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showWeekOff, setShowWeekOff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // New states for dropdown
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ref for date inputs to programmatically open calendar
  const dueDateInputRef = useRef<HTMLInputElement>(null);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const voiceRecorderRef = useRef<VoiceRecorderRef>(null);

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

  // Effect to close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);

  const fetchUsers = async () => {
    try {
      // Filter users by company ID if user is not superadmin
      const params = new URLSearchParams();
      if (user?.companyId) {
        params.append('companyId', user.companyId);
      }
      if (user?.role) {
        params.append('role', user.role);
      }

      const response = await axios.get(`${address}/api/users?${params.toString()}`);
      // Filter out the current user from the list
      setUsers(response.data.filter((u: User) => u._id !== user?.id));
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users.', { theme: isDark ? 'dark' : 'light' });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
              name === 'monthlyDay' ? parseInt(value) : 
              name === 'yearlyDuration' ? parseInt(value) : value
    }));
  };

  const handleUserSelection = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      assignedTo: prev.assignedTo.includes(userId)
        ? prev.assignedTo.filter(id => id !== userId)
        : [...prev.assignedTo, userId]
    }));
  };

  const handleWeekDaySelection = (dayValue: number) => {
    setFormData(prev => ({
      ...prev,
      weeklyDays: prev.weeklyDays.includes(dayValue)
        ? prev.weeklyDays.filter(day => day !== dayValue)
        : [...prev.weeklyDays, dayValue]
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => file.size <= 10 * 1024 * 1024); // 10MB limit

    if (validFiles.length !== files.length) {
      toast.error('Some files were too large (max 10MB per file).', { theme: isDark ? 'dark' : 'light' });
    }

    setAttachments(prev => [...prev, ...validFiles]);
  };

  const handleVoiceRecordingComplete = (audioFile: File) => {
    setAttachments(prev => [...prev, audioFile]);
    toast.success('Voice recording added to attachments!', { theme: isDark ? 'dark' : 'light' });
  };

  const handleVoiceRecordingDeleted = (fileName: string) => {
    setAttachments(prev => prev.filter(file => file.name !== fileName));
  };
  
  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const isAudioFile = (file: File) => {
    return file.type.startsWith('audio/') || file.name.includes('voice-recording');
  };

  // Helper function to calculate expected number of yearly tasks
  const calculateYearlyTasks = () => {
    if (formData.taskType !== 'yearly' || !formData.startDate) return 0;
    
    if (!formData.isForever) {
      return 1; // Single yearly task
    }
    
    return formData.yearlyDuration; // Exact number of years selected
  };


  /// ✅ Helper: Adjust date for Week Off and Sunday rules
const adjustForWeekOffAndSunday = (date: Date, includeSunday: boolean, weekOffDays: number[]) => {
  let adjustedDate = new Date(date);

  // First handle "includeSunday" rule
  if (!includeSunday && adjustedDate.getDay() === 0) {
    adjustedDate.setDate(adjustedDate.getDate() - 1); // move from Sunday → Saturday
  }

  // Then handle Week Off days
  while (weekOffDays.includes(adjustedDate.getDay())) {
    adjustedDate.setDate(adjustedDate.getDate() - 1); // keep moving back until it's valid
  }

  return adjustedDate;
};

// ✅ Yearly Preview
const getYearlyTaskPreview = () => {
  if (formData.taskType !== 'yearly' || !formData.startDate) return [];

  const startDate = new Date(formData.startDate);
  const tasks: Date[] = [];
  const count = formData.isForever ? formData.yearlyDuration : 1;

  for (let i = 0; i < count; i++) {
    let taskDate = new Date(startDate);
    taskDate.setFullYear(startDate.getFullYear() + i);

    // Adjust for Sunday + Week Off
    taskDate = adjustForWeekOffAndSunday(taskDate, formData.includeSunday, formData.weekOffDays);

    tasks.push(taskDate);
  }

  return tasks;
};

// ✅ Quarterly Preview
const getQuarterlyTaskPreview = () => {
  if (formData.taskType !== 'quarterly' || !formData.startDate) return [];

  const startDate = new Date(formData.startDate);
  const tasks: Date[] = [];

  for (let i = 0; i < 4; i++) {
    let taskDate = new Date(startDate);
    taskDate.setMonth(startDate.getMonth() + (i * 3)); // Add 3 months per quarter

    // Adjust for Sunday + Week Off
    taskDate = adjustForWeekOffAndSunday(taskDate, formData.includeSunday, formData.weekOffDays);

    tasks.push(taskDate);
  }

  return tasks;
};


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validation
    if (formData.assignedTo.length === 0) {
      toast.error('Please select at least one user to assign the task to.', { theme: isDark ? 'dark' : 'light' });
      setLoading(false);
      return;
    }

    if (formData.taskType === 'weekly' && formData.weeklyDays.length === 0) {
      toast.error('Please select at least one day for weekly tasks.', { theme: isDark ? 'dark' : 'light' });
      setLoading(false);
      return;
    }

    // Validate dates for recurring tasks
    if (formData.taskType !== 'one-time') {
      // For yearly and quarterly tasks, only validate start date
      if (formData.taskType === 'yearly' || formData.taskType === 'quarterly') {
        if (!formData.startDate) {
          toast.error(`Please select start date for ${formData.taskType} tasks.`, { theme: isDark ? 'dark' : 'light' });
          setLoading(false);
          return;
        }
      } 
      // For other recurring tasks (daily, weekly, monthly), validate based on isForever
      else if (!formData.isForever) {
        if (!formData.startDate || !formData.endDate) {
          toast.error('Please select both start and end dates for recurring tasks.', { theme: isDark ? 'dark' : 'light' });
          setLoading(false);
          return;
        }
        
        if (new Date(formData.startDate) >= new Date(formData.endDate)) {
          toast.error('End date must be after start date.', { theme: isDark ? 'dark' : 'light' });
          setLoading(false);
          return;
        }
      }
      // For forever tasks (non-yearly and non-quarterly), only validate start date
      else if (formData.taskType !== 'yearly' && formData.taskType !== 'quarterly' && !formData.startDate) {
        toast.error('Please select start date for recurring tasks.', { theme: isDark ? 'dark' : 'light' });
        setLoading(false);
        return;
      }
    }

    try {
      // Upload attachments first
      let uploadedAttachments: any[] = [];
      if (attachments.length > 0) {
        const formDataFiles = new FormData();
        attachments.forEach(file => {
          formDataFiles.append('files', file); // Use 'files' to match backend
        });
        const uploadResponse = await axios.post(`${address}/api/upload`, formDataFiles, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        // The backend returns { files: [...] }
        uploadedAttachments = uploadResponse.data.files || [];
      }

      // Create tasks for each selected user
      const taskPromises = formData.assignedTo.map(async (assignedUserId) => {
        const taskData = {
          ...formData,
          
          assignedTo: assignedUserId, // Single user per task
          assignedBy: user?.id,
          companyId: user?.companyId, // Add company ID to task data
          attachments: uploadedAttachments,
          // For yearly and quarterly tasks, ensure proper date handling
          ...((formData.taskType === 'yearly' || formData.taskType === 'quarterly') && !formData.isForever && {
            endDate: formData.startDate
          })
        };

        console.log('Sending task data:', taskData); // Debug log
        return axios.post(`${address}/api/tasks/create-scheduled`, taskData);
      });

      const results = await Promise.all(taskPromises);

      // Calculate total tasks created
      const totalTasksCreated = results.reduce((sum, result) => sum + result.data.tasksCreated, 0);
      const userCount = formData.assignedTo.length;
      const uploadedAttachmentCount = uploadedAttachments.length;
      const voiceRecordingCount = attachments.filter(isAudioFile).length;

      let successMessage = `Successfully created ${totalTasksCreated} task${totalTasksCreated > 1 ? 's' : ''} for ${userCount} user${userCount > 1 ? 's' : ''}.`;
      if (uploadedAttachmentCount > 0) {
        successMessage += ` (${uploadedAttachmentCount} attachment${uploadedAttachmentCount > 1 ? 's' : ''} uploaded`;
        if (voiceRecordingCount > 0) {
          successMessage += `, including ${voiceRecordingCount} voice recording${voiceRecordingCount > 1 ? 's' : ''}`;
        }
        successMessage += ')';
      }
      toast.success(successMessage, { theme: isDark ? 'dark' : 'light' });

      // Reset form
      setFormData({
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
        yearlyDuration: 3
      });
      setAttachments([]);
      setUserSearchTerm('');
      setShowUserDropdown(false);
      
      // Reset voice recorder
      if (voiceRecorderRef.current) {
        voiceRecorderRef.current.resetFromParent();
      }

    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to assign task. Please try again.', { theme: isDark ? 'dark' : 'light' });
    } finally {
      setLoading(false);
    }
  };

  const isRecurring = formData.taskType !== 'one-time';
  const isWeekly = formData.taskType === 'weekly';
  const isMonthly = formData.taskType === 'monthly';
  const isYearly = formData.taskType === 'yearly';
  const isQuarterly = formData.taskType === 'quarterly';

  const getSelectedUsers = () => {
    return users.filter(u => formData.assignedTo.includes(u._id));
  };

  // Filtered users for the dropdown
  const filteredUsers = users.filter(userItem =>
    userItem.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    userItem.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const resetForm = () => {
    setFormData({
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
      yearlyDuration: 3
    });
    setAttachments([]);
    setMessage({ type: '', text: '' });
    setUserSearchTerm('');
    setShowUserDropdown(false);
    
    // Reset voice recorder
    if (voiceRecorderRef.current) {
      voiceRecorderRef.current.resetFromParent();
    }
  };

  // Function to open the date picker
  const openDatePicker = (ref: React.RefObject<HTMLInputElement>) => {
    if (ref.current && typeof ref.current.showPicker === 'function') {
      ref.current.showPicker();
    }
  };

  return (
    <div className={`max-w-5xl mx-auto space-y-2 p-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
      <div className="flex items-center space-x-3 rounded-xl shadow-sm p-4 border border-gray-100">
        <UserPlus size={20} style={{ color: 'var(--color-primary)' }} />
        <h1 className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Assign Task
        </h1>
      </div>

      {/* Internal validation messages */}
      {message.text && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
          style={{
            backgroundColor: message.type === 'success' ? 'var(--color-success-light)' : 'var(--color-error-light)',
            color: message.type === 'success' ? 'var(--color-success-dark)' : 'var(--color-error-dark)',
            borderColor: message.type === 'success' ? 'var(--color-success-border)' : 'var(--color-error-border)',
          }}
        >
          <div className="flex items-center">
            {message.type === 'success' ? (
              <CheckSquare className="mr-2" size={16} />
            ) : (
              <X className="mr-2" size={16} />
            )}
            {message.text}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Task Details and Priority */}
        <div className={`p-4 rounded-xl border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            <Calendar className="mr-2" size={16} style={{ color: 'var(--color-primary)' }} />
            Task Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Task Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                placeholder="Enter task title"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Task Type *
              </label>
              <select
                name="taskType"
                value={formData.taskType}
                onChange={handleInputChange}
                required
                className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
              >
                <option value="one-time">One Time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                placeholder="Enter task description"
              />
            </div>
          </div>
        </div>

        {/* User Assignment and Priority */}
        <div className={`p-4 rounded-xl border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* User Assignment Dropdown */}
            <div>
              <h2 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                <Users className="mr-2" size={16} style={{ color: 'var(--color-primary)' }} />
                Assign To Users *
              </h2>

              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  className={`w-full flex justify-between items-center px-4 py-2 border rounded-lg text-left transition-colors ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                >
                  {formData.assignedTo.length > 0 ? (
                    <span className="text-sm">
                      {getSelectedUsers().map(u => u.username).join(', ')}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">Select users...</span>
                  )}
                  <ChevronDown size={18} className={`${showUserDropdown ? 'transform rotate-180' : ''}`} />
                </button>

                {showUserDropdown && (
                  <div
                    className={`absolute z-10 w-full mt-2 rounded-md shadow-lg border ${
                      isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                    }`}
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                  >
                    <div className="p-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                          type="text"
                          placeholder="Search users..."
                          className={`w-full pl-8 pr-2 py-1 border rounded-md focus:ring-1 focus:ring-blue-400 ${
                            isDark
                              ? 'bg-gray-800 border-gray-600 text-gray-100'
                              : 'border-gray-300 text-gray-900'
                          }`}
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {filteredUsers.length === 0 && (
                        <p className={`p-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No users found.</p>
                      )}
                      {filteredUsers.map(userItem => (
                        <label
                          key={userItem._id}
                          className={`flex items-center p-2 cursor-pointer hover:bg-opacity-80 ${
                            isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'
                          }`}
                          style={{
                            backgroundColor: formData.assignedTo.includes(userItem._id) ? 'var(--color-primary-light)' : '',
                            color: formData.assignedTo.includes(userItem._id) ? 'var(--color-primary-dark)' : (isDark ? 'var(--color-text)' : 'var(--color-text-dark)')
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.assignedTo.includes(userItem._id)}
                            onChange={() => handleUserSelection(userItem._id)}
                            className="mr-2 w-4 h-4 rounded focus:ring-blue-500"
                            style={{ color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{userItem.username}</span>
                            <span className="text-xs">{userItem.email}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {formData.assignedTo.length > 0 && (
                <div
                  className="mt-4 p-2 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--color-primary-light)',
                    borderColor: 'var(--color-primary-border)'
                  }}
                >
                  <p className={`text-xs font-medium mb-1`} style={{ color: 'var(--color-primary-dark)' }}>
                    Selected Users ({formData.assignedTo.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {getSelectedUsers().map(selectedUser => (
                      <span
                        key={selectedUser._id}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--color-primary)',
                          color: 'var(--color-background)',
                        }}
                      >
                        {selectedUser.username}
                        <button
                          type="button"
                          onClick={() => handleUserSelection(selectedUser._id)}
                          className="ml-2"
                          style={{ color: 'var(--color-background)' }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className={`block text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                <Clock className="mr-2" size={16} style={{ color: 'var(--color-primary)' }} />
                Priority
              </label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleInputChange}
                className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Weekly Days Selection */}
        {isWeekly && (
          <div className={`p-4 rounded-xl border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              Select Weekly Days *
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {weekDays.map(day => (
                <div
                  key={day.value}
                  className={`p-2 rounded-lg border-2 cursor-pointer transition-all text-center ${
                    formData.weeklyDays.includes(day.value)
                      ? 'border-blue-500 bg-blue-50'
                      : (isDark ? 'border-gray-600 bg-gray-700 hover:border-gray-500' : 'border-gray-200 bg-gray-50 hover:border-gray-300')
                  }`}
                  style={{
                    borderColor: formData.weeklyDays.includes(day.value) ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: formData.weeklyDays.includes(day.value) ? 'var(--color-primary-light)' : 'var(--color-surface)'
                  }}
                  onClick={() => handleWeekDaySelection(day.value)}
                >
                  <div className={`text-md font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{day.short}</div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{day.label}</div>
                </div>
              ))}
            </div>

            {formData.weeklyDays.length > 0 && (
              <div
                className="mt-2 p-2 rounded-lg border"
                style={{
                  backgroundColor: 'var(--color-primary-light)',
                  borderColor: 'var(--color-primary-border)'
                }}
              >
                <p className={`text-xs font-medium`} style={{ color: 'var(--color-primary-dark)' }}>
                  Selected Days: {formData.weeklyDays.map(dayValue =>
                    weekDays.find(d => d.value === dayValue)?.label
                  ).join(', ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Monthly Day Selection */}
        {isMonthly && (
          <div className={`p-6 rounded-xl border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className={`text-xl font-semibold mb-6 flex items-center ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              <Hash className="mr-2" size={20} style={{ color: 'var(--color-primary)' }} />
              Monthly Day Selection *
            </h2>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Day of Month (1-31) *
                </label>
                <select
                  name="monthlyDay"
                  value={formData.monthlyDay}
                  onChange={handleInputChange}
                  required
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 transition-colors ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                >
                  {monthlyDayOptions.map(day => (
                    <option key={day} value={day}>
                      {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of each month
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: 'var(--color-primary-light)',
                  borderColor: 'var(--color-primary-border)'
                }}
              >
                <p className={`text-sm font-medium mb-1`} style={{ color: 'var(--color-primary-dark)' }}>
                  Selected: {formData.monthlyDay}{formData.monthlyDay === 1 ? 'st' : formData.monthlyDay === 2 ? 'nd' : formData.monthlyDay === 3 ? 'rd' : 'th'} day of each month
                </p>
                <p className={`text-xs`} style={{ color: 'var(--color-primary-dark)' }}>
                  Tasks will be created for the {formData.monthlyDay}{formData.monthlyDay === 1 ? 'st' : formData.monthlyDay === 2 ? 'nd' : formData.monthlyDay === 3 ? 'rd' : 'th'} day of each month within the selected date range.
                  {formData.monthlyDay > 28 && ' Note: For months with fewer days, the task will be created on the last day of that month.'}
                </p>
              </div>
            </div>
          </div>
        )}
        
      
        {/* Date Configuration */}
        <div className={`p-4 rounded-xl border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            <Calendar className="mr-2" size={16} style={{ color: 'var(--color-primary)' }} />
            Date Configuration
          </h2>

          {!isRecurring ? (
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Due Date *
              </label>
              <div onClick={() => openDatePicker(dueDateInputRef)} className="cursor-pointer">
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  required
                  ref={dueDateInputRef}
                  className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {isYearly || isQuarterly ? 'Task Date *' : 'Start Date *'}
                  </label>
                  <div onClick={() => openDatePicker(startDateInputRef)} className="cursor-pointer">
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      required
                      ref={startDateInputRef}
                      className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors ${
                        isDark
                          ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                          : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                      }`}
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                    />
                  </div>
                </div>

                {!isYearly && !isQuarterly && (
                  <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    End Date {!formData.isForever && '*'}
                  </label>
                  <div onClick={() => !formData.isForever && openDatePicker(endDateInputRef)} className={`cursor-pointer ${formData.isForever ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleInputChange}
                      required={!formData.isForever}
                      disabled={formData.isForever}
                      ref={endDateInputRef}
                      className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors disabled:opacity-50 ${
                        isDark
                          ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400 disabled:bg-gray-800'
                          : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100'
                      }`}
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: formData.isForever ? 'var(--color-surface-disabled)' : 'var(--color-surface)' }}
                    />
                  </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-6">
                {/* Forever checkbox - only for non-yearly and non-quarterly tasks */}
                {!isYearly && !isQuarterly && (
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="isForever"
                      checked={formData.isForever}
                      onChange={handleInputChange}
                      className="mr-2 w-3 h-3 rounded focus:ring-blue-500"
                      style={{ color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
                    />
                    <span className={`text-sm  ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Forever (1 year)
                    </span>
                  </label>
                )}

                {/* Multi-year checkbox - only for yearly tasks */}
                {isYearly && (
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="isForever"
                      checked={formData.isForever}
                      onChange={handleInputChange}
                      className="mr-2 w-3 h-3 rounded focus:ring-blue-500"
                      style={{ color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
                    />
                    <span className={`text-sm  ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Create for multiple years
                    </span>
                  </label>
                )}

                {/* Include Sunday checkbox - for daily, monthly, quarterly, and yearly tasks */}
                {(formData.taskType === 'daily' || isMonthly || isQuarterly || isYearly) && (
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="includeSunday"
                      checked={formData.includeSunday}
                      onChange={handleInputChange}
                      className="mr-2 w-3 h-3 rounded focus:ring-blue-500"
                      style={{ color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
                    />
                    <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Include Sunday</span>
                  </label>
                )}
                  {/* ✅ Week Off checkbox */}
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={showWeekOff}
            onChange={(e) => setShowWeekOff(e.target.checked)}
            className="mr-2 w-3 h-3 rounded focus:ring-blue-500"
            style={{ color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
          />
          <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Week Off</span>
        </label>
      </div>

      {/* ✅ Expandable Week Off Day Selector */}
      {showWeekOff && (
        <div
          className="mt-3 p-3 rounded-lg border"
          style={{
            backgroundColor: isDark ? 'var(--color-surface-dark)' : 'var(--color-surface)',
            borderColor: 'var(--color-border)'
          }}
        >
          <h3 className={`font-medium text-sm mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Select Week Off Days
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {weekDays.map(day => (
              <div
                key={day.value}
                onClick={() => {
                  setFormData(prev => ({
                    ...prev,
                    weekOffDays: prev.weekOffDays.includes(day.value)
                      ? prev.weekOffDays.filter(d => d !== day.value)
                      : [...prev.weekOffDays, day.value]
                  }));
                }}
                className={`p-2 rounded-lg border text-center cursor-pointer
                  ${formData.weekOffDays.includes(day.value)
                    ? 'bg-red-100 border-red-500'
                    : isDark
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-white border-gray-300'}`}
              >
                {day.short}
              </div>
            ))}
          </div>
        </div>
      )}

              {/* Yearly Duration Selection */}
              {isYearly && formData.isForever && (
                <div
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--color-primary-light)',
                    borderColor: 'var(--color-primary-border)'
                  }}
                >
                  <label className={`block text-sm font-medium mb-2`} style={{ color: 'var(--color-primary-dark)' }}>
                    <Clock className="inline mr-1" size={16} />
                    How many years should this task repeat?
                  </label>
                  <select
                    name="yearlyDuration"
                    value={formData.yearlyDuration}
                    onChange={handleInputChange}
                    className={`w-full px-2 py-2 border rounded-lg focus:ring-2 transition-colors ${
                      isDark
                        ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-400 focus:border-blue-400'
                        : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                  >
                    <option value={3}>3 years</option>
                    <option value={5}>5 years</option>
                    <option value={10}>10 years</option>
                  </select>
                  <p className={`text-xs mt-1`} style={{ color: 'var(--color-primary-dark)' }}>
                    This will create exactly {formData.yearlyDuration} tasks, one for each year starting from the selected date.
                  </p>
                </div>
              )}

              {/* Yearly Task Preview */}
              {isYearly && formData.startDate && (
                <div
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--color-info-light)',
                    borderColor: 'var(--color-info-border)'
                  }}
                >
                  <p className={`text-sm font-medium mb-2`} style={{ color: 'var(--color-info-dark)' }}>
                    <Calendar className="inline mr-1" size={16} />
                    Task Preview ({calculateYearlyTasks()} task{calculateYearlyTasks() > 1 ? 's' : ''}):
                  </p>
                  <div className="space-y-1">
                    {getYearlyTaskPreview().map((date, index) => (
                      <div key={index} className={`text-xs`} style={{ color: 'var(--color-info-dark)' }}>
                        • {date.toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          weekday: 'long'
                        })}
                        {!formData.includeSunday && new Date(formData.startDate).getDay() === 0 && index === 0 && (
                          <span className="text-orange-600 ml-2">(moved from Sunday)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quarterly Task Preview */}
              {isQuarterly && formData.startDate && (
                <div
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--color-info-light)',
                    borderColor: 'var(--color-info-border)'
                  }}
                >
                  <p className={`text-sm font-medium mb-2`} style={{ color: 'var(--color-info-dark)' }}>
                    <Calendar className="inline mr-1" size={16} />
                    Quarterly Task Preview (4 tasks for one year):
                  </p>
                  <div className="space-y-1">
                    {getQuarterlyTaskPreview().map((date, index) => (
                      <div key={index} className={`text-xs`} style={{ color: 'var(--color-info-dark)' }}>
                        • Quarter {index + 1}: {date.toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          weekday: 'long'
                        })}
                        {!formData.includeSunday && date.getDay() === 0 && (
                          <span className="text-orange-600 ml-2">(moved from Sunday)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sunday warning for monthly, quarterly and yearly tasks */}
              {(isMonthly || isQuarterly || isYearly) && !formData.includeSunday && (
                <div
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--color-warning-light)',
                    borderColor: 'var(--color-warning-border)'
                  }}
                >
                  <p className={`text-sm`} style={{ color: 'var(--color-warning-dark)' }}>
                    <strong>Note:</strong> If any {isMonthly ? 'monthly' : isQuarterly ? 'quarterly' : 'yearly'} task falls on a Sunday, it will be moved to the previous day (Saturday).
                  </p>
                </div>
              )}

              {isRecurring && (
                <div
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)'
                  }}
                >
                  <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <strong>Task Generation:</strong>
                    {formData.taskType === 'daily' && ' Individual tasks will be created for each day in the selected date range.'}
                    {formData.taskType === 'weekly' && ' Tasks will be created for each occurrence of the selected days within the date range.'}
                    {formData.taskType === 'monthly' && ` Tasks will be created for the ${formData.monthlyDay}${formData.monthlyDay === 1 ? 'st' : formData.monthlyDay === 2 ? 'nd' : formData.monthlyDay === 3 ? 'rd' : 'th'} day of each month within the date range.`}
                    {formData.taskType === 'quarterly' && ' Tasks will be created for 4 quarters (every 3 months) starting from the selected date for one year.'}
                    {formData.taskType === 'yearly' && !formData.isForever && ' A single task will be created for the selected date.'}
                    {formData.taskType === 'yearly' && formData.isForever && ` Exactly ${formData.yearlyDuration} tasks will be created, one for each year starting from the selected date.`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Voice Recording Section */}
        <VoiceRecorder 
          ref={voiceRecorderRef}
          onRecordingComplete={handleVoiceRecordingComplete}
          onRecordingDeleted={handleVoiceRecordingDeleted}
          isDark={isDark}
        />

        {/* Attachments */}
        <div className={`p-4 rounded-xl border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            <Paperclip className="mr-2" size={16} style={{ color: 'var(--color-primary)' }} />
            Attachments (Max 10MB per file)
          </h2>
          <div>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className={`block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${
                isDark
                  ? 'file:bg-blue-500 file:text-white hover:file:bg-blue-600'
                  : 'file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100'
              }`}
              style={{
                '--file-bg-color': isDark ? 'var(--color-primary)' : 'var(--color-primary-light)',
                '--file-text-color': isDark ? 'var(--color-background)' : 'var(--color-primary-dark)',
                '--file-hover-bg-color': isDark ? 'var(--color-primary-dark)' : 'var(--color-primary-hover)',
              } as React.CSSProperties}
            />
            <p className={`mt-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Supported formats: PDF, images (JPG, PNG), documents (DOCX, XLSX), voice recordings. Max 10MB per file.
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {attachments.length > 0 && (
              <p className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Selected files ({attachments.length}):
              </p>
            )}
            {attachments.map((file, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-2 rounded-lg ${
                  isAudioFile(file) 
                    ? (isDark ? 'bg-blue-900/30 border border-blue-700' : 'bg-blue-50 border border-blue-200')
                    : (isDark ? 'bg-gray-700' : 'bg-gray-100')
                }`}
              >
                <span className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'} flex items-center`}>
                  {isAudioFile(file) && (
                    <span className="mr-2 flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-1"></div>
                      <Volume2 size={14} className="text-blue-500 mr-1" />
                      <span className="text-xs font-medium text-blue-600">Voice Recording</span>
                    </span>
                  )}
                  <span className={isAudioFile(file) ? 'ml-2' : ''}>
                    {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className={`text-red-500 hover:text-red-700`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={resetForm}
            className={`px-4 py-2 border rounded-lg font-medium transition-colors ${
              isDark
                ? 'border-gray-600 text-gray-100 hover:bg-gray-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-background)' }}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating Tasks...
              </>
            ) : (
              <>
                <UserPlus size={16} className="mr-2" />
                Create Tasks
              </>
            )}
          </button>
        </div>
      </form>
      
      {/* ToastContainer for React-Toastify alerts */}
      <ToastContainer
        position="top-right"
        autoClose={1500}
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

export default AssignTask;