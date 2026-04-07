import React from 'react';

import { AlertTriangle, Flame, Gauge, Sprout } from 'lucide-react';

interface PriorityBadgeProps {
  priority: string;
  size?: 'sm' | 'md';
}

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'sm' }) => {
  const getPriorityMeta = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
        return {
          className:
            'bg-[var(--color-error)]/10 text-[var(--color-error)] border-[var(--color-error)]/20',
          icon: AlertTriangle,
          iconClass: 'bg-[var(--color-error)]/12',
        };
      case 'high':
        return {
          className:
            'bg-[var(--color-warning)]/10 text-[#c2410c] border-[var(--color-warning)]/20',
          icon: Flame,
          iconClass: 'bg-[var(--color-warning)]/12',
        };
      case 'medium':
        return {
          className:
            'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/20',
          icon: Gauge,
          iconClass: 'bg-[var(--color-primary)]/12',
        };
      case 'low':
        return {
          className:
            'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20',
          icon: Sprout,
          iconClass: 'bg-[var(--color-success)]/12',
        };
      default:
        return {
          className: 'bg-[var(--color-background)] text-[var(--color-textSecondary)] border-[var(--color-border)]',
          icon: null,
          iconClass: '',
        };
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-sm';
  const { className, icon: Icon, iconClass } = getPriorityMeta(priority);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-[0.12em] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur-sm ${sizeClasses} ${className}`}
    >
      {Icon && (
        <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${iconClass}`}>
          <Icon size={9} className="shrink-0" />
        </span>
      )}
      <span className="translate-y-px">{priority.toUpperCase()}</span>
    </span>
  );
};

export default PriorityBadge;
