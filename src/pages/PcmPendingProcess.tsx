import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock3,
  GitBranch,
  Loader2,
  RefreshCcw,
  Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PcmFormFrameModal from '../components/PcmFormFrameModal';
import { usePcmIntegration, type PcmPendingStep } from '../hooks/usePcmIntegration';
import { buildPcmStepFormUrl } from '../utils/pcmStepUrl';

type SortKey = 'due' | 'workflowName' | 'stepName' | 'status' | 'assignees';
type SortDirection = 'asc' | 'desc';
type TableHeader = {
  id?: string;
  label?: string;
  fieldId?: string;
  fieldName?: string;
  name?: string;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getDueTimestamp = (step: PcmPendingStep) => {
  const values = [step.plannedEndAt, step.plannedStartAt, step.startedAt]
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter((ts) => !Number.isNaN(ts));
  return values.length > 0 ? values[0] : Number.POSITIVE_INFINITY;
};

const getAssigneeLabel = (step: PcmPendingStep) => {
  const names = Array.isArray(step.assignedUserNames) ? step.assignedUserNames.filter(Boolean) : [];
  if (names.length > 0) return names.slice(0, 3).join(', ');
  const emails = Array.isArray(step.assignedUserEmails) ? step.assignedUserEmails.filter(Boolean) : [];
  if (emails.length > 0) return emails.slice(0, 3).join(', ');
  return 'Unassigned';
};

const getSearchText = (step: PcmPendingStep) =>
  [
    step.workflowName,
    step.stepName,
    step.displayId,
    step.runId,
    getAssigneeLabel(step),
    step.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const getWorkflowGroupKey = (step: PcmPendingStep) =>
  `${String(step.workflowId || '').trim() || 'wf'}:${String(step.workflowName || '').trim() || 'PCM Workflow'}`;

const getHeaderKey = (header: TableHeader) =>
  String(header.fieldId || header.label || header.fieldName || header.name || '').trim().toLowerCase();

const getHeaderLabel = (header: TableHeader) =>
  String(header.label || header.fieldName || header.name || header.fieldId || 'Field').trim();

const getGroupTableHeaders = (steps: PcmPendingStep[]) => {
  const seen = new Set<string>();
  const headers: TableHeader[] = [];

  steps.forEach((step) => {
    (Array.isArray(step.tableHeaders) ? step.tableHeaders : []).forEach((header: TableHeader) => {
      const key = getHeaderKey(header);
      if (!key || seen.has(key)) return;
      seen.add(key);
      headers.push(header);
    });
  });

  return headers;
};

const getHeaderValue = (step: PcmPendingStep, header: TableHeader) => {
  const displayData =
    step.displayData && typeof step.displayData === 'object'
      ? (step.displayData as Record<string, any>)
      : {};
  const formData = step.formData && typeof step.formData === 'object' ? (step.formData as Record<string, any>) : {};
  const data = { ...displayData, ...formData };
  const candidates = [header.fieldId, header.label, header.fieldName, header.name]
    .filter(Boolean)
    .map((value) => String(value || '').trim());

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return data[key];
    }
  }

  const normalizedMap = new Map(
    Object.entries(data).map(([key, value]) => [String(key || '').trim().toLowerCase(), value])
  );

  for (const key of candidates) {
    const found = normalizedMap.get(key.toLowerCase());
    if (found !== undefined) return found;
  }

  return null;
};

const formatHeaderValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    const text = value
      .map((item) => (item === null || item === undefined ? '' : String(item).trim()))
      .filter(Boolean)
      .join(', ');
    return text || '-';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
};

