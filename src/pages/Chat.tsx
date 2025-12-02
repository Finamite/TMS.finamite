import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    MessageCircle,
    Send,
    Paperclip,
    X,
    Search,
    Trash2,
    Tag,
    FileText,
    Image,
    Download,
    Clock,
    CheckCircle,
    Check,
    AlertCircle,
    Users,
    Plus,
    MoreVertical,
    Calendar,
    User,
    Loader2,
    Archive, File, FileSpreadsheet, FileArchive
} from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';

interface User {
    _id: string;
    username: string;
    email: string;
    role: string;
}

interface Chat {
    _id: string;
    participants: Array<{
        userId: string;
        username: string;
        role: string;
    }>;
    chatType: string;
    lastMessage?: Message;
    lastMessageAt: string;
    unreadCount?: number;
    typing?: {
        userId: string,
        lastUpdated: string
    };
    isTyping?: boolean;
}

interface Message {
    _id: string;
    senderId: User;
    senderInfo: {
        username: string;
        role: string;
    };
    content: string;
    messageType: 'text' | 'file' | 'task-tag';
    attachments: Array<{
        filename: string;
        originalName: string;
        mimetype: string;
        size: number;
    }>;
    taggedTask?: {
        taskId: string;
        taskTitle: string;
        taskType: string;
        dueDate: string;
    };
    replyTo?: {
        messageId: string;
        content: string;
        senderName: string;
        messageType: string;
    };
    isDeleted: boolean;
    createdAt: string;
    readBy: Array<{
        userId: string;
        readAt: string;
    }>;
}

interface Task {
    _id: string;
    title: string;
    description: string;
    dueDate: string;
    priority: string;
    taskType?: string;
    isOverdue?: boolean;
    status?: string;
    assignedTo?: {
        _id: string;
        username: string;
    };
}


