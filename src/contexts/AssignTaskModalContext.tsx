import { createContext, useContext } from 'react';

export interface AssignTaskModalOptions {
  mode?: string;
  taskGroupId?: string;
  originalTaskId?: string;
}

interface AssignTaskModalContextValue {
  isAssignTaskModalOpen: boolean;
  openAssignTaskModal: (options?: AssignTaskModalOptions) => void;
  closeAssignTaskModal: () => void;
}

export const AssignTaskModalContext = createContext<AssignTaskModalContextValue | null>(null);

export const useAssignTaskModal = () => {
  const context = useContext(AssignTaskModalContext);

  if (!context) {
    throw new Error('useAssignTaskModal must be used inside AssignTaskModalContext.Provider');
  }

  return context;
};
