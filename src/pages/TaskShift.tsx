import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    Users,
    Filter,
    Search,
    X,
    Paperclip,
    Loader2,
    AlertCircle,
    CheckCircle2,
    UserCheck,
    Zap
} from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';
import { toast } from 'react-toastify';

interface User {
    _id: string;
    username: string;
    email: string;
    role: string;
}

interface Task {
    _id: string;
    title: string;
    description: string;
    taskType: string;
    priority: string;
    dueDate: string;
    status: string;
    assignedTo: {
        _id: string;
        username: string;
        email: string;
    };
    assignedBy: {
        username: string;
        email: string;
    };
    taskGroupId?: string;
    sequenceNumber?: number;
    createdAt: string;
    attachments?: any[];
}

interface MasterTask {
    taskGroupId: string;
    title: string;
    description: string;
    taskType: string;
    priority: string;
    assignedTo: {
        _id: string;
        username: string;
        email: string;
    };
    assignedBy: {
        username: string;
        email: string;
    };
    dateRange: {
        start: string;
        end: string;
    };
    instanceCount: number;
    completedCount: number;
    pendingCount: number;
    attachments?: any[];
}

const TaskShift: React.FC = () => {
    const { user } = useAuth();

    // State management
    const [users, setUsers] = useState<User[]>([]);
    const [fromUser, setFromUser] = useState<string>('');
    const [toUser, setToUser] = useState<string>('');
    const [taskCategory, setTaskCategory] = useState<'one-time' | 'recurring'>('one-time');
    const [taskType, setTaskType] = useState<string>('all');
    const [priority, setPriority] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState<string>('');

    // Task data
    const [oneTimeTasks, setOneTimeTasks] = useState<Task[]>([]);
    const [masterTasks, setMasterTasks] = useState<MasterTask[]>([]);
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [selectedMasterTasks, setSelectedMasterTasks] = useState<Set<string>>(new Set());
    const dateFromRef = useRef<HTMLInputElement>(null);
    const dateToRef = useRef<HTMLInputElement>(null);

    // UI state
    const [loading, setLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showBulkPanel, setShowBulkPanel] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Check screen size
    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth <= 767);
        };

        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);
        return () => window.removeEventListener('resize', checkScreenSize);
    }, []);

    // Show/hide bulk panel based on selections
    useEffect(() => {
        const hasSelections = selectedTasks.size > 0 || selectedMasterTasks.size > 0;
        setShowBulkPanel(hasSelections);
    }, [selectedTasks.size, selectedMasterTasks.size]);

    // Load users on component mount
    useEffect(() => {
        loadUsers();
    }, []);

    // Load tasks when filters change
    useEffect(() => {
        if (fromUser) {
            loadTasks();
        }
    }, [fromUser, taskCategory, taskType, priority, dateFrom, dateTo]);

    const loadUsers = useCallback(async () => {
        try {
            const response = await axios.get(`${address}/api/taskshift/users`, {
                params: {
                    companyId: user?.company?.companyId,
                    excludeUserId: user?.id
                }
            });
            setUsers(response.data || []);
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Failed to load users');
        }
    }, [user]);

    const TASK_CATEGORIES = ['one-time', 'recurring'] as const;

    const loadTasks = useCallback(async () => {
        if (!fromUser) return;

        setLoading(true);
        try {
            if (taskCategory === 'one-time') {
                await loadOneTimeTasks();
            } else {
                await loadRecurringTasks();
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            toast.error('Failed to load tasks');
        } finally {
            setLoading(false);
        }
    }, [fromUser, taskCategory, taskType, priority, dateFrom, dateTo, user]);

    const loadOneTimeTasks = useCallback(async () => {
        const params: any = {
            companyId: user?.company?.companyId,
            assignedTo: fromUser
        };

        if (dateFrom) params.startDate = dateFrom;
        if (dateTo) params.endDate = dateTo;
        if (searchTerm) params.search = searchTerm;
        if (priority !== 'all') params.priority = priority;

        const response = await axios.get(`${address}/api/taskshift/one-time-tasks`, { params });
        setOneTimeTasks(response.data || []);
    }, [fromUser, dateFrom, dateTo, priority, user]);

    const loadRecurringTasks = useCallback(async () => {
        if (!fromUser) return;

        const params: any = {
            companyId: user?.company?.companyId,
            assignedTo: fromUser
        };

        if (taskType !== 'all') params.taskType = taskType;
        if (priority !== 'all') params.priority = priority;

        const response = await axios.get(`${address}/api/taskshift/recurring-masters`, { params });

        let filteredTasks = response.data || [];

        if (dateFrom || dateTo) {
            filteredTasks = filteredTasks.filter((task: any) => {
                const start = new Date(task.startDate);
                const end = new Date(task.endDate);
                if (dateFrom && end < new Date(dateFrom)) return false;
                if (dateTo && start > new Date(dateTo)) return false;
                return true;
            });
        }

        const normalized = filteredTasks.map((task: any) => ({
            taskGroupId: task.taskGroupId,
            title: task.title,
            description: task.description,
            taskType: task.taskType,
            priority: task.priority,
            assignedTo: task.assignedTo,
            assignedBy: task.assignedBy,
            dateRange: {
                start: task.startDate,
                end: task.endDate
            },
            instanceCount: task.instanceCount ?? 0,
            completedCount: task.completedCount ?? 0,
            pendingCount: task.pendingCount ?? 0,
            attachments: task.attachments || []
        }));

        setMasterTasks(normalized);
    }, [fromUser, taskType, priority, dateFrom, dateTo, user]);

    const handleTaskSelection = useCallback((taskId: string, isSelected: boolean) => {
        setSelectedTasks(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(taskId);
            } else {
                newSet.delete(taskId);
            }
            return newSet;
        });
    }, []);

    const handleMasterTaskSelection = useCallback((taskGroupId: string, isSelected: boolean) => {
        setSelectedMasterTasks(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(taskGroupId);
            } else {
                newSet.delete(taskGroupId);
            }
            return newSet;
        });
    }, []);

    const getFilteredOneTimeTasks = useMemo(() => {
        return oneTimeTasks.filter(task =>
            task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            task.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [oneTimeTasks, searchTerm]);

    const getFilteredMasterTasks = useMemo(() => {
        return masterTasks.filter(task =>
            task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            task.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [masterTasks, searchTerm]);

    const handleSelectAll = useCallback(() => {
        if (taskCategory === 'one-time') {
            const filteredTasks = getFilteredOneTimeTasks;
            if (selectedTasks.size === filteredTasks.length) {
                setSelectedTasks(new Set());
            } else {
                setSelectedTasks(new Set(filteredTasks.map((task: Task) => task._id)));
            }
        } else {
            const filteredTasks = getFilteredMasterTasks;
            if (selectedMasterTasks.size === filteredTasks.length) {
                setSelectedMasterTasks(new Set());
            } else {
                setSelectedMasterTasks(new Set(filteredTasks.map((task: MasterTask) => task.taskGroupId)));
            }
        }
    }, [taskCategory, selectedTasks.size, selectedMasterTasks.size, getFilteredOneTimeTasks, getFilteredMasterTasks]);

    const handleShiftTasks = useCallback(async () => {
        if (!toUser || (!selectedTasks.size && !selectedMasterTasks.size)) {
            toast.error('Please select a target user and at least one task to shift.');
            return;
        }

        if (fromUser === toUser) {
            toast.error('Source and target users cannot be the same.');
            return;
        }

        setLoading(true);
        try {
            if (taskCategory === 'one-time') {
                await axios.post(`${address}/api/taskshift/shift-one-time`, {
                    taskIds: Array.from(selectedTasks),
                    fromUser,
                    toUser,
                    companyId: user?.company?.companyId
                });
                toast.success(`Successfully shifted ${selectedTasks.size} one-time task(s)`);
            } else {
                await axios.post(`${address}/api/taskshift/shift-recurring`, {
                    taskGroupIds: Array.from(selectedMasterTasks),
                    fromUser,
                    toUser,
                    companyId: user?.company?.companyId
                });
                toast.success(`Successfully shifted ${selectedMasterTasks.size} recurring task series`);
            }

            setSelectedTasks(new Set());
            setSelectedMasterTasks(new Set());
            await loadTasks();
            setFromUser(toUser);
            setToUser('');
        } catch (error) {
            console.error('Error shifting tasks:', error);
            toast.error('Error occurred while shifting tasks. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [toUser, selectedTasks, selectedMasterTasks, fromUser, taskCategory, user, loadTasks]);

    const clearFilters = () => {
        setTaskType('all');
        setPriority('all');
        setDateFrom('');
        setDateTo('');
        setSearchTerm('');
    };

    const getPriorityColor = (priority: string) => {
        switch (priority.toLowerCase()) {
            case 'high': return 'bg-red-100 text-red-700';
            case 'medium': return 'bg-yellow-100 text-yellow-700';
            case 'low': return 'bg-green-100 text-green-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const getTaskTypeColor = (type: string) => {
        switch (type) {
            case 'daily': return 'bg-blue-100 text-blue-700';
            case 'weekly': return 'bg-purple-100 text-purple-700';
            case 'monthly': return 'bg-indigo-100 text-indigo-700';
            case 'quarterly': return 'bg-pink-100 text-pink-700';
            case 'yearly': return 'bg-orange-100 text-orange-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const getUserInitials = (username: string) => {
        return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getAvatarColor = (username: string) => {
        const colors = [
            'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
            'bg-indigo-500', 'bg-yellow-500', 'bg-red-500', 'bg-teal-500'
        ];
        const index = username.charCodeAt(0) % colors.length;
        return colors[index];
    };

    const filteredOneTimeTasks = getFilteredOneTimeTasks;
    const filteredMasterTasks = getFilteredMasterTasks;
    const totalSelected = selectedTasks.size + selectedMasterTasks.size;

    return (
        <div className={`min-h-screen transition-colors duration-300 'bg-[var(--color-background)]'}`}>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--color-surface)] backdrop-blur-xl border-b border-gray-200">
                <div className="px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                                <Users className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-[var(--color-text)]">Task Shift</h1>
                                <p className="text-sm text-[var(--color-text)]">Reassign & manage tasks efficiently</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search tasks..."
                                    className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-[var(--color-background)] text-[var(--color-text)] placeholder-[var(--color-textSecondary)] transition-all duration-200"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Filter Toggle */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`p-2 rounded-lg border transition-all duration-200 relative ${showFilters
                                    ? 'bg-blue-50 border-blue-200 text-blue-600'
                                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <Filter className="w-5 h-5" />

                                {!fromUser && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters Panel */}
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showFilters ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}>
                <div className="bg-[var(--color-surface)] border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 gap-4">

                        {/* From User */}
                        <div className="flex flex-col">
                            <label className="text-xs font-semibold text-[var(--color-text)] mb-1">
                                From User <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={fromUser}
                                onChange={(e) => setFromUser(e.target.value)}
                                className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="">Select user</option>
                                {users.map(user => (
                                    <option key={user._id} value={user._id}>
                                        {user.username}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Task Category */}
                        <div className="flex flex-col">
                            <label className="text-xs font-semibold text-gray-[var(--color-text)] mb-1">
                                Task Category
                            </label>
                            <div className="flex gap-2">
                                {TASK_CATEGORIES.map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setTaskCategory(type)}
                                        className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all
              ${taskCategory === type
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
            `}
                                    >
                                        {type === 'one-time' ? 'One-time' : 'Recurring'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Priority */}
                        <div className="flex flex-col">
                            <label className="text-xs font-semibold text-gray-[var(--color-text)] mb-1">
                                Priority
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">All</option>
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                            </select>
                        </div>

                        {/* Recurring Task Type */}
                        {taskCategory === 'recurring' && (
                            <div className="flex flex-col">
                                <label className="text-xs font-semibold text-[var(--color-text)] mb-1">
                                    Recurring Type
                                </label>
                                <select
                                    value={taskType}
                                    onChange={(e) => setTaskType(e.target.value)}
                                    className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="all">All</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="yearly">Yearly</option>
                                </select>
                            </div>
                        )}

                        {/* Date From */}
                        <div className="flex flex-col">
                            <label className="text-xs font-semibold text-[var(--color-text)] mb-1">
                                Date From
                            </label>
                            <input
                                ref={dateFromRef}
                                type="date"
                                value={dateFrom}
                                onClick={() => dateFromRef.current?.showPicker()}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="h-9 cursor-pointer rounded-lg
               border border-[var(--color-border)]
               bg-[var(--color-background)]
               px-3 text-sm text-[var(--color-text)]
               focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Date To */}
                        <div className="flex flex-col">
                            <label className="text-xs font-semibold text-[var(--color-text)] mb-1">
                                Date To
                            </label>
                            <input
                                ref={dateToRef}
                                type="date"
                                value={dateTo}
                                onClick={() => dateToRef.current?.showPicker()}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="h-9 cursor-pointer rounded-lg
               border border-[var(--color-border)]
               bg-[var(--color-background)]
               px-3 text-sm text-[var(--color-text)]
               focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Clear Filters */}
                        <div className="flex items-end">
                            <button
                                onClick={clearFilters}
                                className="w-full h-9 rounded-lg border border-gray-300 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 transition flex items-center justify-center gap-2"
                            >
                                <X className="w-4 h-4" />
                                Clear
                            </button>
                        </div>

                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                {!fromUser ? (
                    <div className="text-center py-12">
                        <div className="p-4 rounded-full bg-gray-100 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                            <UserCheck className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">
                            Select a User to Get Started
                        </h3>
                        <p className="text-[var(--color-textSecondary)] flex flex-wrap items-center justify-center gap-1 text-center">
                            Click the
                            <span className="inline-flex items-center gap-1 font-semibold text-blue-600">
                                <Filter className="w-4 h-4" />
                                Filter
                            </span>
                            button above right side, then choose a user from
                            <span className="font-semibold">From User</span>
                            to view and shift their tasks.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Task List Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold text-[var(--color-text)]">
                                    {taskCategory === 'one-time' ? 'One-time Tasks' : 'Recurring Tasks'}
                                </h2>
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    {taskCategory === 'one-time' ? filteredOneTimeTasks.length : filteredMasterTasks.length}
                                </span>
                            </div>

                            {((taskCategory === 'one-time' && filteredOneTimeTasks.length > 0) ||
                                (taskCategory === 'recurring' && filteredMasterTasks.length > 0)) && (
                                    <button
                                        onClick={handleSelectAll}
                                        className="px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-chat)] rounded-lg transition-colors duration-200"
                                    >
                                        {((taskCategory === 'one-time' && selectedTasks.size === filteredOneTimeTasks.length) ||
                                            (taskCategory === 'recurring' && selectedMasterTasks.size === filteredMasterTasks.length))
                                            ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                        </div>

                        {/* Loading State */}
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                    <span className="text-[var(--color-text)]">Loading tasks...</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Desktop Table View */}
                                {!isMobile && (
                                    <div className="bg-[var(--color-surface)] rounded-xl shadow-sm border border-[var(--color-border)] overflow-hidden mb-12">
                                        {taskCategory === 'one-time' ? (
                                            filteredOneTimeTasks.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                                    <p className="text-[var(--color-text)]">No one-time tasks found.</p>
                                                </div>
                                            ) : (
                                                <div className="max-h-[650px] overflow-y-auto overflow-x-auto">
                                                    <table className="w-full">
                                                        <thead className="sticky top-0 z-10 bg-[var(--color-background)] shadow-sm">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedTasks.size === filteredOneTimeTasks.length && filteredOneTimeTasks.length > 0}
                                                                        onChange={handleSelectAll}
                                                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                    />
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Task</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Priority</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Type</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Due Date</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Assigned To</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--color-border)]">
                                                            {filteredOneTimeTasks.map((task, index) => (
                                                                <tr
                                                                    key={task._id}
                                                                    onClick={() => handleTaskSelection(task._id, !selectedTasks.has(task._id))}
                                                                    className={`cursor-pointer transition-all duration-200 hover:bg-[var(--color-chat)] ${selectedTasks.has(task._id) ? 'bg-[var(--color-chat)] border-l-4 border-blue-500' : ''
                                                                        }`}
                                                                    style={{ animationDelay: `${index * 50}ms` }}
                                                                >
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedTasks.has(task._id)}
                                                                            onChange={(e) => handleTaskSelection(task._id, e.target.checked)}
                                                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                        />
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-3">
                                                                            <div>
                                                                                <div className="text-sm font-medium text-[var(--color-text)] truncate max-w-xs">{task.title}</div>
                                                                                <div className="text-sm text-gray-[var(--color-textSecondary)] truncate max-w-xs">{task.description}</div>
                                                                            </div>
                                                                            {task.attachments && task.attachments.length > 0 && (
                                                                                <Paperclip className="w-4 h-4 text-gray-400" />
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.priority)}`}>
                                                                            {task.priority}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTaskTypeColor(task.taskType)}`}>
                                                                            {task.taskType}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text)]">
                                                                        {new Date(task.dueDate).toLocaleDateString('en-GB')}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white ${getAvatarColor(task.assignedTo.username)}`}>
                                                                                {getUserInitials(task.assignedTo.username)}
                                                                            </div>
                                                                            <span className="text-sm text-[var(--color-text)]">{task.assignedTo.username}</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )
                                        ) : (
                                            // Recurring tasks table
                                            filteredMasterTasks.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                                    <p className="text-[var(--color-text)]">No recurring tasks found.</p>
                                                </div>
                                            ) : (
                                                <div className="max-h-[650px] overflow-y-auto overflow-x-auto ">
                                                    <table className="w-full">
                                                        <thead className="sticky top-0 z-10 bg-[var(--color-background)] shadow-sm">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedMasterTasks.size === filteredMasterTasks.length && filteredMasterTasks.length > 0}
                                                                        onChange={handleSelectAll}
                                                                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                    />
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Task Series</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Priority</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Type</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Progress</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--color-text)] uppercase tracking-wider">Assigned To</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--color-border)]">
                                                            {filteredMasterTasks.map((task, index) => (
                                                                <tr
                                                                    key={task.taskGroupId}
                                                                    onClick={() => handleMasterTaskSelection(task.taskGroupId, !selectedMasterTasks.has(task.taskGroupId))}
                                                                    className={`cursor-pointer transition-all duration-200 hover:bg-[var(--color-chat)] ${selectedMasterTasks.has(task.taskGroupId) ? 'bg-[var(--color-chat)] border-l-4 border-blue-500' : ''
                                                                        }`}
                                                                    style={{ animationDelay: `${index * 50}ms` }}
                                                                >
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedMasterTasks.has(task.taskGroupId)}
                                                                            onChange={(e) => handleMasterTaskSelection(task.taskGroupId, e.target.checked)}
                                                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                        />
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-3">
                                                                            <div>
                                                                                <div className="text-sm font-medium text-[var(--color-text)] truncate max-w-xs">{task.title}</div>
                                                                                <div className="text-sm text-[var(--color-textSecondary)] truncate max-w-xs">{task.description}</div>
                                                                            </div>
                                                                            {task.attachments && task.attachments.length > 0 && (
                                                                                <Paperclip className="w-4 h-4 text-gray-400" />
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.priority)}`}>
                                                                            {task.priority}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTaskTypeColor(task.taskType)}`}>
                                                                            {task.taskType}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                                                <div
                                                                                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                                                                    style={{ width: `${(task.completedCount / task.instanceCount) * 100}%` }}
                                                                                />
                                                                            </div>
                                                                            <span className="text-xs text-[var(--color-text)]">
                                                                                {task.completedCount}/{task.instanceCount}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white ${getAvatarColor(task.assignedTo.username)}`}>
                                                                                {getUserInitials(task.assignedTo.username)}
                                                                            </div>
                                                                            <span className="text-sm text-[var(--color-text)]">{task.assignedTo.username}</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Mobile Card View */}
                                {isMobile && (
                                    <div className="space-y-4 mb-24">
                                        {taskCategory === 'one-time' ? (
                                            filteredOneTimeTasks.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                                    <p className="text-[var(--color-text)]">No one-time tasks found.</p>
                                                </div>
                                            ) : (
                                                filteredOneTimeTasks.map((task, index) => (
                                                    <div
                                                        key={task._id}
                                                        onClick={() => handleTaskSelection(task._id, !selectedTasks.has(task._id))}
                                                        className={`bg-[var(--color-surface)] rounded-xl p-4 border transition-all duration-200 ${selectedTasks.has(task._id)
                                                            ? 'border-blue-500 bg-[var(--color-chat)]'
                                                            : 'border-gray-200'
                                                            }`}
                                                        style={{ animationDelay: `${index * 50}ms` }}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedTasks.has(task._id)}
                                                                onChange={(e) => handleTaskSelection(task._id, e.target.checked)}
                                                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-medium text-[var(--color-text)] truncate max-w-xs mb-1">{task.title}</h3>
                                                                <p className="text-sm text-[var(--color-text)] truncate max-w-xs mb-3">{task.description}</p>

                                                                <div className="flex flex-wrap gap-2 mb-3">
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.priority)}`}>
                                                                        {task.priority}
                                                                    </span>
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTaskTypeColor(task.taskType)}`}>
                                                                        {task.taskType}
                                                                    </span>
                                                                    {task.attachments && task.attachments.length > 0 && (
                                                                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-[var(--color-text)] text-[var(--color-text)]">
                                                                            <Paperclip className="w-3 h-3 inline mr-1" />
                                                                            {task.attachments.length}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center justify-between text-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white ${getAvatarColor(task.assignedTo.username)}`}>
                                                                            {getUserInitials(task.assignedTo.username)}
                                                                        </div>
                                                                        <span className="text-[var(--color-text)]">{task.assignedTo.username}</span>
                                                                    </div>
                                                                    <span className="text-[var(--color-text)]">
                                                                        Due: {new Date(task.dueDate).toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )
                                        ) : (
                                            // Mobile recurring tasks
                                            filteredMasterTasks.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                                    <p className="text-[var(--color-text)]">No recurring tasks found.</p>
                                                </div>
                                            ) : (
                                                filteredMasterTasks.map((task, index) => (
                                                    <div
                                                        key={task.taskGroupId}
                                                        onClick={() => handleMasterTaskSelection(task.taskGroupId, !selectedMasterTasks.has(task.taskGroupId))}
                                                        className={`bg-[var(--color-surface)] rounded-xl p-4 border transition-all duration-200 ${selectedMasterTasks.has(task.taskGroupId)
                                                            ? 'border-blue-500 bg-[var(--color-chat)]'
                                                            : 'border-gray-200'
                                                            }`}
                                                        style={{ animationDelay: `${index * 50}ms` }}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMasterTasks.has(task.taskGroupId)}
                                                                onChange={(e) => handleMasterTaskSelection(task.taskGroupId, e.target.checked)}
                                                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-medium text-[var(--color-text)] truncate max-w-xs mb-1">{task.title}</h3>
                                                                <p className="text-sm text-[var(--color-text)]-400 truncate max-w-xs mb-3">{task.description}</p>

                                                                <div className="flex flex-wrap gap-2 mb-3">
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.priority)}`}>
                                                                        {task.priority}
                                                                    </span>
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTaskTypeColor(task.taskType)}`}>
                                                                        {task.taskType}
                                                                    </span>
                                                                    {task.attachments && task.attachments.length > 0 && (
                                                                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-[var(--color-text)] text-[var(--color-text)]">
                                                                            <Paperclip className="w-3 h-3 inline mr-1" />
                                                                            {task.attachments.length}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="mb-3">
                                                                    <div className="flex items-center justify-between text-xs text-[var(--color-text)] mb-1">
                                                                        <span>Progress</span>
                                                                        <span>{task.completedCount}/{task.instanceCount}</span>
                                                                    </div>
                                                                    <div className="bg-[var(--color-text)] rounded-full h-2">
                                                                        <div
                                                                            className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                                                            style={{ width: `${(task.completedCount / task.instanceCount) * 100}%` }}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between text-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white ${getAvatarColor(task.assignedTo.username)}`}>
                                                                            {getUserInitials(task.assignedTo.username)}
                                                                        </div>
                                                                        <span className="text-[var(--color-text)]">{task.assignedTo.username}</span>
                                                                    </div>
                                                                    <span className="text-[var(--color-text)] text-xs">
                                                                        {new Date(task.dateRange.start).toLocaleDateString()} - {new Date(task.dateRange.end).toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Bulk Action Panel */}
            <div
                className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${showBulkPanel ? 'translate-y-0' : 'translate-y-full'
                    }`}
            >
                <div className="bg-[var(--color-surface)] border-t border-gray-200 shadow-2xl px-4 py-4">

                    {/* ================= MOBILE ONLY ================= */}
                    <div className="sm:hidden space-y-3">

                        {/* Assign To */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-semibold text-red-500 whitespace-nowrap">
                                Assign to:
                            </label>

                            <select
                                value={toUser}
                                onChange={(e) => setToUser(e.target.value)}
                                className="flex-1 px-3 py-2 border border-[var(--color-border)]
                     rounded-lg focus:ring-2 focus:ring-blue-500
                     bg-[var(--color-background)]
                     text-[var(--color-text)] text-sm"
                            >
                                <option value="">Select user</option>
                                {users.filter(u => u._id !== fromUser).map(user => (
                                    <option key={user._id} value={user._id}>
                                        {user.username}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Bottom Row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                <span className="font-medium text-[var(--color-text)]">
                                    {totalSelected} task{totalSelected !== 1 ? 's' : ''} selected
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setSelectedTasks(new Set());
                                        setSelectedMasterTasks(new Set());
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-gray-500"
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={handleShiftTasks}
                                    disabled={!toUser || loading}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${!toUser || loading
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white'
                                        }`}
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Zap className="w-4 h-4" />
                                    )}
                                    Shift
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ================= DESKTOP ONLY (UNCHANGED) ================= */}
                    <div className="hidden sm:flex items-center justify-between gap-4">

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-blue-500" />
                                <span className="font-medium text-[var(--color-text)]">
                                    {totalSelected} task{totalSelected !== 1 ? 's' : ''} selected
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="text-md font-semibold text-red-500">
                                    Assign to:
                                </label>

                                <select
                                    value={toUser}
                                    onChange={(e) => setToUser(e.target.value)}
                                    className="px-3 py-1 border border-[var(--color-border)]
                       rounded-lg focus:ring-2 focus:ring-blue-500
                       bg-[var(--color-background)]
                       text-[var(--color-text)] text-md"
                                >
                                    <option value="">Select user...</option>
                                    {users.filter(u => u._id !== fromUser).map(user => (
                                        <option key={user._id} value={user._id}>
                                            {user.username}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => {
                                    setSelectedTasks(new Set());
                                    setSelectedMasterTasks(new Set());
                                }}
                                className="px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:text-gray-800"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleShiftTasks}
                                disabled={!toUser || loading}
                                className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${!toUser || loading
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                                    }`}
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Zap className="w-4 h-4" />
                                )}
                                Shift Tasks
                            </button>
                        </div>

                    </div>
                </div>
            </div>

        </div>
    );
};

export default TaskShift;