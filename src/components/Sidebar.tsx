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

  const renderCountBadge = (count: number, compact = false) => (
    <span
      className={`
        absolute inline-flex items-center rounded-full border
        border-[rgba(239,68,68,0.22)] bg-[rgba(255,255,255,0.96)] px-1.5 py-0.5 text-[10px] font-bold
        leading-none text-[var(--color-error)] shadow-[0_6px_14px_rgba(239,68,68,0.10)] backdrop-blur-sm
        ring-2 ring-[var(--color-surface)]
        ${compact ? 'top-1.5 right-0.5' : 'top-1.5 right-2'}
      `}
    >
      <span>{formatCount(count)}</span>
    </span>
  );



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
          flex flex-col overflow-hidden
          border-r border-[var(--color-border)]
          bg-[var(--color-surface)]/92 backdrop-blur-xl
          shadow-[0_20px_60px_rgba(15,23,42,0.12)]
          transition-[transform,width] duration-300 ease-out
          lg:static lg:inset-0
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{
          width: isExpanded ? "240px" : "84px",
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
          className="flex items-center justify-between px-3 py-2"
          style={{
            borderBottom: "1px solid var(--color-border)",
            minHeight: "55px",
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 min-w-0">
            {isExpanded && (
              <div
                className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
                  isExpanded ? 'max-w-[120px] opacity-100 translate-x-0' : 'max-w-0 opacity-0 -translate-x-2'
                }`}
              >
                <div className="text-[17px] font-bold tracking-tight text-[var(--color-text)]">
                  TMS
                </div>
                <div className="text-[11px] font-medium text-[var(--color-textSecondary)]">
                  Workspace
                </div>
              </div>
            )}
          </div>

          <button
            onClick={toggleCollapse}
            className="hidden lg:flex p-1.5 rounded-xl border shadow-sm hover:scale-105 transition ml-1 mr-2"
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
        <nav className="flex-1 mt-3 overflow-y-auto scrollbar-hide pb-24">
          <div className="px-2.5 space-y-1.5">
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
                    `group relative flex w-full items-center rounded-2xl px-3 py-2.5 font-medium transition-all duration-300 ease-out ${
                      isActive
                        ? "border border-white/20 text-white shadow-[0_16px_30px_rgba(14,165,233,0.34),inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-white/15"
                        : "border border-transparent text-[var(--color-text)] hover:border-[var(--color-border)] hover:bg-[var(--color-background)]/75 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:text-[var(--color-primary)]"
                    } ${isExpanded ? "text-[14px]" : "text-sm justify-center"}`
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
                      size={isExpanded ? 18 : 16}
                      className={`transition-all duration-300 ease-out group-hover:scale-110 ${
                        isExpanded ? "mr-3 shrink-0" : ""
                      }`}
                    />

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
                  {item.label === "Pending Single" && pendingTaskCount > 0 && renderCountBadge(pendingTaskCount, !isExpanded)}
                  {item.label === "Pending Recurring" && pendingRecurringCount > 0 && renderCountBadge(pendingRecurringCount, !isExpanded)}
                  {item.label === "Chat Support" && unreadChatsCount > 0 && renderCountBadge(unreadChatsCount, !isExpanded)}
                  {item.label === "For Approval" && approvalPendingCount > 0 && renderCountBadge(approvalPendingCount, !isExpanded)}
                  {item.label === "PCM Pending" && pcmIntegrationEnabled && pcmPendingCount > 0 && renderCountBadge(pcmPendingCount, !isExpanded)}
                  </NavLink>
              </Tooltip>
            ))}
          </div>
        </nav>

        {/* User Profile */}
        <div
          className="sticky bottom-0 left-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 p-3 backdrop-blur-xl"
        >
          {!isExpanded ? (
            <Tooltip content={`${user?.username} (${user?.role})`} show={true}>
              <div className="flex justify-center">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-secondary))] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)] transition-transform duration-300 ease-out"
                >
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/75 px-3 py-2.5">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-primary),var(--color-secondary))] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)] transition-transform duration-300 ease-out"
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
