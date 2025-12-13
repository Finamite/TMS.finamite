import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit, Save, X, ChevronDown, ChevronUp, User, LockKeyhole, CreditCard, Info, Building2, UserCheck, UserCog, Loader2, Shield, Search, Activity, Building, Clock } from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

interface User {
  lastAccess: any;
  phone: string;
  department: string;
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
    canManageSettings: boolean;
    canManageRecycle: boolean;
  };
  isActive: boolean;
  createdAt: string;
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

const formatDateTime = (dateValue: string | number | Date) => {
  if (!dateValue) return "No data";

  const date = new Date(dateValue);

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
};


const AdminPanel: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loadingCompanyData, setLoadingCompanyData] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: '',
    department: '',
    phone: '',
    permissions: {
      canViewTasks: true,
      canViewAllTeamTasks: false,
      canAssignTasks: false,
      canDeleteTasks: false,
      canEditTasks: false,
      canManageUsers: false,
      canEditRecurringTaskSchedules: false,
      canManageSettings: false,
      canManageRecycle: false,
    }
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [settingsMessage, setSettingsMessage] = useState({ type: '', text: '' });
  const [searchName, setSearchName] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [selectedUserAccess, setSelectedUserAccess] = useState<any>(null);
const [showAccessModal, setShowAccessModal] = useState(false);

  // Define allowed permissions for each role
  const rolePermissions = {
    employee: ['canViewTasks', 'canAssignTasks'],
    manager: ['canViewTasks', 'canViewAllTeamTasks', 'canAssignTasks', 'canDeleteTasks', 'canEditTasks', 'canManageUsers', 'canEditRecurringTaskSchedules', 'canManageSettings', 'canManageRecycle'],
    admin: ['canViewTasks', 'canViewAllTeamTasks', 'canAssignTasks', 'canDeleteTasks', 'canEditTasks', 'canManageUsers', 'canEditRecurringTaskSchedules', 'canManageSettings', 'canManageRecycle'],
    superadmin: ['canViewTasks', 'canViewAllTeamTasks', 'canAssignTasks', 'canDeleteTasks', 'canEditTasks', 'canManageUsers', 'canEditRecurringTaskSchedules', 'canManageSettings','canManageRecycle']
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

 const openAccessModal = async (user: User) => {
  try {
    const res = await axios.get(`${address}/api/users/${user._id}/access-logs`);

    setSelectedUserAccess({
      username: res.data.username || user.username,
      logs: res.data.accessLogs || [],
      lastAccess: res.data.lastAccess || null,
    });

    setShowAccessModal(true);
  } catch (err) {
    console.error("Access log fetch failed", err);
  }
};


  useEffect(() => {
    fetchUsers();
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

  const getRoleLabel = (role: string) => {
    if (role === "employee") return "User";
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const handlePermanentDelete = async (userId: string) => {
    if (!window.confirm("⚠ This will permanently delete the user. This cannot be undone. Continue?"))
      return;

    try {
      await axios.delete(`${address}/api/users/${userId}/permanent`);
      setMessage({ type: "success", text: "User permanently deleted!" });
      fetchUsers(); // refresh list
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to permanently delete user",
      });
    }
  };

  const updatePassword = (user: User) => {
    setPasswordUser(user);
    setNewPassword("");
  };

  const getRoleLimitData = (role: string) => {
    if (!companyData) return { remaining: 0, percent: 0, color: "var(--color-text)" };

    let limit = 0;
    let used = 0;

    if (role === "admin") {
      limit = companyData.limits.adminLimit;
      used = companyData.userCounts.admin;
    } else if (role === "manager") {
      limit = companyData.limits.managerLimit;
      used = companyData.userCounts.manager;
    } else if (role === "employee") {
      limit = companyData.limits.userLimit;
      used = companyData.userCounts.employee;
    }

    const remaining = limit - used;
    const percent = limit > 0 ? (remaining / limit) * 100 : 0;

    let color = "var(--color-text)";

    if (percent >= 60) color = "#1d9449ff";          // green
    else if (percent >= 20) color = "#eab308";     // yellow
    else color = "#ef4444";                         // red

    return { remaining, percent, color };
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
      fetchCompanyData();
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
        permissions: formData.permissions,
        department: formData.department,
        phone: formData.phone,
      });
      setMessage({ type: 'success', text: 'User updated successfully!' });
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update user' });
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
      permissions: user.permissions,
      department: user.department || '',
      phone: user.phone || '',
    });
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      role: '',
      department: '',
      phone: '',
      permissions: {
        canViewTasks: true,
        canViewAllTeamTasks: false,
        canAssignTasks: false,
        canDeleteTasks: false,
        canEditTasks: false,
        canManageUsers: false,
        canEditRecurringTaskSchedules: false,
        canManageSettings: false,
        canManageRecycle: false,
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
      canManageSettings: 'Manage Settings',
      canManageRecycle: 'Manage Recycle Bin',
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
          <Shield size={24} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            Admin Panel
          </h1>
        </div>

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
      </div>
      {/* 🔍 FILTER BAR */}
      <div className="p-6 bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-background)] rounded-2xl border border-[var(--color-border)] shadow-xl mt-6 backdrop-blur-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 🔍 Enhanced Search with Icon */}
          <div className="relative group">
            <input
              type="text"
              value={searchName}
              onChange={(e) => {
                setSearchName(e.target.value);
                setSearchEmail(e.target.value); // 🔥 unified search
              }}
              placeholder="Search name or email..."
              className="w-full pl-12 pr-4 py-3.5 rounded-xl text-sm border-0 shadow-lg focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:shadow-[0_0_0_3px_rgba(var(--color-primary-rgb),0.1)] transition-all duration-300 group-hover:shadow-md bg-[var(--color-background)] text-[var(--color-text)] placeholder-[var(--color-textSecondary)]"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--color-textSecondary)] group-focus-within:text-[var(--color-primary)] transition-colors duration-300" size={20} />
            {searchName && (
              <button
                onClick={() => {
                  setSearchName("");
                  setSearchEmail("");
                }}
                className="absolute right-4 top-1/2 transform -translate-y-1/2
                 w-5 h-5 flex items-center justify-center rounded-full
                 bg-[var(--color-border)] hover:bg-[var(--color-primary)] hover:text-white
                 text-[var(--color-textSecondary)] transition-all duration-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter with Icon */}
          <div className="relative group">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl text-sm border-0 shadow-lg focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:shadow-[0_0_0_3px_rgba(var(--color-primary-rgb),0.1)] transition-all duration-300 group-hover:shadow-md bg-[var(--color-background)] text-[var(--color-text)] appearance-none cursor-pointer"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <Activity className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--color-textSecondary)] group-focus-within:text-[var(--color-primary)] transition-colors duration-300" size={20} />
            <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--color-textSecondary)] pointer-events-none transition-colors duration-300" size={16} />
          </div>

          {/* Role Filter with Icon */}
          <div className="relative group">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl text-sm border-0 shadow-lg focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:shadow-[0_0_0_3px_rgba(var(--color-primary-rgb),0.1)] transition-all duration-300 group-hover:shadow-md bg-[var(--color-background)] text-[var(--color-text)] appearance-none cursor-pointer"
            >
              <option value="">All Roles</option>
              <option value="employee">User</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <Users className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--color-textSecondary)] group-focus-within:text-[var(--color-primary)] transition-colors duration-300" size={20} />
            <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--color-textSecondary)] pointer-events-none transition-colors duration-300" size={16} />
          </div>

          {/* Department Filter with Icon (Dynamic Unique Options) */}
          <div className="relative group">
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl text-sm border-0 shadow-lg focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:shadow-[0_0_0_3px_rgba(var(--color-primary-rgb),0.1)] transition-all duration-300 group-hover:shadow-md bg-[var(--color-background)] text-[var(--color-text)] appearance-none cursor-pointer"
            >
              <option value="">All Departments</option>
              {Array.from(new Set(users.map(u => u.department || "No Department")))
                .map((dept, index) => (
                  <option key={index} value={dept}>
                    {dept}
                  </option>
                ))}
            </select>
            <Building className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--color-textSecondary)] group-focus-within:text-[var(--color-primary)] transition-colors duration-300" size={20} />
            <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--color-textSecondary)] pointer-events-none transition-colors duration-300" size={16} />
          </div>
        </div>
      </div>
      {/* Message */}
      {message.text && (
        <div
          className={`p-3 mt-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-lg border overflow-hidden mt-4" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)' }}>
        <div className="p-3 sm:p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-md font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
            <Users className="mr-2 text-[var(--color-primary)]" size={16} />
            User Management ({users.length})
          </h2>
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto max-h-[650px] z-10 ">
          <table className="w-full">
            <thead className="border-b top-0 sticky z-10" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <tr>
                <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>User</th>
                <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Role</th>
                <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Department</th>
                <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Permissions</th>
                <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Status</th>
                <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Last Access</th>
                <th className="text-left py-3 px-4 font-medium text-sm" style={{ color: 'var(--color-text)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter(u => {
                  if (currentUser?.role === "manager") {
                    return u.role !== "admin" && u.role !== "manager";
                  }
                  return true;
                })
                .filter(u =>
                  u.username.toLowerCase().includes(searchName.toLowerCase()) ||
                  u.email.toLowerCase().includes(searchName.toLowerCase())
                )
                .filter(u =>
                  filterStatus === "" ? true :
                    filterStatus === "active" ? u.isActive : !u.isActive
                )
                .filter(u =>
                  filterRole === "" ? true : u.role === filterRole
                )
                .filter(u => {
                  if (filterDepartment === "") return true;              // All
                  if (filterDepartment === "No Department")              // Show blank dept users
                    return u.department.trim() === "" || !u.department;

                  return (u.department || "")
                    .toLowerCase()
                    .includes(filterDepartment.toLowerCase());
                })
                .map((user) => (
                  <tr key={user._id} className="border-b hover:bg-opacity-50" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{user.username}</p>
                        <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>{user.phone}</p>
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
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="px-2 py-1 text-xs font-medium rounded-full"
                        style={{
                          backgroundColor: "var(--color-border)",
                          color: "var(--color-text)"
                        }}
                      >
                        {user.department || "No Department"}
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
  <div className="flex items-center gap-2">

    {/* Last Access Text */}
    <span className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
      {formatDateTime(user.lastAccess)}
    </span>

    {/* Info Icon */}
    <button
      onClick={() => openAccessModal(user)}
      className="p-1 rounded hover:bg-gray-200 transition"
    >
      <Info size={16} className="text-blue-500" />
    </button>

  </div>
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
                          <div className="flex items-center space-x-2">
                            {/* <button
                            onClick={() => {
                              setDeleteUserId(user._id);
                              setShowDeleteModal(true);
                            }}
                            className="p-2 rounded-lg hover:bg-opacity-10"
                            style={{ color: 'var(--color-error)' }}
                          >
                            <Trash2 size={16} />
                          </button> */}
                            <ToggleSwitch
                              checked={user.isActive}
                              onChange={() => handleToggleActive(user._id)}
                            />
                          </div>
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
          {users
            // Manager restriction
            .filter(u => {
              if (currentUser?.role === "manager") {
                return u.role !== "admin" && u.role !== "manager";
              }
              return true;
            })
            // Search filter (name/email)
            .filter(u =>
              u.username.toLowerCase().includes(searchName.toLowerCase()) ||
              u.email.toLowerCase().includes(searchName.toLowerCase())
            )
            // Status filter
            .filter(u =>
              filterStatus === "" ? true :
                filterStatus === "active" ? u.isActive : !u.isActive
            )
            // Role filter
            .filter(u =>
              filterRole === "" ? true : u.role === filterRole
            )
            // Department filter
            .filter(u => {
              if (filterDepartment === "") return true;              // All
              if (filterDepartment === "No Department")              // Show blank dept users
                return u.department.trim() === "" || !u.department;

              return (u.department || "")
                .toLowerCase()
                .includes(filterDepartment.toLowerCase());
            })
            .map((user) => (
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
                        {user.phone}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--color-textSecondary)' }}>
                        {user.email}
                      </p>
                      {/* Last Access (Mobile) */}
<div className="mt-1 flex items-center gap-1">
  <p className="text-xs text-[var(--color-textSecondary)]">
    Last Access:
    <span className="ml-1 text-xs text-[var(--color-text)]">
      {formatDateTime(user.lastAccess)}
    </span>
  </p>

  {/* Info Icon */}
  <button
    onClick={() => openAccessModal(user)}
    className="p-1 rounded hover:bg-gray-200 transition"
  >
    <Info size={16} className="text-blue-500" />
  </button>
</div>
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
                      <div className="flex items-center space-x-2">
                        {/* <button
                        onClick={() => {
                          setDeleteUserId(user._id);
                          setShowDeleteModal(true);
                        }}
                        className="p-2 rounded-lg hover:bg-opacity-10"
                        style={{ color: 'var(--color-error)' }}
                      >
                        <Trash2 size={16} />
                      </button> */}
                        <ToggleSwitch
                          checked={user.isActive}
                          onChange={() => handleToggleActive(user._id)}
                        />
                      </div>
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
                    {getRoleLabel(user.role)}
                  </span>
                  <span
                    className="px-2 py-1 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  >
                    {user.department || "-"}
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

      {/* View Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full 
     max-w-lg sm:max-w-md md:max-w-lg 
     max-h-[90vh] overflow-y-auto 
     transform transition-all
     mx-2">
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
                      <option value="" disabled>Select Role</option>  {/* 🔥 NEW */}

                      {currentUser?.role === "manager"
                        ? (() => {
                          const { remaining, color } = getRoleLimitData("employee");
                          return (
                            <option value="employee" style={{ color }}>
                              User — {remaining} left
                            </option>
                          );
                        })()
                        : (["employee", "manager", "admin"].map((role) => {
                          const { remaining, color } = getRoleLimitData(role);
                          const disabled = remaining <= 0 && formData.role !== role;
                          const label =
                            role === "employee"
                              ? "User"
                              : role.charAt(0).toUpperCase() + role.slice(1);

                          return (
                            <option key={role} value={role} disabled={disabled} style={{ color }}>
                              {label} — {remaining} left
                            </option>
                          );
                        })
                        )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Department (Optional)
                    </label>
                    <input
                      type="text"
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="Enter department"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Phone Number *
                    </label>
                    <input
                      type="text"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="Enter phone number"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
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
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Department (Optional)
                    </label>
                    <input
                      type="text"
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="Enter department"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Phone Number *
                    </label>
                    <input
                      type="text"
                      name="phone"
                      value={formData.phone}
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
      {/* 🚨 Permanent Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            className="rounded-lg max-w-md w-full p-6"
            style={{
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
            }}
          >
            <h2 className="text-lg font-bold mb-2">Permanently Delete User</h2>

            <p className="text-sm mb-5" style={{ color: "var(--color-textSecondary)" }}>
              This action cannot be undone. The user will be <b>permanently removed</b> from the system.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteUserId(null);
                }}
                className="py-2 px-4 rounded-lg border font-medium text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  if (deleteUserId) {
                    await handlePermanentDelete(deleteUserId);
                  }
                  setShowDeleteModal(false);
                  setDeleteUserId(null);
                }}
                className="py-2 px-4 rounded-lg text-white font-medium text-sm"
                style={{ backgroundColor: "var(--color-error)" }}
              >
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {showAccessModal && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md shadow-2xl transform transition-all">
    {/* Header */}
    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Access Logs
        </h2>
        <p className="text-sm text-[var(--color-text)] mt-1">
          {selectedUserAccess?.username}
        </p>
      </div>
      <button
        onClick={() => setShowAccessModal(false)}
        className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5 text-[var(--color-text)]" />
      </button>
    </div>

    {/* Content */}
    <div className="p-6 max-h-96 overflow-y-auto">
      {selectedUserAccess?.logs?.length ? (
        <div className="space-y-3">
          {selectedUserAccess.logs.map((time: string | number | Date, idx: React.Key | null | undefined) => (
            <div 
              key={idx} 
              className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-chat)] hover:border-[var(--color-primary)] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm text-[var(--color-text)]">
                {formatDateTime(time)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
            <Clock className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400">No access logs available</p>
        </div>
      )}
    </div>

    {/* Footer */}
    <div className="p-6 border-t border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setShowAccessModal(false)}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/25"
      >
        Close
      </button>
    </div>
  </div>
</div>
)}
    </div>
  );
};

export default AdminPanel;