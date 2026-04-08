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
            case 'high':
                return 'border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.10)] text-[var(--color-danger)]';
            case 'medium':
                return 'border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.10)] text-amber-600';
            case 'low':
                return 'border border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.10)] text-emerald-600';
            default:
                return 'border border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)]';
        }
    };

    const getTaskTypeColor = (type: string) => {
        switch (type) {
            case 'daily':
                return 'border border-[rgba(14,165,233,0.18)] bg-[rgba(14,165,233,0.10)] text-sky-600';
            case 'weekly':
                return 'border border-[rgba(168,85,247,0.18)] bg-[rgba(168,85,247,0.10)] text-violet-600';
            case 'monthly':
                return 'border border-[rgba(99,102,241,0.18)] bg-[rgba(99,102,241,0.10)] text-indigo-600';
            case 'quarterly':
                return 'border border-[rgba(236,72,153,0.18)] bg-[rgba(236,72,153,0.10)] text-pink-600';
            case 'yearly':
                return 'border border-[rgba(249,115,22,0.18)] bg-[rgba(249,115,22,0.10)] text-orange-600';
            default:
                return 'border border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)]';
        }
    };

    const getUserInitials = (username: string) => {
        return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getAvatarColor = (username: string) => {
        void username;
        return 'bg-[var(--color-primary)]';
    };

    const filteredOneTimeTasks = getFilteredOneTimeTasks;
    const filteredMasterTasks = getFilteredMasterTasks;
    const totalSelected = selectedTasks.size + selectedMasterTasks.size;

    return (
        <div className="relative min-h-screen overflow-hidden bg-[var(--color-background)]">
            {/* Header */}
            <div className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-xl">
                <div className="mx-auto flex max-w-15xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                                <Users className="h-6 w-6 text-[var(--color-primary)]" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Task Shift</h1>
                                <p className="text-sm text-[var(--color-textSecondary)]">Reassign and manage tasks efficiently</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-textSecondary)]" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search tasks..."
                                    className="w-64 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2.5 pl-10 pr-10 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)] transition-colors hover:text-[var(--color-text)]"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`relative inline-flex items-center justify-center rounded-2xl border px-3 py-2 transition-colors ${showFilters
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                    : 'border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)] hover:bg-[var(--color-background)]'
                                    }`}
                            >
                                <Filter className="h-5 w-5" />
                                {!fromUser && (
                                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters Panel */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showFilters ? 'max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">

                        {/* From User */}
                        <div className="flex flex-col">
                            <label className="mb-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                                From User <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={fromUser}
                                onChange={(e) => setFromUser(e.target.value)}
                                className="h-9 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                            <label className="mb-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                                Task Category
                            </label>
                            <div className="flex gap-2">
                                {TASK_CATEGORIES.map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setTaskCategory(type)}
                                        className={`flex-1 h-9 rounded-2xl text-sm font-medium transition-all
              ${taskCategory === type
                                                ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(14,165,233,0.24)]'
                                                : 'border border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)] hover:bg-[var(--color-background)]'}
            `}
                                    >
                                        {type === 'one-time' ? 'One-time' : 'Recurring'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Priority */}
                        <div className="flex flex-col">
                            <label className="mb-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                                Priority
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="h-9 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                            >
                                <option value="all">All</option>
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                            </select>
                        </div>

                        {/* Recurring Task Type */}
                        {taskCategory === 'recurring' && (
                            <div className="flex flex-col">
                                <label className="mb-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                                    Recurring Type
                                </label>
                                <select
                                    value={taskType}
                                    onChange={(e) => setTaskType(e.target.value)}
                                    className="h-9 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                            <label className="mb-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                                Date From
                            </label>
                            <input
                                ref={dateFromRef}
                                type="date"
                                value={dateFrom}
                                onClick={() => dateFromRef.current?.showPicker()}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="h-9 cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                            />
                        </div>

                        {/* Date To */}
                        <div className="flex flex-col">
                            <label className="mb-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                                Date To
                            </label>
                            <input
                                ref={dateToRef}
                                type="date"
                                value={dateTo}
                                onClick={() => dateToRef.current?.showPicker()}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="h-9 cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                            />
                        </div>

                        {/* Clear Filters */}
                        <div className="flex items-end">
                            <button
                                onClick={clearFilters}
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 text-sm font-medium text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)] hover:text-[var(--color-danger)]"
                            >
                                <X className="w-4 h-4" />
                                Clear
                            </button>
                        </div>

                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
                {!fromUser ? (
                    <div className="text-center py-12">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
                            <UserCheck className="h-8 w-8 text-[var(--color-primary)]" />
                        </div>
                        <h3 className="mb-2 text-lg font-medium text-[var(--color-text)]">
                            Select a User to Get Started
                        </h3>
                        <p className="text-[var(--color-textSecondary)] flex flex-wrap items-center justify-center gap-1 text-center">
                            Click the
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-primary)]">
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
                        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold text-[var(--color-text)]">
                                    {taskCategory === 'one-time' ? 'One-time Tasks' : 'Recurring Tasks'}
                                </h2>
                                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/75 px-2 py-1 text-xs font-medium text-[var(--color-textSecondary)]">
                                    {taskCategory === 'one-time' ? filteredOneTimeTasks.length : filteredMasterTasks.length}
                                </span>
                            </div>

                            {((taskCategory === 'one-time' && filteredOneTimeTasks.length > 0) ||
                                (taskCategory === 'recurring' && filteredMasterTasks.length > 0)) && (
                                    <button
                                        onClick={handleSelectAll}
                                        className="rounded-2xl px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors duration-200 hover:bg-[var(--color-background)]"
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
                                            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
                                            <span className="text-[var(--color-text)]">Loading tasks...</span>
                                        </div>
                                    </div>
                        ) : (
                            <>
                                {/* Desktop Table View */}
                                {!isMobile && (
                                    <div className="mb-12 overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_44px_rgba(15,23,42,0.08)]">
                                        {taskCategory === 'one-time' ? (
                                            filteredOneTimeTasks.length === 0 ? (
                                                <div className="py-12 text-center">
                                                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--color-textSecondary)]" />
                                                    <p className="text-[var(--color-text)]">No one-time tasks found.</p>
                                                </div>
                                            ) : (
                                                <div className="max-h-[650px] overflow-x-auto overflow-y-auto">
                                                    <table className="min-w-full table-fixed divide-y divide-[var(--color-border)]">
                                                        <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
                                                            <tr>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedTasks.size === filteredOneTimeTasks.length && filteredOneTimeTasks.length > 0}
                                                                        onChange={handleSelectAll}
                                                                        className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                                    />
                                                                </th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Task</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Priority</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Type</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Due Date</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Assigned To</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                                                            {filteredOneTimeTasks.map((task, index) => (
                                                                <tr
                                                                    key={task._id}
                                                                    onClick={() => handleTaskSelection(task._id, !selectedTasks.has(task._id))}
                                                                    className={`cursor-pointer transition-colors hover:bg-[var(--color-background)]/70 ${selectedTasks.has(task._id) ? 'bg-[var(--color-background)]/70' : ''
                                                                        }`}
                                                                    style={{ animationDelay: `${index * 50}ms` }}
                                                                >
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedTasks.has(task._id)}
                                                                            onChange={(e) => handleTaskSelection(task._id, e.target.checked)}
                                                                            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                                        />
                                                                    </td>
                                                                    <td className="px-6 py-5">
                                                                        <div className="flex items-center gap-3">
                                                                            <div>
                                                                                <div className="text-sm font-medium text-[var(--color-text)] truncate max-w-xs">{task.title}</div>
                                                                                <div className="text-sm text-[var(--color-textSecondary)] truncate max-w-xs">{task.description}</div>
                                                                            </div>
                                                                            {task.attachments && task.attachments.length > 0 && (
                                                                                <Paperclip className="h-4 w-4 text-[var(--color-textSecondary)]" />
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                                                            {task.priority}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getTaskTypeColor(task.taskType)}`}>
                                                                            {task.taskType}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-[var(--color-text)]">
                                                                        {new Date(task.dueDate).toLocaleDateString('en-GB')}
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(task.assignedTo.username)}`}>
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
                                                <div className="py-12 text-center">
                                                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--color-textSecondary)]" />
                                                    <p className="text-[var(--color-text)]">No recurring tasks found.</p>
                                                </div>
                                            ) : (
                                                <div className="max-h-[650px] overflow-x-auto overflow-y-auto">
                                                    <table className="min-w-full table-fixed divide-y divide-[var(--color-border)]">
                                                        <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
                                                            <tr>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedMasterTasks.size === filteredMasterTasks.length && filteredMasterTasks.length > 0}
                                                                        onChange={handleSelectAll}
                                                                        className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                                    />
                                                                </th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Task Series</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Priority</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Type</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Progress</th>
                                                                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Assigned To</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                                                            {filteredMasterTasks.map((task, index) => (
                                                                <tr
                                                                    key={task.taskGroupId}
                                                                    onClick={() => handleMasterTaskSelection(task.taskGroupId, !selectedMasterTasks.has(task.taskGroupId))}
                                                                    className={`cursor-pointer transition-colors hover:bg-[var(--color-background)]/70 ${selectedMasterTasks.has(task.taskGroupId) ? 'bg-[var(--color-background)]/70' : ''
                                                                        }`}
                                                                    style={{ animationDelay: `${index * 50}ms` }}
                                                                >
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedMasterTasks.has(task.taskGroupId)}
                                                                            onChange={(e) => handleMasterTaskSelection(task.taskGroupId, e.target.checked)}
                                                                            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                                        />
                                                                    </td>
                                                                    <td className="px-6 py-5">
                                                                        <div className="flex items-center gap-3">
                                                                            <div>
                                                                                <div className="text-sm font-medium text-[var(--color-text)] truncate max-w-xs">{task.title}</div>
                                                                                <div className="text-sm text-[var(--color-textSecondary)] truncate max-w-xs">{task.description}</div>
                                                                            </div>
                                                                            {task.attachments && task.attachments.length > 0 && (
                                                                                <Paperclip className="h-4 w-4 text-[var(--color-textSecondary)]" />
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                                                            {task.priority}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getTaskTypeColor(task.taskType)}`}>
                                                                            {task.taskType}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="flex-1 rounded-full bg-[var(--color-background)]/70 h-2">
                                                                                <div
                                                                                    className="h-2 rounded-full bg-[var(--color-success)] transition-all duration-300"
                                                                                    style={{ width: `${(task.completedCount / task.instanceCount) * 100}%` }}
                                                                                />
                                                                            </div>
                                                                            <span className="text-xs text-[var(--color-text)]">
                                                                                {task.completedCount}/{task.instanceCount}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(task.assignedTo.username)}`}>
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
                                                <div className="py-12 text-center">
                                                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--color-textSecondary)]" />
                                                    <p className="text-[var(--color-text)]">No one-time tasks found.</p>
                                                </div>
                                            ) : (
                                                filteredOneTimeTasks.map((task, index) => (
                                                    <div
                                                        key={task._id}
                                                        onClick={() => handleTaskSelection(task._id, !selectedTasks.has(task._id))}
                                                        className={`rounded-[24px] border p-4 transition-all duration-200 ${selectedTasks.has(task._id)
                                                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                                            : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                                                            }`}
                                                        style={{ animationDelay: `${index * 50}ms` }}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedTasks.has(task._id)}
                                                                onChange={(e) => handleTaskSelection(task._id, e.target.checked)}
                                                                className="mt-1 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="mb-1 max-w-xs truncate font-medium text-[var(--color-text)]">{task.title}</h3>
                                                                <p className="mb-3 max-w-xs truncate text-sm text-[var(--color-textSecondary)]">{task.description}</p>

                                                                <div className="flex flex-wrap gap-2 mb-3">
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.priority)}`}>
                                                                        {task.priority}
                                                                    </span>
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTaskTypeColor(task.taskType)}`}>
                                                                        {task.taskType}
                                                                    </span>
                                                                    {task.attachments && task.attachments.length > 0 && (
                                                                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/75 px-2 py-1 text-xs font-medium text-[var(--color-textSecondary)]">
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
                                                <div className="py-12 text-center">
                                                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--color-textSecondary)]" />
                                                    <p className="text-[var(--color-text)]">No recurring tasks found.</p>
                                                </div>
                                            ) : (
                                                filteredMasterTasks.map((task, index) => (
                                                    <div
                                                        key={task.taskGroupId}
                                                        onClick={() => handleMasterTaskSelection(task.taskGroupId, !selectedMasterTasks.has(task.taskGroupId))}
                                                        className={`rounded-[24px] border p-4 transition-all duration-200 ${selectedMasterTasks.has(task.taskGroupId)
                                                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                                            : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                                                            }`}
                                                        style={{ animationDelay: `${index * 50}ms` }}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMasterTasks.has(task.taskGroupId)}
                                                                onChange={(e) => handleMasterTaskSelection(task.taskGroupId, e.target.checked)}
                                                                className="mt-1 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="mb-1 max-w-xs truncate font-medium text-[var(--color-text)]">{task.title}</h3>
                                                                <p className="mb-3 max-w-xs truncate text-sm text-[var(--color-textSecondary)]">{task.description}</p>

                                                                <div className="flex flex-wrap gap-2 mb-3">
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.priority)}`}>
                                                                        {task.priority}
                                                                    </span>
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTaskTypeColor(task.taskType)}`}>
                                                                        {task.taskType}
                                                                    </span>
                                                                    {task.attachments && task.attachments.length > 0 && (
                                                                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/75 px-2 py-1 text-xs font-medium text-[var(--color-textSecondary)]">
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
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 shadow-[0_-12px_40px_rgba(15,23,42,0.12)]">

                    {/* ================= MOBILE ONLY ================= */}
                    <div className="sm:hidden space-y-3">

                        {/* Assign To */}
                        <div className="flex items-center gap-2">
                            <label className="whitespace-nowrap text-sm font-semibold text-[var(--color-danger)]">
                                Assign to:
                            </label>

                            <select
                                value={toUser}
                                onChange={(e) => setToUser(e.target.value)}
                                className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
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
                                className="px-3 py-2 text-sm font-medium text-[var(--color-textSecondary)]"
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={handleShiftTasks}
                                    disabled={!toUser || loading}
                                className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium ${!toUser || loading
                                    ? 'cursor-not-allowed bg-[var(--color-border)] text-[var(--color-textSecondary)]'
                                    : 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(14,165,233,0.24)]'
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
                                <CheckCircle2 className="h-5 w-5 text-[var(--color-primary)]" />
                                <span className="font-medium text-[var(--color-text)]">
                                    {totalSelected} task{totalSelected !== 1 ? 's' : ''} selected
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="text-md font-semibold text-[var(--color-danger)]">
                                    Assign to:
                                </label>

                                <select
                                    value={toUser}
                                    onChange={(e) => setToUser(e.target.value)}
                                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-md text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                className="px-4 py-2 text-sm font-medium text-[var(--color-textSecondary)] hover:text-[var(--color-text)]"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleShiftTasks}
                                disabled={!toUser || loading}
                                className={`flex items-center gap-2 rounded-2xl px-6 py-2 font-medium transition-all ${!toUser || loading
                                    ? 'cursor-not-allowed bg-[var(--color-border)] text-[var(--color-textSecondary)]'
                                    : 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(14,165,233,0.24)]'
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
