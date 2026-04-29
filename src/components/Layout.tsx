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
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
            <div className="flex h-[min(90dvh,920px)] w-full max-w-[980px] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    Task assignment
                  </p>
                  <h2 className="truncate text-lg font-semibold text-[var(--color-text)]">
                    {assignTaskModalOptions.mode === 'reassign' ? 'Reassign task' : 'Assign task'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeAssignTaskModal}
                  aria-label="Close assign task"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)] transition hover:text-[var(--color-error)]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
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
