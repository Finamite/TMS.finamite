import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, Save, X, ChevronDown, ChevronUp, User, Cog, FileText, Paperclip, MessageSquare, LockKeyhole, CreditCard, Building2, UserCheck, UserCog, Loader2, Shield } from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

interface User {
  _id: string;
  companyId?: string;
  username: string;
  email: string;
  role: string;
  permissions: {
    canViewTasks: boolean;
    canViewAllTeamTasks: boolean;
    canAssignTasks: boolean;
    canDeleteTasks: boolean;
    canEditTasks: boolean;
    canManageUsers: boolean;
    canEditRecurringTaskSchedules: boolean;
  };
  isActive: boolean;
  createdAt: string;
}

interface TaskCompletionSettings {
  pendingTasks: {
    allowAttachments: boolean;
    mandatoryAttachments: boolean;
    mandatoryRemarks: boolean;
  };
  pendingRecurringTasks: {
    allowAttachments: boolean;
    mandatoryAttachments: boolean;
    mandatoryRemarks: boolean;
  };
}

interface CompanyData {
  _id: string;
  companyId: string;
  companyName: string;
  limits: {
    adminLimit: number;
    managerLimit: number;
    userLimit: number;
  };
  userCounts: {
    admin: number;
    manager: number;
    employee: number;
  };
  admin: {
    username: string;
    email: string;
  } | null;
  isActive: boolean;
  createdAt: string;
}

