import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePcmIntegration } from '../hooks/usePcmIntegration';
import { createPortal } from 'react-dom';
import axios from "axios";
import { address } from "../../utils/ipAddress";

import {
  LayoutDashboard,
  CheckSquare,
  RefreshCw,
  GitBranch,
  Archive,
  RotateCcw,
  UserPlus,
  Settings,
  X,
  ChevronRight,
  Zap,
  Crown,
  MessageCircle,
  Shield,
  Recycle,
  HelpCircle,
  ArrowLeftRight,
  ClipboardCheck,
  Plug,
} from 'lucide-react';


// Tooltip Component
interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  show: boolean;
}

const Tooltip = ({ children, content, show }: TooltipProps) => {
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });


  const updatePosition = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();

    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 14,
    });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setVisible(true);
  };

  const handleMouseLeave = () => {
    setVisible(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={updatePosition}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      {show && visible &&
        createPortal(
          <div
            className="fixed z-[99999] px-3 py-2 rounded-lg shadow-lg pointer-events-none transition-opacity duration-150"
            style={{
              top: pos.top,
              left: pos.left,
              transform: "translateY(-50%)",
              backgroundColor: "var(--color-text)",
              color: "var(--color-background)",
              whiteSpace: "nowrap",
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const CHAT_POLL_MS = 30000;
  const COUNTS_POLL_MS = 30000;
  const { user } = useAuth();
  const { enabled: pcmIntegrationEnabled, count: pcmPendingCount } = usePcmIntegration();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const [approvalPendingCount, setApprovalPendingCount] = useState(0);

  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [pendingRecurringCount, setPendingRecurringCount] = useState(0);

  // Fetch unread messages on interval (visibility-aware)
  useEffect(() => {
    if (!user?.id || !user?.company?.companyId) return;

    const fetchUnreadChats = () => {
      if (document.visibilityState !== "visible") return;
      axios
        .get(`${address}/api/chat/user/${user.id}?companyId=${user.company?.companyId}`)
        .then((res) => {
          const chats = res.data;
          const unread = chats.filter((c: any) => c.unreadCount > 0).length;
          setUnreadChatsCount(unread);
        })
        .catch(() => { });
    };

    fetchUnreadChats();
    const interval = window.setInterval(fetchUnreadChats, CHAT_POLL_MS);
    document.addEventListener("visibilitychange", fetchUnreadChats);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", fetchUnreadChats);
    };
  }, [user?.id, user?.company?.companyId]);

  useEffect(() => {
    // If mobile width, always expand sidebar
    if (window.innerWidth < 1024) {
      setIsCollapsed(false);
      setIsHoverExpanded(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const companyId = user?.company?.companyId;
    if (!companyId) return;

    const fetchApprovalCount = () => {
      if (document.visibilityState !== "visible") return;
      axios
        .get(`${address}/api/tasks/pending-approval-count`, {
          params: {
            companyId,
            userId: user?.id,
            role: user?.role
          }
        })
        .then((res) => {
          const total = res.data?.count ?? 0;
          setApprovalPendingCount(total);
        })
        .catch(() => {
          setApprovalPendingCount(0);
        });
    };

    fetchApprovalCount();
    const interval = window.setInterval(fetchApprovalCount, COUNTS_POLL_MS);
    document.addEventListener("visibilitychange", fetchApprovalCount);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", fetchApprovalCount);
    };
  }, [user?.company?.companyId, user?.id, user?.role]);

  useEffect(() => {
    const companyId = user?.company?.companyId;
    if (!companyId) return;

    const fetchPendingCount = async () => {
      try {
        const params: {
          companyId: string;
          taskType: string;
          status: string;
          limit: number;
          userId?: string;
        } = {
          companyId,
          taskType: "one-time",
          status: "pending,in-progress,overdue",
          limit: 1
        };

        // same rule as PendingTasks page
        if (!user.permissions.canViewAllTeamTasks && user.id) {
          params.userId = user.id;
        }

        if (document.visibilityState !== "visible") return;
        const res = await axios.get(`${address}/api/tasks`, { params });
        setPendingTaskCount(res.data?.total ?? 0);
      } catch {
        setPendingTaskCount(0);
      }
    };

    fetchPendingCount();
    const interval = window.setInterval(fetchPendingCount, COUNTS_POLL_MS);
    document.addEventListener("visibilitychange", fetchPendingCount);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", fetchPendingCount);
    };

  }, [user]);

  useEffect(() => {
    const companyId = user?.company?.companyId;
    if (!companyId) return;

    const fetchPendingRecurringCount = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        const params: {
          companyId: string;
          userId?: string;
        } = { companyId };

        if (!user.permissions.canViewAllTeamTasks && user.id) {
          params.userId = user.id;
        }

        const res = await axios.get(
          `${address}/api/tasks/pending-recurring`,
          { params }
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let count = 0;

        res.data.forEach((task: any) => {
          const due = new Date(task.dueDate);
          due.setHours(0, 0, 0, 0);

          // ✅ DAILY → only today
          if (task.taskType === "daily") {
            if (due.getTime() === today.getTime()) {
              count++;
            }
          }

          // ✅ OTHER RECURRING → overdue or today
          else if (
            ["weekly", "fortnightly", "monthly", "quarterly", "yearly"].includes(task.taskType)
          ) {
            if (due.getTime() <= today.getTime()) {
              count++;
            }
          }
        });

        setPendingRecurringCount(count);
      } catch {
        setPendingRecurringCount(0);
      }
    };

    fetchPendingRecurringCount();
    const interval = window.setInterval(fetchPendingRecurringCount, COUNTS_POLL_MS);
    document.addEventListener("visibilitychange", fetchPendingRecurringCount);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", fetchPendingRecurringCount);
    };

  }, [user]);

  const formatCount = (count: number) => {
    if (count > 9) return "9+";
    return count.toString();
  };



  const cp = (user?.company?.permissions || {}) as Record<string, boolean>;

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', permission: cp.dashboard },
    { icon: CheckSquare, label: 'Pending Single', path: '/pending-tasks', permission: cp.pendingTasks },
    { icon: RefreshCw, label: 'Pending Recurring', path: '/pending-recurring', permission: cp.pendingRecurringTasks },
    { icon: GitBranch, label: 'PCM Pending', path: '/pcm-pending-process', permission: cp.pendingTasks },
    { icon: Archive, label: 'Master Single', path: '/master-tasks', permission: cp.masterTasks },
    { icon: RotateCcw, label: 'Master Recurring', path: '/master-recurring', permission: cp.masterRecurringTasks },
    { icon: UserPlus, label: 'Assign Task', path: '/assign-task', permission: user?.permissions?.canAssignTasks },
    { icon: ClipboardCheck, label: 'For Approval', path: '/For-Approval', permission: user?.permissions?.canManageApproval },
    { icon: ArrowLeftRight, label: 'Task Shift', path: '/task-shift', permission: cp.taskshift && ['admin', 'manager', 'superadmin'].includes(user?.role || '') },
    { icon: MessageCircle, label: 'Chat Support', path: '/chat', permission: cp.chat },
    { icon: Recycle, label: 'Recycle bin', path: '/recycle-bin', permission: user?.permissions?.canManageRecycle },
    { icon: Zap, label: 'Performance', path: '/performance', permission: cp.performance },
    { icon: Plug, label: 'Integrations', path: '/integrations', permission: user?.permissions?.canManageSettings },
    { icon: Shield, label: 'Admin Panel', path: '/admin', permission: user?.permissions?.canManageUsers },
    { icon: Settings, label: 'Settings', path: '/settings-page', permission: user?.permissions?.canManageSettings },
    { icon: HelpCircle, label: 'Help & Support', path: '/help-support', permission: cp.helpsupport },
    { icon: Crown, label: 'SuperAdmin Panel', path: '/superadmin', requireSuperAdmin: true },
  ];

  const filteredMenuItems = user?.role === 'superadmin'
    ? menuItems.filter((item) => item.requireSuperAdmin)
    : menuItems.filter(item => {
    if (item.requireSuperAdmin && user?.role !== 'superadmin') return false;
    if (item.permission === false) return false;
    if (item.label === 'PCM Pending' && !pcmIntegrationEnabled) return false; 
    return true;
    });

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    setIsHoverExpanded(false);
  };

  const isExpanded = !isCollapsed || isHoverExpanded;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 transition-opacity bg-black opacity-50 lg:hidden"
          onClick={onClose}
        ></div>
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 
    border-r shadow-sm
    transition-[transform,width] duration-300 ease-out
    overflow-hidden
    lg:static lg:inset-0
    flex flex-col
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
          width: isExpanded ? "224px" : "84px",
        }}
        onMouseEnter={() => {
          if (window.innerWidth >= 1024 && isCollapsed) {
            setIsHoverExpanded(true);
          }
        }}
        onMouseLeave={() => {
          if (window.innerWidth >= 1024) {
            setIsHoverExpanded(false);
          }
        }}
      >

        {/* Header */}
        <div
          className="flex items-center justify-between px-4"
          style={{
            borderBottom: "1px solid var(--color-border)",
            minHeight: "55px",
          }}
        >
          {/* Logo */}
          <div className="flex items-center">
            <span
              className={`font-bold tracking-tight overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
                isExpanded
                  ? 'max-w-[100px] text-2xl opacity-100 translate-x-0'
                  : 'max-w-0 text-xl opacity-0 -translate-x-2'
              }`}
              style={{ color: 'var(--color-text)' }}
            >
              TMS
            </span>
          </div>

          <button
            onClick={toggleCollapse}
            className="hidden lg:flex p-2 rounded-xl border shadow-sm hover:scale-105 transition ml-1"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
            aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <ChevronRight
              size={20}
              className={`transition-transform duration-300 ease-out ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
            />
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded-md lg:hidden"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-background)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Navigation */}
        <nav
        className="
    flex-1
    overflow-y-auto
    scrollbar-hide
    mt-4
    pb-24
  "
        >
          <div className="px-2 space-y-2">
            {filteredMenuItems.map((item) => (
              <Tooltip
                key={item.path}
                content={item.label}
                show={!isExpanded}
              >
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `group flex items-center rounded-xl px-3 py-2.5 font-medium transition-all duration-300 ease-out ${
                      isActive
                        ? "text-white shadow-sm"
                        : "text-[var(--color-text)] hover:-translate-y-0.5 hover:bg-[var(--color-surface)] hover:shadow-md hover:shadow-black/5 hover:text-[var(--color-primary)]"
                    } ${isExpanded ? "text-[15px]" : "text-sm justify-center"}`
                  }
                  style={({ isActive }) => ({
                    background: isActive
                      ? 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))'
                      : 'transparent',
                    color: isActive ? 'white' : 'var(--color-text)'
                  })}
                >


                  {/* ICON + RED DOT */}
                  <div className="relative flex items-center">
                    <item.icon
                      size={isExpanded ? 19 : 16}
                      className={`transition-all duration-300 ease-out group-hover:scale-110 group-hover:translate-x-0.5 ${
                        isExpanded ? "mr-3 shrink-0" : ""
                      }`}
                    />

                    {item.label === "Pending Single" && pendingTaskCount > 0 && (
                      <span
                        className={`
      absolute -top-2
                      ${isExpanded ? "-top-1 left-2" : "-right-4"}
      bg-red-600 text-white text-[10px]
      rounded-full min-w-[18px] h-[18px]
      flex items-center justify-center px-1
    `}
                      >
                        {formatCount(pendingTaskCount)}
                      </span>
                    )}

                    {item.label === "Pending Recurring" && pendingRecurringCount > 0 && (
                      <span
                        className={`
      absolute -top-2
      ${isExpanded ? "-top-1 left-2" : "-right-4"}
      bg-red-600 text-white text-[10px]
      rounded-full min-w-[18px] h-[18px]
      flex items-center justify-center px-1
    `}
                      >
                        {formatCount(pendingRecurringCount)}
                      </span>
                    )}


                    {item.label === "Chat Support" && unreadChatsCount > 0 && (
                      <span
                        className={`
      absolute -top-2
      ${isExpanded ? "left-2" : "-right-4"}
      bg-red-600 text-white text-[10px]
      rounded-full min-w-[18px] h-[18px]
      flex items-center justify-center px-1
    `}
                      >
                        {formatCount(unreadChatsCount)}
                      </span>
                    )}
                    {item.label === "For Approval" && approvalPendingCount > 0 && (
                      <span
                        className={`
      absolute -top-2
      ${isExpanded ? "left-2" : "-right-4"}
      bg-red-600 text-white text-[10px]
      rounded-full min-w-[18px] h-[18px]
      flex items-center justify-center px-1
    `}
                      >
                        {formatCount(approvalPendingCount)}
                      </span>
                    )}
                    {item.label === "PCM Pending" && pcmIntegrationEnabled && pcmPendingCount > 0 && (
                      <span
                        className={`
      absolute -top-2
      ${isExpanded ? "-top-1 left-2" : "-right-4"}
      bg-red-600 text-white text-[10px]
      rounded-full min-w-[18px] h-[18px]
      flex items-center justify-center px-1
    `}
                      >
                        {formatCount(pcmPendingCount)}
                      </span>
                    )}
                  </div>

                  <span
                    className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-out group-hover:translate-x-0.5 ${
                      isExpanded
                        ? 'max-w-[150px] opacity-100 translate-x-0 ml-0'
                        : 'max-w-0 opacity-0 -translate-x-2 ml-0'
                    }`}
                  >
                    {item.label}
                  </span>
                  </NavLink>
              </Tooltip>
            ))}
          </div>
        </nav>

        {/* User Profile */}
        <div
          className="
    sticky
    bottom-0
    left-0
    p-4
    border-t
    bg-[var(--color-background)]
  "
          style={{ borderColor: 'var(--color-border)' }}
        >
          {!isExpanded ? (
            <Tooltip content={`${user?.username} (${user?.role})`} show={true}>
              <div className="flex justify-center">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium transition-transform duration-300 ease-out"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium transition-transform duration-300 ease-out"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {user?.username?.charAt(0).toUpperCase()}
              </div>

              <div className="ml-3 min-w-0">
                <p
                  className={`text-xs font-medium truncate overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
                    isExpanded ? 'max-w-[120px] opacity-100 translate-x-0' : 'max-w-0 opacity-0 -translate-x-2'
                  }`}
                  style={{ color: 'var(--color-text)' }}
                >
                  {user?.username}
                </p>
                <p
                  className={`text-xs truncate overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
                    isExpanded ? 'max-w-[120px] opacity-100 translate-x-0' : 'max-w-0 opacity-0 -translate-x-2'
                  }`}
                  style={{ color: 'var(--color-textSecondary)' }}
                >
                  {user?.role}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
