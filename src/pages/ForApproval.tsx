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
    const { theme } = useTheme();

    if (!isOpen || !task) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`${theme === 'light' ? 'bg-white' : 'bg-gray-800'} rounded-2xl p-6 w-full max-w-md shadow-2xl transform transition-all`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    {/* LEFT: Title */}
                    <h3
                        className={`text-xl font-semibold flex items-center max-w-[85%] ${theme === 'light' ? 'text-gray-900' : 'text-white'
                            }`}
                        title={task.title}
                    >
                        <AlertTriangle className="mr-2 text-red-500 shrink-0" size={20} />
                        Reject Task:{' '}
                        {task.title.split(' ').length > 4
                            ? task.title.split(' ').slice(0, 4).join(' ') + '...'
                            : task.title}
                    </h3>

                    {/* RIGHT: Close Button */}
                    <button
                        onClick={onClose}
                        className={`p-1 rounded-full transition-colors shrink-0 ${theme === 'light'
                                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                            }`}
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>


                <div className="mt-5 space-y-3 text-xs">
                    {/* No Action Required */}
                    <div
                        className={`
      flex gap-3 p-3 rounded-xl border transition
      ${theme === 'light'
                                ? 'bg-red-50 border-red-200'
                                : 'bg-red-900/20 border-red-700/40'
                            }
    `}
                    >
                        <div className="flex-shrink-0 mt-0.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-red-100">
                                <X size={14} className="text-red-600" />
                            </div>
                        </div>

                        <div>
                            <p className="font-semibold text-red-600">
                                No Action Required
                            </p>
                            <p className="mt-0.5 text-(--color-text) leading-relaxed">
                                Rejects this task permanently and closes it.
                                No further action will be taken.
                            </p>
                        </div>
                    </div>

                    {/* Reassign Task */}
                    <div
                        className={`
      flex gap-3 p-3 rounded-xl border transition
      ${theme === 'light'
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-yellow-900/20 border-yellow-700/40'
                            }
    `}
                    >
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
                    <label className={`block text-sm font-medium mb-2 ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>
                        Remarks (Required)
                    </label>
                    <textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Please provide a reason for rejection..."
                        className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${theme === 'light'
                            ? 'border-gray-300 bg-gray-50 text-gray-900'
                            : 'border-gray-600 bg-gray-700 text-white'
                            }`}
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
                        className="px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-colors"
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
                        className="px-4 py-2 rounded-xl bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-colors"
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
            const response = await axios.get(
                `${address}/api/tasks`,
                {
                    params: {
                        status: 'in-progress',
                        requiresApproval: true,
                        companyId: user?.company?.companyId,
                        limit: 10000   // ✅ IMPORTANT
                    }
                }
            );

            setTasks(Array.isArray(response.data.tasks) ? response.data.tasks : []);
        } catch (error) {
            toast.error('Error fetching tasks');
            setTasks([]);
        } finally {
            setLoading(false);
        }
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
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {paginatedTasks.map((task) => {
                const descriptionIsLong = task.description.length > 150;
                const displayDescription = showFullDescription[task._id] || !descriptionIsLong
                    ? task.description
                    : `${task.description.substring(0, 150)}...`;

                return (
                    <div
                        key={task._id}
                        className={`${theme === 'light' ? 'bg-white' : 'bg-gray-800'} rounded-xl shadow-sm border ${theme === 'light' ? 'border-gray-200 hover:border-blue-300' : 'border-gray-700 hover:border-blue-500'} hover:shadow-lg transition-all duration-300 overflow-hidden transform hover:-translate-y-1`}
                    >
                        <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <h3 className={`text-lg font-semibold pr-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                                    {showFullTitle[task._id] ? task.title : task.title.length > 70 ? `${task.title.substring(0, 70)}...` : task.title}
                                    {task.title.length > 70 && (
                                        <button
                                            onClick={() => toggleTitleVisibility(task._id)}
                                            className="ml-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
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
                                        disabled={approving === task._id}
                                        className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors hover:scale-110 disabled:opacity-50"
                                        title="Approve task"
                                    >
                                        {approving === task._id ? (
                                            <RefreshCw size={18} className="animate-spin" />
                                        ) : (
                                            <Check size={18} />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedTask(task);
                                            setShowRejectionModal(true);
                                        }}
                                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors hover:scale-110"
                                        title="Reject task"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-4">
                                <PriorityBadge priority={task.priority} />
                            </div>

                            <p className={`text-sm mb-4 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                                {displayDescription}
                                {descriptionIsLong && (
                                    <button
                                        onClick={() => toggleDescription(task._id)}
                                        className="ml-1 text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
                                    >
                                        {showFullDescription[task._id] ? 'See Less' : 'See More'}
                                    </button>
                                )}
                            </p>

                            <div className="space-y-3 text-sm">
                                <div className={`flex justify-between items-center py-2 px-3 ${theme === 'light' ? 'bg-gray-50' : 'bg-gray-700'} rounded-lg`}>
                                    <span className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'}>Assigned to:</span>
                                    <span className={`font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{task.assignedTo.username}</span>
                                </div>
                                <div className={`flex justify-between items-center py-2 px-3 ${theme === 'light' ? 'bg-blue-50' : 'bg-blue-900/30'} rounded-lg`}>
                                    <span className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'}>Due date:</span>
                                    <span className={`font-medium ${theme === 'light' ? 'text-blue-700' : 'text-blue-400'}`}>
                                        {new Date(task.dueDate).toLocaleDateString('en-GB', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                        })}
                                    </span>
                                </div>
                                {task.completedAt && (
                                    <div className={`flex justify-between items-center py-2 px-3 ${theme === 'light' ? 'bg-green-50' : 'bg-green-900/30'
                                        } rounded-lg`}>
                                        <span className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'}>
                                            Completed on:
                                        </span>
                                        <span className={`font-medium ${theme === 'light' ? 'text-green-700' : 'text-green-400'
                                            }`}>
                                            {new Date(task.completedAt).toLocaleDateString('en-GB', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                            })}
                                        </span>
                                    </div>
                                )}
                                <div className={`flex justify-between items-center py-2 px-3 ${theme === 'light' ? 'bg-gray-50' : 'bg-gray-700'} rounded-lg`}>
                                    <span className={`flex items-center ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                                        <Paperclip size={14} className="mr-1" />
                                        Attachments:
                                    </span>
                                    {task.attachments && task.attachments.length > 0 ? (
                                        <button
                                            onClick={() => setShowAttachmentsModal(task.attachments)}
                                            className="font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                        >
                                            <Paperclip size={12} />
                                            View ({task.attachments.length})
                                        </button>
                                    ) : (
                                        <span className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'}>—</span>
                                    )}
                                </div>
                                {task.completionRemarks && (
                                    <div
                                        className={`flex justify-between items-start py-2 px-3 ${theme === 'light' ? 'bg-green-50' : 'bg-green-900/30'
                                            } rounded-lg`}
                                    >
                                        {/* LEFT */}
                                        <span
                                            className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'
                                                }`}
                                        >
                                            Completion Remarks
                                        </span>

                                        {/* RIGHT */}
                                        <span
                                            className={`text-sm text-right max-w-[65%] ${theme === 'light' ? 'text-green-700' : 'text-green-400'
                                                }`}
                                        >
                                            {task.completionRemarks}
                                        </span>
                                    </div>
                                )}

                                {task.completionAttachments && task.completionAttachments.length > 0 && (
                                    <div
                                        className={`flex justify-between items-center py-2 px-3 ${theme === 'light' ? 'bg-blue-50' : 'bg-blue-900/30'
                                            } rounded-lg`}
                                    >
                                        {/* LEFT */}
                                        <span
                                            className={`flex items-center text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'
                                                }`}
                                        >
                                            <Paperclip size={14} className="mr-1" />
                                            Completion Attachments
                                        </span>

                                        {/* RIGHT */}
                                        <button
                                            onClick={() => setShowAttachmentsModal(task.completionAttachments ?? [])}
                                            className="font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
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
        <div className={`${theme === 'light' ? 'bg-white' : 'bg-gray-800'} rounded-xl shadow-sm border ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'} overflow-hidden`}>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className={theme === 'light' ? 'bg-gray-50' : 'bg-gray-700'}>
                        <tr>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Task</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Assignee</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Priority</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Due Date</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Completed On</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Attachments</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Remarks</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Completion Files</th>
                            <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className={`divide-y ${theme === 'light' ? 'divide-gray-200 bg-white' : 'divide-gray-700 bg-gray-800'}`}>
                        {paginatedTasks.map((task) => {
                            const descriptionIsLong = task.description.length > 150;
                            const displayDescription = showFullDescription[task._id] || !descriptionIsLong
                                ? task.description
                                : `${task.description.substring(0, 150)}...`;

                            return (
                                <tr key={task._id} className={`${theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-gray-700'} transition-colors`}>
                                    <td className="px-6 py-4">
                                        <div>
                                            <div className={`text-sm font-medium mb-1 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                                                {showFullTitle[task._id] ? task.title : task.title.length > 100 ? `${task.title.substring(0, 100)}...` : task.title}
                                                {task.title.length > 100 && (
                                                    <button
                                                        onClick={() => toggleTitleVisibility(task._id)}
                                                        className="ml-1 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                                    >
                                                        {showFullTitle[task._id] ? 'Show Less' : 'Show More'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                                                {displayDescription}
                                                {descriptionIsLong && (
                                                    <button
                                                        onClick={() => toggleDescription(task._id)}
                                                        className="ml-1 text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium"
                                                    >
                                                        {showFullDescription[task._id] ? 'See Less' : 'See More'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <User className="mr-2 text-[var(--color-primary)]" size={16} />
                                            <div>
                                                <div className={`text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{task.assignedTo.username}</div>
                                                <div className={`text-sm ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>{task.assignedTo.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <PriorityBadge priority={task.priority} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <Calendar className="mr-2 text-[var(--color-primary)]" size={16} />
                                            <span className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
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
                                                <Calendar className="mr-2 text-green-500" size={16} />
                                                <span className={`text-sm ${theme === 'light' ? 'text-gray-900' : 'text-white'
                                                    }`}>
                                                    {new Date(task.completedAt).toLocaleDateString('en-GB', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                    })}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className={`text-sm italic ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'
                                                }`}>
                                                —
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {task.attachments && task.attachments.length > 0 ? (
                                            <button
                                                onClick={() => setShowAttachmentsModal(task.attachments)}
                                                className="font-medium text-[var(--color-primary)] flex items-center gap-1"
                                            >
                                                <Paperclip size={12} />
                                                View ({task.attachments.length})
                                            </button>
                                        ) : (
                                            <span className={theme === 'light' ? 'text-gray-500' : 'text-gray-400'}>—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`text-sm max-w-xs truncate ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                                            {task.completionRemarks || 'No remarks'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {task.completionAttachments && task.completionAttachments.length > 0 ? (
                                            <button
                                                onClick={() => setShowAttachmentsModal(task.completionAttachments ?? [])}
                                                className="font-medium text-[var(--color-primary)] flex items-center gap-1"
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
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => {
                                                    setApproveTaskId(task._id);
                                                    setShowApproveConfirm(true);
                                                }}
                                                disabled={approving === task._id}
                                                className="px-3 py-1 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 transition-colors"
                                            >
                                                {approving === task._id ? (
                                                    <RefreshCw size={14} className="animate-spin" />
                                                ) : (
                                                    <Check size={14} />
                                                )}
                                                <span>Approve</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedTask(task);
                                                    setShowRejectionModal(true);
                                                }}
                                                className="px-3 py-1 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 flex items-center space-x-1 transition-colors"
                                            >
                                                <X size={14} />
                                                <span>Reject</span>
                                            </button>
                                        </div>
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
            <div className={`min-h-screen ${theme === 'light' ? 'bg-gray-50' : 'bg-gray-900'} flex items-center justify-center`}>
                <div className="text-center">
                    <RefreshCw className="animate-spin mx-auto mb-4" size={32} />
                    <p className={theme === 'light' ? 'text-gray-600' : 'text-gray-400'}>Loading tasks for approval...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${theme === 'light' ? 'bg-gray-50' : 'bg-gray-900'} p-4 md:p-6`}>
            <div className="max-w-15xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                    <div>
                        <h1 className={`text-2xl md:text-3xl font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                            Tasks for Approval
                        </h1>
                        <p className={`mt-1 text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                            {filteredTasks.length} of {tasks.length} task(s) found • Review and approve/reject pending one-time tasks
                        </p>
                    </div>
                    {!isMobile && (
                        <div className="mt-4 sm:mt-0">
                            <ViewToggle view={view} onViewChange={setView} />
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div className={`${theme === 'light' ? 'bg-white' : 'bg-gray-800'} rounded-xl shadow-sm border ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'} p-4 mb-6`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`} size={20} />
                            <input
                                type="text"
                                placeholder="Search tasks, assignees..."
                                value={filter.search}
                                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                className={`w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${theme === 'light'
                                    ? 'border-gray-300 bg-white text-gray-900'
                                    : 'border-gray-600 bg-gray-700 text-white'
                                    }`}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`px-4 py-2 rounded-xl border transition-colors flex items-center gap-2 ${theme === 'light'
                                    ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                                    }`}
                            >
                                <Filter size={16} />
                                Filters
                                {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            <button
                                onClick={fetchPendingApprovalTasks}
                                className={`px-4 py-2 rounded-xl border transition-colors flex items-center space-x-2 ${theme === 'light'
                                    ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                                    }`}
                            >
                                <RefreshCw size={16} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {showFilters && (
                        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-700 border-gray-600'}`}>
                            <div>
                                <label className={`block text-sm font-medium mb-1 ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>Priority</label>
                                <select
                                    value={filter.priority}
                                    onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${theme === 'light'
                                        ? 'border-gray-300 bg-white text-gray-900'
                                        : 'border-gray-600 bg-gray-700 text-white'
                                        }`}
                                >
                                    <option value="">All Priorities</option>
                                    <option value="urgent">Urgent</option>
                                    <option value="high">High</option>
                                    <option value="normal">Normal</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-1 ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>Assignee</label>
                                <select
                                    value={filter.assignee}
                                    onChange={(e) => setFilter({ ...filter, assignee: e.target.value })}
                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${theme === 'light'
                                        ? 'border-gray-300 bg-white text-gray-900'
                                        : 'border-gray-600 bg-gray-700 text-white'
                                        }`}
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
                                    className={`px-4 py-2 rounded-lg transition-colors ${theme === 'light'
                                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                                        }`}
                                >
                                    Clear Filters
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content */}
                {filteredTasks.length === 0 ? (
                    <div className={`text-center py-16 ${theme === 'light' ? 'bg-white' : 'bg-gray-800'} rounded-xl shadow-sm border ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
                        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center">
                            <Clock size={32} className="text-blue-600" />
                        </div>
                        <h3 className={`text-xl font-semibold mb-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                            No tasks pending approval
                        </h3>
                        <p className={`${theme === 'light' ? 'text-gray-600' : 'text-gray-400'} mb-4`}>
                            {tasks.length === 0
                                ? "There are no tasks requiring approval at the moment."
                                : "No tasks match your current filters."}
                        </p>
                        {tasks.length > 0 && (
                            <button
                                onClick={resetFilters}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
                            <div className={`${theme === 'light' ? 'bg-white' : 'bg-gray-800'} rounded-xl shadow-sm border ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'} p-4 mt-6`}>
                                <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div className="flex items-center space-x-2">
                                        <span className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>Show:</span>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                                            className={`text-sm px-2 py-1 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${theme === 'light'
                                                ? 'border-gray-300 bg-white text-gray-900'
                                                : 'border-gray-600 bg-gray-700 text-white'
                                                }`}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                        <span className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>per page</span>
                                    </div>

                                    <div className="flex items-center">
                                        <p className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                                            Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                                            <span className="font-medium">{Math.min(endIndex, filteredTasks.length)}</span> of{' '}
                                            <span className="font-medium">{filteredTasks.length}</span> results
                                        </p>
                                    </div>

                                    <div className="flex items-center space-x-1">
                                        <button
                                            onClick={() => handlePageChange(1)}
                                            disabled={currentPage === 1}
                                            className={`p-2 text-sm font-medium border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'light'
                                                ? 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                                                : 'text-gray-400 bg-gray-700 border-gray-600 hover:bg-gray-600'
                                                }`}
                                            title="First page"
                                        >
                                            <ChevronsLeft size={16} />
                                        </button>

                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className={`p-2 text-sm font-medium border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'light'
                                                ? 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                                                : 'text-gray-400 bg-gray-700 border-gray-600 hover:bg-gray-600'
                                                }`}
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
                                                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentPage === pageNumber
                                                            ? 'bg-blue-600 text-white'
                                                            : theme === 'light'
                                                                ? 'text-gray-600 bg-white border border-gray-300 hover:bg-gray-50'
                                                                : 'text-gray-400 bg-gray-700 border border-gray-600 hover:bg-gray-600'
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
                                            className={`p-2 text-sm font-medium border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'light'
                                                ? 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                                                : 'text-gray-400 bg-gray-700 border-gray-600 hover:bg-gray-600'
                                                }`}
                                            title="Next page"
                                        >
                                            <ChevronRight size={16} />
                                        </button>

                                        <button
                                            onClick={() => handlePageChange(totalPages)}
                                            disabled={currentPage === totalPages}
                                            className={`p-2 text-sm font-medium border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'light'
                                                ? 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                                                : 'text-gray-400 bg-gray-700 border-gray-600 hover:bg-gray-600'
                                                }`}
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className={`rounded-xl max-w-2xl w-full shadow-2xl transform transition-all max-h-[80vh] overflow-hidden ${theme === 'light' ? 'bg-white' : 'bg-gray-800'}`}>
                        <div className="p-6">
                            <h3 className={`text-lg font-semibold mb-4 flex items-center ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                                <Paperclip size={20} className="mr-2" />
                                Task Attachments
                                <span className={`ml-2 text-sm font-normal ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                                    ({showAttachmentsModal.length} file{showAttachmentsModal.length !== 1 ? 's' : ''})
                                </span>
                            </h3>
                            {showAttachmentsModal.length > 0 ? (
                                <div className="max-h-96 overflow-y-auto pr-2">
                                    <div className="grid grid-cols-1 gap-3">
                                        {showAttachmentsModal.map((attachment, index) => (
                                            <div key={index} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border transition-colors ${theme === 'light'
                                                ? 'bg-gray-50 border-gray-200 hover:border-blue-300'
                                                : 'bg-gray-700 border-gray-600 hover:border-blue-500'
                                                }`}>
                                                <div className="flex items-center mb-3 sm:mb-0 sm:mr-4 flex-1 min-w-0">
                                                    {isImage(attachment.filename) ? (
                                                        <>
                                                            <img
                                                                src={`${address}/uploads/${attachment.filename}`}
                                                                alt={attachment.originalName}
                                                                className={`w-16 h-16 object-cover rounded-md mr-3 border cursor-pointer hover:border-blue-500 transition-colors shadow-sm ${theme === 'light' ? 'border-gray-300' : 'border-gray-600'}`}
                                                                onClick={() => setSelectedImagePreview(`${address}/uploads/${attachment.filename}`)}
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`text-sm font-medium truncate ${theme === 'light' ? 'text-gray-900' : 'text-white'}`} title={attachment.originalName}>
                                                                    {attachment.originalName}
                                                                </div>
                                                                <div className={`text-xs mt-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                                                                    Image • {(attachment.size / 1024).toFixed(1)} KB
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className={`w-16 h-16 rounded-md mr-3 flex items-center justify-center border ${theme === 'light' ? 'bg-blue-100 border-gray-300' : 'bg-blue-900/30 border-gray-600'}`}>
                                                                <FileText size={24} className="text-blue-600" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`text-sm font-medium truncate ${theme === 'light' ? 'text-gray-900' : 'text-white'}`} title={attachment.originalName}>
                                                                    {attachment.originalName}
                                                                </div>
                                                                <div className={`text-xs mt-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
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
                                                            className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
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
                                                        className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
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
                                    <Paperclip size={48} className={`mx-auto mb-3 ${theme === 'light' ? 'text-gray-400' : 'text-gray-600'}`} />
                                    <p className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>No attachments for this task.</p>
                                </div>
                            )}
                            <div className={`mt-6 flex justify-end border-t pt-4 ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
                                <button
                                    onClick={() => setShowAttachmentsModal(null)}
                                    className={`py-2 px-6 rounded-lg font-medium transition-colors border ${theme === 'light'
                                        ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                                        }`}
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
                    onClick={() => setSelectedImagePreview(null)}
                >
                    <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={selectedImagePreview}
                            alt="Full Screen Preview"
                            className="max-w-full max-h-[90vh] object-contain cursor-pointer rounded-lg shadow-2xl"
                            onClick={() => setSelectedImagePreview(null)}
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
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
                    onClick={() => setShowApproveConfirm(false)}
                >
                    <div
                        className={`${theme === 'light' ? 'bg-white' : 'bg-gray-800'} rounded-2xl p-6 w-full max-w-sm shadow-2xl`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className={`text-lg font-semibold mb-3 flex items-center ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                            <Check className="mr-2 text-green-500" size={20} />
                            Confirm Approval
                        </h3>

                        <p className={`text-sm mb-6 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                            Are you sure you want to approve this task?
                            This action will mark the task as completed.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowApproveConfirm(false)}
                                className={`px-4 py-2 rounded-xl border transition-colors ${theme === 'light'
                                    ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                                    }`}
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
                                className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors"
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