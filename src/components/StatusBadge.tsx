import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20';
      case 'pending':
        return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20';
      case 'overdue':
        return 'bg-[var(--color-error)]/10 text-[var(--color-error)] border-[var(--color-error)]/20';
      case 'in-progress':
        return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20';
      case 'due today':
        return 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20';
      case 'due tomorrow':
        return 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20';
      case 'daily':
        return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20';
      case 'cyclic':
        return 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20';
      default:
        return 'bg-[var(--color-background)] text-[var(--color-textSecondary)] border-[var(--color-border)]';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-sm';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold tracking-[0.14em] uppercase ${sizeClasses} ${getStatusStyles(
        status
      )}`}
    >
      {status.toUpperCase()}
    </span>
  );
};

export default StatusBadge;