const PcmPendingProcess: React.FC = () => {
  const { user } = useAuth();
  const { enabled, settings, steps, count, loading, error, refresh } = usePcmIntegration();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<PcmPendingStep | null>(null);
  const [activeUrl, setActiveUrl] = useState<string>('');

  const filteredSteps = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? steps.filter((step) => getSearchText(step).includes(query))
      : [...steps];

    const multiplier = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === 'due') {
        return (getDueTimestamp(a) - getDueTimestamp(b)) * multiplier;
      }

      const aValue =
        sortKey === 'assignees'
          ? getAssigneeLabel(a)
          : String(a[sortKey] || '').toLowerCase();
      const bValue =
        sortKey === 'assignees'
          ? getAssigneeLabel(b)
          : String(b[sortKey] || '').toLowerCase();

      return aValue.localeCompare(bValue) * multiplier;
    });

    return list;
  }, [search, sortDirection, sortKey, steps]);

  const workflowGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        workflowId?: string;
        workflowName: string;
        steps: PcmPendingStep[];
      }
    >();

    filteredSteps.forEach((step) => {
      const key = getWorkflowGroupKey(step);
      if (!groups.has(key)) {
        groups.set(key, {
          workflowId: step.workflowId,
          workflowName: step.workflowName || 'PCM Workflow',
          steps: [],
        });
      }
      groups.get(key)!.steps.push(step);
    });

    return Array.from(groups.entries()).map(([key, value]) => ({
      key,
      ...value,
    }));
  }, [filteredSteps]);

  const openStep = (step: PcmPendingStep) => {
    const url = buildPcmStepFormUrl(step, {
      companyId: user?.company?.companyId || user?.companyId,
      userEmail: user?.email,
      userRole: user?.role,
    });

    if (!url) {
      setLaunchError('Configure VITE_PCM_STEP_FORM_URL_TEMPLATE or VITE_PCM_FRONTEND_URL to open the PCM form.');
      return;
    }

    setLaunchError(null);
    setActiveStep(step);
    setActiveUrl(url);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'due' ? 'asc' : 'asc');
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={14} className="opacity-60" />;
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  return (
    <div className="min-h-full bg-[var(--color-background)] p-6">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
            PCM Workspace
          </p>
          <h1 className="text-lg font-bold text-[var(--color-text)]">PCM Pending Process</h1>
          <p className="mt-1 text-xs text-[var(--color-textSecondary)]">
            {count} pending step(s) synced from PCM
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-textSecondary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflow, step, assignee or run"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 pl-10 pr-4 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)] sm:w-96"
            />
          </div>

          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary)]/10"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {enabled && settings.showInPendingPages === false && (
        <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-textSecondary)]">
          PCM integration is enabled. This dedicated page stays available even when pending-page embedding is turned off.
        </div>
      )}

      {!enabled && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-sm text-[var(--color-textSecondary)]">
          PCM integration is disabled. Turn it on from Settings to view pending PCM steps here.
        </div>
      )}

      {enabled && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {launchError && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {launchError}
        </div>
      )}

      {enabled && loading && (
        <div className="mt-8 flex items-center gap-2 text-sm text-[var(--color-textSecondary)]">
          <Loader2 size={16} className="animate-spin" />
          Loading PCM steps...
        </div>
      )}

      {enabled && !loading && (
        <div className="mt-4 space-y-4">
          {workflowGroups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-textSecondary)] shadow-sm">
              No PCM pending steps found.
            </div>
          ) : (
            workflowGroups.map((group) => {
              const groupHeaders = getGroupTableHeaders(group.steps);
              const hasDynamicHeaders = groupHeaders.length > 0;

              return (
                <div key={group.key} className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
                        <GitBranch size={14} />
                        Workflow
                      </div>
                      <h2 className="truncate text-base font-bold text-[var(--color-text)]">
                        {group.workflowName || 'PCM Workflow'}
                      </h2>
                    </div>
                    <div className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
                      {group.steps.length} pending
                    </div>
                  </div>

                  <div className="max-h-[calc(100vh-260px)] overflow-auto">
                    <table className="min-w-full divide-y divide-[var(--color-border)]">
                      <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-textSecondary)]">
                          <th className="px-4 py-3">
                            <button type="button" onClick={() => toggleSort('workflowName')} className="inline-flex items-center gap-2">
                              ID {renderSortIcon('workflowName')}
                            </button>
                          </th>
                          <th className="px-4 py-3">
                            <button type="button" onClick={() => toggleSort('stepName')} className="inline-flex items-center gap-2">
                              Step {renderSortIcon('stepName')}
                            </button>
                          </th>
                          <th className="px-4 py-3">
                            <button type="button" onClick={() => toggleSort('assignees')} className="inline-flex items-center gap-2">
                              Assignee {renderSortIcon('assignees')}
                            </button>
                          </th>
                          {hasDynamicHeaders ? (
                            groupHeaders.map((header) => (
                              <th key={getHeaderKey(header) || getHeaderLabel(header)} className="px-4 py-3">
                                {getHeaderLabel(header)}
                              </th>
                            ))
                          ) : (
                            <th className="px-4 py-3">PCM Form</th>
                          )}
                          <th className="px-4 py-3">
                            <button type="button" onClick={() => toggleSort('due')} className="inline-flex items-center gap-2">
                              Planned Date {renderSortIcon('due')}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {group.steps.map((step) => {
                          const fieldCount = Array.isArray(step.formFields) ? step.formFields.length : 0;
                          const key = `${step.runId}:${step.stepId}`;
                          return (
                            <tr
                              key={key}
                              role="button"
                              tabIndex={0}
                              onClick={() => openStep(step)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openStep(step);
                                }
                              }}
                              className="cursor-pointer transition-colors hover:bg-[var(--color-primary)]/5 focus:bg-[var(--color-primary)]/5"
                            >
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                                    <GitBranch size={16} />
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-[var(--color-text)]">
                                      {step.displayId || step.runId}
                                    </div>
                                    <div className="truncate text-xs text-[var(--color-textSecondary)]">
                                      Run identifier
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm font-medium text-[var(--color-text)]">{step.stepName}</div>
                              </td>
                              <td className="px-4 py-4 text-sm text-[var(--color-textSecondary)]">
                                {getAssigneeLabel(step)}
                              </td>
                              {hasDynamicHeaders ? (
                                groupHeaders.map((header) => {
                                  const value = getHeaderValue(step, header);
                                  return (
                                    <td key={`${key}:${getHeaderKey(header) || getHeaderLabel(header)}`} className="px-4 py-4 text-sm text-[var(--color-textSecondary)]">
                                      {formatHeaderValue(value)}
                                    </td>
                                  );
                                })
                              ) : (
                                <td className="px-4 py-4 text-sm text-[var(--color-textSecondary)]">
                                  {fieldCount} field{fieldCount === 1 ? '' : 's'}
                                </td>
                              )}
                              <td className="px-4 py-4 text-sm text-[var(--color-textSecondary)]">
                                <div className="flex items-center gap-2">
                                  <Clock3 size={14} className="text-[var(--color-textSecondary)]" />
                                  {formatDate(step.plannedEndAt || step.plannedStartAt || null)}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openStep(step);
                                  }}
                                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                                >
                                  Open PCM
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <PcmFormFrameModal
        open={Boolean(activeStep && activeUrl)}
        url={activeUrl}
        step={activeStep}
        onCompleted={() => {
          void refresh();
          setActiveStep(null);
          setActiveUrl('');
        }}
        onClose={() => {
          setActiveStep(null);
          setActiveUrl('');
        }}
      />

    </div>
  );
};

export default PcmPendingProcess;
