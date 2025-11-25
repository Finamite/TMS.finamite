import React from 'react';

interface TaskTypeBadgeProps {
  taskType: string;
  size?: 'sm' | 'md';
}

const TaskTypeBadge: React.FC<TaskTypeBadgeProps> = ({ taskType, size = 'sm' }) => {
  const getTaskTypeStyles = (taskType: string) => {
    switch (taskType.toLowerCase()) {
      case 'daily':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'weekly':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'monthly':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'yearly':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'one-time':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizeClasses} ${getTaskTypeStyles(
        taskType
      )}`}
    >
      {taskType.toUpperCase()}
    </span>
  );
};

export default TaskTypeBadge;