const Chat: React.FC = () => {
    const { user } = useAuth();
    const currentRole = user?.role ?? "";
    const currentUserId = user?.id ?? "";
    const [chats, setChats] = useState<Chat[]>([]);
    const [activeChat, setActiveChat] = useState<Chat | null>(null);
    // quick local id for instant UI highlight (avoid waiting for full chat load)
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [allUsers, setAllUsers] = useState<User[]>([]);

    // File upload states
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
    const [showFilePreview, setShowFilePreview] = useState(false);

    // Task tagging states
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [taskSearchTerm, setTaskSearchTerm] = useState('');
    const [taskFilter, setTaskFilter] = useState({
        type: 'all',
        status: 'all',
        assignedTo: 'all'
    });

    // UI states
    const [showImagePreview, setShowImagePreview] = useState<string | null>(null);
    const [otherTyping, setOtherTyping] = useState(false);
    const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [showChatOptions, setShowChatOptions] = useState(false);
    const [autoRefresh] = useState(true);
    const [highlightId, setHighlightId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<any>(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [userSearch, setUserSearch] = useState("");
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
    const [confirmText, setConfirmText] = useState("");
    const [replyTo, setReplyTo] = useState<Message | null>(null);

    const isAdmin = user?.role === 'admin' || user?.role === 'manager';

    // Auto-refresh messages every 2 seconds
    useEffect(() => {
        if (autoRefresh && activeChat) {
            refreshIntervalRef.current = setInterval(() => {
                silentRefreshMessages();
            }, 2000);
        }

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [activeChat, autoRefresh]);

    const silentRefreshMessages = useCallback(async () => {
        if (!activeChat || loadingMessages) return;

        try {
            const response = await axios.get(`${address}/api/chat/${activeChat._id}/messages`, {
                params: { limit: 50 }
            });

            setMessages(prev => {
                if (prev.length === response.data.messages.length) return prev;
                return response.data.messages;
            });

            // Mark messages as read silently
            await axios.put(`${address}/api/chat/${activeChat._id}/messages/read`, {
                userId: user?.id
            });
        } catch (error) {
            console.error('Silent refresh error:', error);
        }
    }, [activeChat, loadingMessages, user?.id]);

    useEffect(() => {
        initializeChat();
        loadAllUsers();
    }, [user]);

    useEffect(() => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (activeChat) {
            loadMessages().then(() => {
                if (messagesContainerRef.current) {
                    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                }
            });
            markMessagesAsRead();
        }
    }, [activeChat]);

    useEffect(() => {
        if (showTaskModal) {
            loadAllTasks();
        }
    }, [showTaskModal]);

    useEffect(() => {
        filterTasks();
    }, [allTasks, taskSearchTerm, taskFilter]);

    // 🔄 AUTO REFRESH CHAT LIST EVERY 2 SECONDS
    useEffect(() => {
        if (!user) return;

        const interval = setInterval(() => {
            axios
                .get(`${address}/api/chat/user/${user.id}?companyId=${user.company?.companyId}`)
                .then((res) => {
                    setChats((prev) => {
                        const newChats = res.data;

                        // Add typing detection for each chat
                        newChats.forEach((c: { typing: any; isTyping: any; }) => {
                            const typingInfo = c.typing;

                            c.isTyping =
                                typingInfo &&
                                typingInfo.userId &&
                                String(typingInfo.userId) !== String(currentUserId);
                        });

                        const isEqual = (a: any[], b: any[]) => {
                            if (a.length !== b.length) return false;
                            for (let i = 0; i < a.length; i++) {
                                if (a[i]._id !== b[i]._id) return false;
                                if (a[i].lastMessageAt !== b[i].lastMessageAt) return false;
                            }
                            return true;
                        };

                        if (isEqual(prev, newChats)) {
                            return prev;
                        }

                        return newChats;
                    });
                })
                .catch((err) => console.error("Chat list refresh error:", err));
        }, 2000);

        return () => clearInterval(interval);
    }, [user]);


    // 🔄 SILENT AUTO REFRESH MESSAGES EVERY 2 SECONDS
    useEffect(() => {
        if (!activeChat) return;

        const interval = setInterval(() => {
            axios.get(`${address}/api/chat/${activeChat._id}`)
                .then(res => {
                    const typingInfo = res.data.typing;

                    setOtherTyping(
                        typingInfo &&
                        typingInfo.userId &&
                        String(typingInfo.userId) !== String(currentUserId)
                    );
                })
                .catch(() => { });

        }, 1500);

        return () => clearInterval(interval);
    }, [activeChat]);

    const initializeChat = async () => {
        if (!user) return;

        try {
            setLoading(true);

            // Get all chats for user
            const chatsResponse = await axios.get(`${address}/api/chat/user/${user.id}`, {
                params: {
                    companyId: user.company?.companyId
                }
            });

            const userChats = chatsResponse.data;
            setChats(userChats);
            setActiveChat(null);
            setActiveChatId(null);
            setActiveChatId(null);

        } catch (error) {
            console.error('Error initializing chat:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadAllUsers = async () => {
        if (!user) return;

        try {
            const res = await axios.get(`${address}/api/users`, {
                params: { companyId: user.company?.companyId }
            });

            setAllUsers(res.data);
        } catch (err) {
            console.error("Failed to load users", err);
        }
    };


    const sendTypingSignal = () => {
        if (!activeChat || !user) return;

        axios.post(`${address}/api/chat/${activeChat._id}/typing`, {
            userId: user.id
        });

        clearTimeout(typingTimeoutRef.current);

        typingTimeoutRef.current = setTimeout(() => {
            axios.post(`${address}/api/chat/${activeChat._id}/typing-stop`);
        }, 1500);
    };


    const loadAllTasks = async () => {
        if (!user || !activeChat) return;

        try {
            // 1️⃣ DETERMINE WHOSE TASKS TO LOAD
            const employee = activeChat.participants.find(
                (p: any) => p.role === "employee"
            );

            let chatUserId = employee ? employee.userId : null;

            const params: any = {
                companyId: user.company?.companyId,
            };

            if (chatUserId) {
                params.userId = chatUserId;
            }

            // 2️⃣ FETCH TASKS
            const allPending = await axios.get(
                `${address}/api/tasks/pending`,
                { params }
            );

            const allRecurring = await axios.get(
                `${address}/api/tasks/pending-recurring`,
                { params }
            );

            let tasks = [...allPending.data, ...allRecurring.data];

            // 3️⃣ FILTER + OVERDUE SUPPORT
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const next5 = new Date();
            next5.setDate(today.getDate() + 5);
            next5.setHours(23, 59, 59, 999);

            const filtered = tasks.map((t: any) => {
                const due = new Date(t.dueDate);
                due.setHours(0, 0, 0, 0);

                t.isOverdue = t.status === "pending" && due < today;
                return t;
            }).filter((t: any) => {
                const due = new Date(t.dueDate);
                due.setHours(0, 0, 0, 0);

                // ALWAYS SHOW OVERDUE
                if (t.isOverdue) return true;

                // ONE-TIME
                if (t.taskType === "one-time" || !t.taskType) {
                    return t.status === "pending";
                }

                // DAILY — ONLY TODAY
                if (t.taskType === "daily") {
                    return (
                        t.status === "pending" &&
                        due.getTime() === today.getTime()
                    );
                }

                // WEEKLY / MONTHLY / QUARTERLY / YEARLY
                if (["weekly", "monthly", "quarterly", "yearly"].includes(t.taskType)) {
                    return (
                        t.status === "pending" &&
                        due >= today &&
                        due <= next5
                    );
                }

                return false;
            });

            // 4️⃣ REMOVE DUPLICATE TASKS
            const uniqueTasks = Array.from(
                new Map(filtered.map((t: any) => [t._id, t])).values()
            );

            setAllTasks(uniqueTasks);

        } catch (error) {
            console.error("Error loading tasks:", error);
        }
    };



    const filterTasks = () => {
        let filtered = allTasks;

        // Search Filter
        if (taskSearchTerm.trim()) {
            filtered = filtered.filter(task =>
                task.title.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
                task.description.toLowerCase().includes(taskSearchTerm.toLowerCase())
            );
        }

        // Type Filter
        if (taskFilter.type !== 'all') {
            filtered = filtered.filter(task => {
                if (taskFilter.type === 'one-time') {
                    return task.taskType === 'one-time' || !task.taskType;
                }
                return task.taskType === taskFilter.type;
            });
        }

        // Status Filter (NOW WITH OVERDUE)
        if (taskFilter.status !== 'all') {
            if (taskFilter.status === 'overdue') {
                filtered = filtered.filter(task => task.isOverdue);
            } else {
                filtered = filtered.filter(task => task.status === taskFilter.status);
            }
        }

        // Assigned To Filter
        if (taskFilter.assignedTo !== 'all') {
            filtered = filtered.filter(task =>
                task.assignedTo && task.assignedTo._id === taskFilter.assignedTo
            );
        }

        setFilteredTasks(filtered);
    };


    const startChatWithUser = async (targetUserId: string) => {
        if (!user || !targetUserId) return;

        try {
            const res = await axios.post(`${address}/api/chat/create-chat`, {
                adminId: currentUserId,
                userId: targetUserId,
                companyId: user.company?.companyId
            });

            const newChat = res.data;

            setChats(prev => {
                const exists = prev.some(c => c._id === newChat._id);
                if (exists) return prev;
                return [newChat, ...prev];
            });

            setActiveChat(newChat);
            setActiveChatId(newChat._id);

        } catch (err) {
            console.error(err);
        }
    };

    const loadMessages = async (searchQuery?: string) => {
        if (!activeChat) return;

        try {
            setLoadingMessages(true);

            const params: any = { limit: 50 };
            if (searchQuery) {
                params.search = searchQuery;
            }

            const response = await axios.get(`${address}/api/chat/${activeChat._id}/messages`, { params });

            if (searchQuery) {
                setSearchResults(response.data.messages);
            } else {
                setMessages(response.data.messages);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        } finally {
            setLoadingMessages(false);
        }
    };

    const sendMessage = async () => {
        if ((!newMessage.trim() && !selectedFiles && !selectedTask) || !activeChat || !user) {
            return;
        }

        try {
            const formData = new FormData();
            formData.append('senderId', user.id);
            formData.append('content', newMessage);

            if (replyTo) {
                formData.append('replyToMessageId', String(replyTo._id));
            }

            if (selectedTask) {
                formData.append('taggedTaskId', selectedTask._id);
                formData.append('taggedTaskType', selectedTask.taskType || 'one-time');
            }

            if (selectedFiles) {
                Array.from(selectedFiles).forEach(file => {
                    formData.append('attachments', file);
                });
            }

            const response = await axios.post(`${address}/api/chat/${activeChat._id}/messages`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            // Add new message to state
            setMessages(prev => [...prev, response.data]);

            // Clear form
            setNewMessage('');
            setSelectedFiles(null);
            setSelectedTask(null);
            setShowFilePreview(false);
            setShowTaskModal(false);
            setReplyTo(null);

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }

            // Update chat in chats list
            setChats(prev => prev.map(chat =>
                chat._id === activeChat._id
                    ? { ...chat, lastMessage: response.data, lastMessageAt: new Date().toISOString() }
                    : chat
            ));

        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            // Check file size (100KB limit)
            const oversizedFiles = Array.from(files).filter(file => file.size > 100 * 1024);
            if (oversizedFiles.length > 0) {
                alert(`File size limit is 100KB. The following files are too large: ${oversizedFiles.map(f => f.name).join(', ')}`);
                return;
            }

            setSelectedFiles(files);
            setShowFilePreview(true);
        }
    };

    const removeFile = (index: number) => {
        if (selectedFiles) {
            const dt = new DataTransfer();
            Array.from(selectedFiles).forEach((file, i) => {
                if (i !== index) dt.items.add(file);
            });
            setSelectedFiles(dt.files.length > 0 ? dt.files : null);

            if (dt.files.length === 0) {
                setShowFilePreview(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        }
    };

    const deleteMessage = (messageId: string) => {
        if (!isAdmin) return;

        setConfirmText("Are you sure you want to delete this message?");
        setConfirmAction(() => async () => {
            try {
                await axios.delete(`${address}/api/chat/messages/${messageId}`, {
                    data: { deletedBy: user?.id }
                });

                setMessages(prev => prev.filter(msg => msg._id !== messageId));
            } catch (error) {
                console.error("Error deleting message:", error);
            }
        });

        setShowConfirmModal(true);
    };

    const deleteSelectedMessages = async () => {
        if (!isAdmin || selectedMessages.length === 0) return;

        if (!confirm(`Are you sure you want to delete ${selectedMessages.length} selected messages?`)) {
            return;
        }

        try {
            await Promise.all(
                selectedMessages.map(messageId =>
                    axios.delete(`${address}/api/chat/messages/${messageId}`, {
                        data: { deletedBy: user?.id }
                    })
                )
            );

            // Remove messages from state
            setMessages(prev => prev.filter(msg => !selectedMessages.includes(msg._id)));
            setSelectedMessages([]);
            setIsSelectionMode(false);
        } catch (error) {
            console.error('Error deleting messages:', error);
            alert('Failed to delete messages.');
        }
    };

    const deleteChat = async () => {
        if (!activeChat || !isAdmin) return;

        setConfirmText("Are you sure you want to delete this entire chat? This action cannot be undone.");
        setConfirmAction(() => async () => {
            try {
                await axios.delete(`${address}/api/chat/${activeChat._id}`, {
                    data: { deletedBy: user?.id }
                });

                setChats(prev => prev.filter(chat => chat._id !== activeChat._id));
                setActiveChat(null);
                setActiveChatId(null);
                setMessages([]);

            } catch (error) {
                console.error("Error deleting chat:", error);
            }
        });

        setShowConfirmModal(true);
    };

    const searchMessages = async (query: string) => {
        if (!query.trim()) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        await loadMessages(query);
    };

    const markMessagesAsRead = async () => {
        if (!activeChat || !user) return;

        try {
            await axios.put(`${address}/api/chat/${activeChat._id}/messages/read`, {
                userId: user.id
            });
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    };

    const formatFileSize = (bytes: number) => {
        return `${(bytes / 1024).toFixed(1)} KB`;
    };


    const downloadFile = async (filename: string, originalName: string) => {
        try {
            const response = await fetch(`${address}/uploads/chat/${filename}`);
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
            alert('Failed to download file.');
        }
    };

    const toggleMessageSelection = (messageId: string) => {
        setSelectedMessages(prev =>
            prev.includes(messageId)
                ? prev.filter(id => id !== messageId)
                : [...prev, messageId]
        );
    };

    const getMessageStatus = (message: Message) => {
        const readCount = message.readBy?.length || 0;
        if (message.senderId._id !== user?.id) return null;

        if (readCount > 1) { // More than just sender
            return <CheckCircle size={12} className="ml-1 text-green-300" />;
        }
        return <Check size={12} className="ml-1 text-[var(--color-textSecondary)]" />;
    };

    const createSupportChat = async () => {
        if (!user) return;

        try {
            const chatResponse = await axios.post(`${address}/api/chat/support-chat`, {
                userId: user.id,
                companyId: user.company?.companyId
            });

            const newChat = chatResponse.data;

            setChats(prev => {
                const exists = prev.some(c => c._id === newChat._id);
                if (exists) return prev;
                return [newChat, ...prev];
            });

            setActiveChat(newChat);
            setActiveChatId(newChat._id);

        } catch (error) {
            console.error('Error creating chat:', error);
            alert("Unable to start chat. Try again.");
        }
    };

    const renderMessage = (message: Message) => {
        const isOwn = message.senderId._id === user?.id;
        const isDeleted = message.isDeleted;
        const isSelected = selectedMessages.includes(message._id);


        return (
            <div
                id={message._id}
                key={message._id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-4 group`}
                onClick={() => {
                    if (isSelectionMode && isAdmin) toggleMessageSelection(message._id);
                }}
            >
                <div className={`max-w-[70%] ${isOwn ? "order-2" : "order-1"}`}>
                    {/* Selection Mode Checkbox */}
                    <div className="relative">

                        {/* Reply Button (shows on hover) */}
                        {!isSelectionMode && !message.isDeleted && (
                            <button
                                onClick={() => setReplyTo(message)}
                                className={`absolute top-2 opacity-0 group-hover:opacity-100 text-[var(--color-textSecondary)] hover:text-blue-600 transition
    ${isOwn ? "-left-8" : "-right-8"}`}
                                title="Reply"
                            >
                                ↩
                            </button>
                        )}

                        <div
                            className={`rounded-2xl px-4 py-3 transition
    ${isOwn ? 'bg-blue-600 text-white' : 'bg-[var(--color-surfacechat)] text-[var(--color-text)]'}
    ${highlightId === message._id ? "ring-4 ring-yellow-300" : ""}
    ${isDeleted ? 'opacity-50' : ''}
    ${isSelected
                                    ? isOwn
                                        ? 'ring-2 ring-red-500'
                                        : 'ring-2 ring-red-500'
                                    : ''}
  `}
                        >
                            {/* Sender info for others' messages */}
                            {!isOwn && (
                                <div className="flex items-center mb-2">
                                    <div
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mr-2 ${message.senderInfo.role === 'admin' ? 'bg-red-500 text-white' :
                                            message.senderInfo.role === 'manager' ? 'bg-purple-500 text-white' :
                                                'bg-gray-500 text-white'
                                            }`}
                                    >
                                        {message.senderInfo.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <span className="text-xs font-medium text-[var(--color-text)]">
                                            {message.senderInfo.username}
                                        </span>
                                        <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                                            {message.senderInfo.role}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Tagged Task */}
                            {message.taggedTask && (
                                <div className={`mb-2 p-2 rounded-lg border-l-4 ${isOwn
                                    ? 'bg-white/20 border-white/50'
                                    : 'bg-blue-50 border-blue-400'
                                    }`}>
                                    <div className="flex items-center mb-1">
                                        <Tag size={14} className="mr-1" />
                                        <span className="text-xs font-medium">Tagged Task</span>
                                    </div>
                                    <div className="text-sm font-medium mb-1">{message.taggedTask.taskTitle}</div>
                                    <div className="text-xs opacity-80">
                                        <span className="inline-flex items-center mr-2">
                                            <Clock size={10} className="mr-1" />
                                            Due: {new Date(message.taggedTask.dueDate).toLocaleDateString()}
                                        </span>
                                        <span className="bg-black/20 px-1 py-0.5 rounded text-xs">
                                            {message.taggedTask.taskType}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {message.replyTo && (
                                <div
                                    className={`p-2 mb-2 rounded border-l-4 cursor-pointer
      ${isOwn ? 'border-white bg-white/20' : 'border-blue-400 bg-blue-100'}
    `}
                                    onClick={() => {
                                        const id = message.replyTo?.messageId;
                                        if (!id) return; // <-- SAFETY FIX

                                        const el = document.getElementById(id);
                                        if (el) {
                                            el.scrollIntoView({ behavior: "smooth", block: "center" });

                                            // highlight effect
                                            setHighlightId(id);
                                            setTimeout(() => setHighlightId(null), 1200);
                                        }
                                    }}
                                >
                                    <div className="text-xs font-semibold opacity-80">
                                        {message.replyTo.senderName}
                                    </div>
                                    <div className="text-xs truncate opacity-70">
                                        {message.replyTo.messageType === "file" ? "📎 Attachment" : message.replyTo.content}
                                    </div>
                                </div>
                            )}

                            {/* Message Content */}
                            {!isDeleted ? (
                                <>
                                    {message.content && (
                                        <div className="mb-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                                            {message.content}
                                        </div>
                                    )}

                                    {/* Attachments */}
                                    {message.attachments?.length > 0 && (
                                        <div className="flex flex-wrap gap-3 mt-2">

                                            {message.attachments.map((file, index) => {
                                                const fileUrl = `${address}/uploads/chat/${file.filename}`;
                                                const isImage = file.mimetype.startsWith("image/");
                                                const name = file.originalName.toLowerCase();
                                                const type = file.mimetype.toLowerCase();
                                                const sizeKB = (file.size / 1024).toFixed(1) + " KB";

                                                const getLucideIcon = () => {
                                                    if (type.includes("pdf") || name.endsWith(".pdf"))
                                                        return <FileText size={20} className="text-red-600" />;

                                                    if (
                                                        type.includes("spreadsheet") ||
                                                        type.includes("excel") ||
                                                        name.endsWith(".xlsx") ||
                                                        name.endsWith(".xls") ||
                                                        name.endsWith(".csv")
                                                    )
                                                        return <FileSpreadsheet size={20} className="text-green-600" />;

                                                    if (
                                                        type.includes("word") ||
                                                        type.includes("msword") ||
                                                        name.endsWith(".doc") ||
                                                        name.endsWith(".docx")
                                                    )
                                                        return <FileText size={20} className="text-blue-600" />;

                                                    if (name.endsWith(".txt"))
                                                        return <FileText size={20} className="text-gray-700" />;

                                                    if (name.endsWith(".zip") || name.endsWith(".rar"))
                                                        return <FileArchive size={20} className="text-yellow-600" />;

                                                    return <File size={20} className="text-[var(--color-textSecondary)]" />;
                                                };

                                                return (
                                                    <div
                                                        key={index}
                                                        className="flex flex-col items-center text-center"
                                                        style={{ width: isImage ? "240px" : "160px" }}
                                                    >
                                                        {/* IMAGE PREVIEW */}
                                                        {isImage ? (
                                                            <img
                                                                src={fileUrl}
                                                                alt={file.originalName}
                                                                className="w-[240px] h-[160px] object-cover rounded border cursor-pointer"
                                                                onClick={() => setShowImagePreview(fileUrl)}
                                                            />
                                                        ) : (
                                                            <div
                                                                className="w-[48px] h-[40px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded flex items-center justify-center cursor-pointer"
                                                                onClick={() => window.open(fileUrl, "_blank")}
                                                            >
                                                                {getLucideIcon()}
                                                            </div>
                                                        )}

                                                        {/* FILE NAME */}
                                                        <p
                                                            className="text-[10px] mt-1 truncate w-full text-white/90"
                                                            title={file.originalName}
                                                        >
                                                            {file.originalName}
                                                        </p>

                                                        <div className="flex items-center gap-2 text-white/80 text-[9px] mt-1">
                                                            <span>{sizeKB}</span>

                                                            <button
                                                                className="text-blue-300 hover:text-blue-500"
                                                                onClick={() => downloadFile(file.filename, file.originalName)}
                                                                title="Download File"
                                                            >
                                                                <Download size={12} />
                                                            </button>
                                                        </div>


                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                </>
                            ) : (
                                <div className="text-xs italic opacity-75">
                                    This message was deleted
                                </div>
                            )}

                            {/* Message footer */}
                            <div className="flex items-center justify-between mt-2 text-xs opacity-75">
                                <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                                <div className="flex items-center space-x-1">
                                    {/* Read indicators */}
                                    {getMessageStatus(message)}

                                    {/* Delete button for admin/manager */}
                                    {isAdmin && !isDeleted && !isSelectionMode && (
                                        <button
                                            onClick={() => deleteMessage(message._id)}
                                            className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded"
                                            title="Delete message"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-[var(--color-textSecondary)]">Loading chat...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col sm:flex-row bg-[var(--color-background)] text-[var(--color-text)]">
            {/* Chat List Sidebar */}
            <div className={`${activeChat ? "hidden sm:flex" : "flex"} w-full sm:w-80 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex-col`}>
                {/* Fixed Header */}
                <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-[var(--color-text)]">Messages</h2>
                        <button
                            onClick={() => {
                                if (currentRole === "employee") {
                                    createSupportChat(); // employee goes direct
                                } else {
                                    setShowUserModal(true); // admin/manager opens modal
                                }
                            }}
                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* User Selection for Admins */}
                    {isAdmin && (
                        <div className="mt-3">
                            {/* Search Input */}
                            <div className="relative mb-2">
                                <Search
                                    size={16}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]"
                                />
                                <input
                                    type="text"
                                    placeholder="Search user..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat List */}
                <div className="flex-1 overflow-y-auto">
                    {chats.map(chat => (
                        <div
                            key={chat._id}
                            onClick={() => {
                                // instant UI highlight
                                setActiveChatId(chat._id);
                                setActiveChat(chat);

                                // reset unread count instantly in UI
                                setChats(prev =>
                                    prev.map(c =>
                                        c._id === chat._id ? { ...c, unreadCount: 0 } : c
                                    )
                                );
                            }}
                            className={`p-4 border-b border-[var(--color-border)] cursor-pointer transition-colors ${(activeChatId === chat._id) ? 'bg-[var(--color-chat)] text-white dark:bg-blue-500 dark:text-white border-r-2 border-r-blue-600' : ''}`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center">
                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                        <Users size={16} className="text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-[var(--color-text)] text-sm dark:text-white">
                                            {chat.participants
                                                .filter(p => p.userId !== currentUserId)
                                                .map(p => p.username)
                                                .join(", ")}
                                        </h3>
                                        <p className="text-xs text-[var(--color-textSecondary)]">
                                            {chat.participants.length} participants
                                        </p>
                                    </div>
                                </div>
                                {chat.lastMessageAt && (
                                    <span className="text-xs text-[var(--color-textSecondary)]">
                                        {new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                {/* LEFT SIDE: Last message preview */}
                                {chat.isTyping ? (
                                    <p className="text-sm text-blue-600 italic">Typing...</p>
                                ) : (
                                    chat.lastMessage && (
                                        <p className="text-sm text-[var(--color-textSecondary)] truncate max-w-[75%]">
                                            <span className="font-medium">
                                                {chat.lastMessage.senderInfo?.username}:
                                            </span>
                                            {' '}
                                            {chat.lastMessage.content || '📎 Attachment'}
                                        </p>
                                    )
                                )}

                                {/* RIGHT SIDE: Unread message count */}
                                {chat.unreadCount! > 0 && chat._id !== activeChat?._id && (
                                    <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full ml-2 shrink-0">
                                        {chat.unreadCount}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-[var(--color-background)] text-[var(--color-text)]">
                {activeChat ? (
                    <>
                        {/* Fixed Chat Header */}
                        <div className="p-4 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between sticky top-0 z-30">
                            <div className="flex items-center">
                                {/* Mobile Back Button */}
                                <button
                                    onClick={() => {
                                        setActiveChat(null);
                                        setActiveChatId(null);
                                    }}
                                    className="sm:hidden mr-3 p-2 rounded-lg bg-gray-100 dark:bg-gray-700"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg"
                                        className="h-5 w-5 text-gray-700 dark:text-white"
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>

                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                    <Users size={18} className="text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-[var(--color-text)]">Support Chat</h3>
                                    <p className="text-sm text-[var(--color-textSecondary)]">
                                        {otherTyping
                                            ? <span className="text-blue-600 italic">Typing...</span>
                                            : `${activeChat.participants.length} participants`
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Chat Controls */}
                            <div className="flex items-center space-x-2">
                                {/* Search */}
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--color-textSecondary)]" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            searchMessages(e.target.value);
                                        }}
                                        className="pl-9 pr-4 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] w-40"
                                    />
                                </div>

                                {isSearching && (
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setIsSearching(false);
                                            setSearchResults([]);
                                        }}
                                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                    >
                                        Clear
                                    </button>
                                )}

                                {/* Selection Mode Toggle for Admin */}
                                {isAdmin && (
                                    <button
                                        onClick={() => {
                                            setIsSelectionMode(!isSelectionMode);
                                            setSelectedMessages([]);
                                        }}
                                        className={`p-2 rounded-lg ${isSelectionMode
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 text-[var(--color-textSecondary)] hover:bg-gray-200'
                                            }`}
                                        title="Select messages"
                                    >
                                        <CheckCircle size={16} />
                                    </button>
                                )}

                                {/* Bulk Delete */}
                                {isSelectionMode && (
                                    <div className="flex items-center space-x-3">

                                        {/* Selected Count */}
                                        <span className="text-sm font-semibold text-blue-600">
                                            Selected ({selectedMessages.length})
                                        </span>

                                        {/* Delete Button */}
                                        {selectedMessages.length > 0 && (
                                            <button
                                                onClick={deleteSelectedMessages}
                                                className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                                title={`Delete ${selectedMessages.length} selected messages`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Chat Options */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowChatOptions(!showChatOptions)}
                                        className="p-2 bg-gray-100 text-[var(--color-textSecondary)] hover:bg-gray-200 rounded-lg"
                                    >
                                        <MoreVertical size={16} />
                                    </button>
                                    {showChatOptions && (
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--color-surface)] rounded-lg shadow-lg border border-gray-200 py-2 z-10">
                                            {isAdmin && (
                                                <button
                                                    onClick={() => {
                                                        deleteChat();
                                                        setShowChatOptions(false);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center"
                                                >
                                                    <Archive size={16} className="mr-2" />
                                                    Delete Chat
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setShowChatOptions(false)}
                                                className="w-full px-4 py-2 text-left text-[var(--color-textSecondary)] hover:bg-[var(--color-surface)]"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 pt-6 pb-32 bg-[var(--color-background)]" ref={messagesContainerRef} style={{ WebkitOverflowScrolling: 'touch' }}>
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center">
                                        <Loader2 className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4" />
                                        <p className="text-[var(--color-textSecondary)]">Loading messages...</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Search Results or Regular Messages */}
                                    {isSearching ? (
                                        <>
                                            <div className="text-center py-4">
                                                <div className="bg-blue-100 rounded-lg p-3 inline-block">
                                                    <p className="text-sm text-blue-800">
                                                        {searchResults.length} result(s) for "{searchTerm}"
                                                    </p>
                                                </div>
                                            </div>
                                            {searchResults.map(renderMessage)}
                                        </>
                                    ) : (
                                        <>
                                            {messages.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                                        <MessageCircle size={24} className="text-blue-600" />
                                                    </div>
                                                    <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Start the conversation</h3>
                                                    <p className="text-[var(--color-textSecondary)]">
                                                        {isAdmin
                                                            ? 'No messages yet. Start communicating with your team!'
                                                            : 'Send a message to get help from admin or managers.'
                                                        }
                                                    </p>
                                                </div>
                                            ) : (
                                                messages.map(renderMessage)
                                            )}
                                        </>
                                    )}
                                    <div ref={messagesEndRef} />
                                </>
                            )}
                        </div>

                        {/* Fixed Message Input Area */}
                        {!isSearching && (
                            <div className="p-4 bg-[var(--color-background)] border-t border-gray-200 sticky bottom-0 z-20">
                                {/* File Preview */}
                                {showFilePreview && selectedFiles && (
                                    <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-blue-800 flex items-center">
                                                <Paperclip size={14} className="mr-1" />
                                                Attached Files ({selectedFiles.length})
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setSelectedFiles(null);
                                                    setShowFilePreview(false);
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                }}
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {Array.from(selectedFiles).map((file, index) => (
                                                <div key={index} className="flex items-center justify-between p-2 bg-[var(--color-surface)] rounded border border-[var(--color-border)]">
                                                    <div className="flex items-center">
                                                        <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center mr-2">
                                                            {file.type.startsWith('image/') ? (
                                                                <Image size={12} className="text-blue-600" />
                                                            ) : (
                                                                <FileText size={12} className="text-blue-600" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-medium text-gray-800 block truncate max-w-24">{file.name}</span>
                                                            <span className="text-xs text-[var(--color-textSecondary)]">
                                                                {formatFileSize(file.size)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFile(index)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Tagged Task Preview */}
                                {selectedTask && (
                                    <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-green-800 flex items-center">
                                                <Tag size={14} className="mr-1" />
                                                Tagged Task:
                                            </span>
                                            <button
                                                onClick={() => setSelectedTask(null)}
                                                className="text-green-600 hover:text-green-800"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="bg-white p-2 rounded border border-green-200">
                                            <div className="font-medium text-sm text-gray-800">{selectedTask.title}</div>
                                            <div className="text-xs text-[var(--color-textSecondary)] mt-1 flex items-center space-x-3">
                                                <span className="flex items-center">
                                                    <Calendar size={10} className="mr-1" />
                                                    Due: {new Date(selectedTask.dueDate).toLocaleDateString()}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs ${selectedTask.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                    {selectedTask.priority}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Reply preview above input */}
                                {replyTo && (
                                    <div className="mb-2 p-2 bg-blue-50 border-l-4 border-blue-500 rounded">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="text-xs font-bold text-blue-700">Replying to {replyTo.senderInfo.username}</span>
                                                <div className="text-xs text-blue-800 truncate max-w-[480px]">
                                                    {replyTo.messageType === "file" ? "📎 Attachment" : replyTo.content || "No text"}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setReplyTo(null)}
                                                className="ml-2 text-blue-700 font-bold"
                                                title="Cancel reply"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Message Input */}
                                <div className="flex items-center space-x-3">
                                    <div className="flex space-x-2">
                                        {/* File Upload Button */}
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="p-2 bg-gray-100 text-[var(--color-textSecondary)] hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Attach file (max 100KB)"
                                        >
                                            <Paperclip size={18} />
                                        </button>

                                        {/* Tag Task Button */}
                                        <button
                                            onClick={() => setShowTaskModal(true)}
                                            className="p-2 bg-gray-100 text-[var(--color-textSecondary)] hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                            title="Tag a task"
                                        >
                                            <Tag size={18} />
                                        </button>
                                    </div>

                                    {/* Message Input */}
                                    <div className="flex-1 relative">
                                        <textarea
                                            value={newMessage}
                                            onChange={(e) => {
                                                setNewMessage(e.target.value);
                                                sendTypingSignal();       // 👈 add this
                                            }}
                                            onKeyPress={handleKeyPress}
                                            placeholder="Type your message..."
                                            rows={1}
                                            className="w-full px-4 py-3 bg-[var(--color-surface)] border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                            style={{ minHeight: '44px', maxHeight: '120px' }}
                                        />
                                    </div>

                                    {/* Send Button */}
                                    <button
                                        onClick={sendMessage}
                                        disabled={!newMessage.trim() && !selectedFiles && !selectedTask}
                                        className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Send size={18} />
                                    </button>
                                </div>

                                {/* Hidden File Input */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
                                    multiple
                                    className="hidden"
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <MessageCircle size={32} className="text-blue-600" />
                            </div>
                            <h3 className="text-xl font-semibold text-[var(--color-text)] mb-2">Welcome to Chat Support</h3>
                            <p className="text-[var(--color-textSecondary)] max-w-md mx-auto">
                                {isAdmin
                                    ? 'Manage team communications and provide support to your employees.'
                                    : 'Get help and communicate directly with admin and managers.'
                                }
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Task Selection Modal */}
            {showTaskModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--color-surface)] rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                        <div className="p-4 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center">
                                    <Tag size={20} className="mr-2 text-blue-600" />
                                    Tag a Task
                                </h3>
                                <button
                                    onClick={() => setShowTaskModal(false)}
                                    className="text-[var(--color-textSecondary)] hover:text-[var(--color-textSecondary)]"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="p-4">
                            {/* Search and Filters */}
                            <div className="mb-4 space-y-3">
                                {/* Search */}
                                <div className="relative">
                                    <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--color-textSecondary)]" />
                                    <input
                                        type="text"
                                        placeholder="Search tasks..."
                                        value={taskSearchTerm}
                                        onChange={(e) => setTaskSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                                    />
                                </div>

                                {/* Filters */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <select
                                        value={taskFilter.type}
                                        onChange={(e) => setTaskFilter(prev => ({ ...prev, type: e.target.value }))}
                                        className="p-2 bg-[var(--color-background)] border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="all">All Types</option>
                                        <option value="one-time">One-time</option>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>

                                    <select
                                        value={taskFilter.status}
                                        onChange={(e) => setTaskFilter(prev => ({ ...prev, status: e.target.value }))}
                                        className="p-2 bg-[var(--color-background)] border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="all">All Status</option>
                                        <option value="pending">Pending</option>
                                        <option value="overdue">Overdue</option>
                                    </select>

                                </div>
                            </div>

                            {/* Task List */}
                            <div className="max-h-96 overflow-y-auto">
                                {filteredTasks.length === 0 ? (
                                    <div className="text-center py-8">
                                        <AlertCircle size={24} className="text-[var(--color-textSecondary)] mx-auto mb-2" />
                                        <h3 className="font-medium text-[var(--color-text)] mb-1">No tasks found</h3>
                                        <p className="text-[var(--color-textSecondary)] text-sm">
                                            Try adjusting your search or filter criteria
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {filteredTasks.map(task => (
                                            <div
                                                key={`${task._id}-${task.taskType}`}
                                                onClick={() => {
                                                    setSelectedTask(task);
                                                    setShowTaskModal(false);
                                                }}
                                                className="p-3 bg-[var(--color-surface)] hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer group"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <h4 className="font-medium text-[var(--color-text)] group-hover:text-blue-900 mb-1">{task.title}</h4>
                                                        <p className="text-sm text-[var(--color-textSecondary)] mb-2 line-clamp-2">{task.description}</p>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center space-x-3 text-xs">
                                                                <span className="flex items-center text-blue-600">
                                                                    <Clock size={10} className="mr-1" />
                                                                    {new Date(task.dueDate).toLocaleDateString("en-IN")}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded text-xs ${task.priority === 'high'
                                                                    ? 'bg-red-100 text-red-800'
                                                                    : 'bg-blue-100 text-blue-800'
                                                                    }`}>
                                                                    {task.priority}
                                                                </span>
                                                                <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs">
                                                                    {task.taskType || 'one-time'}
                                                                </span>
                                                                {task.isOverdue && (
                                                                    <div className="inline-flex items-center bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs">
                                                                        <AlertCircle size={12} className="mr-1" />
                                                                        Overdue
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {isAdmin && task.assignedTo && (
                                                                <span className="flex items-center text-xs text-[var(--color-textSecondary)]">
                                                                    <User size={10} className="mr-1" />
                                                                    {task.assignedTo.username}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-200 bg-[var(--color-background)]">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-[var(--color-textSecondary)]">
                                    Showing {filteredTasks.length} of {allTasks.length} tasks
                                </p>
                                <button
                                    onClick={() => setShowTaskModal(false)}
                                    className="px-4 py-2 text-sm text-[var(--color-textSecondary)] hover:text-gray-800"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Preview Modal */}
            {showImagePreview && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
                    onClick={() => setShowImagePreview(null)}
                >
                    <div
                        className="relative max-w-full max-h-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={showImagePreview}
                            onError={(e) => {
                                e.currentTarget.src = "https://via.placeholder.com/300?text=Preview+Not+Available";
                            }}
                            className="max-w-full max-h-full object-contain rounded-lg"
                        />
                        <button
                            onClick={() => setShowImagePreview(null)}
                            className="absolute -top-4 -right-4 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}
            {/* USER SELECTION MODAL */}
            {showUserModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--color-surface)] w-full max-w-md rounded-2xl shadow-xl overflow-hidden">

                        {/* Header */}
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center">
                                <Users size={18} className="text-blue-600 mr-2" />
                                Start New Chat
                            </h3>
                            <button onClick={() => setShowUserModal(false)}>
                                <X size={20} className="text-[var(--color-textSecondary)] hover:text-[var(--color-textSecondary)]" />
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="p-4 border-b">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]" />
                                <input
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 pl-10 pr-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Search user..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* User List */}
                        <div className="max-h-80 overflow-y-auto p-2">
                            {allUsers
                                .filter(u => u._id !== currentUserId)
                                .filter(u => {
                                    if (currentRole === "manager") return u.role === "employee";
                                    return true;
                                })
                                .filter(u =>
                                    u.username.toLowerCase().includes(userSearch.toLowerCase())
                                )
                                .map(u => (
                                    <div
                                        key={u._id}
                                        onClick={() => {
                                            startChatWithUser(u._id);
                                            setShowUserModal(false);
                                        }}
                                        className="p-3 flex items-center justify-between bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-400 rounded-lg cursor-pointer mb-2 transition-all"
                                    >
                                        <div className="flex items-center">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold mr-3">
                                                {u.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-[var(--color-text)]">{u.username}</p>
                                                <span
                                                    className={`text-xs px-2 py-1 rounded-full ${u.role === "admin"
                                                        ? "bg-red-100 text-red-700"
                                                        : u.role === "manager"
                                                            ? "bg-purple-100 text-purple-700"
                                                            : "bg-green-100 text-green-700"
                                                        }`}
                                                >
                                                    {u.role}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                            {/* Empty State */}
                            {allUsers.filter(u =>
                                u.username.toLowerCase().includes(userSearch.toLowerCase())
                            ).length === 0 && (
                                    <div className="text-center py-10 text-[var(--color-textSecondary)]">
                                        No users found
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
            )}
            {/* Global Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-[999]">
                    <div className="bg-[var(--color-surface)] w-full max-w-md rounded-2xl shadow-xl p-6 animate-fadeIn">

                        {/* Icon */}
                        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                            <Trash2 size={28} />
                        </div>

                        {/* Title & Message */}
                        <h3 className="text-xl font-semibold text-center text-[var(--color-text)] mb-2">
                            Confirm Delete
                        </h3>
                        <p className="text-center text-[var(--color-textSecondary)] mb-6">
                            {confirmText}
                        </p>

                        {/* Buttons */}
                        <div className="flex items-center justify-center space-x-3">
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                className="px-5 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={async () => {
                                    if (confirmAction) await confirmAction();
                                    setShowConfirmModal(false);
                                }}
                                className="px-5 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chat;