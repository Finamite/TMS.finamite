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
  requiresApproval: boolean;
  taskTypeLocked?: boolean;
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
      attachments: [],
      requiresApproval: false,
    }
  ]);

  const [showWeekOff, setShowWeekOff] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState<{ [key: string]: boolean }>({});
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState("");
  const [taskGroupId, setTaskGroupId] = useState("");
  const [originalTaskId, setOriginalTaskId] = useState(""); // Add this
  const loadedReassignDataRef = useRef(false);
  const [adminApprovalSettings, setAdminApprovalSettings] = useState({ enabled: false, defaultForOneTime: false });

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
    if (!adminApprovalSettings.enabled) return;

    setTaskForms(prev =>
      prev.map(task =>
        task.taskType === "one-time"
          ? { ...task, requiresApproval: adminApprovalSettings.defaultForOneTime }
          : task
      )
    );
  }, [adminApprovalSettings]);


  useEffect(() => {
    if (mode === "reassign" && users.length > 0 && taskForms.length > 0) {
      setTaskForms((prev) => {
        const updated = [...prev];

        const assignedId = updated[0].assignedTo?.[0];
        if (!assignedId) return updated;

        const exists = users.some(u => u._id.toString() === assignedId.toString());

        if (exists) {
          updated[0].assignedTo = [assignedId]; // reapply to force dropdown update
        } else {
          console.warn("⚠ Assigned user NOT FOUND in users list:", assignedId);
        }

        return updated;
      });
    }
  }, [users, mode, taskForms.length]);

  useEffect(() => {
    if (user?.company?.companyId) {
      axios.get(`${address}/api/settings/admin-approval?companyId=${user.company.companyId}`)
        .then(res => setAdminApprovalSettings(res.data))
        .catch(err => console.error('Error fetching admin approval settings:', err));
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    const id = params.get("taskGroupId");
    const originalId = params.get("originalTaskId"); // Add this

    if (m) setMode(m);
    if (id) setTaskGroupId(id);
    if (originalId) setOriginalTaskId(originalId); // Add this
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
      attachments: [],
      requiresApproval: false,
    };

    if (newTask.taskType === 'one-time') {
      newTask.requiresApproval = adminApprovalSettings.defaultForOneTime;
    }

    setTaskForms([...taskForms, newTask]);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    return dateString.split("T")[0];
  };

  const loadReassignData = async () => {
    try {
      const res = await axios.get(`${address}/api/tasks/master/${taskGroupId}`);
      const data = res.data;

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
    setTaskForms(prev =>
      prev.map(task => {
        if (task.id !== taskId) return task;

        // 🔐 USER: lock task type after first selection
        if (
          field === "taskType" &&
          user?.role === "employee" &&
          task.taskType && // already selected once
          task.taskTypeLocked
        ) {
          return task; // ❌ block change
        }

        // First-time selection → lock it
        if (
          field === "taskType" &&
          user?.role === "employee" &&
          !task.taskTypeLocked
        ) {
          return {
            ...task,
            taskType: value,
            taskTypeLocked: true
          };
        }

        return { ...task, [field]: value };
      })
    );
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
        totalUsers: taskForms.reduce((sum, task) => sum + task.assignedTo.length, 0),
        // Add reassign mode data
        isReassignMode: mode === "reassign",
        originalTaskId: originalTaskId
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

      // Add reassign success message
      if (mode === "reassign" && originalTaskId) {
        successMessage += '. Original task has been marked as rejected.';
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
        attachments: [],
        requiresApproval: false,
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
      attachments: [],
      requiresApproval: false,
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
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-background)] px-4 py-6 transition-all duration-300 sm:px-6 lg:px-8">
      <div className="absolute -top-24 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute left-0 top-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl space-y-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Task Forms */}
          <div className="grid gap-6">
            {taskForms.map((task, index) => (
              <div key={task.id}
                className="relative overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_44px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_58px_rgba(15,23,42,0.12)]">

                {/* Task Header */}
                <div className="relative border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(14,165,233,0.04),rgba(59,130,246,0.02),transparent)]" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-secondary))] font-bold text-white shadow-[0_14px_30px_rgba(14,165,233,0.28)]">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-bold tracking-tight text-[var(--color-text)]">
                          {(task.title?.length > 20
                            ? task.title.substring(0, 20) + "..."
                            : task.title) || `Task ${index + 1}`}
                        </h3>
                        <p className="text-sm text-[var(--color-textSecondary)]">
                          {task.taskType.charAt(0).toUpperCase() + task.taskType.slice(1)} Task
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => duplicateTaskForm(task.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 text-[var(--color-primary)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
                        title="Duplicate Task"
                      >
                        <Copy size={16} />
                      </button>
                      {taskForms.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTaskForm(task.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] text-[var(--color-error)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(239,68,68,0.12)]"
                          title="Remove Task"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Task Content */}
                <div className="space-y-6 px-5 py-5 sm:px-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[var(--color-text)]">
                        Task Title *
                      </label>
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => updateTaskForm(task.id, 'title', e.target.value)}
                        required
                        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                        placeholder="Enter task title"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[var(--color-text)]">
                        Task Type *
                      </label>
                      <select
                        value={task.taskType}
                        onChange={(e) => updateTaskForm(task.id, 'taskType', e.target.value)}
                        required
                        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                      >
                        <option value="one-time">One Time</option>

                        {user?.role !== 'employee' && (
                          <>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="fortnightly">Fortnightly (every 14 days)</option>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="yearly">Yearly</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="lg:col-span-2 space-y-2">
                      <label className="text-sm font-semibold text-[var(--color-text)]">
                        Description
                      </label>
                      <textarea
                        value={task.description}
                        onChange={(e) => updateTaskForm(task.id, 'description', e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                        placeholder="Enter task description"
                      />
                    </div>
                  </div>

                  {/* User Assignment & Priority */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {/* User Assignment */}
                    {/* User Assignment */}
                    <div className="space-y-3">
                      <label className="flex items-center text-sm font-semibold text-[var(--color-text)]">
                        <Users className="mr-2" size={16} />
                        Assign To Users *
                      </label>

                      <div className="relative" ref={dropdownRef}>
                        {/* Dropdown Open Button */}
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-left text-[var(--color-text)] transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                          onClick={() =>
                            setShowUserDropdown((prev) => ({
                              ...prev,
                              [task.id]: !prev[task.id],
                            }))
                          }
                        >
                          {task.assignedTo.length > 0 ? (
                            <span className="text-sm font-medium">
                              {getSelectedUsers(task.id)
                                .map((u) => u.username)
                                .join(", ")}
                            </span>
                          ) : (
                            <span className="text-sm" style={{ color: "var(--color-textSecondary)" }}>
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
                            className="absolute z-10 mt-2 max-h-64 w-full overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_20px_50px_rgba(15,23,42,0.14)]"
                          >
                            {/* ⭐ COMBINED (Search + Select All + Clear All in one row) */}
                            <div
                              className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5"
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
                                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-10 pr-10 text-[var(--color-text)] outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                                  value={userSearchTerm}
                                  onChange={(e) => setUserSearchTerm(e.target.value)}
                                />

                                {/* Clear Icon */}
                                {userSearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setUserSearchTerm("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)] hover:text-[var(--color-error)]"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                )}
                              </div>

                              {/* Select All */}
                              <button
                                type="button"
                                className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[var(--color-primary)] transition hover:scale-105"
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
                                className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[var(--color-error)] transition hover:scale-105"
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
                                className="p-4 text-center text-sm text-[var(--color-textSecondary)]"
                                >
                                  No users found.
                                </p>
                              )}

                              {filteredUsers.map((userItem) => (
                                <label
                                  key={userItem._id}
                                  className="flex cursor-pointer items-center px-3 py-3 transition-all duration-200 hover:bg-[var(--color-background)]"
                                  style={{
                                    backgroundColor: task.assignedTo.includes(userItem._id)
                                      ? "var(--color-background)"
                                      : "",
                                    color: "var(--color-text)",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={task.assignedTo.includes(userItem._id)}
                                    onChange={() =>
                                      handleUserSelection(task.id, userItem._id)
                                    }
                                    className="mr-3 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-medium text-[var(--color-text)]">{userItem.username}</span>
                                    <span className="text-xs text-[var(--color-textSecondary)]">
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
                        <div className="mt-2 flex flex-wrap gap-2">
                          {getSelectedUsers(task.id).map((selectedUser) => (
                            <span
                              key={selectedUser._id}
                              className="inline-flex items-center rounded-full bg-[linear-gradient(135deg,var(--color-primary),var(--color-secondary))] px-3 py-1.5 text-sm font-medium text-white shadow-[0_10px_20px_rgba(14,165,233,0.2)] transition-all duration-200 hover:-translate-y-0.5"
                            >
                              {selectedUser.username}
                              <button
                                type="button"
                                onClick={() =>
                                  handleUserSelection(task.id, selectedUser._id)
                                }
                                className="ml-2 rounded-full p-1 hover:bg-white/20"
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
                      <label className="flex items-center text-sm font-semibold text-[var(--color-text)]">
                        <Clock className="mr-2" size={16} />
                        Priority
                      </label>
                      <select
                        value={task.priority}
                        onChange={(e) => updateTaskForm(task.id, 'priority', e.target.value)}
                        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    {task.taskType === 'one-time' && (
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`requiresApproval-${task.id}`}
                          checked={task.requiresApproval}
                          onChange={(e) => {
                            setTaskForms(prev => prev.map(t => t.id === task.id ? { ...t, requiresApproval: e.target.checked } : t));
                          }}
                          disabled={!adminApprovalSettings.enabled}
                          className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <label htmlFor={`requiresApproval-${task.id}`} className="cursor-pointer select-none text-sm font-medium text-[var(--color-text)]">
                          Requires Admin Approval
                          {adminApprovalSettings.enabled && !adminApprovalSettings.defaultForOneTime && (
                            <span className="text-xs text-[var(--color-textSecondary)] ml-1">(Optional)</span>
                          )}
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Date Configuration */}
                  <div className="space-y-4">
                    <h4 className="flex items-center text-lg font-semibold text-[var(--color-text)]">
                      Date Configuration
                    </h4>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {task.taskType === 'one-time' ? (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-[var(--color-text)]">Due Date *</label>
                          <div className="relative">
                            <input
                              type="date"
                              value={task.dueDate}
                              onClick={(e: React.MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                              onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                              onChange={(e) => updateTaskForm(task.id, 'dueDate', e.target.value)}
                              required
                              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                            />
                            <Calendar
                              size={16}
                              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                              style={{
                                color: "var(--color-text)",
                                opacity: 0.9
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-[var(--color-text)]">
                              {task.taskType === 'yearly' || task.taskType === 'quarterly' ? 'Task Date *' : 'Start Date *'}
                            </label>
                            <div className="relative">
                              <input
                                type="date"
                                value={task.startDate}
                                onClick={(e: React.MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                onChange={(e) => updateTaskForm(task.id, 'startDate', e.target.value)}
                                required
                                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                              />
                              <Calendar
                                size={16}
                                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                                style={{
                                  color: "var(--color-text)",
                                  opacity: 0.9
                                }}
                              />
                            </div>
                          </div>

                          {task.taskType !== 'yearly' && task.taskType !== 'quarterly' && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-[var(--color-text)]">
                                End Date {!task.isForever && '*'}
                              </label>
                              <div className="relative">
                                <input
                                  type="date"
                                  value={task.endDate}
                                  onClick={(e: React.MouseEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                  onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                                  onChange={(e) => updateTaskForm(task.id, 'endDate', e.target.value)}
                                  required={!task.isForever}
                                  disabled={task.isForever}
                                  className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 disabled:opacity-50 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                                  style={{
                                    backgroundColor: task.isForever ? 'var(--color-background)' : 'var(--color-background)',
                                  }}
                                />
                                <Calendar
                                  size={16}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                                  style={{
                                    color: "var(--color-text)",
                                    opacity: 0.9
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Recurring Options */}
                    {task.taskType !== 'one-time' && (
                      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/60 p-4">
                        {task.taskType !== 'yearly' && task.taskType !== 'quarterly' && (
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.isForever}
                              onChange={(e) => updateTaskForm(task.id, 'isForever', e.target.checked)}
                              className="mr-2 w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium text-[var(--color-text)]">
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
                            <span className="text-sm font-medium text-[var(--color-text)]">
                              Create for multiple years
                            </span>
                          </label>
                        )}

                        {(task.taskType === 'daily' || task.taskType === 'monthly' || task.taskType === 'fortnightly' || task.taskType === 'quarterly' || task.taskType === 'yearly') && (
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.includeSunday}
                              onChange={(e) => updateTaskForm(task.id, 'includeSunday', e.target.checked)}
                              className="mr-2 w-4 h-4 rounded"
                            />
                            <span className="text-sm font-medium text-[var(--color-text)]">Include Sunday</span>
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
                            <span className="text-sm font-medium text-[var(--color-text)]">Week Off</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Week Off Days */}
                    {showWeekOff[task.id] && (
                      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/60 p-4">
                        <h5 className="mb-3 text-sm font-medium text-[var(--color-text)]">Select Week Off Days</h5>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
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
                              className={`rounded-2xl border text-center transition-all duration-200 hover:-translate-y-0.5 ${task.weekOffDays.includes(day.value)
                                ? 'bg-[var(--color-error)] border-[var(--color-error)] text-white'
                                : 'border-[var(--color-border)] bg-[var(--color-background)]/70 text-[var(--color-text)]'
                                }`}
                              style={{
                                backgroundColor: task.weekOffDays.includes(day.value) ? 'var(--color-error)' : 'var(--color-background)',
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
                        <h5 className="font-semibold text-[var(--color-text)]">Select Weekly Days *</h5>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                          {weekDays.map(day => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => handleWeekDaySelection(task.id, day.value)}
                              className={`rounded-2xl border-2 px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 ${task.weeklyDays.includes(day.value)
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                                : 'border-[var(--color-border)] bg-[var(--color-background)]/70 text-[var(--color-text)]'
                                }`}
                              style={{
                                borderColor: task.weeklyDays.includes(day.value) ? 'var(--color-primary)' : 'var(--color-border)',
                                backgroundColor: task.weeklyDays.includes(day.value) ? 'var(--color-primary)' : 'var(--color-background)',
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
                        <h5 className="font-semibold text-[var(--color-text)]">Day of Month *</h5>
                        <select
                          value={task.monthlyDay}
                          onChange={(e) => updateTaskForm(task.id, 'monthlyDay', parseInt(e.target.value))}
                          required
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
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
                        <h5 className="font-semibold text-[var(--color-text)]">Number of Years</h5>
                        <select
                          value={task.yearlyDuration}
                          onChange={(e) => updateTaskForm(task.id, 'yearlyDuration', parseInt(e.target.value))}
                          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-4 py-3 text-[var(--color-text)] outline-none transition-all duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10"
                        >
                          <option value={3}>3 years</option>
                          <option value={5}>5 years</option>
                          <option value={10}>10 years</option>
                        </select>
                      </div>
                    )}
                    {task.taskType === 'fortnightly' && (
                      <div className="text-sm text-amber-600 mt-2">
                        {!task.includeSunday
                          ? "Tasks will be created every 14 days from start date, Sundays will be moved to Saturday (or earlier if week-off)"
                          : "Tasks can fall on Sunday"}
                      </div>
                    )}
                  </div>

                  {/* Voice Recording and Attachments for Each Task */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
                    <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)] transition-all duration-300 hover:shadow-[0_20px_46px_rgba(15,23,42,0.12)]">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-[var(--color-text)]">
                        <Paperclip className="mr-2" size={18} />
                        Task Attachments (Max 10MB per file)
                      </h3>

                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,audio/*"
                        onChange={(e) => handleFileChange(task.id, e)}
                        className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--color-primary)]/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/15 transition-all duration-200"
                      />

                      <div className="mt-4 space-y-2">
                        {task.attachments.map((file, fileIndex) => (
                          <div
                            key={fileIndex}
                            className={`flex items-center justify-between rounded-2xl border px-3 py-3 transition-all duration-200 ${isAudioFile(file)
                              ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5'
                              : 'border-[var(--color-border)] bg-[var(--color-background)]/70'
                              }`}
                            style={{
                              backgroundColor: isAudioFile(file)
                                ? 'var(--color-background)'
                                : 'var(--color-background)',
                              borderColor: isAudioFile(file) ? 'var(--color-primary)' : 'var(--color-border)'
                            }}
                          >
                            <span className="flex items-center text-sm text-[var(--color-text)]">
                              {isAudioFile(file) && (
                                <Volume2 size={16} className="mr-2 text-[var(--color-primary)]" />
                              )}
                              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(task.id, fileIndex)}
                              className="rounded-full bg-[var(--color-error)] p-1 text-white transition-all duration-200 hover:-translate-y-0.5 hover:scale-110"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {task.attachments.length === 0 && (
                          <p className="py-4 text-center text-sm text-[var(--color-textSecondary)]">
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
            className="flex flex-col gap-4 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:items-center sm:justify-between"
          >
            {/* Reset Button (full width on mobile) */}
            <button
              type="button"
              onClick={resetAllForms}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-6 py-3 font-medium text-[var(--color-text)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:w-auto"
            >
              Reset All
            </button>

            {/* Right side buttons (Add Task + Create Tasks) */}
            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-center">

              {/* Add Task Button (moved near Create All Tasks) */}
              <button
                type="button"
                onClick={addNewTaskForm}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-success),#16a34a)] px-5 py-3 font-medium text-white shadow-[0_14px_26px_rgba(34,197,94,0.22)] transition-all duration-200 hover:-translate-y-0.5 sm:w-auto"
              >
                <Plus size={20} strokeWidth={3.5} />
              </button>

              {/* Create All Tasks */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center space-x-3 rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-secondary))] px-6 py-3 font-bold text-white shadow-[0_16px_30px_rgba(14,165,233,0.24)] transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
