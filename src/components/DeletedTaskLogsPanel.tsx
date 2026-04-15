import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Building2, Calendar, CheckCircle2, Filter, History, Loader2, RefreshCw, Search, Trash2, Users, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { address } from '../../utils/ipAddress';
import { toast } from 'react-toastify';

type CompanyOption = {
  companyId: string;
  companyName: string;
};

type DeleteLog = {
  _id: string;
  companyId: string;
  companyName: string;
  taskId: string;
  taskGroupId: string;
  taskType: string;
  taskFamily: 'one-time' | 'recurring';
  taskTitle: string;
  taskDescription: string;
  assignedByName: string;
  assignedToName: string;
  deletedByName: string;
  deletedByRole?: string;
  deleteMode: 'soft' | 'permanent';
  source?: string;
  sourceTaskObjectId?: string;
  deletedAt: string;
  dateFrom?: string;
  dateTo?: string;
  instanceCount?: number;
  dueDate?: string;
  status?: string;
  priority?: string;
  sequenceNumber?: number;
};

type UserOption = {
  _id: string;
  username: string;
  email?: string;
  companyId?: string;
};

const taskTypeOptions = [
  'all',
  'one-time',
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'yearly'
];

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  const hasTime =
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0 ||
    date.getMilliseconds() !== 0;

  const dateLabel = format(date, 'dd/MM/yyyy');
  return hasTime ? `${dateLabel}, ${format(date, 'h:mm a')}` : dateLabel;
};

const formatDateRange = (from?: string, to?: string) => {
  if (!from && !to) return '—';
  const fromLabel = from ? format(new Date(from), 'dd/MM/yyyy') : '—';
  const toLabel = to ? format(new Date(to), 'dd/MM/yyyy') : '—';
  if (fromLabel === toLabel) return fromLabel;
  return `${fromLabel} to ${toLabel}`;
};

