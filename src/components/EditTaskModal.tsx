import React, { useState, useEffect } from 'react';
import { X, Calendar, User, AlertCircle, FileText, Flag } from 'lucide-react';
import { Task } from "../types/Task";
import { useTheme } from "../contexts/ThemeContext"; // ← ADD THIS

interface User {
  _id: string;
  username: string;
  email: string;
}

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  users: User[];
  onSave: (taskId: string, updates: any) => Promise<void>;
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({
  isOpen,
  onClose,
  task,
  users,
  onSave
}) => {
  const { isDark } = useTheme();   // ← GET THEME
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    assignedTo: '',
    priority: 'normal' as 'normal' | 'high'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        dueDate: task.dueDate
          ? new Date(task.dueDate).toISOString().split("T")[0]
          : "",
        assignedTo: task.assignedTo._id,
        priority: task.priority === 'high' ? 'high' : 'normal'
      });
    }
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const updates = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        dueDate: new Date(formData.dueDate).toISOString(),
        assignedTo: formData.assignedTo,
        priority: formData.priority
      };

      await onSave(task._id, updates);
      onClose();
    } catch (err) {
      setError('Failed to update task. Please try again.');
      console.error('Error updating task:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      style={{ backdropFilter: "blur(3px)" }}
    >
      {/* Main Modal Container */}
      <div
        className="rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-all"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: `1px solid var(--color-border)`
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <h2 className="text-xl font-semibold flex items-center">
            <FileText className="w-5 h-5 mr-2" style={{ color: "var(--color-primary)" }} />
            Edit Task
          </h2>

          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: "var(--color-textSecondary)" }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Error Alert */}
          {error && (
            <div
              className="rounded-md p-4 flex items-center"
              style={{
                backgroundColor: "var(--color-error)20",
                border: `1px solid var(--color-error)`
              }}
            >
              <AlertCircle
                className="w-5 h-5 mr-2"
                style={{ color: "var(--color-error)" }}
              />
              <span style={{ color: "var(--color-error)" }}>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
              Task Title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2"
              placeholder="Enter task title"
              style={{
                backgroundColor: "var(--color-background)",
                border: `1px solid var(--color-border)`,
                color: "var(--color-text)"
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2"
              placeholder="Enter task description"
              style={{
                backgroundColor: "var(--color-background)",
                border: `1px solid var(--color-border)`,
                color: "var(--color-text)"
              }}
            />
          </div>

          {/* Date + Assigned */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                <Calendar className="w-4 h-4 inline mr-1" /> Due Date *
              </label>
              <input
                type="date"
                name="dueDate"
                value={formData.dueDate}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 rounded-md focus:ring-2"
                style={{
                  backgroundColor: "var(--color-background)",
                  border: `1px solid var(--color-border)`,
                  color: "var(--color-text)"
                }}
              />
            </div>

            {/* Assigned To */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                <User className="w-4 h-4 inline mr-1" /> Assigned To *
              </label>
              <select
                name="assignedTo"
                value={formData.assignedTo}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 rounded-md focus:ring-2"
                style={{
                  backgroundColor: "var(--color-background)",
                  border: `1px solid var(--color-border)`,
                  color: "var(--color-text)"
                }}
              >
                <option value="">Select user</option>
                {users.map(user => (
                  <option key={user._id} value={user._id}>
                    {user.username} ({user.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
              <Flag className="w-4 h-4 inline mr-1" /> Priority
            </label>

            <select
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
              className="w-full px-3 py-2 rounded-md focus:ring-2"
              style={{
                backgroundColor: "var(--color-background)",
                border: `1px solid var(--color-border)`,
                color: "var(--color-text)"
              }}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Task Info */}
          <div
            className="p-4 rounded-md"
            style={{
              backgroundColor: "var(--color-settingcolor)"
            }}
          >
            <h3 className="text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
              Task Information
            </h3>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><strong>Type:</strong> {task.taskType}</div>
              <div><strong>Status:</strong> {task.status}</div>
              <div><strong>Assigned By:</strong> {task.assignedBy.username}</div>
              <div><strong>Current Assignee:</strong> {task.assignedTo.username}</div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end space-x-3 pt-4" style={{ borderTop: `1px solid var(--color-border)` }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md"
              style={{
                backgroundColor: "var(--color-background)",
                border: `1px solid var(--color-border)`,
                color: "var(--color-textSecondary)"
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-md text-white"
              style={{
                backgroundColor: "var(--color-primary)",
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
