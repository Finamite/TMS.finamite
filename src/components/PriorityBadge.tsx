import React from 'react';

interface PriorityBadgeProps {
  priority: string;
  size?: 'sm' | 'md';
}

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'sm' }) => {
  const getPriorityStyles = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
        return {
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          color: 'var(--color-error)',
          borderColor: 'rgba(239, 68, 68, 0.24)',
        };
      case 'high':
        return {
          backgroundColor: 'rgba(249, 115, 22, 0.12)',
          color: '#ea580c',
          borderColor: 'rgba(249, 115, 22, 0.24)',
        };
      case 'medium':
        return {
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          color: '#2563eb',
          borderColor: 'rgba(59, 130, 246, 0.24)',
        };
      case 'low':
        return {
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          color: 'var(--color-success)',
          borderColor: 'rgba(16, 185, 129, 0.24)',
        };
      default:
        return {
          backgroundColor: 'rgba(148, 163, 184, 0.12)',
          color: 'var(--color-textSecondary)',
          borderColor: 'rgba(148, 163, 184, 0.24)',
        };
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const styles = getPriorityStyles(priority);

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold tracking-wide ${sizeClasses}`}
      style={styles}
    >
      {priority.toUpperCase()}
    </span>
  );
};

export default PriorityBadge;
