import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Check, X, Calendar, User, Clock, Paperclip, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, AlertTriangle, RefreshCw, Filter, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';
import { useTheme } from '../contexts/ThemeContext';
import { toast, ToastContainer } from 'react-toastify';
import { useLocation, useNavigate } from 'react-router-dom';
import ViewToggle from '../components/ViewToggle';
import PriorityBadge from '../components/PriorityBadge';

interface Task {
    _id: string;
    title: string;
    description: string;
    taskType: string;
    assignedBy: { username: string; email: string; _id: string };
    assignedTo: { username: string; email: string; _id: string };
    dueDate: string;
    completedAt?: string;
    priority: string;
    completionRemarks?: string;
    completionAttachments?: any[];
    attachments: any[];
    createdAt: string;
}

interface RejectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNoAction: (remarks: string) => void;
    onReassign: (remarks: string) => void;
    task: Task | null;
    loading: boolean;
}

// Helper function to detect mobile devices
const isMobileDevice = () => {
    return window.innerWidth < 768; // md breakpoint in Tailwind
};

// Helper function to get initial view preference
const getInitialViewPreference = (): 'card' | 'table' => {
    const savedView = localStorage.getItem('approvalViewPreference');

    if (savedView === 'card' || savedView === 'table') {
        return savedView;
    }

    return isMobileDevice() ? 'card' : 'table';
};

const RejectionModal: React.FC<RejectionModalProps> = ({ isOpen, onClose, onNoAction, onReassign, task, loading }) => {
    const [remarks, setRemarks] = useState('');

    if (!isOpen || !task) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.22)] transition-all"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    {/* LEFT: Title */}
                    <h3
                        className="flex max-w-[85%] items-center text-xl font-semibold tracking-tight text-[var(--color-text)]"
                        title={task.title}
                    >
                        <AlertTriangle className="mr-2 shrink-0 text-[var(--color-error)]" size={20} />
                        Reject Task:{' '}
                        {task.title.split(' ').length > 4
                            ? task.title.split(' ').slice(0, 4).join(' ') + '...'
                            : task.title}
                    </h3>

                    {/* RIGHT: Close Button */}
                    <button
                        onClick={onClose}
                        className="shrink-0 rounded-full p-1 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>


                <div className="mt-5 space-y-3 text-xs">
                    {/* No Action Required */}
                    <div className="flex gap-3 rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.06)] p-3 transition">
                        <div className="flex-shrink-0 mt-0.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-red-100">
                                <X size={14} className="text-red-600" />
                            </div>
                        </div>

                        <div>
                            <p className="font-semibold text-red-600">
                                No Action Required
                            </p>
                            <p className="mt-0.5 leading-relaxed text-[var(--color-text)]">
                                Rejects this task permanently and closes it.
                                No further action will be taken.
                            </p>
                        </div>
                    </div>

                    {/* Reassign Task */}
                    <div className="flex gap-3 rounded-2xl border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.06)] p-3 transition">
                        <div className="flex-shrink-0 mt-0.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-yellow-100">
                                <User size={14} className="text-yellow-600" />
                            </div>
                        </div>

                        <div>
                            <p className="font-semibold text-yellow-600">
                                Reassign Task
                            </p>
                            <p className="mt-0.5 text-(--color-text) leading-relaxed">
                                Rejects this task and lets you create a new task
                                with corrected or updated details.
                            </p>
                        </div>
                    </div>
                </div>


                <div className="mb-6">
                    <label className="mb-2 block text-sm font-medium text-[var(--color-textSecondary)]">
                        Remarks (Required)
                    </label>
                    <textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Please provide a reason for rejection..."
                        className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                        rows={4}
                        required
                    />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                    <button
                        onClick={() => {
                            if (!remarks.trim()) {
                                toast.error('Please provide remarks for rejection');
                                return;
                            }
                            onNoAction(remarks);
                            setRemarks('');
                        }}
                        disabled={loading || !remarks.trim()}
                        className="flex items-center justify-center space-x-2 rounded-2xl bg-[var(--color-error)] px-4 py-2 text-white transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? (
                            <RefreshCw size={16} className="animate-spin" />
                        ) : (
                            <X size={16} />
                        )}
                        <span>No Action Required</span>
                    </button>
                    <button
                        onClick={() => {
                            if (!remarks.trim()) {
                                toast.error('Please provide remarks for rejection');
                                return;
                            }
                            onReassign(remarks);
                            setRemarks('');
                        }}
                        disabled={loading || !remarks.trim()}
                        className="flex items-center justify-center space-x-2 rounded-2xl bg-amber-500 px-4 py-2 text-white transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? (
                            <RefreshCw size={16} className="animate-spin" />
                        ) : (
                            <User size={16} />
                        )}
                        <span>Reassign Task</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

