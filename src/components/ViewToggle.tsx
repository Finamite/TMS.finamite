import React from 'react';
import { Grid, List } from 'lucide-react';

interface ViewToggleProps {
  view: 'card' | 'table';
  onViewChange: (view: 'card' | 'table') => void;
  activeShadowClassName?: string;
}

const ViewToggle: React.FC<ViewToggleProps> = ({
  view,
  onViewChange,
  activeShadowClassName = 'shadow-[0_8px_18px_rgba(14,165,233,0.28)]'
}) => {
  return (
    <div className="relative inline-grid grid-cols-2 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] backdrop-blur-xl">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-0.25rem)] rounded-full bg-[var(--color-primary)] ${activeShadowClassName} transition-transform duration-300 ease-out ${
          view === 'table' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      <button
        onClick={() => onViewChange('card')}
        className={`relative z-10 flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold tracking-tight transition-all duration-300 ${
          view === 'card'
            ? 'text-white'
            : 'text-text'
        }`}
      >
        <Grid size={12} strokeWidth={2} />
        <span className="hidden sm:inline">Cards</span>
      </button>
      <button
        onClick={() => onViewChange('table')}
        className={`relative z-10 flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold tracking-tight transition-all duration-300 ${
          view === 'table'
            ? 'text-white'
            : 'text-text'
        }`}
      >
        <List size={12} strokeWidth={2} />
        <span className="hidden sm:inline">Table</span>
      </button>
    </div>
  );
};

export default ViewToggle;
