import React, { memo } from 'react';
import { CreditCard as Edit, Save, X } from 'lucide-react';

interface User {
  _id: string;
  username: string;
  email: string;
}

interface MasterTask {
  taskGroupId: string;
  title: string;
  description: string;
  taskType: string;
  assignedBy: { username: string; email: string };
  assignedTo: {
    _id: any; 
    username: string; 
    email: string;
  };
  priority: string;
  parentTaskInfo?: {
    [x: string]: any;
    originalStartDate?: string;
    originalEndDate?: string;
    includeSunday: boolean;
    isForever: boolean;
    weeklyDays?: number[];
    weekOffDays?: number[];
    monthlyDay?: number;
    yearlyDuration?: number;
  };
  weekOffDays?: number[];
  dateRange: {
    start: string;
    end: string;
  };
}

interface EditFormData {
  title: string;
  description: string;
  priority: string;
  assignedTo: string;
  taskType: string;
  startDate: string;
  endDate: string;
  isForever: boolean;
  includeSunday: boolean;
  weeklyDays: number[];
  monthlyDay?: number;
  yearlyDuration: number;
  weekOffDays: number[];
}

interface EditMasterTaskModalProps {
  showEditModal: boolean;
  editingMasterTask: MasterTask | null;
  editFormData: EditFormData;
  setEditFormData: (data: EditFormData) => void;
  users: User[];
  isAdmin: boolean;
  isSaving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const EditMasterTaskModal: React.FC<EditMasterTaskModalProps> = memo(({
  showEditModal,
  editingMasterTask,
  editFormData,
  setEditFormData,
  users,
  isAdmin,
  isSaving,
  onSave,
  onCancel
}) => {
  if (!showEditModal || !editingMasterTask) return null;

  const handleSave = async () => {
    await onSave();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[--color-surface] rounded-xl max-w-4xl w-full max-h-[90vh] shadow-2xl transform transition-all overflow-hidden">
        <div className="p-6 border-b border-[--color-border]">
          <h3 className="text-xl font-semibold flex items-center text-[--color-text]">
            <Edit size={24} className="mr-3" />
            Edit Master Task: {editingMasterTask.title}
          </h3>
        </div>
        
        <div className="p-6 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-2">Title *</label>
              <input
                type="text"
                value={editFormData.title || ''}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
                placeholder="Enter task title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-2">Task Type *</label>
              <select
                value={editFormData.taskType || ''}
                disabled
                className="w-full px-4 py-3 border border-[--color-border] rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              >
                <option value="">Select Type</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-2">Priority *</label>
              <select
                value={editFormData.priority || ''}
                onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
              >
                <option value="">Select Priority</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>

            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-[--color-text] mb-2">Assigned To *</label>
                <select
                  value={editFormData.assignedTo || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, assignedTo: e.target.value })}
                  className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
                >
                  <option value="">Select User</option>
                  {users.map(user => (
                    <option key={user._id} value={user._id}>{user.username}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-2">Start Date</label>
              <input
                type="date"
                value={editFormData.startDate?.split('T')[0] || ''}
                disabled
                className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text] disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[--color-text] mb-2">End Date</label>
              <input
                type="date"
                value={editFormData.endDate?.split('T')[0] || ''}
                disabled
                className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text] disabled:opacity-50"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[--color-text] mb-2">Description</label>
              <textarea
                value={editFormData.description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 border border-[--color-border] rounded-lg focus:ring-2 focus:ring-[--color-primary] focus:border-[--color-primary] bg-[--color-background] text-[--color-text]"
                placeholder="Enter task description"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center space-x-6 mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editFormData.isForever || false}
                    disabled
                    className="w-4 h-4 text-[--color-primary] border-[--color-border] rounded focus:ring-[--color-primary]"
                  />
                  <span className="ml-2 text-sm font-medium text-[--color-text]">Forever Task</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editFormData.includeSunday ?? true}
                    disabled
                    className="w-4 h-4 text-[--color-primary] border-[--color-border] rounded focus:ring-[--color-primary]"
                  />
                  <span className="ml-2 text-sm font-medium text-[--color-text]">Include Sunday</span>
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[--color-text] mb-3">Week Off Days</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                  const currentWeekOffDays = editFormData.weekOffDays || [];
                  const isSelected = currentWeekOffDays.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const newDays = isSelected
                          ? currentWeekOffDays.filter((d: number) => d !== i)
                          : [...currentWeekOffDays, i].sort((a, b) => a - b);
                        setEditFormData({
                          ...editFormData,
                          weekOffDays: newDays
                        });
                      }}
                      className={`px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 border-2 ${
                        isSelected
                          ? 'bg-[--color-primary] border-[--color-primary] text-white shadow-md transform scale-105'
                          : 'bg-[--color-background] border-[--color-border] text-[--color-text] hover:border-[--color-primary] hover:shadow-sm'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-[--color-border] flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-6 py-3 text-sm font-medium text-[--color-text] bg-[--color-surface] border border-[--color-border] rounded-lg hover:bg-[--color-background] transition-colors"
          >
            <X size={16} className="inline mr-2" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !editFormData.title || !editFormData.taskType || !editFormData.priority}
            className={`px-6 py-3 text-sm font-medium text-white bg-[--color-primary] rounded-lg transition-colors ${
              isSaving || !editFormData.title || !editFormData.taskType || !editFormData.priority
                ? 'opacity-60 cursor-not-allowed' 
                : 'hover:bg-[--color-primary] hover:scale-105'
            }`}
          >
            <Save size={16} className="inline mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
});

EditMasterTaskModal.displayName = 'EditMasterTaskModal';

export default EditMasterTaskModal;