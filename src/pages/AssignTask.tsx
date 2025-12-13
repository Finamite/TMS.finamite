import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Paperclip, X, Users, Clock, ChevronDown, Search, XCircle, CheckSquare, Volume2, Plus, Copy, Trash2, Zap } from 'lucide-react';
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
  department: string;
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
  const [mode, setMode] = useState("");
  const [taskGroupId, setTaskGroupId] = useState("");
  const loadedReassignDataRef = useRef(false);

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
    if (mode === "reassign" && users.length > 0 && taskForms.length > 0) {
      setTaskForms((prev) => {
        const updated = [...prev];

        const assignedId = updated[0].assignedTo?.[0];
        if (!assignedId) return updated;

        const exists = users.some(u => u._id.toString() === assignedId.toString());

        if (exists) {
          console.log("🎉 Assigned user synced after users loaded:", assignedId);
          updated[0].assignedTo = [assignedId]; // reapply to force dropdown update
        } else {
          console.warn("⚠ Assigned user NOT FOUND in users list:", assignedId);
        }

        return updated;
      });
    }
  }, [users, mode, taskForms.length]);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    const id = params.get("taskGroupId");

    if (m) setMode(m);
    if (id) setTaskGroupId(id);
  }, []);

  useEffect(() => {
    if (mode === "reassign" && taskGroupId) {
      loadReassignData();
    }
  }, [mode, taskGroupId]);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();

      // FIXED COMPANY ID SOURCE
      if (user?.company?.companyId) {
        params.append("companyId", user.company.companyId);
      }

      if (user?.role) {
        params.append("role", user.role);
      }

      const response = await axios.get(`${address}/api/users?${params.toString()}`);

      const sortedUsers = response.data.sort((a: User, b: User) =>
        a.username.localeCompare(b.username)
      );

      setUsers(sortedUsers);

      console.log("Users loaded:", sortedUsers);

    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to fetch users.");
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

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    return dateString.split("T")[0];
  };

  const loadReassignData = async () => {
    try {
      const res = await axios.get(`${address}/api/tasks/master/${taskGroupId}`);
      const data = res.data;

      console.log("📌 Prefill data for reassign:", data);
      loadedReassignDataRef.current = true;

      // ----------------------------
      // 1️⃣ Ensure assigned user is available
      // ----------------------------
      if (data.assignedTo) {
        setUsers(prev => {
          const exists = prev.some(u => u._id === data.assignedTo);
          if (!exists) {
            return [
              ...prev,
              {
                _id: data.assignedTo,
                username: "Loading...",
                email: "",
                department: "General",
                companyId: data.companyId
              }
            ];
          }
          return prev;
        });
      }

      // ----------------------------
      // 2️⃣ Extract weekOff & weeklyDays from correct location
      // ----------------------------
      const weeklyDays =
        (data.weeklyDays || data.parentTaskInfo?.weeklyDays || []).map(Number);

      const weekOffDays =
        (data.weekOffDays || data.parentTaskInfo?.weekOffDays || []).map(Number);

      // Include Sunday flag
      const includeSunday =
        data.includeSunday ??
        data.parentTaskInfo?.includeSunday ??
        false;

      const monthlyDay =
        data.monthlyDay ||
        data.parentTaskInfo?.monthlyDay ||
        1;

      const yearlyDuration =
        data.yearlyDuration ||
        data.parentTaskInfo?.yearlyDuration ||
        1;

      setShowWeekOff(prev => ({
        ...prev,
        [taskForms[0].id]: weekOffDays.length > 0
      }));

      // ----------------------------
      // 3️⃣ Load attachments & voice recordings
      // ----------------------------
      const convertedAttachments: File[] = [];

      if (Array.isArray(data.attachments)) {
        for (const file of data.attachments) {

          // ✅ CORRECT PUBLIC URL
          const fileUrl = `${address}/uploads/${file.filename}`;

          const response = await fetch(fileUrl);
          if (!response.ok) {
            console.error("Failed to fetch file:", fileUrl);
            continue;
          }

          const blob = await response.blob();

          // ✅ Blob size will now be correct
          const constructedFile = new File([blob], file.originalName, {
            type: blob.type || "application/octet-stream",
            lastModified: new Date(file.uploadedAt).getTime()
          });

          convertedAttachments.push(constructedFile);
        }
      }


      // ----------------------------
      // 4️⃣ Update form fields
      // ----------------------------
      setTaskForms(prev => {
        const upd = [...prev];
        upd[0] = {
          ...upd[0],

          title: data.title || "",
          description: data.description || "",
          priority: data.priority || "normal",
          taskType: data.taskType || "daily",

          assignedTo: data.assignedTo ? [data.assignedTo] : [],

          startDate: formatDate(data.startDate),
          endDate: formatDate(data.endDate),

          isForever: data.isForever || data.parentTaskInfo?.isForever || false,
          includeSunday,

          weeklyDays,
          weekOffDays,
          monthlyDay,
          yearlyDuration,

          attachments: convertedAttachments
        };
        return upd;
      });

      console.log("🎉 Prefill DONE → WeekOff, WeeklyDays, Attachments, Voice all loaded");

    } catch (err) {
      console.error("❌ Failed to load reassign data:", err);
      toast.error("Failed to load task details");
    }
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
    userItem.department.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  // ✅ OPTIMIZED: Super fast bulk task creation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // ⚡ Step 1: Validate all tasks at once (no early returns in loop)
      const validationErrors: string[] = [];

      taskForms.forEach((task, index) => {
        if (task.assignedTo.length === 0) {
          validationErrors.push(`Task ${index + 1}: Please select users`);
        }
        if (task.taskType === 'weekly' && task.weeklyDays.length === 0) {
          validationErrors.push(`Task ${index + 1}: Please select weekly days`);
        }
        if (task.taskType !== 'one-time') {
          if (task.taskType === 'yearly' || task.taskType === 'quarterly') {
            if (!task.startDate) {
              validationErrors.push(`Task ${index + 1}: Please select start date`);
            }
          } else if (!task.isForever && (!task.startDate || !task.endDate)) {
            validationErrors.push(`Task ${index + 1}: Please select start and end dates`);
          } else if (!task.isForever && new Date(task.startDate) >= new Date(task.endDate)) {
            validationErrors.push(`Task ${index + 1}: End date must be after start date`);
          }
        }
      });

      if (validationErrors.length > 0) {
        toast.error(validationErrors.join('. '), { theme: isDark ? 'dark' : 'light' });
        setLoading(false);
        return;
      }

      // ⚡ Step 2: Upload ALL attachments in parallel (not per task)
      const uploadPromises = taskForms.map(async (task) => {
        if (task.attachments.length === 0) return { taskId: task.id, attachments: [] };

        const formDataFiles = new FormData();
        task.attachments.forEach(file => formDataFiles.append('files', file));

        const uploadResponse = await axios.post(`${address}/api/upload`, formDataFiles, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        return { taskId: task.id, attachments: uploadResponse.data.files || [] };
      });

      const uploadResults = await Promise.all(uploadPromises);
      const attachmentMap = Object.fromEntries(
        uploadResults.map(r => [r.taskId, r.attachments])
      );

      // ⚡ Step 3: Prepare bulk task data (single payload)
      const bulkTaskData = {
        tasks: taskForms.map(task => ({
          ...task,
          assignedBy: user?.id,
          companyId: user?.companyId,
          attachments: attachmentMap[task.id],
          ...((task.taskType === 'yearly' || task.taskType === 'quarterly') && !task.isForever && {
            endDate: task.startDate
          })
        })),
        totalUsers: taskForms.reduce((sum, task) => sum + task.assignedTo.length, 0)
      };

      // ⚡ Step 4: Single API call for ALL tasks - SUPER FAST!
      const response = await axios.post(`${address}/api/tasks/bulk-create`, bulkTaskData);

      const { totalTasksCreated, totalUsers } = response.data;
      const totalAttachments = taskForms.reduce((sum, task) => sum + task.attachments.length, 0);
      const totalVoiceRecordings = taskForms.reduce((sum, task) =>
        sum + task.attachments.filter(isAudioFile).length, 0);

      let successMessage = `Created ${totalTasksCreated} task${totalTasksCreated > 1 ? 's' : ''} for ${totalUsers} user${totalUsers > 1 ? 's' : ''}`;
      if (totalAttachments > 0) {
        successMessage += ` (${totalAttachments} file${totalAttachments > 1 ? 's' : ''} uploaded`;
        if (totalVoiceRecordings > 0) {
          successMessage += `, ${totalVoiceRecordings} voice recording${totalVoiceRecordings > 1 ? 's' : ''}`;
        }
        successMessage += ')';
      }

      toast.success(successMessage, {
        theme: isDark ? 'dark' : 'light',
        autoClose: 4000,
      });

      // ✅ Reset everything
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
        if (ref) ref.resetFromParent();
      });

    } catch (error: any) {
      console.error('Error creating tasks:', error);
      const errorMsg = error.response?.data?.message || 'Failed to create tasks. Please try again.';
      toast.error(`Error: ${errorMsg}`, { theme: isDark ? 'dark' : 'light' });
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
                          {(task.title?.length > 20
                            ? task.title.substring(0, 20) + "..."
                            : task.title) || `Task ${index + 1}`}
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
                    {/* User Assignment */}
                    <div className="space-y-3">
                      <label
                        className="text-sm font-semibold flex items-center"
                        style={{ color: "var(--color-text)" }}
                      >
                        <Users className="mr-2" size={16} />
                        Assign To Users *
                      </label>

                      <div className="relative" ref={dropdownRef}>
                        {/* Dropdown Open Button */}
                        <button
                          type="button"
                          className="w-full flex justify-between items-center px-3 py-2 rounded-xl border-2 text-left transition-all duration-200"
                          style={{
                            borderColor: "var(--color-border)",
                            backgroundColor: "var(--color-surface)",
                            color: "var(--color-text)",
                          }}
                          onClick={() =>
                            setShowUserDropdown((prev) => ({
                              ...prev,
                              [task.id]: !prev[task.id],
                            }))
                          }
                        >
                          {task.assignedTo.length > 0 ? (
                            <span className="text-md">
                              {getSelectedUsers(task.id)
                                .map((u) => u.username)
                                .join(", ")}
                            </span>
                          ) : (
                            <span
                              className="text-md"
                              style={{ color: "var(--color-textSecondary)" }}
                            >
                              Select users...
                            </span>
                          )}

                          <ChevronDown
                            size={18}
                            className={`transition-transform duration-200 ${showUserDropdown[task.id] ? "rotate-180" : ""
                              }`}
                          />
                        </button>

                        {/* Dropdown Content */}
                        {showUserDropdown[task.id] && (
                          <div
                            className="absolute z-10 w-full mt-2 rounded-xl shadow-2xl border-2 max-h-64 overflow-hidden"
                            style={{
                              borderColor: "var(--color-border)",
                              backgroundColor: "var(--color-surface)",
                            }}
                          >
                            {/* ⭐ COMBINED (Search + Select All + Clear All in one row) */}
                            <div
                              className="flex items-center gap-3 px-3 py-2 border-b"
                              style={{ borderColor: "var(--color-border)" }}
                            >
                              {/* Search Input */}
                              <div className="relative flex-1">
                                <Search
                                  className="absolute left-3 top-1/2 -translate-y-1/2"
                                  style={{ color: "var(--color-textSecondary)" }}
                                  size={16}
                                />

                                <input
                                  type="text"
                                  placeholder="Search users..."
                                  className="w-full pl-10 pr-10 py-2 rounded-lg border transition-all duration-200"
                                  style={{
                                    borderColor: "var(--color-border)",
                                    backgroundColor: "var(--color-surface)",
                                    color: "var(--color-text)",
                                  }}
                                  value={userSearchTerm}
                                  onChange={(e) => setUserSearchTerm(e.target.value)}
                                />

                                {/* Clear Icon */}
                                {userSearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setUserSearchTerm("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                )}
                              </div>

                              {/* Select All */}
                              <button
                                type="button"
                                className="flex items-center gap-1 text-sm font-medium hover:scale-105 transition whitespace-nowrap"
                                style={{ color: "var(--color-primary)" }}
                                onClick={() => {
                                  const allUserIds = filteredUsers.map((u) => u._id);
                                  updateTaskForm(task.id, "assignedTo", allUserIds);
                                }}
                              >
                                <CheckSquare size={18} />

                                {/* Text visible on desktop only */}
                                <span className="hidden lg:inline-flex">Select All</span>
                              </button>

                              {/* Clear All */}
                              <button
                                type="button"
                                className="flex items-center gap-1 text-sm font-medium hover:scale-105 transition whitespace-nowrap"
                                style={{ color: "var(--color-error)" }}
                                onClick={() => {
                                  updateTaskForm(task.id, "assignedTo", []);
                                }}
                              >
                                <X size={18} />

                                {/* Text visible on desktop only */}
                                <span className="hidden lg:inline-flex">Clear</span>
                              </button>
                            </div>

                            {/* User List */}
                            <div className="max-h-48 overflow-y-auto">
                              {filteredUsers.length === 0 && (
                                <p
                                  className="p-4 text-sm text-center"
                                  style={{ color: "var(--color-textSecondary)" }}
                                >
                                  No users found.
                                </p>
                              )}

                              {filteredUsers.map((userItem) => (
                                <label
                                  key={userItem._id}
                                  className="flex items-center p-3 cursor-pointer transition-all duration-200 hover:bg-opacity-80"
                                  style={{
                                    backgroundColor: task.assignedTo.includes(userItem._id)
                                      ? "var(--color-chat)"
                                      : "",
                                    color: task.assignedTo.includes(userItem._id)
                                      ? ""
                                      : "var(--color-text)",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={task.assignedTo.includes(userItem._id)}
                                    onChange={() =>
                                      handleUserSelection(task.id, userItem._id)
                                    }
                                    className="mr-3 w-4 h-4 rounded"
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{userItem.username}</span>
                                    <span className="text-xs opacity-75">
                                      {userItem.department}
                                    </span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Selected User Tags */}
                      {task.assignedTo.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {getSelectedUsers(task.id).map((selectedUser) => (
                            <span
                              key={selectedUser._id}
                              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 hover:scale-105"
                              style={{
                                backgroundColor: "var(--color-primary)",
                                color: "white",
                              }}
                            >
                              {selectedUser.username}
                              <button
                                type="button"
                                onClick={() =>
                                  handleUserSelection(task.id, selectedUser._id)
                                }
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
                            onClick={(e: React.MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                            onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
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
                              onClick={(e: React.MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                              onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
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
                                onClick={(e: React.MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
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

                        {task.taskType !== "weekly" && (
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showWeekOff[task.id] || false}
                              onChange={(e) => setShowWeekOff(prev => ({ ...prev, [task.id]: e.target.checked }))}
                              className="mr-2 w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Week Off</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Week Off Days */}
                    {showWeekOff[task.id] && (
                      <div className="p-4 rounded-xl border" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                        <h5 className="font-medium text-sm mb-3" style={{ color: 'var(--color-text)' }}>Select Week Off Days</h5>
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
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
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
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
                Add New Task
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