import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, AlertTriangle, Users, Sparkles } from 'lucide-react';

interface TeamPendingCounts {
  oneTimeToday: number;
  oneTimeOverdue: number;
  dailyToday: number;
  recurringToday: number;
  recurringOverdue: number;
}

interface TeamPendingData {
  [username: string]: TeamPendingCounts;
}

interface UserData {
  username: string;
  role: string;
}

interface Props {
  teamPendingData: TeamPendingData;
  user: UserData;
}

type MemberSummary = {
  username: string;
  pending: number;
  overdue: number;
  oneTimeToday: number;
  oneTimeOverdue: number;
  dailyToday: number;
  recurringToday: number;
  recurringOverdue: number;
};

const TeamPendingTasksChart = ({ teamPendingData, user }: Props) => {
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isCompact = typeof window !== 'undefined' && window.innerWidth < 768;
  const pageSize = isCompact ? 3 : 4;

  const members = useMemo<MemberSummary[]>(() => {
    return Object.entries(teamPendingData || {})
      .map(([username, data]) => {
        const pending = (data?.oneTimeToday || 0) + (data?.dailyToday || 0) + (data?.recurringToday || 0);
        const overdue = (data?.oneTimeOverdue || 0) + (data?.recurringOverdue || 0);

        return {
          username,
          pending,
          overdue,
          oneTimeToday: data?.oneTimeToday || 0,
          oneTimeOverdue: data?.oneTimeOverdue || 0,
          dailyToday: data?.dailyToday || 0,
          recurringToday: data?.recurringToday || 0,
          recurringOverdue: data?.recurringOverdue || 0
        };
      })
      .sort((a, b) => (b.pending + b.overdue) - (a.pending + a.overdue));
  }, [teamPendingData]);

  const personalSummary = useMemo<MemberSummary>(() => {
    const data = teamPendingData[user.username] || {
      oneTimeToday: 0,
      oneTimeOverdue: 0,
      dailyToday: 0,
      recurringToday: 0,
      recurringOverdue: 0
    };

    const pending = (data.oneTimeToday || 0) + (data.dailyToday || 0) + (data.recurringToday || 0);
    const overdue = (data.oneTimeOverdue || 0) + (data.recurringOverdue || 0);

    return {
      username: user.username,
      pending,
      overdue,
      oneTimeToday: data.oneTimeToday || 0,
      oneTimeOverdue: data.oneTimeOverdue || 0,
      dailyToday: data.dailyToday || 0,
      recurringToday: data.recurringToday || 0,
      recurringOverdue: data.recurringOverdue || 0
    };
  }, [teamPendingData, user.username]);

  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil((isAdmin ? members.length : 1) / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleMembers = isAdmin
    ? members.slice(safePage * pageSize, safePage * pageSize + pageSize)
    : [personalSummary];

  useEffect(() => {
    setPage(0);
  }, [pageSize, members.length, isAdmin]);

  const totalPending = visibleMembers.reduce((sum, member) => sum + member.pending, 0);
  const totalOverdue = visibleMembers.reduce((sum, member) => sum + member.overdue, 0);

  const hasAnyData = (isAdmin ? members : [personalSummary]).some((member) => member.pending > 0 || member.overdue > 0);

  const goPrev = () => setPage((current) => Math.max(0, current - 1));
  const goNext = () => setPage((current) => Math.min(totalPages - 1, current + 1));

  if (!hasAnyData) {
    return (
      <div className="rounded-[24px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
          <Sparkles size={22} className="text-[var(--color-primary)]" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-[var(--color-text)]">No pending or overdue tasks</h3>
        <p className="mt-2 text-sm text-[var(--color-textSecondary)]">
          Great job. The selected team currently has nothing pending today.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
            Pending work by member
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm text-[var(--color-textSecondary)]">
            <Users size={14} />
            <span>{isAdmin ? `${members.length} members` : 'Your workload'}</span>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={safePage === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={safePage >= totalPages - 1}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Shown pending</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{totalPending}</p>
          </div>
          <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Shown overdue</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{totalOverdue}</p>
          </div>
          <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">Page</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {safePage + 1}/{totalPages}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {visibleMembers.map((member) => {
          const total = Math.max(member.pending + member.overdue, 1);
          const pendingShare = Math.max((member.pending / total) * 100, 8);
          const overdueShare = Math.max((member.overdue / total) * 100, 8);

          return (
            <div
              key={member.username}
              className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{member.username}</p>
                  <p className="mt-1 text-xs text-[var(--color-textSecondary)]">
                    {member.pending} pending, {member.overdue} overdue
                  </p>
                </div>
                <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-textSecondary)]">
                  {member.pending} active
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                <div className="flex h-full">
                  <div
                    className="h-full rounded-l-full bg-[var(--color-primary)]"
                    style={{ width: `${pendingShare}%` }}
                  />
                  <div
                    className="h-full rounded-r-full bg-slate-200 dark:bg-slate-600"
                    style={{ width: `${overdueShare}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <p className="text-[var(--color-textSecondary)]">One-time</p>
                  <p className="mt-1 font-semibold text-[var(--color-text)]">{member.oneTimeToday}</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <p className="text-[var(--color-textSecondary)]">Daily</p>
                  <p className="mt-1 font-semibold text-[var(--color-text)]">{member.dailyToday}</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <p className="text-[var(--color-textSecondary)]">Recurring</p>
                  <p className="mt-1 font-semibold text-[var(--color-text)]">{member.recurringToday + member.recurringOverdue}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 font-semibold text-[var(--color-primary)]">
                  <Clock3 size={12} />
                  Pending {member.pending}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 font-semibold text-[var(--color-textSecondary)]">
                  <AlertTriangle size={12} />
                  Overdue {member.overdue}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--color-textSecondary)]">
          <span>
            Showing {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, members.length)} of {members.length}
          </span>
          <span>Use the arrows to browse the rest of the team</span>
        </div>
      )}
    </div>
  );
};

export default TeamPendingTasksChart;
