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
import { toast } from 'react-toastify';

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
    const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<any>(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [userSearch, setUserSearch] = useState("");
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
    const [confirmText, setConfirmText] = useState("");
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [sidebarSearch, setSidebarSearch] = useState("");
    const [freezeSidebarSearch, setFreezeSidebarSearch] = useState(false);
    const [showMobileSearch, setShowMobileSearch] = useState(false);

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
        if (!messagesContainerRef.current) return;

        // 1st scroll after messages state update
        requestAnimationFrame(() => {
            if (!messagesContainerRef.current) return;
            messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
        });

        // 2nd scroll after DOM paint
        setTimeout(() => {
            if (!messagesContainerRef.current) return;
            messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
        }, 50);

        // 3rd scroll for mobile slow layout
        setTimeout(() => {
            if (!messagesContainerRef.current) return;
            messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
        }, 250);

    }, [messages]);

    useEffect(() => {
        if (!activeChat) return;

        const loadAndScroll = async () => {
            await loadMessages();

            // wait for DOM to render the messages
            setTimeout(() => {
                scrollToBottom();
            }, 150);
        };

        loadAndScroll();
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
        if (!user || freezeSidebarSearch) return;

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
    }, [user, freezeSidebarSearch]);

    useEffect(() => {
        if (sidebarSearch.trim() === "") {
            setFreezeSidebarSearch(false);
        }
    }, [sidebarSearch]);


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

    const scrollToBottom = () => {
        if (!messagesContainerRef.current) return;

        const el = messagesContainerRef.current;

        // Run multiple passes because mobile layout shifts
        const scrollNow = () => {
            el.scrollTop = el.scrollHeight;
        };

        requestAnimationFrame(scrollNow);
        setTimeout(scrollNow, 50);
        setTimeout(scrollNow, 150);
        setTimeout(scrollNow, 350);
        setTimeout(scrollNow, 600); // 🔥 mobile needs this final pass
    };

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
            toast.error('Failed to send message. Please try again.');
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
                toast.error("File size limit is 100KB. The following files are too large");
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

        // OPEN CUSTOM CONFIRM MODAL
        setConfirmText(`Are you sure you want to delete ${selectedMessages.length} selected messages?`);

        setConfirmAction(() => async () => {
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
                console.error("Error deleting messages:", error);
                toast.error("Failed to delete messages.");
            }
        });

        setShowConfirmModal(true); // SHOW THE POPUP
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

    const searchMessages = (query: string) => {
        setSearchTerm(query);

        if (!query.trim()) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }

        const lower = query.toLowerCase();

        const results = messages.filter(msg =>
            msg.content?.toLowerCase().includes(lower) ||
            msg.senderInfo.username.toLowerCase().includes(lower)
        );

        setSearchResults(results);
        setIsSearching(true);
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
            toast.error('Failed to download file.');
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
            return <CheckCircle size={12} className="ml-1 text-green-100" />;
        }
        return <Check size={12} className="ml-1 text-white" />;
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
            toast.error("Unable to start chat. Try again.");
        }
    };

    const formatParticipantNames = (participants: Chat["participants"]) => {
        const names = participants
            .filter(p => p.userId !== currentUserId)
            .map(p => p.username);

        if (names.length <= 2) {
            return names.join(", ");
        }

        return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
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
                                className={`absolute top-2 opacity-0 group-hover:opacity-100 text-[var(--color-textSecondary)] hover:text-[var(--color-primary)] transition
    ${isOwn ? "-left-8" : "-right-8"}`}
                                title="Reply"
                            >
                                ↩
                            </button>
                        )}

                        <div
                            className={`rounded-2xl px-4 py-3 transition
    ${isOwn ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_30px_rgba(14,165,233,0.18)]' : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_10px_24px_rgba(15,23,42,0.06)]'}
    ${highlightId === message._id ? "ring-4 ring-[rgba(14,165,233,0.2)]" : ""}
    ${isDeleted ? 'opacity-50' : ''}
    ${isSelected
                                    ? isOwn
                                        ? 'ring-2 ring-[rgba(14,165,233,0.85)] shadow-[0_0_0_4px_rgba(14,165,233,0.16)]'
                                        : 'ring-2 ring-[rgba(14,165,233,0.65)] bg-[rgba(14,165,233,0.08)] shadow-[0_0_0_4px_rgba(14,165,233,0.08)]'
                                    : ''}
  `}
                        >
                            {isSelectionMode && isSelected && (
                                <div className="absolute -top-2 -left-2 z-20">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(14,165,233,0.25)] bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[0_8px_18px_rgba(14,165,233,0.14)]">
                                        <CheckCircle size={14} />
                                    </div>
                                </div>
                            )}

                            {/* Sender info for others' messages */}
                            {!isOwn && (
                                <div className="flex items-center mb-2">
                                    <div className="mr-2 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-semibold text-[var(--color-primary)]">
                                        {message.senderInfo.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <span className="text-xs font-medium text-[var(--color-text)]">
                                            {message.senderInfo.username}
                                        </span>
                                        <span className="ml-2 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs text-[var(--color-textSecondary)]">
                                            {message.senderInfo.role}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Tagged Task */}
                            {message.taggedTask && (
                                <div className={`mb-2 p-2 rounded-lg border-l-4 ${isOwn
                                    ? 'border-white/25 bg-white/10'
                                    : 'border-[var(--color-primary)]/40 bg-[var(--color-background)]/70'
                                    }`}>
                                    <div className="flex items-center mb-1">
                                        <Tag size={14} className="mr-1 text-[var(--color-primary)]" />
                                        <span className={`text-xs font-medium ${isOwn ? 'text-white' : 'text-[var(--color-text)]'}`}>Tagged Task</span>
                                    </div>
                                    <div className={`mb-1 text-sm font-medium ${isOwn ? 'text-white' : 'text-[var(--color-text)]'}`}>{message.taggedTask.taskTitle}</div>
                                    <div className={`text-xs ${isOwn ? 'text-white/80' : 'text-[var(--color-textSecondary)]'}`}>
                                        <span className="inline-flex items-center mr-2">
                                            <Clock size={10} className="mr-1" />
                                            Due: {new Date(message.taggedTask.dueDate).toLocaleDateString('en-GB')}
                                        </span>
                                        <span className={`rounded px-1 py-0.5 text-xs ${isOwn ? 'bg-white/15 text-white' : 'border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-textSecondary)]'}`}>
                                            {message.taggedTask.taskType}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {message.replyTo && (
                                <div
                                    className={`p-2 mb-2 rounded border-l-4 cursor-pointer
      ${isOwn ? 'border-white/25 bg-white/10' : 'border-[var(--color-primary)]/40 bg-[var(--color-background)]/70'}
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
                                    <div className={`text-xs font-semibold ${isOwn ? 'text-white/90' : 'text-[var(--color-text)]'}`}>
                                        {message.replyTo.senderName}
                                    </div>
                                    <div className={`text-xs truncate ${isOwn ? 'text-white/75' : 'text-[var(--color-textSecondary)]'}`}>
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
                                                        return <FileText size={20} className="text-[var(--color-danger)]" />;

                                                    if (
                                                        type.includes("spreadsheet") ||
                                                        type.includes("excel") ||
                                                        name.endsWith(".xlsx") ||
                                                        name.endsWith(".xls") ||
                                                        name.endsWith(".csv")
                                                    )
                                                        return <FileSpreadsheet size={20} className="text-[var(--color-success)]" />;

                                                    if (
                                                        type.includes("word") ||
                                                        type.includes("msword") ||
                                                        name.endsWith(".doc") ||
                                                        name.endsWith(".docx")
                                                    )
                                                        return <FileText size={20} className="text-[var(--color-primary)]" />;

                                                    if (name.endsWith(".txt"))
                                                        return <FileText size={20} className="text-[var(--color-textSecondary)]" />;

                                                    if (name.endsWith(".zip") || name.endsWith(".rar"))
                                                        return <FileArchive size={20} className="text-[var(--color-warning)]" />;

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
                                                                className="h-[160px] w-[240px] cursor-pointer rounded-2xl border border-[var(--color-border)] object-cover shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                                                                onClick={() => setShowImagePreview(fileUrl)}
                                                            />
                                                        ) : (
                                                            <div
                                                                className={`flex h-[40px] w-[48px] cursor-pointer items-center justify-center rounded-2xl border
                                                                  ${isOwn
                                                                        ? 'border-white/20 bg-white/10'
                                                                        : 'border-[var(--color-border)] bg-[var(--color-background)]'
                                                                    }
`}

                                                                onClick={() => window.open(fileUrl, "_blank")}
                                                            >
                                                                {getLucideIcon()}
                                                            </div>
                                                        )}

                                                        {/* FILE NAME */}
                                                        <p
                                                            className={`text-[10px] mt-1 truncate w-full ${isOwn ? 'text-white/90' : 'text-[var(--color-text)]'
                                                                }`}
                                                            title={file.originalName}
                                                        >
                                                            {file.originalName}
                                                        </p>

                                                        <div className={`flex items-center gap-2 text-[9px] mt-1 ${isOwn ? 'text-white/80' : 'text-[var(--color-text)]'
                                                            }`}
                                                        >
                                                            <span>{sizeKB}</span>

                                                            <button
                                                                className="text-[var(--color-primary)] hover:opacity-80"
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
                                    {isAdmin && !isDeleted && (
                                        <button
                                            onClick={() => deleteMessage(message._id)}
                                            className={`rounded p-1 transition ${
                                                isSelectionMode
                                                    ? 'opacity-100 text-[var(--color-danger)]'
                                                    : 'opacity-0 group-hover:opacity-100 hover:text-[var(--color-danger)]'
                                            }`}
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
            <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
                <div className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent"></div>
                    <p className="text-[var(--color-textSecondary)]">Loading chat...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-background)] text-[var(--color-text)] sm:flex-row">
            {/* Chat List Sidebar */}
            <div className={`${activeChat ? "hidden sm:flex" : "flex"} h-full min-h-0 w-full flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] sm:w-80 sm:shrink-0`}>
                {/* Fixed Header */}
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-[var(--color-text)]">Messages</h2>
                        <button
                            onClick={() => {
                                if (currentRole === "employee") {
                                    createSupportChat(); // employee goes direct
                                } else {
                                    setSidebarSearch("");     // 🔥 reset sidebar search
                                    setFreezeSidebarSearch(false);
                                    setShowUserModal(true);
                                }
                            }}
                            className="rounded-2xl bg-[var(--color-primary)] p-2 text-white transition-colors hover:opacity-95"
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
                                    value={sidebarSearch}
                                    onChange={(e) => {
                                        setSidebarSearch(e.target.value);
                                        setFreezeSidebarSearch(true);
                                    }}
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-10 pr-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                />
                                {sidebarSearch && (
                                    <button
                                        onClick={() => {
                                            setSidebarSearch("");
                                            setFreezeSidebarSearch(false);
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)] hover:text-[var(--color-danger)]"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat List */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {chats
                        .filter(chat => {
                            const participantNames = chat.participants
                                .filter(p => p.userId !== currentUserId)
                                .map(p => p.username)
                                .join(" ")
                                .toLowerCase();

                            return participantNames.includes(sidebarSearch.toLowerCase());
                        })
                        .map(chat => (
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
                                className={`cursor-pointer border-b border-[var(--color-border)] p-4 transition-colors ${activeChatId === chat._id ? 'border-r-4 border-r-[var(--color-primary)] bg-[var(--color-background)]/70' : 'hover:bg-[var(--color-background)]/70'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center">
                                        <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)]">
                                            <Users size={16} className="text-[var(--color-primary)]" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-[var(--color-text)] text-sm ">
                                                {formatParticipantNames(chat.participants)}
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
                                        <p className="text-sm italic text-[var(--color-primary)]">Typing...</p>
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
                                        <span className="ml-2 shrink-0 rounded-full bg-[var(--color-danger)] px-2 py-1 text-xs text-white">
                                            {chat.unreadCount}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`flex min-w-0 h-full min-h-0 flex-1 flex-col bg-[var(--color-background)] text-[var(--color-text)] ${activeChat ? "" : "hidden sm:flex"}`}>
                {activeChat ? (
                    <>
                        {/* Fixed Chat Header */}
                        <div className="sticky top-0 z-10 flex shrink-0 flex-row items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4">

                            {/* LEFT SECTION */}
                            <div className="flex items-center">

                                {/* Mobile Back Button */}
                                <button
                                    onClick={() => {
                                        setActiveChat(null);
                                        setActiveChatId(null);
                                    }}
                                    className="mr-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 sm:hidden"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg"
                                        className="h-5 w-5 text-[var(--color-text)]"
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>

                                {/* Avatar */}
                                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)]">
                                    <Users size={18} className="text-[var(--color-primary)]" />
                                </div>

                                {/* Chat Info */}
                                <div>
                                    <h3 className="font-semibold text-[var(--color-text)] text-sm sm:text-base">
                                        {formatParticipantNames(activeChat.participants)}
                                    </h3>
                                    {otherTyping && (
                                        <p className="text-sm italic text-[var(--color-primary)]">
                                            Typing...
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT SECTION */}
                            <div className="flex items-center gap-2 sm:w-auto">

                                {/* DESKTOP SEARCH BAR */}
                                <div className="relative flex-grow hidden sm:block">
                                    <Search size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            searchMessages(e.target.value);
                                        }}
                                        className="pl-9 pr-3 py-2 bg-[var(--color-background)]
                border border-[var(--color-border)] rounded-lg w-full
                text-sm focus:ring-2 focus:ring-[var(--color-primary)]"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => {
                                                setSearchTerm("");
                                                searchMessages(""); // 👈 also clear results
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)] hover:text-[var(--color-danger)]"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* MOBILE SEARCH ICON */}
                                <button
                                    onClick={() => setShowMobileSearch(!showMobileSearch)}
                                    className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)] sm:hidden"
                                >
                                    <Search size={18} />
                                </button>

                                {/* SELECT MODE OFF */}
                                {!isSelectionMode && isAdmin && (
                                    <button
                                        onClick={() => {
                                            setIsSelectionMode(true);
                                            setSelectedMessages([]);
                                        }}
                                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)]"
                                    >
                                        <CheckCircle size={18} />
                                    </button>
                                )}

                                {/* SELECT MODE ON → CANCEL */}
                                {isSelectionMode && (
                                    <button
                                        onClick={() => {
                                            setIsSelectionMode(false);
                                            setSelectedMessages([]);
                                        }}
                                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)]"
                                    >
                                        <X size={18} />
                                    </button>
                                )}

                                {/* SELECT MODE ON → DELETE */}
                                {isSelectionMode && (
                                    <button
                                        onClick={deleteSelectedMessages}
                                        disabled={selectedMessages.length === 0}
                                        className={`rounded-2xl p-2 ${selectedMessages.length > 0
                                            ? 'bg-[var(--color-danger)] text-red-500 hover:opacity-95'
                                            : 'cursor-not-allowed bg-[var(--color-border)] text-[var(--color-textSecondary)]'
                                            }`}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}

                                {/* MENU BUTTON */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowChatOptions(!showChatOptions)}
                                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-[var(--color-textSecondary)] transition hover:bg-[var(--color-background)]"
                                    >
                                        <MoreVertical size={18} />
                                    </button>

                                    {showChatOptions && (
                                        <div className="absolute right-0 z-20 mt-2 w-48 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] py-2 shadow-[0_16px_44px_rgba(15,23,42,0.12)]">

                                            {isAdmin && (
                                                <button
                                                    onClick={() => {
                                                        deleteChat();
                                                        setShowChatOptions(false);
                                                    }}
                                                    className="flex w-full items-center px-4 py-2 text-left text-[var(--color-danger)] hover:bg-[rgba(239,68,68,0.06)]"
                                                >
                                                    <Archive size={16} className="mr-2" /> Delete Chat
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setShowChatOptions(false)}
                                                className="w-full px-4 py-2 text-left text-[var(--color-textSecondary)] hover:bg-[var(--color-background)]"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* MOBILE SEARCH BAR BELOW HEADER */}
                        {showMobileSearch && (
                            <div className="sticky top-[64px] z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:hidden">
                                <div className="relative">
                                    <Search
                                        size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            searchMessages(e.target.value);
                                        }}
                                        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => {
                                                setSearchTerm("");
                                                searchMessages(""); // 👈 also clear results
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)] hover:text-[var(--color-danger)]"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}


                        {/* Messages Area */}
                        <div
                            ref={messagesContainerRef}
                            className="flex-1 min-h-0 overflow-y-auto bg-[var(--color-background)] p-4 pb-6"
                            style={{
                                WebkitOverflowScrolling: "touch"
                            }}
                        >
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="text-center">
                                        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[var(--color-primary)]" />
                                        <p className="text-[var(--color-textSecondary)]">Loading messages...</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Search Results or Regular Messages */}
                                    {isSearching ? (
                                        <>
                                                <div className="py-4 text-center">
                                                <div className="inline-block rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/75 p-3">
                                                    <p className="text-sm text-[var(--color-primary)]">
                                            {searchResults.length} result(s) for "{searchTerm}"
                                                    </p>
                                                </div>
                                            </div>
                                            {searchResults.map(renderMessage)}
                                        </>
                                    ) : (
                                        <>
                                            {messages.length === 0 ? (
                                                <div className="py-12 text-center">
                                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)]">
                                                        <MessageCircle size={24} className="text-[var(--color-primary)]" />
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
                            <div className="sticky bottom-0 z-20 shrink-0 border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
                                {/* File Preview */}
                                {showFilePreview && selectedFiles && (
                                    <div className="mb-3 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-[var(--color-primary)] flex items-center">
                                                <Paperclip size={14} className="mr-1 text-[var(--color-primary)]" />
                                                Attached Files ({selectedFiles.length})
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setSelectedFiles(null);
                                                    setShowFilePreview(false);
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                }}
                                                className="text-[var(--color-primary)] hover:opacity-90"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {Array.from(selectedFiles).map((file, index) => (
                                                <div key={index} className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 p-2">
                                                    <div className="flex items-center">
                                                            <div className="mr-2 flex h-6 w-6 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-background)]">
                                                                {file.type.startsWith('image/') ? (
                                                                    <Image size={12} className="text-[var(--color-primary)]" />
                                                                ) : (
                                                                    <FileText size={12} className="text-[var(--color-primary)]" />
                                                                )}
                                                            </div>
                                                            <div>
                                                            <span className="block max-w-24 truncate text-xs font-medium text-[var(--color-text)]">{file.name}</span>
                                                            <span className="text-xs text-[var(--color-textSecondary)]">
                                                                {formatFileSize(file.size)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFile(index)}
                                                        className="text-[var(--color-danger)] hover:opacity-90"
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
                                    <div className="mb-3 rounded-[24px] border border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.06)] p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-green-800 flex items-center">
                                                <Tag size={14} className="mr-1 text-[var(--color-success)]" />
                                                Tagged Task:
                                            </span>
                                            <button
                                                onClick={() => setSelectedTask(null)}
                                                className="text-[var(--color-success)] hover:opacity-90"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                                            <div className="font-medium text-sm text-[var(--color-text)]">{selectedTask.title}</div>
                                            <div className="text-xs text-[var(--color-textSecondary)] mt-1 flex items-center space-x-3">
                                                <span className="flex items-center">
                                                    <Calendar size={10} className="mr-1" />
                                                    Due: {new Date(selectedTask.dueDate).toLocaleDateString('en-GB')}
                                                </span>
                                                <span className={`rounded-full px-2 py-0.5 text-xs ${selectedTask.priority === 'high' ? 'bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)]' : 'bg-[rgba(14,165,233,0.12)] text-[var(--color-primary)]'
                                                    }`}>
                                                    {selectedTask.priority}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Reply preview above input */}
                                {replyTo && (
                                    <div className="mb-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 p-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="text-xs font-bold text-[var(--color-primary)]">Replying to {replyTo.senderInfo.username}</span>
                                                <div className="max-w-[480px] truncate text-xs text-[var(--color-textSecondary)]">
                                                    {replyTo.messageType === "file" ? "📎 Attachment" : replyTo.content || "No text"}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setReplyTo(null)}
                                                className="ml-2 font-bold text-[var(--color-primary)]"
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
                                            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-primary)]"
                                            title="Attach file (max 100KB)"
                                        >
                                            <Paperclip size={18} />
                                        </button>

                                        {/* Tag Task Button */}
                                        <button
                                            onClick={() => setShowTaskModal(true)}
                                            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-text)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-success)]"
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
                                            className="w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                            style={{ minHeight: '44px', maxHeight: '120px' }}
                                        />
                                    </div>

                                    {/* Send Button */}
                                    <button
                                        onClick={sendMessage}
                                        disabled={!newMessage.trim() && !selectedFiles && !selectedTask}
                                        className="rounded-2xl bg-[var(--color-primary)] p-3 text-white transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
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
                            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)]">
                                <MessageCircle size={32} className="text-[var(--color-primary)]" />
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                        <div className="border-b border-[var(--color-border)] p-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center">
                                    <Tag size={20} className="mr-2 text-[var(--color-primary)]" />
                                    Tag a Task
                                </h3>
                                <button
                                    onClick={() => setShowTaskModal(false)}
                                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-[var(--color-textSecondary)] transition hover:text-[var(--color-primary)]"
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
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 pl-10 pr-4 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                />
                                </div>

                                {/* Filters */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <select
                                        value={taskFilter.type}
                                        onChange={(e) => setTaskFilter(prev => ({ ...prev, type: e.target.value }))}
                                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
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
                                                className="group cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 p-3 transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-background)]"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <h4 className="font-medium text-[var(--color-text)] mb-1">{task.title}</h4>
                                                        <p className="text-sm text-[var(--color-textSecondary)] mb-2 line-clamp-2">{task.description}</p>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center space-x-3 text-xs">
                                                                <span className="flex items-center text-[var(--color-text)]">
                                                                    <Clock size={10} className="mr-1" />
                                                                    {new Date(task.dueDate).toLocaleDateString("en-IN")}
                                                                </span>
                                                                <span className={`rounded-full border px-2 py-0.5 text-xs ${task.priority === 'high'
                                                                    ? 'border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)]'
                                                                    : 'border-[rgba(14,165,233,0.18)] bg-[rgba(14,165,233,0.12)] text-[var(--color-primary)]'
                                                                    }`}>
                                                                    {task.priority}
                                                                </span>
                                                                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-xs text-[var(--color-textSecondary)]">
                                                                    {task.taskType || 'one-time'}
                                                                </span>
                                                                {task.isOverdue && (
                                                                    <div className="inline-flex items-center rounded-full border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.12)] px-2 py-0.5 text-xs text-[var(--color-danger)]">
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
                        <div className="border-t border-[var(--color-border)] bg-[var(--color-background)] p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-[var(--color-textSecondary)]">
                                    Showing {filteredTasks.length} of {allTasks.length} tasks
                                </p>
                                <button
                                    onClick={() => setShowTaskModal(false)}
                                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-textSecondary)] transition hover:text-[var(--color-text)]"
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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.82)] p-4 backdrop-blur-md"
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
                            className="max-w-full max-h-full rounded-2xl object-contain shadow-[0_20px_60px_rgba(15,23,42,0.35)]"
                        />
                        <button
                            onClick={() => setShowImagePreview(null)}
                            className="absolute -right-4 -top-4 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_12px_30px_rgba(15,23,42,0.2)] transition hover:text-[var(--color-danger)]"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}
            {/* USER SELECTION MODAL */}
            {showUserModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(15,23,42,0.18)]">

                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
                            <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center">
                                <Users size={18} className="mr-2 text-[var(--color-primary)]" />
                                Start New Chat
                            </h3>
                            <button onClick={() => setShowUserModal(false)}>
                                <X size={20} className="text-[var(--color-textSecondary)] transition hover:text-[var(--color-primary)]" />
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="border-b border-[var(--color-border)] p-4">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]" />
                                <input
                                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-10 pr-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                                    placeholder="Search user..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                />
                                {userSearch && (
                                    <button
                                        onClick={() => setUserSearch("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)] transition hover:text-[var(--color-danger)]"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
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
                                            setSidebarSearch("");      // 🔥 reset sidebar search so sidebar list doesn't jump
                                            setFreezeSidebarSearch(false);
                                            startChatWithUser(u._id);
                                            setShowUserModal(false);
                                        }}
                                        className="mb-2 flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/70 p-3 transition hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-background)]"
                                    >
                                        <div className="flex items-center">
                                            <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(14,165,233,0.18)] bg-[rgba(14,165,233,0.12)] font-semibold text-[var(--color-primary)]">
                                                {u.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-[var(--color-text)]">{u.username}</p>
                                                <span
                                                    className={`text-xs px-2 py-1 rounded-full ${u.role === "admin"
                                                        ? "border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)]"
                                                        : u.role === "manager"
                                                            ? "border border-[rgba(14,165,233,0.18)] bg-[rgba(14,165,233,0.12)] text-[var(--color-primary)]"
                                                            : "border border-[rgba(34,197,94,0.18)] bg-[rgba(34,197,94,0.12)] text-[var(--color-success)]"
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
                <div className="fixed inset-0 z-[999] flex items-center justify-center bg-[rgba(15,23,42,0.45)] backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)] animate-fadeIn">

                        {/* Icon */}
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)]">
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
                                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-2 text-[var(--color-textSecondary)] transition hover:text-[var(--color-text)]"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={async () => {
                                    if (confirmAction) await confirmAction();
                                    setShowConfirmModal(false);
                                }}
                                className="rounded-2xl bg-[var(--color-danger)] px-5 py-2 text-white transition hover:opacity-95"
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