const ForApproval: React.FC = () => {
    const { user } = useAuth();
    const { theme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'card' | 'table'>(getInitialViewPreference);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [showRejectionModal, setShowRejectionModal] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [approving, setApproving] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<string | null>(null);
    const [showFullDescription, setShowFullDescription] = useState<{ [key: string]: boolean }>({});
    const [showFullTitle, setShowFullTitle] = useState<{ [key: string]: boolean }>({});
    const [showAttachmentsModal, setShowAttachmentsModal] = useState<any[] | null>(null);
    const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
    const [showApproveConfirm, setShowApproveConfirm] = useState(false);
    const [approveTaskId, setApproveTaskId] = useState<string | null>(null);


    const [filter, setFilter] = useState({
        priority: '',
        assignee: '',
        search: ''
    });

    const isMobile = isMobileDevice();

    // Apply filters
    useEffect(() => {
        let filtered = [...tasks];

        if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            filtered = filtered.filter(task =>
                task.title.toLowerCase().includes(searchLower) ||
                task.description.toLowerCase().includes(searchLower) ||
                task.assignedTo.username.toLowerCase().includes(searchLower)
            );
        }

        if (filter.priority) {
            filtered = filtered.filter(task => task.priority === filter.priority);
        }

        if (filter.assignee) {
            filtered = filtered.filter(task => task.assignedTo._id === filter.assignee);
        }

        setFilteredTasks(filtered);
        setCurrentPage(1);
    }, [tasks, filter]);




    // Save view preference
    useEffect(() => {
        localStorage.setItem('approvalViewPreference', view);
    }, [view]);

    const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedTasks = filteredTasks.slice(startIndex, endIndex);

    useEffect(() => {
        if (user?.company?.companyId) {
            fetchPendingApprovalTasks();
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;

        const allowed =
            user.role === 'admin' ||
            user.role === 'superadmin' ||
            (user.role === 'manager' && user.permissions?.canManageApproval) ||
            user.permissions?.canManageApproval === true;

        if (!allowed) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, navigate]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages || 1);
        }
    }, [totalPages]);

    useEffect(() => {
        if (location.state?.highlightTaskId) {
            const task = tasks.find(t => t._id === location.state.highlightTaskId);
            if (task) {
                setSelectedTask(task);
            }
        }
    }, [tasks, location.state]);

    const fetchPendingApprovalTasks = async () => {
        try {
            setLoading(true);
            const isUserLevelApprover = user?.role === 'employee' && user.permissions?.canManageApproval;
            const response = await axios.get(
                `${address}/api/tasks`,
                {
                    params: {
                        status: 'in-progress',
                        requiresApproval: true,
                        taskType: 'one-time',
                        companyId: user?.company?.companyId,
                        ...(isUserLevelApprover ? { assignedBy: user.id } : {}),
                        limit: 10000   // âœ… IMPORTANT
                    }
                }
            );

            setTasks(Array.isArray(response.data.tasks)
                ? response.data.tasks.filter((task: Task) => {
                    const isOneTime = task.taskType === 'one-time';
                    const isUserLevelApprover = user?.role === 'employee' && user.permissions?.canManageApproval;
                    const isSelfAssigned = isUserLevelApprover && task.assignedTo?._id === user.id;
                    return isOneTime && !isSelfAssigned;
                })
                : []);
        } catch (error) {
            toast.error('Error fetching tasks');
            setTasks([]);
        } finally {
            setLoading(false);
        }
    };

    const isSelfAssignedForManager = (task: Task) => {
        if (!user) return false;

        return (
            task.assignedTo?._id === user.id
        );
    };

    const handleApprove = async (taskId: string, remarks?: string) => {
        setApproving(taskId);
        try {
            await axios.post(`${address}/api/tasks/${taskId}/approve`, { remarks });
            toast.success('Task approved successfully');
            fetchPendingApprovalTasks();
        } catch (error) {
            toast.error('Error approving task');
        } finally {
            setApproving(null);
        }
    };

    const handleRejectNoAction = async (taskId: string, remarks: string) => {
        setRejecting(taskId);
        try {
            await axios.post(`${address}/api/tasks/${taskId}/reject`, { action: 'noAction', remarks });
            toast.success('Task marked as no action required');
            setShowRejectionModal(false);
            fetchPendingApprovalTasks();
        } catch (error) {
            toast.error('Error rejecting task');
        } finally {
            setRejecting(null);
        }
    };

    const handleRejectReassign = async (taskId: string, remarks: string) => {
        setRejecting(taskId);
        try {
            const response = await axios.post(`${address}/api/tasks/${taskId}/reject`, { action: 'reassign', remarks });
            toast.success('Task rejected and reassigned');
            setShowRejectionModal(false);

            navigate(`/assign-task?mode=reassign&taskGroupId=${response.data.reassignPayload.taskGroupId}&originalTaskId=${taskId}`, {
                state: { prefillData: response.data.reassignPayload }
            });
        } catch (error) {
            toast.error('Error reassigning task');
        } finally {
            setRejecting(null);
        }
    };

    const toggleDescription = (taskId: string) => {
        setShowFullDescription(prevState => ({
            ...prevState,
            [taskId]: !prevState[taskId]
        }));
    };

    const toggleTitleVisibility = (taskId: string) => {
        setShowFullTitle(prev => ({
            ...prev,
            [taskId]: !prev[taskId],
        }));
    };

    const resetFilters = () => {
        setFilter({ priority: '', assignee: '', search: '' });
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const handleItemsPerPageChange = (newItemsPerPage: number) => {
        setItemsPerPage(newItemsPerPage);
        setCurrentPage(1);
    };

    // Helper to determine if a filename is an image
    const isImage = (filename: string) => {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        const lowercasedFilename = filename.toLowerCase();
        return imageExtensions.some(ext => lowercasedFilename.endsWith(ext));
    };

    // Function to handle file download
    const downloadFile = async (filename: string, originalName: string) => {
        try {
            const response = await fetch(`${address}/uploads/${filename}`);
            const blob = await response.blob();

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = originalName;
            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading file:', error);
            window.open(`${address}/uploads/${filename}`, '_blank');
        }
    };

    const renderCardView = () => (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {paginatedTasks.map((task) => {
                const descriptionIsLong = task.description.length > 150;
                const displayDescription = showFullDescription[task._id] || !descriptionIsLong
                    ? task.description
                    : `${task.description.substring(0, 150)}...`;

                return (
                    <div
                        key={task._id}
                        className="group flex h-full flex-col rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_14px_38px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_56px_rgba(15,23,42,0.12)]"
                    >
                        <div className="flex h-full flex-col p-5 sm:p-6">
                            <div className="flex items-start justify-between mb-4">
                                <h3 className="min-w-0 pr-2 text-lg font-semibold tracking-tight text-[var(--color-text)]">
                                    {showFullTitle[task._id] ? task.title : task.title.length > 70 ? `${task.title.substring(0, 70)}...` : task.title}
                                    {task.title.length > 70 && (
                                        <button
                                            onClick={() => toggleTitleVisibility(task._id)}
                                            className="ml-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                                        >
                                            {showFullTitle[task._id] ? 'Show Less' : 'Show More'}
                                        </button>
                                    )}
                                </h3>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => {
                                            setApproveTaskId(task._id);
                                            setShowApproveConfirm(true);
                                        }}
                                        disabled={
                                            approving === task._id || isSelfAssignedForManager(task)
                                        }
                                        className={`p-2 rounded-lg transition-colors
    ${isSelfAssignedForManager(task)
                                                ? 'opacity-40 cursor-not-allowed'
                                                : 'text-green-600 hover:bg-green-100 hover:scale-110'
                                            }`}
                                        title={
                                            isSelfAssignedForManager(task)
                                                ? 'You cannot approve your own task'
                                                : 'Approve task'
                                        }
                                    >
                                        <Check size={18} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedTask(task);
                                            setShowRejectionModal(true);
                                        }}
                                        disabled={isSelfAssignedForManager(task)}
                                        className={`p-2 rounded-lg transition-colors
    ${isSelfAssignedForManager(task)
                                                ? 'opacity-40 cursor-not-allowed'
                                                : 'text-red-600 hover:bg-red-100 hover:scale-110'
                                            }`}
                                        title={
                                            isSelfAssignedForManager(task)
                                                ? 'You cannot reject your own task'
                                                : 'Reject task'
                                        }
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="mb-4 flex flex-wrap gap-2">
                                <PriorityBadge priority={task.priority} />
                            </div>

                            <p className="mb-4 text-sm leading-6 whitespace-pre-wrap break-words text-[var(--color-textSecondary)]">
                                {displayDescription}
                                {descriptionIsLong && (
                                    <button
                                        onClick={() => toggleDescription(task._id)}
                                        className="ml-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                                    >
                                        {showFullDescription[task._id] ? 'See Less' : 'See More'}
                                    </button>
                                )}
                            </p>

                            <div className="mt-auto space-y-2 text-sm">
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3.5 py-2.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-textSecondary)]">Assigned by</span>
                                    <span className="font-semibold text-[var(--color-text)]">{task.assignedBy?.username || ''}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3.5 py-2.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-textSecondary)]">Assigned to</span>
                                    <span className="font-semibold text-[var(--color-text)]">{task.assignedTo.username}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3.5 py-2.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-textSecondary)]">Due date</span>
                                    <span className="font-semibold text-[var(--color-primary)]">
                                        {new Date(task.dueDate).toLocaleDateString('en-GB', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                        })}
                                    </span>
                                </div>
                                {task.completedAt && (
                                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3.5 py-2.5">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-textSecondary)]">
                                            Completed on
                                        </span>
                                        <span className="font-semibold text-[var(--color-success)]">
                                            {new Date(task.completedAt).toLocaleDateString('en-GB', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                            })}
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3.5 py-2.5">
                                    <span className="flex items-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-textSecondary)]">
                                        <Paperclip size={12} className="mr-1" />
                                        Attachments
                                    </span>
                                    {task.attachments && task.attachments.length > 0 ? (
                                        <button
                                            onClick={() => setShowAttachmentsModal(task.attachments)}
                                            className="flex items-center gap-1 font-semibold text-[var(--color-primary)] hover:underline"
                                        >
                                            <Paperclip size={12} />
                                            View ({task.attachments.length})
                                        </button>
                                    ) : (
                                        <span className="text-[var(--color-textSecondary)]">—</span>
                                    )}
                                </div>
                                {task.completionRemarks && (
                                    <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3.5 py-2.5">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-textSecondary)]">
                                            Completion Remarks
                                        </span>
                                        <span className="max-w-[65%] text-right text-sm font-medium text-[var(--color-success)]">
                                            {task.completionRemarks}
                                        </span>
                                    </div>
                                )}

                                {task.completionAttachments && task.completionAttachments.length > 0 && (
                                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-3.5 py-2.5">
                                        <span className="flex items-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-textSecondary)]">
                                            <Paperclip size={12} className="mr-1" />
                                            Completion Files
                                        </span>
                                        <button
                                            onClick={() => setShowAttachmentsModal(task.completionAttachments ?? [])}
                                            className="flex items-center gap-1 font-semibold text-[var(--color-success)] hover:underline"
                                        >
                                            <FileText size={14} />
                                            View ({task.completionAttachments.length})
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
        <div className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_16px_44px_rgba(15,23,42,0.08)]">
            <div className="overflow-x-auto">
                <table className="min-w-full table-fixed divide-y divide-[var(--color-border)]">
                    <thead className="bg-[var(--color-surface)]">
                        <tr>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Task</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Assigned By</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Assigned To</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Priority</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Due Date</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Completed On</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Attachments</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Remarks</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Completion Files</th>
                            <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                        {paginatedTasks.map((task) => {
                            const descriptionIsLong = task.description.length > 150;
                            const displayDescription = showFullDescription[task._id] || !descriptionIsLong
                                ? task.description
                                : `${task.description.substring(0, 150)}...`;

                            return (
                                <tr key={task._id} className="transition-colors hover:bg-[var(--color-background)]/70">
                                    <td className="px-6 py-5 align-top">
                                        <div className="space-y-1">
                                            <div className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
                                                {showFullTitle[task._id] ? task.title : task.title.length > 100 ? `${task.title.substring(0, 100)}...` : task.title}
                                                {task.title.length > 100 && (
                                                    <button
                                                        onClick={() => toggleTitleVisibility(task._id)}
                                                        className="ml-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                                                    >
                                                        {showFullTitle[task._id] ? 'Show Less' : 'Show More'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="text-sm leading-6 whitespace-pre-wrap break-words text-[var(--color-textSecondary)]">
                                                {displayDescription}
                                                {descriptionIsLong && (
                                                    <button
                                                        onClick={() => toggleDescription(task._id)}
                                                        className="ml-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
                                                    >
                                                        {showFullDescription[task._id] ? 'See Less' : 'See More'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-start gap-2">
                                            <User className="mt-0.5 shrink-0 text-[var(--color-textSecondary)]" size={16} />
                                            <div>
                                                <div className="text-sm font-medium text-[var(--color-text)]">
                                                    {task.assignedBy?.username || '—'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <User className="mr-2 text-[var(--color-primary)]" size={16} />
                                            <div>
                                                <div className="text-sm font-medium text-[var(--color-text)]">{task.assignedTo.username}</div>
                                                <div className="text-sm text-[var(--color-textSecondary)]">{task.assignedTo.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <PriorityBadge priority={task.priority} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <Calendar className="mr-2 text-[var(--color-primary)]" size={16} />
                                            <span className="text-sm font-medium text-[var(--color-text)]">
                                                {new Date(task.dueDate).toLocaleDateString('en-GB', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: 'numeric',
                                                })}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {task.completedAt ? (
                                            <div className="flex items-center">
                                                <Calendar className="mr-2 text-[var(--color-success)]" size={16} />
                                                <span className="text-sm font-medium text-[var(--color-text)]">
                                                    {new Date(task.completedAt).toLocaleDateString('en-GB', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                    })}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-sm italic text-[var(--color-textSecondary)]">
                                                Not completed
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {task.attachments && task.attachments.length > 0 ? (
                                            <button
                                                onClick={() => setShowAttachmentsModal(task.attachments)}
                                                className="inline-flex items-center gap-1 font-medium text-[var(--color-primary)] hover:underline"
                                            >
                                                <Paperclip size={12} />
                                                View ({task.attachments.length})
                                            </button>
                                        ) : (
                                            <span className={theme === 'light' ? 'text-gray-500' : 'text-gray-400'}>—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="max-w-xs truncate text-sm text-[var(--color-textSecondary)]">
                                            {task.completionRemarks || 'No remarks'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {task.completionAttachments && task.completionAttachments.length > 0 ? (
                                            <button
                                                onClick={() => setShowAttachmentsModal(task.completionAttachments ?? [])}
                                                className="inline-flex items-center gap-1 font-medium text-[var(--color-success)] hover:underline"
                                            >
                                                <Paperclip size={12} />
                                                View ({task.completionAttachments.length})
                                            </button>
                                        ) : (
                                            <span className={theme === 'light' ? 'text-gray-500' : 'text-gray-400'}>
                                                —
                                            </span>
                                        )}
                                    </td>

                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        {(() => {
                                            const disabled = isSelfAssignedForManager(task);

                                            return (
                                                <div className="flex items-center gap-3">
                                                    {/* âœ… APPROVE */}
                                                    <button
                                                        onClick={() => {
                                                            setApproveTaskId(task._id);
                                                            setShowApproveConfirm(true);
                                                        }}
                                                        disabled={approving === task._id || disabled}
                                                        title={
                                                            disabled
                                                                ? 'You cannot approve your own task'
                                                                : 'Approve task'
                                                        }
                                                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors
                                                        ${disabled
                                                                ? 'cursor-not-allowed opacity-40'
                                                                : 'text-[var(--color-success)] hover:bg-[rgba(16,185,129,0.08)]'
                                                            }`}
                                                    >
                                                        {approving === task._id ? (
                                                            <RefreshCw size={16} className="animate-spin" />
                                                        ) : (
                                                            <Check size={16} />
                                                        )}
                                                    </button>

                                                    {/* âŒ REJECT */}
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTask(task);
                                                            setShowRejectionModal(true);
                                                        }}
                                                        disabled={disabled}
                                                        title={
                                                            disabled
                                                                ? 'You cannot reject your own task'
                                                                : 'Reject task'
                                                        }
                                                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors
                                                           ${disabled
                                                                ? 'cursor-not-allowed opacity-40'
                                                                : 'text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]'
                                                            }`}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="relative min-h-screen overflow-hidden bg-[var(--color-background)] flex items-center justify-center">
                <div className="relative z-10 text-center">
                    <RefreshCw className="mx-auto mb-4 animate-spin text-[var(--color-primary)]" size={32} />
                    <p className="text-sm text-[var(--color-textSecondary)]">Loading tasks for approval...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen overflow-hidden bg-[var(--color-background)] px-4 py-6 md:px-6 lg:px-8">
            <div className="relative z-10 mx-auto max-w-15xl">
                {/* Header */}
                <div className="mb-6 overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 shadow-[0_16px_44px_rgba(15,23,42,0.08)] sm:px-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
                                Tasks for Approval
                            </h1>
                            <p className="mt-1 text-sm text-[var(--color-textSecondary)]">
                                {filteredTasks.length} of {tasks.length} task(s) found • {user?.role === 'employee' && user.permissions?.canManageApproval ? 'Review tasks assigned by you' : 'Review and approve/reject pending one-time tasks'}
                            </p>
                        </div>
                        {!isMobile && (
                            <div className="shrink-0 lg:pt-1">
                                <ViewToggle view={view} onViewChange={setView} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Filters */}
                <div className="mb-6 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_16px_44px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]" size={20} />
                            <input
                                type="text"
                                placeholder="Search tasks, assignees..."
                                value={filter.search}
                                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2.5 pl-10 pr-4 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] px-4 py-2 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)]"
                            >
                                <Filter size={16} />
                                Filters
                                {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            <button
                                onClick={fetchPendingApprovalTasks}
                                className="flex items-center space-x-2 rounded-2xl border border-[var(--color-border)] px-4 py-2 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)]"
                            >
                                <RefreshCw size={16} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {showFilters && (
                        <div className="grid grid-cols-1 gap-4 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-background)]/70 p-4 md:grid-cols-3">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-[var(--color-textSecondary)]">Priority</label>
                                <select
                                    value={filter.priority}
                                    onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                >
                                    <option value="">All Priorities</option>
                                    <option value="urgent">Urgent</option>
                                    <option value="high">High</option>
                                    <option value="normal">Normal</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-[var(--color-textSecondary)]">Assignee</label>
                                <select
                                    value={filter.assignee}
                                    onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                >
                                    <option value="">All Assignees</option>
                                    {Array.from(
                                        new Map(
                                            tasks.map(t => [
                                                t.assignedTo._id,
                                                { id: t.assignedTo._id, name: t.assignedTo.username }
                                            ])
                                        ).values()
                                    ).map((assignee) => (
                                        <option key={assignee.id} value={assignee.id}>
                                            {assignee.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    onClick={resetFilters}
                                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-4 py-2.5 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)]"
                                >
                                    Clear Filters
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content */}
                {filteredTasks.length === 0 ? (
                    <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] py-16 text-center shadow-[0_16px_44px_rgba(15,23,42,0.08)]">
                        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(14,165,233,0.14),rgba(59,130,246,0.22))]">
                            <Clock size={32} className="text-[var(--color-primary)]" />
                        </div>
                        <h3 className="mb-2 text-xl font-semibold text-[var(--color-text)]">
                            No tasks pending approval
                        </h3>
                        <p className="mb-4 text-[var(--color-textSecondary)]">
                            {tasks.length === 0
                                ? "There are no tasks requiring approval at the moment."
                                : "No tasks match your current filters."}
                        </p>
                        {tasks.length > 0 && (
                            <button
                                onClick={resetFilters}
                                className="rounded-2xl bg-[var(--color-primary)] px-4 py-2 text-white transition-colors hover:opacity-95"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {isMobile || view === 'card' ? renderCardView() : renderTableView()}

                        {/* Pagination */}
                        {filteredTasks.length > itemsPerPage && (
                            <div className="mt-6 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_16px_44px_rgba(15,23,42,0.08)]">
                                <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm text-[var(--color-textSecondary)]">Show:</span>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                                            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 px-2 py-1 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                        <span className="text-sm text-[var(--color-textSecondary)]">per page</span>
                                    </div>

                                    <div className="flex items-center">
                                        <p className="text-sm text-[var(--color-textSecondary)]">
                                            Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                                            <span className="font-medium">{Math.min(endIndex, filteredTasks.length)}</span> of{' '}
                                            <span className="font-medium">{filteredTasks.length}</span> results
                                        </p>
                                    </div>

                                    <div className="flex items-center space-x-1">
                                        <button
                                            onClick={() => handlePageChange(1)}
                                            disabled={currentPage === 1}
                                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
                                            title="First page"
                                        >
                                            <ChevronsLeft size={16} />
                                        </button>

                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
                                            title="Previous page"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

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
                                                        className={`rounded-2xl border px-3 py-2 text-sm font-medium transition-colors ${currentPage === pageNumber
                                                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                                                            : 'border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)] hover:bg-[var(--color-background)]'
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
                                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
                                            title="Next page"
                                        >
                                            <ChevronRight size={16} />
                                        </button>

                                        <button
                                            onClick={() => handlePageChange(totalPages)}
                                            disabled={currentPage === totalPages}
                                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50"
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
            </div>

            {/* Rejection Modal */}
            <RejectionModal
                isOpen={showRejectionModal}
                onClose={() => setShowRejectionModal(false)}
                onNoAction={(remarks) =>
                    selectedTask && handleRejectNoAction(selectedTask._id, remarks)
                }
                onReassign={(remarks) =>
                    selectedTask && handleRejectReassign(selectedTask._id, remarks)
                }
                task={selectedTask}
                loading={rejecting === selectedTask?._id}
            />

            {/* Attachments Modal */}
            {showAttachmentsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md">
                    <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
                        <div className="p-6">
                            <h3 className="mb-4 flex items-center text-lg font-semibold text-[var(--color-text)]">
                                <Paperclip size={20} className="mr-2 text-[var(--color-primary)]" />
                                Task Attachments
                                <span className="ml-2 text-sm font-normal text-[var(--color-textSecondary)]">
                                    ({showAttachmentsModal.length} file{showAttachmentsModal.length !== 1 ? 's' : ''})
                                </span>
                            </h3>
                            {showAttachmentsModal.length > 0 ? (
                                <div className="max-h-96 overflow-y-auto pr-2">
                                    <div className="grid grid-cols-1 gap-3">
                                        {showAttachmentsModal.map((attachment, index) => (
                                            <div key={index} className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center mb-3 sm:mb-0 sm:mr-4 flex-1 min-w-0">
                                                    {isImage(attachment.filename) ? (
                                                        <>
                                                            <img
                                                                src={`${address}/uploads/${attachment.filename}`}
                                                                alt={attachment.originalName}
                                                                className="mr-3 h-16 w-16 cursor-pointer rounded-xl border border-[var(--color-border)] object-cover shadow-sm transition-colors hover:border-[var(--color-primary)]"
                                                                onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)}
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="truncate text-sm font-medium text-[var(--color-text)]" title={attachment.originalName}>
                                                                    {attachment.originalName}
                                                                </div>
                                                                <div className="mt-1 text-xs text-[var(--color-textSecondary)]">
                                                                    Image â€¢ {(attachment.size / 1024).toFixed(1)} KB
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="mr-3 flex h-16 w-16 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/80">
                                                                <FileText size={24} className="text-[var(--color-primary)]" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="truncate text-sm font-medium text-[var(--color-text)]" title={attachment.originalName}>
                                                                    {attachment.originalName}
                                                                </div>
                                                                <div className="mt-1 text-xs text-[var(--color-textSecondary)]">
                                                                    Document â€¢ {(attachment.size / 1024).toFixed(1)} KB
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    {isImage(attachment.filename) && (
                                                        <button
                                                            onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)}
                                                            className="inline-flex items-center gap-1 rounded-2xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-background)]"
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
                                                        className="inline-flex items-center gap-1 rounded-2xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-background)]"
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
                                <div className="py-8 text-center">
                                    <Paperclip size={48} className="mx-auto mb-3 text-[var(--color-textSecondary)]" />
                                    <p className="text-sm text-[var(--color-textSecondary)]">No attachments for this task.</p>
                                </div>
                            )}
                            <div className="mt-6 flex justify-end border-t border-[var(--color-border)] pt-4">
                                <button
                                    onClick={() => setShowAttachmentsModal(null)}
                                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 px-6 py-2 font-medium text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)]"
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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
                    onClick={() => setSelectedImagePreview(null)}
                >
                    <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={selectedImagePreview}
                            alt="Full Screen Preview"
                            className="max-h-[90vh] max-w-full cursor-pointer rounded-[24px] object-contain shadow-[0_24px_70px_rgba(15,23,42,0.35)]"
                            onClick={() => setSelectedImagePreview(null)}
                        />
                        <button
                            onClick={() => setSelectedImagePreview(null)}
                            className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-error)] text-white transition-all hover:opacity-95"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/75 px-4 py-2 text-sm text-white">
                            Click anywhere to close
                        </div>
                    </div>
                </div>
            )}

            <ToastContainer
                position="top-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop={true}
                closeOnClick
                pauseOnHover
                theme={theme}
            />
            {showApproveConfirm && approveTaskId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md"
                    onClick={() => setShowApproveConfirm(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-3 flex items-center text-lg font-semibold text-[var(--color-text)]">
                            <Check className="mr-2 text-[var(--color-success)]" size={20} />
                            Confirm Approval
                        </h3>

                        <p className="mb-6 text-sm text-[var(--color-textSecondary)]">
                            Are you sure you want to approve this task?
                            This action will mark the task as completed.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowApproveConfirm(false)}
                                className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-background)]"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={async () => {
                                    if (!approveTaskId) return;

                                    setShowApproveConfirm(false);
                                    await handleApprove(approveTaskId);
                                    setApproveTaskId(null);
                                }}
                                className="rounded-2xl bg-[var(--color-success)] px-4 py-2 text-white transition-colors hover:opacity-95"
                            >
                                Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ForApproval;