const DeletedTaskLogsPanel: React.FC<{ companies: CompanyOption[] }> = ({ companies }) => {
  const [logs, setLogs] = useState<DeleteLog[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageLimit, setPageLimit] = useState(25);
  const didMountSearchEffect = useRef(false);
  const [recoveringLogId, setRecoveringLogId] = useState<string | null>(null);
  const [recoveredLogIds, setRecoveredLogIds] = useState<Set<string>>(() => new Set());
  const [pendingRecoverLog, setPendingRecoverLog] = useState<DeleteLog | null>(null);
  const [successRecoverLog, setSuccessRecoverLog] = useState<DeleteLog | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    companyId: 'all',
    taskType: 'all',
    assignedTo: 'all',
    assignedBy: 'all',
    deletedBy: 'all',
    dateFrom: '',
    dateTo: ''
  });

  const companyNameMap = useMemo(() => {
    return new Map(companies.map((company) => [company.companyId, company.companyName]));
  }, [companies]);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${address}/api/users`, {
        params: { includeInactive: 'true' }
      });
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to fetch users for delete log filters:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {
        page: String(page),
        limit: String(pageLimit)
      };

      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.companyId !== 'all') params.companyId = filters.companyId;
      if (filters.taskType !== 'all') params.taskType = filters.taskType;
      if (filters.assignedTo !== 'all') params.assignedTo = filters.assignedTo;
      if (filters.assignedBy !== 'all') params.assignedBy = filters.assignedBy;
      if (filters.deletedBy !== 'all') params.deletedBy = filters.deletedBy;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const response = await axios.get(`${address}/api/tasks/delete-logs`, { params });
      setLogs(response.data?.logs || []);
      setTotal(response.data?.total || 0);
      setTotalPages(response.data?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch delete logs:', error);
      setLogs([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageLimit, filters.companyId, filters.taskType, filters.assignedTo, filters.assignedBy, filters.deletedBy, filters.dateFrom, filters.dateTo]);

  const debouncedSearch = useMemo(() => filters.search, [filters.search]);

  useEffect(() => {
    if (!didMountSearchEffect.current) {
      didMountSearchEffect.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      if (page !== 1) {
        setPage(1);
      } else {
        fetchLogs();
      }
    }, 300);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleLimitChange = (value: string) => {
    setPage(1);
    setPageLimit(Number(value) || 25);
  };

  const resetFilters = () => {
    setPage(1);
    setFilters({
      search: '',
      companyId: 'all',
      taskType: 'all',
      assignedTo: 'all',
      assignedBy: 'all',
      deletedBy: 'all',
      dateFrom: '',
      dateTo: ''
    });
    setPageLimit(25);
  };

  const normalizeId = (value: unknown) => {
    if (!value) return '';
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'object' && value !== null && '_id' in value) {
      return normalizeId((value as { _id?: unknown })._id);
    }
    return String(value).trim();
  };

  const handleRecoverLog = async (log: DeleteLog) => {
    if (recoveredLogIds.has(log._id) || recoveringLogId === log._id) {
      return;
    }

    const isRecurringSeries = log.taskFamily === 'recurring';
    const restoreTarget = isRecurringSeries
      ? normalizeId(log.taskGroupId)
      : normalizeId(log.sourceTaskObjectId) || normalizeId(log.taskId);

    if (log.deleteMode === 'permanent' && !isRecurringSeries) {
      toast.info('Permanent one-time deletions cannot be recovered from task delete logs yet.');
      return;
    }

    if (!restoreTarget) {
      toast.error('This log entry does not have enough information to recover the task.');
      return;
    }

    try {
      setRecoveringLogId(log._id);

      if (isRecurringSeries && log.deleteMode === 'permanent') {
        await axios.post(`${address}/api/tasks/bin/restore-permanent-recurring/${restoreTarget}`, {
          companyId: log.companyId
        });
        toast.success('Recurring series restored successfully');
      } else if (isRecurringSeries) {
        await axios.post(`${address}/api/tasks/bin/restore-master/${restoreTarget}`, {
          companyId: log.companyId
        });
        toast.success('Recurring series restored successfully');
      } else {
        await axios.post(`${address}/api/tasks/bin/restore/${restoreTarget}`, {
          companyId: log.companyId
        });
        toast.success('Task restored successfully');
      }

      setRecoveredLogIds((prev) => {
        const next = new Set(prev);
        next.add(log._id);
        return next;
      });
      setSuccessRecoverLog(log);
    } catch (error) {
      console.error('Failed to recover task from logs:', error);
      toast.error('Failed to recover task from logs');
    } finally {
      setRecoveringLogId(null);
    }
  };

  const openRecoverModal = (log: DeleteLog) => {
    if (recoveredLogIds.has(log._id) || recoveringLogId === log._id) {
      return;
    }
    setPendingRecoverLog(log);
  };

  const confirmRecoverFromModal = () => {
    if (!pendingRecoverLog) return;
    const log = pendingRecoverLog;
    setPendingRecoverLog(null);
    void handleRecoverLog(log);
  };

  const closeSuccessModal = () => {
    setSuccessRecoverLog(null);
  };

  const userLabel = (user: UserOption) => {
    const companyName = user.companyId ? companyNameMap.get(user.companyId) : '';
    return companyName ? `${user.username} • ${companyName}` : user.username;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 sm:p-5 shadow-sm" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <History size={20} style={{ color: 'var(--color-primary)' }} />
              <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Deleted Task Logs
              </h2>
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-textSecondary)' }}>
              Company-wise deletion history with search, date, assignee, assigner, and deleter filters. Soft-deleted rows can be recovered from here.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border px-4 py-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surfacehelp)' }}>
            <Trash2 size={16} style={{ color: 'var(--color-warning)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {total} deleted tasks
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="relative lg:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-textSecondary)' }} />
            <input
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search task title, task ID, company, assignee, assigner, or deleter"
              className="w-full rounded-xl border px-10 py-3 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-background)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            />
          </div>

          <button
            onClick={resetFilters}
            className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-surfacehelp)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <Filter size={16} />
            Reset Filters
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select
            value={filters.companyId}
            onChange={(e) => handleFilterChange('companyId', e.target.value)}
            className="rounded-xl border px-3 py-3 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <option value="all">All Companies</option>
            {companies.map((company) => (
              <option key={company.companyId} value={company.companyId}>
                {company.companyName}
              </option>
            ))}
          </select>

          <select
            value={filters.taskType}
            onChange={(e) => handleFilterChange('taskType', e.target.value)}
            className="rounded-xl border px-3 py-3 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            {taskTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All Task Types' : option.replace(/-/g, ' ')}
              </option>
            ))}
          </select>

          <select
            value={filters.assignedTo}
            onChange={(e) => handleFilterChange('assignedTo', e.target.value)}
            className="rounded-xl border px-3 py-3 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <option value="all">All Assigned To</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>
                {userLabel(user)}
              </option>
            ))}
          </select>

          <select
            value={filters.assignedBy}
            onChange={(e) => handleFilterChange('assignedBy', e.target.value)}
            className="rounded-xl border px-3 py-3 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <option value="all">All Assigned By</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>
                {userLabel(user)}
              </option>
            ))}
          </select>

          <select
            value={filters.deletedBy}
            onChange={(e) => handleFilterChange('deletedBy', e.target.value)}
            className="rounded-xl border px-3 py-3 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
          >
            <option value="all">All Deleted By</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>
                {userLabel(user)}
              </option>
            ))}
          </select>

          <div className="relative">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-textSecondary)' }} />
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full rounded-xl border px-10 py-3 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-background)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            />
          </div>

          <div className="relative">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-textSecondary)' }} />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full rounded-xl border px-10 py-3 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-background)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)'
              }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1360px]">
            <thead style={{ backgroundColor: 'var(--color-surfacehelp)' }}>
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Task</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Company</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Type</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Date Range</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Assigned To</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Assigned By</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Deleted By</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Deleted At</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Mode</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Recover</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10">
                    <div className="flex items-center justify-center gap-2" style={{ color: 'var(--color-textSecondary)' }}>
                      <Loader2 size={18} className="animate-spin" />
                      Loading delete logs...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <div className="text-sm" style={{ color: 'var(--color-textSecondary)' }}>
                      No deleted task logs found for the selected filters.
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-opacity-40" style={{ backgroundColor: 'transparent' }}>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
                          {log.taskTitle || 'Untitled Task'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                          {log.taskId || '—'}
                        </div>
                        {log.taskDescription && (
                          <div className="text-xs line-clamp-2" style={{ color: 'var(--color-textSecondary)' }}>
                            {log.taskDescription}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 size={15} style={{ color: 'var(--color-primary)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                          {log.companyName || log.companyId}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: 'rgba(59, 130, 246, 0.25)', color: 'var(--color-primary)', backgroundColor: 'rgba(59, 130, 246, 0.08)' }}>
                          {log.taskType || '—'}
                        </span>
                        <div>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${log.taskFamily === 'one-time' ? '' : ''}`} style={{
                            borderColor: log.taskFamily === 'one-time' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(249, 115, 22, 0.25)',
                            color: log.taskFamily === 'one-time' ? 'var(--color-success)' : 'var(--color-warning)',
                            backgroundColor: log.taskFamily === 'one-time' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(249, 115, 22, 0.08)'
                          }}>
                            {log.taskFamily === 'one-time' ? 'One-time' : 'Recurring'}
                          </span>
                        </div>
                        {log.instanceCount && log.instanceCount > 1 && (
                          <div className="text-xs font-medium" style={{ color: 'var(--color-textSecondary)' }}>
                            {log.instanceCount} instances
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {formatDateRange(log.dateFrom, log.dateTo)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Users size={15} style={{ color: 'var(--color-textSecondary)' }} />
                        <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                          {log.assignedToName || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                        {log.assignedByName || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                        {log.deletedByName || 'System Cleanup'}
                      </span>
                      {log.deletedByRole && (
                        <div className="text-xs capitalize" style={{ color: 'var(--color-textSecondary)' }}>
                          {log.deletedByRole}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                        {formatDateTime(log.deletedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium" style={{
                        borderColor: log.deleteMode === 'soft' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                        color: log.deleteMode === 'soft' ? 'rgb(168, 85, 247)' : 'rgb(239, 68, 68)',
                        backgroundColor: log.deleteMode === 'soft' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(239, 68, 68, 0.08)'
                      }}>
                        {log.deleteMode === 'soft' ? 'Recycle Bin' : 'Permanent'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {log.deleteMode === 'soft' || (log.deleteMode === 'permanent' && log.taskFamily === 'recurring') ? (
                        <button
                          type="button"
                          onClick={() => openRecoverModal(log)}
                          disabled={recoveringLogId === log._id || recoveredLogIds.has(log._id)}
                          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            borderColor: recoveredLogIds.has(log._id)
                              ? 'rgba(34, 197, 94, 0.25)'
                              : 'rgba(59, 130, 246, 0.22)',
                            color: recoveredLogIds.has(log._id)
                              ? 'var(--color-success)'
                              : 'var(--color-primary)',
                            backgroundColor: recoveredLogIds.has(log._id)
                              ? 'rgba(34, 197, 94, 0.08)'
                              : 'rgba(59, 130, 246, 0.08)'
                          }}
                        >
                          {recoveringLogId === log._id ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Recovering
                            </>
                          ) : recoveredLogIds.has(log._id) ? (
                            <>
                              <CheckCircle2 size={14} />
                              Recovered
                            </>
                          ) : (
                            <>
                              <RefreshCw size={14} />
                              Recover
                            </>
                          )}
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-xl border px-3 py-2 text-xs font-medium"
                          style={{
                            borderColor: 'rgba(148, 163, 184, 0.25)',
                            color: 'var(--color-textSecondary)',
                            backgroundColor: 'rgba(148, 163, 184, 0.08)'
                          }}
                        >
                          Unavailable
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t px-4 py-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-textSecondary)' }}>
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>Show</span>
              <select
                value={pageLimit}
                onChange={(e) => handleLimitChange(e.target.value)}
                className="rounded-xl border px-2 py-1 text-sm outline-none transition focus:border-[var(--color-primary)]"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)'
                }}
              >
                {[10, 25, 50, 100].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span>per page</span>
            </div>
            <div className="rounded-2xl border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-textSecondary)' }}>
              Showing{' '}
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                {total === 0 ? 0 : (page - 1) * pageLimit + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                {Math.min(page * pageLimit, total)}
              </span>{' '}
              of{' '}
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                {total}
              </span>{' '}
              results
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-textSecondary)' }}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-textSecondary)' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-textSecondary)' }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-textSecondary)' }}
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {pendingRecoverLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-[28px] border bg-[var(--color-surface)] p-6 shadow-2xl" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ borderColor: 'rgba(59, 130, 246, 0.18)', color: 'var(--color-primary)' }}>
                  Recover Task
                </div>
                <h3 className="mt-3 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
                  Recover deleted task?
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-textSecondary)' }}>
                  {pendingRecoverLog.taskFamily === 'recurring'
                    ? `This will restore the recurring series "${pendingRecoverLog.taskTitle || 'Untitled Task'}" for ${pendingRecoverLog.companyName || pendingRecoverLog.companyId}.`
                    : `This will restore the task "${pendingRecoverLog.taskTitle || 'Untitled Task'}" for ${pendingRecoverLog.companyName || pendingRecoverLog.companyId}.`}
                </p>
                <p className="mt-2 text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                  Mode: {pendingRecoverLog.deleteMode === 'soft' ? 'Recycle Bin' : 'Permanent'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingRecoverLog(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors hover:opacity-90"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                aria-label="Close recover modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingRecoverLog(null)}
                className="rounded-2xl border px-5 py-3 text-sm font-medium transition-colors hover:opacity-90"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRecoverFromModal}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium text-white transition-colors hover:opacity-95"
                style={{
                  backgroundColor: 'var(--color-primary)'
                }}
              >
                <RefreshCw size={16} />
                Recover Now
              </button>
            </div>
          </div>
        </div>
      )}

      {successRecoverLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[28px] border bg-[var(--color-surface)] p-6 text-center shadow-2xl" style={{ borderColor: 'var(--color-border)' }}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border" style={{ borderColor: 'rgba(34, 197, 94, 0.22)', backgroundColor: 'rgba(34, 197, 94, 0.08)', color: 'var(--color-success)' }}>
              <CheckCircle2 size={30} />
            </div>
            <h3 className="mt-4 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
              Recovered successfully
            </h3>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--color-textSecondary)' }}>
              {successRecoverLog.taskTitle || 'The selected task'} has been recovered and is available again in the task list.
            </p>
            <button
              type="button"
              onClick={closeSuccessModal}
              className="mt-6 rounded-2xl px-5 py-3 text-sm font-medium text-white transition-colors hover:opacity-95"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeletedTaskLogsPanel;
