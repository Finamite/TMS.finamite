import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createPortal } from 'react-dom';
import axios from "axios";
import { address } from "../../utils/ipAddress";

import {
  LayoutDashboard,
  CheckSquare,
  RefreshCw,
  Archive,
  RotateCcw,
  UserPlus,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  Crown,
  MessageCircle,
  Shield,
  Recycle,
  HelpCircle,
  ArrowLeftRight,
  ClipboardCheck,
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
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [approvalPendingCount, setApprovalPendingCount] = useState(0);

  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [pendingRecurringCount, setPendingRecurringCount] = useState(0);

  // Fetch unread messages every 2 seconds
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      axios
        .get(`${address}/api/chat/user/${user.id}?companyId=${user.company?.companyId}`)
        .then((res) => {
          const chats = res.data;
          const unread = chats.filter((c: any) => c.unreadCount > 0).length;
          setUnreadChatsCount(unread);
        })
        .catch(() => { });
    }, 2000);

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    // If mobile width, always expand sidebar
    if (window.innerWidth < 1024) {
      setIsCollapsed(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const companyId = user?.company?.companyId;
    if (!companyId) return;

    const interval = setInterval(() => {
      axios
        .get(`${address}/api/tasks`, {
          params: {
            status: "in-progress",
            requiresApproval: true,
            companyId,
            limit: 1
          }
        })
        .then((res) => {
          const total = res.data?.total ?? res.data?.tasks?.length ?? 0;
          setApprovalPendingCount(total);
        })
        .catch(() => {
          setApprovalPendingCount(0);
        });
    }, 3000);

    return () => clearInterval(interval);
  }, [user?.company?.companyId]);

  useEffect(() => {
    const companyId = user?.company?.companyId;
    if (!companyId) return;

    const fetchPendingCount = async () => {
      try {
        const params: {
          companyId: string;
          taskType: string;
          userId?: string;
        } = {
          companyId,
          taskType: "one-time",
        };

        // same rule as PendingTasks page
        if (!user.permissions.canViewAllTeamTasks && user.id) {
          params.userId = user.id;
        }

        const res = await axios.get(`${address}/api/tasks/pending`, { params });
        setPendingTaskCount(res.data.length);
      } catch {
        setPendingTaskCount(0);
      }
    };

    fetchPendingCount();

    const interval = setInterval(fetchPendingCount, 10000);
    return () => clearInterval(interval);

  }, [user]);

  useEffect(() => {
    const companyId = user?.company?.companyId;
    if (!companyId) return;

    const fetchPendingRecurringCount = async () => {
      try {
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
            ["weekly", "monthly", "quarterly", "yearly"].includes(task.taskType)
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
    const interval = setInterval(fetchPendingRecurringCount, 10000);
    return () => clearInterval(interval);

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
    { icon: Archive, label: 'Master Single', path: '/master-tasks', permission: cp.masterTasks },
    { icon: RotateCcw, label: 'Master Recurring', path: '/master-recurring', permission: cp.masterRecurringTasks },
    { icon: UserPlus, label: 'Assign Task', path: '/assign-task', permission: user?.permissions?.canAssignTasks },
    { icon: ClipboardCheck, label: 'For Approval', path: '/For-Approval', permission: user?.permissions?.canManageApproval },
    { icon: ArrowLeftRight, label: 'Task Shift', path: '/task-shift', permission: cp.taskshift && ['admin', 'manager', 'superadmin'].includes(user?.role || '') },
    { icon: MessageCircle, label: 'Chat Support', path: '/chat', permission: cp.chat },
    { icon: Recycle, label: 'Recycle bin', path: '/recycle-bin', permission: user?.permissions?.canManageRecycle },
    { icon: Zap, label: 'Performance', path: '/performance', permission: cp.performance },
    { icon: Shield, label: 'Admin Panel', path: '/admin', permission: user?.permissions?.canManageUsers },
    { icon: Settings, label: 'Settings', path: '/settings-page', permission: user?.permissions?.canManageSettings },
    { icon: HelpCircle, label: 'Help & Support', path: '/help-support', permission: cp.helpsupport },
    { icon: Crown, label: 'SuperAdmin Panel', path: '/superadmin', requireSuperAdmin: true },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (item.requireSuperAdmin && user?.role !== 'superadmin') return false;
    if (item.permission === false) return false;
    return true;
  });

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

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
    lg:static lg:inset-0
    flex flex-col
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
          width: isCollapsed ? "80px" : "200px",
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
            {!isCollapsed ? (
              <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
                TMS
              </span>
            ) : (
              <button
                onClick={toggleCollapse}
                className="p-2 rounded-xl border flex items-center justify-center shadow-md hover:scale-105 transition ml-1"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {!isCollapsed && (
            <button
              onClick={toggleCollapse}
              className="hidden lg:flex p-2 rounded-xl border shadow-sm hover:scale-105 transition ml-1"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}
            >
              <ChevronLeft size={20} />
            </button>
          )}

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
    mt-4
    pb-24
  "
        >
          <div className="px-2 space-y-2">
            {filteredMenuItems.map((item) => (
              <Tooltip
                key={item.path}
                content={item.label}
                show={isCollapsed}
              >
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center px-2 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${isActive ? 'text-white' : ''
                    } ${isCollapsed ? 'justify-center' : ''}`
                  }
                  style={({ isActive }) => ({
                    background: isActive
                      ? 'linear-gradient(135deg, #3a2ee2ff, var(--color-secondary))'
                      : 'transparent',
                    color: isActive ? 'white' : 'var(--color-text)'
                  })}
                >


                  {/* ICON + RED DOT */}
                  <div className="relative">
                    <item.icon size={16} className={isCollapsed ? '' : 'mr-3'} />

                    {item.label === "Pending Single" && pendingTaskCount > 0 && (
                      <span
                        className={`
      absolute -top-2
      ${isCollapsed ? "-right-4" : "-top-1 left-2"}
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
      ${isCollapsed ? "-right-4" : "-top-1 left-2"}
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
      ${isCollapsed ? "-right-4" : "left-2"}
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
      ${isCollapsed ? "-right-4" : "left-2"}
      bg-red-600 text-white text-[10px]
      rounded-full min-w-[18px] h-[18px]
      flex items-center justify-center px-1
    `}
                      >
                        {formatCount(approvalPendingCount)}
                      </span>
                    )}
                  </div>

                  {!isCollapsed && (
                    <span className="transition-opacity duration-200">
                      {item.label}
                    </span>
                  )}
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
          {isCollapsed ? (
            <Tooltip content={`${user?.username} (${user?.role})`} show={true}>
              <div className="flex justify-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {user?.username?.charAt(0).toUpperCase()}
              </div>

              <div className="ml-3 min-w-0">
                <p
                  className="text-xs font-medium truncate"
                  style={{ color: 'var(--color-text)' }}
                >
                  {user?.username}
                </p>
                <p
                  className="text-xs truncate"
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
