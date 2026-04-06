import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Building2, Calendar, Filter, History, Loader2, Search, Trash2, Users, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { address } from '../../utils/ipAddress';

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
  deletedAt: string;
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
  return new Date(value).toLocaleString();
};

const DeletedTaskLogsPanel: React.FC<{ companies: CompanyOption[] }> = ({ companies }) => {
  const [logs, setLogs] = useState<DeleteLog[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const didMountSearchEffect = useRef(false);
  const [filters, setFilters] = useState({
    search: '',
    companyId: 'all',
    taskType: 'all',
    assignedTo: 'all',
    assignedBy: 'all',
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
        limit: '25'
      };

      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.companyId !== 'all') params.companyId = filters.companyId;
      if (filters.taskType !== 'all') params.taskType = filters.taskType;
      if (filters.assignedTo !== 'all') params.assignedTo = filters.assignedTo;
      if (filters.assignedBy !== 'all') params.assignedBy = filters.assignedBy;
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
  }, [page, filters.companyId, filters.taskType, filters.assignedTo, filters.assignedBy, filters.dateFrom, filters.dateTo]);

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

  const resetFilters = () => {
    setPage(1);
    setFilters({
      search: '',
      companyId: 'all',
      taskType: 'all',
      assignedTo: 'all',
      assignedBy: 'all',
      dateFrom: '',
      dateTo: ''
    });
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
              Company-wise deletion history with search, date, assignee, and assigner filters.
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

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
          <table className="w-full min-w-[1200px]">
            <thead style={{ backgroundColor: 'var(--color-surfacehelp)' }}>
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Task</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Company</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Type</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Assigned To</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Assigned By</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Deleted By</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Deleted At</th>
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10">
                    <div className="flex items-center justify-center gap-2" style={{ color: 'var(--color-textSecondary)' }}>
                      <Loader2 size={18} className="animate-spin" />
                      Loading delete logs...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-sm" style={{ color: 'var(--color-textSecondary)' }}>
            Showing {logs.length} of {total} deleted tasks
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="rounded-lg border p-2 transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="rounded-lg border p-2 transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border p-2 transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-lg border p-2 transition-colors disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeletedTaskLogsPanel;