const AdminPanel: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'users' | 'settings'>('users');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loadingCompanyData, setLoadingCompanyData] = useState(false);
  const [taskSettings, setTaskSettings] = useState<TaskCompletionSettings>({
    pendingTasks: {
      allowAttachments: false,
      mandatoryAttachments: false,
      mandatoryRemarks: false,
    },
    pendingRecurringTasks: {
      allowAttachments: false,
      mandatoryAttachments: false,
      mandatoryRemarks: false,
    }
  });
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'employee',
    permissions: {
      canViewTasks: true,
      canViewAllTeamTasks: false,
      canAssignTasks: false,
      canDeleteTasks: false,
      canEditTasks: false,
      canManageUsers: false,
      canEditRecurringTaskSchedules: false,
    }
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [settingsMessage, setSettingsMessage] = useState({ type: '', text: '' });

  // Define allowed permissions for each role
  const rolePermissions = {
    employee: ['canViewTasks', 'canAssignTasks'],
    manager: ['canViewTasks', 'canViewAllTeamTasks', 'canAssignTasks', 'canDeleteTasks', 'canEditTasks', 'canEditRecurringTaskSchedules'],
    admin: ['canViewTasks', 'canViewAllTeamTasks', 'canAssignTasks', 'canDeleteTasks', 'canEditTasks', 'canManageUsers', 'canEditRecurringTaskSchedules'],
    superadmin: ['canViewTasks', 'canViewAllTeamTasks', 'canAssignTasks', 'canDeleteTasks', 'canEditTasks', 'canManageUsers', 'canEditRecurringTaskSchedules']
  };
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Get company ID from localStorage or context
  // const getCompanyId = () => {
  //   // This should come from your auth context or localStorage
  //   // For now, using a placeholder - replace with actual implementation
  //   return localStorage.getItem('companyId') || 'your-company-id';
  // };

  const fetchCompanyData = async () => {
    if (!currentUser?.companyId) {
      console.error("No companyId found in currentUser");
      return;
    }

    setLoadingCompanyData(true);
    try {
      const response = await fetch(`${address}/api/companies`);
      if (!response.ok) {
        throw new Error('Failed to fetch company data');
      }
      const companies: CompanyData[] = await response.json();

      // Use companyId from currentUser
      const currentCompany = companies.find(
        company => company.companyId === currentUser.companyId
      );

      if (currentCompany) {
        setCompanyData(currentCompany);
      } else {
        console.error(`Company not found for ID: ${currentUser.companyId}`);
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
    } finally {
      setLoadingCompanyData(false);
    }
  };


  useEffect(() => {
    fetchUsers();
    fetchTaskSettings();
    fetchCompanyData();
  }, []);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (settingsMessage.text) {
      const timer = setTimeout(() => {
        setSettingsMessage({ type: '', text: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [settingsMessage]);

  const fetchUsers = async () => {
    try {
      const params = currentUser?.companyId
        ? `?companyId=${currentUser.companyId}&role=${currentUser.role}&includeInactive=true`
        : `?role=${currentUser?.role}&includeInactive=true`;
      const response = await axios.get(`${address}/api/users${params}`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskSettings = async () => {
    try {
      const response = await axios.get(
        `${address}/api/settings/task-completion?companyId=${currentUser?.companyId}`
      );
      if (response.data) {
        setTaskSettings(response.data);
      }
    } catch (error) {
      console.error('Error fetching task settings:', error);
    }
  };
  const updatePassword = (user: User) => {
    setPasswordUser(user);
    setNewPassword("");
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser) return;
    try {
      setPasswordLoading(true);
      await axios.put(`${address}/api/users/${passwordUser._id}/password`, { password: newPassword });
      setMessage({ type: "success", text: "Password updated successfully!" });
      setPasswordUser(null);
      setNewPassword("");
      fetchUsers();
    } catch (error: any) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to update password" });
    } finally {
      setPasswordLoading(false);
    }
  };

  const saveTaskSettings = async () => {
    try {
      await axios.post(`${address}/api/settings/task-completion`, {
        companyId: currentUser?.companyId,
        ...taskSettings
      });
      setSettingsMessage({ type: 'success', text: 'Task completion settings saved successfully!' });
    } catch (error) {
      console.error('Error saving task settings:', error);
      setSettingsMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
    }
  };

  const toggleCardExpansion = (userId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedCards(newExpanded);
  };

  const isPermissionAllowedForRole = (permissionKey: string, role: string) => {
    const allowedPermissions = rolePermissions[role as keyof typeof rolePermissions] || [];
    return allowedPermissions.includes(permissionKey);
  };

  const updatePermissionsForRole = (role: string, currentPermissions: any) => {
    const allowedPermissions = rolePermissions[role as keyof typeof rolePermissions] || [];
    const updatedPermissions = { ...currentPermissions };

    // Disable permissions not allowed for the role
    Object.keys(updatedPermissions).forEach(permission => {
      if (!allowedPermissions.includes(permission)) {
        updatedPermissions[permission] = false;
      }
    });

    return updatedPermissions;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (name === 'role') {
      // When role changes, update permissions accordingly
      const updatedPermissions = updatePermissionsForRole(value, formData.permissions);
      setFormData(prev => ({
        ...prev,
        role: value,
        permissions: updatedPermissions
      }));
    } else if (name.startsWith('permissions.')) {
      const permissionKey = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        permissions: {
          ...prev.permissions,
          [permissionKey]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
      }));
    }
  };

  const handleTaskSettingChange = (taskType: 'pendingTasks' | 'pendingRecurringTasks', setting: string, value: boolean) => {
    setTaskSettings(prev => ({
      ...prev,
      [taskType]: {
        ...prev[taskType],
        [setting]: value
      }
    }));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userData = {
        ...formData,
        companyId: currentUser?.companyId
      };
      await axios.post(`${address}/api/users`, userData);
      toast.success("✅ User created successfully!");
      setMessage({ type: 'success', text: 'User created successfully!' });
      setShowCreateModal(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "❌ Failed to create user");
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to create user' });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await axios.put(`${address}/api/users/${editingUser._id}`, {
        username: formData.username,
        email: formData.email,
        role: formData.role,
        permissions: formData.permissions
      });
      setMessage({ type: 'success', text: 'User updated successfully!' });
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update user' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await axios.delete(`${address}/api/users/${userId}`);
        setMessage({ type: 'success', text: 'User deleted successfully!' });
        fetchUsers();
      } catch (error: any) {
        setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to delete user' });
      }
    }
  };

  const handleToggleActive = async (userId: string) => {
    try {
      const response = await axios.put(`${address}/api/users/${userId}/toggle-active`);
      setMessage({ type: 'success', text: response.data.message });
      fetchUsers(); // refresh list
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update status' });
    }
  };

  const startEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      permissions: user.permissions
    });
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      role: 'employee',
      permissions: {
        canViewTasks: true,
        canViewAllTeamTasks: false,
        canAssignTasks: false,
        canDeleteTasks: false,
        canEditTasks: false,
        canManageUsers: false,
        canEditRecurringTaskSchedules: false,
      }
    });
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'superadmin': return 'var(--color-primary)';
      case 'admin': return 'var(--color-error)';
      case 'manager': return 'var(--color-warning)';
      case 'employee': return 'var(--color-success)';
      default: return 'var(--color-textSecondary)';
    }
  };

  const getPermissionDisplayName = (key: string) => {
    const names: { [key: string]: string } = {
      canViewTasks: 'View Tasks',
      canViewAllTeamTasks: 'View All Team Tasks',
      canAssignTasks: 'Assign Tasks',
      canDeleteTasks: 'Delete Tasks',
      canEditTasks: 'Edit Tasks',
      canManageUsers: 'Manage Users',
      canEditRecurringTaskSchedules: 'Edit Recurring Task Schedules',
    };
    return names[key] || null;
  };

  const getActivePermissions = (permissions: any) => {
    return Object.entries(permissions).filter(([_, value]) => value);
  };

  const ToggleSwitch = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) => (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
        }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
          }`}
      />
    </button>
  );

  const renderTaskSettings = () => (
    <div className="space-y-6">
      {/* Settings Message */}
      {settingsMessage.text && (
        <div
          className={`p-3 rounded-lg text-sm ${settingsMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}
        >
          {settingsMessage.text}
        </div>
      )}

      {/* Pending Tasks Settings */}
      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="p-4 border-b border-[var(--color-border)]" style={{ backgroundColor: 'var(--color-surface)' }}>
          <h3 className="text-lg font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
            <FileText className="mr-2" size={20} />
            One-Time Pending Tasks Completion Settings
          </h3>
          <p className="text-sm text-[var(--color-textSecondary)] mt-1">
            Configure attachment and remark requirements for completing one-time pending tasks
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Paperclip size={20} className="text-[var(--color-primary)]" />
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Allow Attachments
                </label>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  Enable users to upload files when completing tasks
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={taskSettings.pendingTasks.allowAttachments}
              onChange={(value) => handleTaskSettingChange('pendingTasks', 'allowAttachments', value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Paperclip size={20} className="text-[var(--color-error)]" />
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Mandatory Attachments
                </label>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  Require at least one file to be uploaded when completing tasks
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={taskSettings.pendingTasks.mandatoryAttachments}
              onChange={(value) => handleTaskSettingChange('pendingTasks', 'mandatoryAttachments', value)}
              disabled={!taskSettings.pendingTasks.allowAttachments}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MessageSquare size={20} className="text-[var(--color-warning)]" />
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Mandatory Completion Remarks
                </label>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  Require completion remarks to be filled when completing tasks
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={taskSettings.pendingTasks.mandatoryRemarks}
              onChange={(value) => handleTaskSettingChange('pendingTasks', 'mandatoryRemarks', value)}
            />
          </div>
        </div>
      </div>

      {/* Pending Recurring Tasks Settings */}
      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="p-4 border-b border-[var(--color-border)]" style={{ backgroundColor: 'var(--color-surface)' }}>
          <h3 className="text-lg font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
            <Cog className="mr-2" size={20} />
            Recurring Tasks Completion Settings
          </h3>
          <p className="text-sm text-[var(--color-textSecondary)] mt-1">
            Configure attachment and remark requirements for completing recurring tasks
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Paperclip size={20} className="text-[var(--color-primary)]" />
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Allow Attachments
                </label>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  Enable users to upload files when completing recurring tasks
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={taskSettings.pendingRecurringTasks.allowAttachments}
              onChange={(value) => handleTaskSettingChange('pendingRecurringTasks', 'allowAttachments', value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Paperclip size={20} className="text-[var(--color-error)]" />
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Mandatory Attachments
                </label>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  Require at least one file to be uploaded when completing recurring tasks
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={taskSettings.pendingRecurringTasks.mandatoryAttachments}
              onChange={(value) => handleTaskSettingChange('pendingRecurringTasks', 'mandatoryAttachments', value)}
              disabled={!taskSettings.pendingRecurringTasks.allowAttachments}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MessageSquare size={20} className="text-[var(--color-warning)]" />
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  Mandatory Completion Remarks
                </label>
                <p className="text-xs text-[var(--color-textSecondary)]">
                  Require completion remarks to be filled when completing recurring tasks
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={taskSettings.pendingRecurringTasks.mandatoryRemarks}
              onChange={(value) => handleTaskSettingChange('pendingRecurringTasks', 'mandatoryRemarks', value)}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveTaskSettings}
          className="px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Save size={18} />
          Save Settings
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-2 sm:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <Shield size={20} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            Admin Panel
          </h1>
          {currentUser?.company && (
            <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--color-primary)20', color: 'var(--color-primary)' }}>
              {currentUser.company.companyName}
            </span>
          )}
        </div>

        {activeTab === 'users' && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                fetchCompanyData(); // always fetch latest data
                setShowPlanModal(true);
              }}
              className="px-3 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-opacity text-sm"
              style={{ backgroundColor: 'var(--color-textSecondary)' }}
            >
              <CreditCard size={16} className="inline mr-2" />
              View Plan
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-opacity text-sm"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <Plus size={16} className="inline mr-2" />
              Create User
            </button>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-[var(--color-border)]">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'users'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-textSecondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
              }`}
          >
            <Users size={16} className="inline mr-2" />
            User Management
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'settings'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-textSecondary)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
              }`}
          >
            <Cog size={16} className="inline mr-2" />
            Task Completion Settings
          </button>
        </nav>
      </div>

      {/* Message */}
      {message.text && (
        <div
          className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}
        >
          {message.text}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'settings' ? (
        renderTaskSettings()
      ) : (
        /* Users Management Section */
        <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)' }}>
          <div className="p-3 sm:p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-md font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
              <Users className="mr-2" size={16} />
              User Management ({users.length})
              {currentUser?.company && (
                <span className="ml-2 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--color-primary)10', color: 'var(--color-primary)' }}>
                  Company: {currentUser.company.companyName}
                </span>
              )}
            </h2>
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="border-b" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>User</th>
                  <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Role</th>
                  <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Permissions</th>
                  <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Status</th>
                  <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-b hover:bg-opacity-50" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{user.username}</p>
                        <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>{user.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="px-2 py-1 text-xs font-medium rounded-full capitalize"
                        style={{
                          backgroundColor: `${getRoleColor(user.role)}20`,
                          color: getRoleColor(user.role)
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs space-y-1">
                        {getActivePermissions(user.permissions).slice(0, 2).map(([key, _]) => (
                          <div key={key} className="inline-block mr-2 mb-1">
                            <span
                              className="px-2 py-1 rounded-full"
                              style={{
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                color: 'var(--color-primary)'
                              }}
                            >
                              {getPermissionDisplayName(key)}
                            </span>
                          </div>
                        ))}
                        {getActivePermissions(user.permissions).length > 2 && (
                          <span className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                            +{getActivePermissions(user.permissions).length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => startEditUser(user)}
                          className="p-1 rounded hover:bg-opacity-10"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => updatePassword(user)}
                          className="p-1 rounded hover:bg-opacity-10"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          <LockKeyhole size={16} />
                        </button>
                        {user.role !== 'admin' && user.role !== 'superadmin' && (
                          <ToggleSwitch
                            checked={user.isActive}
                            onChange={() => handleToggleActive(user._id)}
                          />
                        )}

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile/Tablet Card View */}
          <div className="lg:hidden divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {users.map((user) => (
              <div key={user._id} className="p-3 sm:p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)20' }}>
                      <User size={20} style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
                        {user.username}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--color-textSecondary)' }}>
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-2">
                    <button
                      onClick={() => startEditUser(user)}
                      className="p-2 rounded-lg hover:bg-opacity-10"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => updatePassword(user)}
                      className="p-2 rounded-lg hover:bg-opacity-10"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <LockKeyhole size={16} />
                    </button>
                    {user.role !== 'admin' && user.role !== 'superadmin' && (
                      <button
                        onClick={() => handleDeleteUser(user._id)}
                        className="p-2 rounded-lg hover:bg-opacity-10"
                        style={{ color: 'var(--color-error)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className="px-2 py-1 text-xs font-medium rounded-full capitalize"
                    style={{
                      backgroundColor: `${getRoleColor(user.role)}20`,
                      color: getRoleColor(user.role)
                    }}
                  >
                    {user.role}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                      Permissions ({getActivePermissions(user.permissions).length})
                    </span>
                    <button
                      onClick={() => toggleCardExpansion(user._id)}
                      className="p-1 rounded"
                      style={{ color: 'var(--color-textSecondary)' }}
                    >
                      {expandedCards.has(user._id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {expandedCards.has(user._id) ? (
                    <div className="grid grid-cols-1 gap-1">
                      {getActivePermissions(user.permissions).map(([key, _]) => (
                        <span
                          key={key}
                          className="text-xs px-2 py-1 rounded-full"
                          style={{
                            backgroundColor: 'rgba(113, 145, 197, 0.1)',
                            color: 'var(--color-primary)'
                          }}
                        >
                          {getPermissionDisplayName(key)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {getActivePermissions(user.permissions).slice(0, 3).map(([key, _]) => (
                        <span
                          key={key}
                          className="text-xs px-2 py-1 rounded-full"
                          style={{
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            color: 'var(--color-primary)'
                          }}
                        >
                          {getPermissionDisplayName(key)}
                        </span>
                      ))}
                      {getActivePermissions(user.permissions).length > 3 && (
                        <span className="text-xs px-2 py-1" style={{ color: 'var(--color-textSecondary)' }}>
                          +{getActivePermissions(user.permissions).length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform transition-all">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl p-6 text-white">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="bg-white bg-opacity-20 rounded-full p-2">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Plan Details</h2>
                    <p className="text-blue-100 text-sm">Current subscription limits</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPlanModal(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {loadingCompanyData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="ml-3 text-gray-600">Loading plan details...</span>
                </div>
              ) : companyData ? (
                <>
                  {/* Company Name */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <div className="flex items-center space-x-3">
                      <div className="bg-blue-100 rounded-full p-2">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 font-medium">Company</p>
                        <p className="text-lg font-bold text-gray-800">{companyData.companyName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Plan Limits */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Subscription Limits</h3>

                    {/* Users */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-green-100 rounded-full p-2">
                            <Users className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">Users (Employees)</p>
                            <p className="text-sm text-gray-600">
                              {companyData.userCounts.employee} / {companyData.limits.userLimit} used
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-600">{companyData.limits.userLimit}</p>
                          <p className="text-xs text-gray-500">Max limit</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="bg-green-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min((companyData.userCounts.employee / companyData.limits.userLimit) * 100, 100)}%`
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Managers */}
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-orange-100 rounded-full p-2">
                            <UserCog className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">Managers</p>
                            <p className="text-sm text-gray-600">
                              {companyData.userCounts.manager} / {companyData.limits.managerLimit} used
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-orange-600">{companyData.limits.managerLimit}</p>
                          <p className="text-xs text-gray-500">Max limit</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="bg-orange-200 rounded-full h-2">
                          <div
                            className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min((companyData.userCounts.manager / companyData.limits.managerLimit) * 100, 100)}%`
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Admins */}
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-purple-100 rounded-full p-2">
                            <UserCheck className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">Admins</p>
                            <p className="text-sm text-gray-600">
                              {companyData.userCounts.admin} / {companyData.limits.adminLimit} used
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-purple-600">{companyData.limits.adminLimit}</p>
                          <p className="text-xs text-gray-500">Max limit</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="bg-purple-200 rounded-full h-2">
                          <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min((companyData.userCounts.admin / companyData.limits.adminLimit) * 100, 100)}%`
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-red-600 font-medium">Unable to load plan details</p>
                    <p className="text-red-500 text-sm mt-1">Please try again later</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-b-2xl px-6 py-4">
              <button
                onClick={() => setShowPlanModal(false)}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="sticky top-0 p-4 border-b" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                  Create New User
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-4">
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Username *
                    </label>
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      placeholder="Enter username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      placeholder="Enter email address"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Password *
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      placeholder="Enter password"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Role
                    </label>
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      {currentUser?.role === 'admin' && <option value="admin">Admin</option>}
                      {/* {currentUser?.role === 'superadmin' && <option value="superadmin">SuperAdmin</option>} */}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text)' }}>
                    Permissions
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(formData.permissions).map(([key, value]) => {
                      const isAllowed = isPermissionAllowedForRole(key, formData.role);
                      const isDisabled = !isAllowed;

                      return (
                        <label
                          key={key}
                          className={`flex items-center space-x-2 ${isDisabled ? 'opacity-50' : ''}`}
                        >
                          <input
                            type="checkbox"
                            name={`permissions.${key}`}
                            checked={value && isAllowed}
                            onChange={handleInputChange}
                            disabled={isDisabled}
                            className="rounded"
                          />
                          <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                            {getPermissionDisplayName(key)}
                          </span>
                          {isDisabled && (
                            <span className="text-xs text-gray-400 ml-2">
                              (Not available for {formData.role})
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 py-2 px-4 rounded-lg text-white font-medium text-sm"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <Save size={16} className="inline mr-2" />
                    Create User
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className="flex-1 py-2 px-4 rounded-lg border font-medium text-sm"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="sticky top-0 p-4 border-b" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                  Edit User - {editingUser.username}
                </h3>
                <button
                  onClick={() => {
                    setEditingUser(null);
                    resetForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-4">
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Username *
                    </label>
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Role
                    </label>
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      {currentUser?.role === 'admin' && <option value="admin">Admin</option>}
                      {/* {currentUser?.role === 'superadmin' && <option value="superadmin">SuperAdmin</option>} */}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text)' }}>
                    Permissions
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(formData.permissions).map(([key, value]) => {
                      const displayName = getPermissionDisplayName(key);
                      if (!displayName) return null; // skip unsupported permissions

                      const isAllowed = isPermissionAllowedForRole(key, formData.role);
                      const isDisabled = !isAllowed;

                      return (
                        <label key={key} className={`flex items-center space-x-2 ${isDisabled ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            name={`permissions.${key}`}
                            checked={value && isAllowed}
                            onChange={handleInputChange}
                            disabled={isDisabled}
                            className="rounded"
                          />
                          <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                            {displayName}
                          </span>
                          {isDisabled && (
                            <span className="text-xs text-gray-400 ml-2">
                              (Not available for {formData.role})
                            </span>
                          )}
                        </label>
                      );
                    })}

                  </div>
                </div>

                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 py-2 px-4 rounded-lg text-white font-medium text-sm"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <Save size={16} className="inline mr-2" />
                    Update User
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUser(null);
                      resetForm();
                    }}
                    className="flex-1 py-2 px-4 rounded-lg border font-medium text-sm"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Update Password Modal */}
      {passwordUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg max-w-md w-full" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                Update Password - {passwordUser.username}
              </h3>
              <button onClick={() => setPasswordUser(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  style={{
                    backgroundColor: 'var(--color-background)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                  placeholder="Enter new password"
                />
              </div>

              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 py-2 px-4 rounded-lg text-white font-medium text-sm disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {passwordLoading ? "Updating..." : "Update Password"}
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordUser(null)}
                  className="flex-1 py-2 px-4 rounded-lg border font-medium text-sm"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;