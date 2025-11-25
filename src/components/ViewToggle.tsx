import React from 'react';
import { Grid, List } from 'lucide-react';

interface ViewToggleProps {
  view: 'card' | 'table';
  onViewChange: (view: 'card' | 'table') => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ view, onViewChange }) => {
  return (
    <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
      <button
        onClick={() => onViewChange('card')}
        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
  view === 'card'
    ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
    : 'text-gray-600 hover:text-gray-900'
}`}
      >
        <Grid size={12} />
      </button>
      <button
        onClick={() => onViewChange('table')}
        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          view === 'table'
            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        <List size={12} />
      </button>
    </div>
  );
};

export default ViewToggle;