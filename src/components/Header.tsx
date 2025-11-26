import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Menu, LogOut, Palette, Moon, UserPlus, Bell, Clock, CheckSquare, Sun, SunDim, SunDimIcon, SunMedium, SunMoon, SunSnow } from 'lucide-react';
import { address } from '../../utils/ipAddress';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

interface HeaderProps {
  onMenuClick: () => void;
}

interface CompanyData {
  companyId: string;
  companyName: string;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const { theme, setTheme, isDark } = useTheme();
  const [company, setCompany] = useState<CompanyData | null>(null);

  const navigate = useNavigate();

  /* ---------------- NOTIFICATIONS ------------------ */
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const [tasksToday, setTasksToday] = useState<any[]>([]);
  const [tasksOverdue, setTasksOverdue] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true); // Only first load

  const [mainTab, setMainTab] = useState<'one' | 'rec'>('one');
  const [subTab, setSubTab] = useState<'today' | 'overdue'>('today');

  const canViewAll = user?.permissions?.canViewAllTeamTasks;
  const canAssignTasks = user?.permissions?.canAssignTasks;

  /* ---------------- DATE HELPERS ------------------ */
  const normalize = (date: string | Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const isToday = (date: string) => {
    const today = normalize(new Date());
    const d = normalize(date);
    return d.getTime() === today.getTime();
  };

  const isOverdue = (date: string) => {
    const today = normalize(new Date());
    const d = normalize(date);
    return d.getTime() < today.getTime();
  };

  /* ---------------- FETCH NOTIFICATIONS ------------------ */
  const fetchNotif = async () => {
    try {
      const paramsBase: any = {};
      if (user?.company?.companyId) paramsBase.companyId = user.company.companyId;
      if (!canViewAll && user?.id) paramsBase.userId = user.id;

      const [oneRes, recRes] = await Promise.all([
        axios.get(`${address}/api/tasks/pending`, {
          params: { ...paramsBase, taskType: 'one-time' }
        }),
        axios.get(`${address}/api/tasks/pending-recurring`, {
          params: paramsBase
        })
      ]);

      const one = oneRes.data || [];
      const rec = recRes.data || [];

      // merge both categories
      const all = [...one, ...rec];

      // FILTER TODAY (all types: one-time today, daily today, other rec today)
      setTasksToday(all.filter((t: any) => t.dueDate && isToday(t.dueDate)));

      // FILTER OVERDUE (only other recurring overdue; exclude daily and one-time overdue)
      setTasksOverdue(all.filter((t: any) => {
        const overdue = t.dueDate && isOverdue(t.dueDate);
        return overdue && t.taskType !== 'daily';
      }));
    } catch (e) {
      console.log("Notification fetch error:", e);
    } finally {
      setInitialLoading(false); // Only once
    }
  };

  useEffect(() => {
    fetchNotif();
    const i = setInterval(fetchNotif, 2000); // silent refresh
    return () => clearInterval(i);
  }, []);

  /* ---------------- SELECTED LIST ------------------ */
  const filteredToday =
    mainTab === 'one'
      ? tasksToday.filter(t => t.taskType === 'one-time')
      : tasksToday.filter(t => t.taskType !== 'one-time');

  const filteredOverdue =
    mainTab === 'one'
      ? tasksOverdue.filter(t => t.taskType === 'one-time') // Will be empty since excluded
      : tasksOverdue.filter(t => t.taskType !== 'one-time'); // Other recurring overdue

  const currentList = subTab === 'today' ? filteredToday : filteredOverdue;

  const totalCount = tasksToday.length + tasksOverdue.length;

  // Compute counts for tabs
  const oneTimeTodayCount = tasksToday.filter((t: any) => t.taskType === 'one-time').length;
  const oneTimeOverdueCount = tasksOverdue.filter((t: any) => t.taskType === 'one-time').length; // 0
  const recTodayCount = tasksToday.filter((t: any) => t.taskType !== 'one-time').length;
  const recOverdueCount = tasksOverdue.filter((t: any) => t.taskType !== 'one-time').length;

  const oneTimeTotal = oneTimeTodayCount + oneTimeOverdueCount;
  const recTotal = recTodayCount + recOverdueCount;

  const currentTodayCount = mainTab === 'one' ? oneTimeTodayCount : recTodayCount;
  const currentOverdueCount = mainTab === 'one' ? oneTimeOverdueCount : recOverdueCount;

  /* ---------------- CLOSE ON OUTSIDE CLICK ------------------ */
  useEffect(() => {
    const handler = (e: any) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ---------------- FETCH COMPANY ------------------ */
  useEffect(() => {
    const load = async () => {
      if (!user?.companyId) return;
      try {
        const res = await fetch(`${address}/api/companies`);
        const companies = await res.json();
        const c = companies.find((x: any) => x.companyId === user.companyId);
        if (c) setCompany(c);
      } catch { }
    };
    load();
  }, [user?.companyId]);

  /* ---------------- RENDER ------------------ */
  return (
    <header
      className="flex items-center justify-between px-2 py-2 border-b"
      style={{ background: 'var(--color-background)', borderColor: 'var(--color-border)' }}
    >
      {/* LEFT */}
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-md lg:hidden"
          style={{ background: 'var(--color-primary)', color: 'var(--color-background)' }}
        >
          <Menu size={20} />
        </button>
        <div className="ml-3 sm:hidden text-xs">
          <span style={{ color: 'var(--color-textSecondary)' }}>Welcome </span>
          <span style={{ color: 'var(--color-primary)' }}>{company?.companyName}</span>
        </div>
      </div>

      {/* CENTER */}
      <div className="hidden sm:block text-center flex-1">
        <h2 className="text-lg font-semibold">
          <span style={{ color: 'var(--color-textSecondary)' }}>Welcome </span>
          <span style={{ color: 'var(--color-primary)' }}>{company?.companyName}</span>
        </h2>
      </div>

      {/* RIGHT */}
      <div className="flex items-center space-x-3">

        {/* 🔔 NOTIFICATION */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="p-2 rounded-xl shadow-sm hover:scale-105 transition"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)"
            }}
          >
            <Bell size={18} />
            {totalCount > 0 && (
              <span
                className="absolute -top-1 -right-1 text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--color-error)", color: "white" }}
              >
                {totalCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              className={`
      z-50

      /* DESKTOP: attach to bell */
      sm:absolute
      sm:right-0
      sm:mt-2

      /* MOBILE: center modal */
      max-sm:fixed
      max-sm:top-16
      max-sm:left-1/2
      max-sm:-translate-x-1/2
      max-sm:mt-0
    `}
            >
              <div
                className="
        rounded-2xl shadow-2xl border

        /* Desktop width */
        sm:w-[420px]

        /* Mobile width */
        max-sm:w-[92vw]
      "
                style={{
                  background: "var(--color-background)",
                  borderColor: "var(--color-border)",
                  animation: "notifDrop .25s ease-out",
                  pointerEvents: "auto"
                }}
              >
                <style>{`
        @keyframes notifDrop {
          0% { opacity: 0; transform: translateY(-8px) scale(.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

                {/* HEADER */}
                <div
                  className="p-4 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-[var(--color-primary)]" />
                    <div>
                      <p className="font-semibold text-[var(--color-text)] text-sm">
                        Task Notifications
                      </p>
                      <p className="text-xs text-[var(--color-textSecondary)]">
                        Today & Overdue
                      </p>
                    </div>
                  </div>

                  <span className="text-xs text-[var(--color-textSecondary)]">
                    {initialLoading ? "Loading..." : `${totalCount} tasks`}
                  </span>
                </div>

                {/* TOP TABS */}
                <div
                  className="
          px-4 mt-3 
          grid grid-cols-2 gap-3
          max-[600px]:grid-cols-1
        "
                >
                  {/* ONE-TIME */}
                  <button
                    onClick={() => { setMainTab("one"); setSubTab("today"); }}
                    className="relative w-full py-2 flex flex-col items-center"
                  >
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-semibold ${mainTab === "one"
                          ? "text-[var(--color-primary)]"
                          : "text-[var(--color-textSecondary)]"
                        }`}>
                        One-Time
                      </span>

                      <span
                        className={`
                text-xs font-semibold px-2 py-[2px] rounded-full
                ${mainTab === "one"
                            ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            : "bg-[var(--color-surface)] text-[var(--color-textSecondary)] border border-[var(--color-border)]"
                          }
              `}
                      >
                        {oneTimeTotal}
                      </span>
                    </div>

                    <div
                      className={`
              h-[2px] w-full mt-2 rounded-full transition-all
              ${mainTab === "one"
                          ? "bg-[var(--color-primary)] scale-100"
                          : "bg-transparent scale-0"}
            `}
                    />
                  </button>

                  {/* RECURRING */}
                  <button
                    onClick={() => { setMainTab("rec"); setSubTab("today"); }}
                    className="relative w-full py-2 flex flex-col items-center"
                  >
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-semibold ${mainTab === "rec"
                          ? "text-[var(--color-primary)]"
                          : "text-[var(--color-textSecondary)]"
                        }`}>
                        Recurring
                      </span>

                      <span
                        className={`
                text-xs font-semibold px-2 py-[2px] rounded-full
                ${mainTab === "rec"
                            ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                            : "bg-[var(--color-surface)] text-[var(--color-textSecondary)] border border-[var(--color-border)]"
                          }
              `}
                      >
                        {recTotal}
                      </span>
                    </div>

                    <div
                      className={`
              h-[2px] w-full mt-2 rounded-full transition-all
              ${mainTab === "rec"
                          ? "bg-[var(--color-primary)] scale-100"
                          : "bg-transparent scale-0"}
            `}
                    />
                  </button>
                </div>

                {/* DIVIDER */}
                <div className="px-4 py-2">
                  <div className="w-full h-[1px]" style={{ background: "var(--color-border)" }} />
                </div>

                {/* SECOND TABS */}
                <div
                  className="
          px-4 mt-1 
          grid grid-cols-2 gap-3
          max-[600px]:grid-cols-1
        "
                >
                  {/* TODAY */}
                  <button
                    onClick={() => setSubTab("today")}
                    className="relative w-full py-2 rounded-full border text-sm font-medium"
                    style={{
                      color: subTab === "today" ? "var(--color-accent)" : "var(--color-textSecondary)",
                      borderColor: subTab === "today" ? "var(--color-accent)" : "var(--color-border)",
                      background: subTab === "today" ? "var(--color-accent)/10" : "transparent",
                    }}
                  >
                    Today / Daily
                    <span className="
            absolute -top-1 -right-1
            text-[10px] font-semibold text-white
            bg-[var(--color-accent)]
            px-2 py-[2px] rounded-full shadow
          ">
                      {currentTodayCount}
                    </span>
                  </button>

                  {/* OVERDUE */}
                  <button
                    onClick={() => setSubTab("overdue")}
                    className="relative w-full py-2 rounded-full border text-sm font-medium"
                    style={{
                      color: subTab === "overdue" ? "var(--color-error)" : "var(--color-textSecondary)",
                      borderColor: subTab === "overdue" ? "var(--color-error)" : "var(--color-border)",
                      background: subTab === "overdue" ? "var(--color-error)/10" : "transparent",
                    }}
                  >
                    Overdue
                    <span className="
            absolute -top-1 -right-1
            text-[10px] font-semibold text-white
            bg-[var(--color-error)]
            px-2 py-[2px] rounded-full shadow
          ">
                      {currentOverdueCount}
                    </span>
                  </button>
                </div>

                {/* TASK LIST */}
                <div className="mt-4 px-4 pb-3 max-h-[300px] overflow-y-auto">

                  {initialLoading && (
                    <p className="text-center py-4 text-sm text-[var(--color-textSecondary)]">
                      Loading...
                    </p>
                  )}

                  {!initialLoading && currentList.length === 0 && (
                    <p className="text-center py-4 text-sm text-[var(--color-textSecondary)]">
                      No tasks found
                    </p>
                  )}

                  {!initialLoading &&
                    currentList.map((t: any) => (
                      <div
                        key={t._id}
                        className="p-3 mb-2 rounded-lg border flex justify-between items-start hover:bg-[var(--color-surface)] transition"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <div className="flex-1 mr-3">
                          <p className="text-sm font-medium text-[var(--color-text)]">
                            {t.title}
                          </p>
                          <p className="text-xs text-[var(--color-textSecondary)]">
                            {t.assignedBy?.username}
                          </p>
                        </div>

                        {/* COMPLETE ICON */}
                        <button
                          onClick={() => {
                            const path =
                              t.taskType === "one-time"
                                ? "/pending-tasks"
                                : "/pending-recurring";

                            navigate(path, {
                              state: {
                                highlightTaskId: t._id,
                                openCompleteModal: true,
                              },
                            });

                            setNotifOpen(false);
                          }}
                          className="p-1.5 rounded-md border text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          <CheckSquare size={16} />
                        </button>
                      </div>
                    ))}
                </div>

                {/* FOOTER */}
                <div
                  className="p-3 border-t flex justify-between items-center"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <button
                    onClick={() => {
                      navigate(mainTab === "one" ? "/pending-tasks" : "/pending-recurring");
                      setNotifOpen(false);
                    }}
                    className="px-3 py-1 text-xs rounded-md border"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    View All
                  </button>
                </div>
              </div>
            </div>
          )}




        </div>

        {/* Assign Task */}
        {canAssignTasks &&
          <button
            onClick={() => navigate('/assign-task')}
            className="p-2 rounded-xl shadow-sm hover:scale-105 transition"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-primary)"
            }}
          >
            <UserPlus size={20} />
          </button>
        }
        {/* Theme Toggle */}
        <div className="relative">
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 rounded-xl shadow-sm hover:scale-105 transition"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-primary)"
            }}
          >
            {isDark ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>

        {/* User */}
        <div className="flex items-center space-x-2">
          <div className="text-right">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {user?.username}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
              {user?.role}
            </p>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg"
            style={{ color: 'var(--color-error)' }}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;