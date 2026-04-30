import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';
import AssignTask from '../pages/AssignTask';
import {
  AssignTaskModalContext,
  type AssignTaskModalOptions,
} from '../contexts/AssignTaskModalContext';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assignTaskModalOpen, setAssignTaskModalOpen] = useState(false);
  const [assignTaskModalOptions, setAssignTaskModalOptions] = useState<AssignTaskModalOptions>({});
  const [assignTaskModalKey, setAssignTaskModalKey] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const state = location.state as {
      openAssignTaskModal?: boolean;
      assignTaskModalOptions?: AssignTaskModalOptions;
    } | null;

    if (!state?.openAssignTaskModal) return;

    setAssignTaskModalOptions(state.assignTaskModalOptions || {});
    setAssignTaskModalKey(prev => prev + 1);
    setAssignTaskModalOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  const assignTaskModalContext = useMemo(
    () => ({
      isAssignTaskModalOpen: assignTaskModalOpen,
      openAssignTaskModal: (options: AssignTaskModalOptions = {}) => {
        setAssignTaskModalOptions(options);
        setAssignTaskModalKey(prev => prev + 1);
        setAssignTaskModalOpen(true);
      },
      closeAssignTaskModal: () => setAssignTaskModalOpen(false),
    }),
    [assignTaskModalOpen]
  );

  const closeAssignTaskModal = () => setAssignTaskModalOpen(false);

  return (
    <AssignTaskModalContext.Provider value={assignTaskModalContext}>
      <div className="flex h-screen min-w-0 overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto" style={{ backgroundColor: 'var(--color-surface)' }}>
            <Outlet />
          </main>
        </div>

        {assignTaskModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-stretch justify-stretch bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
            <div className="flex h-[100dvh] w-full max-w-[1060px] flex-col overflow-hidden rounded-none border-0 border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_32px_110px_rgba(15,23,42,0.28)] sm:h-[min(92dvh,940px)] sm:rounded-[28px] sm:border">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-5 sm:pb-2.5 sm:pt-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary)] sm:text-[11px]">
                    Task assignment
                  </p>
                  <h2 className="truncate text-base font-semibold text-[var(--color-text)] sm:text-lg">
                    {assignTaskModalOptions.mode === 'reassign' ? 'Reassign task' : 'Assign task'}
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div id="assign-task-header-actions" className="flex items-center gap-2" />
                  <button
                    type="button"
                    onClick={closeAssignTaskModal}
                    aria-label="Close assign task"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)] transition hover:text-[var(--color-error)] sm:rounded-2xl"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <AssignTask
                  key={assignTaskModalKey}
                  isModal
                  onClose={closeAssignTaskModal}
                  initialMode={assignTaskModalOptions.mode}
                  initialTaskGroupId={assignTaskModalOptions.taskGroupId}
                  initialOriginalTaskId={assignTaskModalOptions.originalTaskId}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AssignTaskModalContext.Provider>
  );
};

export default Layout;
