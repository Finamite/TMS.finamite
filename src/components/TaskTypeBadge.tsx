import React from 'react';

interface TaskTypeBadgeProps {
  taskType: string;
  size?: 'sm' | 'md';
}

const TaskTypeBadge: React.FC<TaskTypeBadgeProps> = ({ taskType, size = 'sm' }) => {
  const getTaskTypeStyles = (taskType: string) => {
    switch (taskType.toLowerCase()) {
      case 'daily':
        return 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20';
      case 'weekly':
        return 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20';
      case 'fortnightly':
        return 'bg-sky-500/10 text-sky-600 border-sky-500/20';
      case 'monthly':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'yearly':
        return 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20';
      case 'one-time':
        return 'bg-[var(--color-background)] text-[var(--color-textSecondary)] border-[var(--color-border)]';
      default:
        return 'bg-[var(--color-background)] text-[var(--color-textSecondary)] border-[var(--color-border)]';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-sm';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold tracking-[0.14em] uppercase ${sizeClasses} ${getTaskTypeStyles(
        taskType
      )}`}
    >
      {taskType.toUpperCase()}
    </span>
  );
};

export default TaskTypeBadge;
