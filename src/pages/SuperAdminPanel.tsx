import React, { useState, useEffect } from 'react';
import { Building2, Plus, Edit, Save, X, Users, Crown, Mail, Lock, Building, Eye, EyeOff, Key, ChevronUp, ChevronDown } from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';

interface Company {
  permissions: {
    dashboard: boolean;
    pendingTasks: boolean;
    pendingRecurringTasks: boolean;
    masterTasks: boolean;
    masterRecurringTasks: boolean;
    performance: boolean;
    assignTask: boolean;
    adminPanel: boolean;
    chat: boolean;
    settingspage: boolean,
    recyclebin: boolean,
    helpsupport: boolean,
    taskshift:boolean,
    forapproval: boolean
  };
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
  isActive: boolean;
  createdAt: string;
  admin: {
    username: string;
    email: string;
    phone?: string;
  } | null;
}
const SuperAdminPanel: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showAllPermissions, setShowAllPermissions] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const defaultPermissions = {
    dashboard: true,
    pendingTasks: true,
    pendingRecurringTasks: true,
    masterTasks: true,
    masterRecurringTasks: true,
    performance: true,
    assignTask: true,
    adminPanel: true,
    chat: true,
    settingspage: true,
    recyclebin: true,
    helpsupport: true,
    taskshift: true,
    forapproval:true,
  };
  const [formData, setFormData] = useState({
    companyName: '',
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
    adminNewName: '',
    adminNewEmail: '',
    adminNewPhone: '',
    limits: {
      adminLimit: 1,
      managerLimit: 5,
      userLimit: 50
    },
    permissions: { ...defaultPermissions }   // ✅ fixed
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${address}/api/companies`);
      setCompanies(response.data);
    } catch (error) {
      console.error('Error fetching companies:', error);
      setMessage({ type: 'error', text: 'Failed to fetch companies' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;

    if (name.startsWith('limits.')) {
      const limitKey = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        limits: {
          ...prev.limits,
          [limitKey]: type === 'number' ? parseInt(value) || 0 : value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? parseInt(value) || 0 : value
      }));
    }
  };

  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await axios.post(`${address}/api/companies`, formData);
      setMessage({ type: 'success', text: 'Company and admin created successfully!' });
      setShowCreateModal(false);
      resetForm();
      fetchCompanies();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to create company' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    setIsSubmitting(true);

    try {
      const updateData: any = {
        companyName: formData.companyName,
        limits: formData.limits,
        permissions: formData.permissions
      };

      // Add admin details if they were provided
      if (formData.adminNewName || formData.adminNewEmail) {
        updateData.adminDetails = {
          username: formData.adminNewName || editingCompany.admin?.username,
          email: formData.adminNewEmail || editingCompany.admin?.email,
          phone: formData.adminNewPhone || editingCompany.admin?.phone || ''
        };
      }

      await axios.put(`${address}/api/companies/${editingCompany.companyId}`, updateData);
      setMessage({ type: 'success', text: 'Company updated successfully!' });
      setEditingCompany(null);
      resetForm();
      fetchCompanies();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update company' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters long' });
      return;
    }

    setIsSubmitting(true);

    try {
      await axios.put(`${address}/api/companies/${selectedCompany.companyId}/admin/password`, {
        newPassword: passwordData.newPassword
      });
      setMessage({ type: 'success', text: 'Admin password updated successfully!' });
      setShowPasswordModal(false);
      setSelectedCompany(null);
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update password' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCompanies = companies.filter((company) => {
  const term = searchTerm.toLowerCase();

  return (
    company.companyName.toLowerCase().includes(term) ||
    company.admin?.username.toLowerCase().includes(term) ||
    company.admin?.email.toLowerCase().includes(term) ||
    (company.admin?.phone || "").toLowerCase().includes(term)
  );
});

  const handleToggleCompanyStatus = async (companyId: string, companyName: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (window.confirm(`Are you sure you want to ${action} "${companyName}"?`)) {
      try {
        await axios.patch(`${address}/api/companies/${companyId}/status`, {
          isActive: !currentStatus
        });
        setMessage({
          type: 'success',
          text: `Company ${action}d successfully!`
        });
        fetchCompanies();
      } catch (error: any) {
        setMessage({
          type: 'error',
          text: error.response?.data?.message || `Failed to ${action} company`
        });
      }
    }
  };

  const startEditCompany = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      companyName: company.companyName,
      adminName: '',
      adminEmail: '',
      adminPhone: '',
      adminPassword: '',
      adminNewPhone: company.admin?.phone || '',
      adminNewName: company.admin?.username || '',
      adminNewEmail: company.admin?.email || '',
      limits: company.limits,
      permissions: {
        ...defaultPermissions,
        ...(company.permissions || {})
      }
    });
  };

  const startPasswordChange = (company: Company) => {
    setSelectedCompany(company);
    setShowPasswordModal(true);
    setPasswordData({ newPassword: '', confirmPassword: '' });
  };

  const resetForm = () => {
    setFormData({
      companyName: '',
      adminName: '',
      adminEmail: '',
      adminPhone: '',
      adminPassword: '',
      adminNewName: '',
      adminNewEmail: '',
      adminNewPhone: '',
      limits: {
        adminLimit: 1,
        managerLimit: 5,
        userLimit: 50
      },
      permissions: {
        dashboard: true,
        pendingTasks: true,
        pendingRecurringTasks: true,
        masterTasks: true,
        masterRecurringTasks: true,
        performance: true,
        assignTask: true,
        adminPanel: true,
        chat: true,
        settingspage: true,
        recyclebin: true,
        helpsupport: true,
        taskshift:true,
        forapproval:true,
      }
    });
  };

  const getTotalUsers = (userCounts: Company['userCounts']) => {
    return userCounts.admin + userCounts.manager + userCounts.employee;
  };

  const getUsagePercentage = (current: number, limit: number) => {
    return limit > 0 ? Math.round((current / limit) * 100) : 0;
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'var(--color-error)';
    if (percentage >= 75) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-2 sm:p-6 space-y-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Crown size={28} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-3xl font-bold" style={{ color: 'var(--color-text)' }}>
            SuperAdmin Panel
          </h1>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <Plus size={20} />
          Create Company
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 w-full max-w-md">
  <input
    type="text"
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    className="flex-1 px-4 py-3 border rounded-lg text-sm"
    placeholder="Search by Company, Admin, Email, Phone..."
    style={{
      backgroundColor: "var(--color-background)",
      borderColor: "var(--color-border)",
      color: "var(--color-text)",
    }}
  />

  {searchTerm && (
    <button
      onClick={() => setSearchTerm("")}
      className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
      title="Clear"
    >
      <X size={18} className="text-gray-600" />
    </button>
  )}
</div>

      {/* Message */}
      {message.text && (
        <div
          className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
            }`}
        >
          {message.text}
        </div>
      )}
      

      {/* Companies Table */}
      <div className="rounded-lg border shadow-sm overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="max-h-[700px] overflow-x-auto overflow-y-auto">
          <table className="w-full">
            <thead  className="sticky top-0 z-20" style={{ backgroundColor: 'var(--color-surfacehelp)' }}>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Company
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Users
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Limits
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Created
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Permissions
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {filteredCompanies.map((company) => (
                <tr key={company._id} className="hover:bg-opacity-50" style={{ backgroundColor: 'transparent' }}>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)20' }}>
                        <Building2 size={20} style={{ color: 'var(--color-primary)' }} />
                      </div>
                      <div>
                        <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
                          {company.companyName}
                        </div>
                        <div className="text-sm" style={{ color: 'var(--color-textSecondary)' }}>
                          ID: {company.companyId}
                        </div>
                        {company.admin && (
                          <div className="text-sm" style={{ color: 'var(--color-textSecondary)' }}>
                            <div>{company.admin.username}</div>
                            <div className="text-xs text-[var(--color-textSecondary)]">{company.admin.email}</div>
                            <div className="text-xs text-[var(--color-textSecondary)]">{company.admin.phone}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                        <span className="font-medium">Total: </span>
                        <span className="font-bold" style={{ color: 'var(--color-primary)' }}>
                          {getTotalUsers(company.userCounts)}
                        </span>
                      </div>
                      <div className="text-xs space-y-1" style={{ color: 'var(--color-textSecondary)' }}>
                        <div>Admins: {company.userCounts.admin}</div>
                        <div>Managers: {company.userCounts.manager}</div>
                        <div>Employees: {company.userCounts.employee}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      {/* Admin Limit */}
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--color-text)' }}>Admin</span>
                        <span style={{ color: 'var(--color-textSecondary)' }}>
                          {company.userCounts.admin}/{company.limits.adminLimit}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${getUsagePercentage(company.userCounts.admin, company.limits.adminLimit)}%`,
                            backgroundColor: getUsageColor(getUsagePercentage(company.userCounts.admin, company.limits.adminLimit))
                          }}
                        />
                      </div>

                      {/* Manager Limit */}
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--color-text)' }}>Manager</span>
                        <span style={{ color: 'var(--color-textSecondary)' }}>
                          {company.userCounts.manager}/{company.limits.managerLimit}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${getUsagePercentage(company.userCounts.manager, company.limits.managerLimit)}%`,
                            backgroundColor: getUsageColor(getUsagePercentage(company.userCounts.manager, company.limits.managerLimit))
                          }}
                        />
                      </div>

                      {/* Employee Limit */}
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--color-text)' }}>Employee</span>
                        <span style={{ color: 'var(--color-textSecondary)' }}>
                          {company.userCounts.employee}/{company.limits.userLimit}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${getUsagePercentage(company.userCounts.employee, company.limits.userLimit)}%`,
                            backgroundColor: getUsageColor(getUsagePercentage(company.userCounts.employee, company.limits.userLimit))
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${company.isActive
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                        }`}
                    >
                      {company.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                      {new Date(company.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                      {new Date(company.createdAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs space-y-1">

                      {/* Slice only 4 when not expanded */}
                      {Object.entries(company.permissions || {})
                        .slice(0, showAllPermissions ? undefined : 4)
                        .map(([key, value]) => (
                          <div key={key}>
                            <span className="font-semibold capitalize">{key}: </span>
                            <span className={value ? "text-green-500" : "text-red-500"}>
                              {value ? "Yes" : "No"}
                            </span>
                          </div>
                        ))}

                      {/* Show More / Less Button */}
                      {Object.keys(company.permissions || {}).length > 4 && (
                        <button
                          onClick={() => setShowAllPermissions(!showAllPermissions)}
                          className="flex items-center text-blue-600 hover:underline font-semibold text-xs mt-1"
                        >
                          {showAllPermissions ? (
                            <>
                              Show Less <ChevronUp size={14} className="ml-1" />
                            </>
                          ) : (
                            <>
                              Show More <ChevronDown size={14} className="ml-1" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => startEditCompany(company)}
                        className="p-2 rounded-lg hover:bg-opacity-10 transition-colors"
                        style={{ color: 'var(--color-primary)' }}
                        title="Edit Company"
                      >
                        <Edit size={16} />
                      </button>
                      {company.admin && (
                        <button
                          onClick={() => startPasswordChange(company)}
                          className="p-2 rounded-lg hover:bg-opacity-10 transition-colors"
                          style={{ color: 'var(--color-secondary)' }}
                          title="Change Admin Password"
                        >
                          <Key size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleCompanyStatus(company.companyId, company.companyName, company.isActive)}
                        className="p-2 rounded-lg hover:bg-opacity-10 transition-colors"
                        style={{ color: company.isActive ? 'var(--color-warning)' : 'var(--color-success)' }}
                        title={company.isActive ? 'Deactivate Company' : 'Activate Company'}
                      >
                        {company.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {companies.length === 0 && (
          <div className="text-center py-12">
            <Building2 size={48} className="mx-auto mb-4" style={{ color: 'var(--color-textSecondary)' }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--color-text)' }}>
              No companies found
            </h3>
            <p className="text-sm" style={{ color: 'var(--color-textSecondary)' }}>
              Create your first company to get started.
            </p>
          </div>
        )}
      </div>

      {/* Create Company Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="sticky top-0 p-6 border-b" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
                  <Building size={24} className="mr-3" style={{ color: 'var(--color-primary)' }} />
                  Create New Company
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <form onSubmit={handleCreateCompany} className="space-y-6">
                {/* Company Information */}
                <div className="space-y-4">
                  <h4 className="text-lg font-medium flex items-center" style={{ color: 'var(--color-text)' }}>
                    <Building2 size={20} className="mr-2" />
                    Company Information
                  </h4>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                      Company Name *
                    </label>
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border rounded-lg"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                    Admin Name *
                  </label>
                  <input
                    type="text"
                    name="adminName"
                    value={formData.adminName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border rounded-lg"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                </div>

                {/* Admin Information */}
                <div className="space-y-4">
                  <h4 className="text-lg font-medium flex items-center" style={{ color: 'var(--color-text)' }}>
                    <Crown size={20} className="mr-2" />
                    Company Admin Details
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Email *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail size={18} style={{ color: 'var(--color-textSecondary)' }} />
                        </div>
                        <input
                          type="email"
                          name="adminEmail"
                          value={formData.adminEmail}
                          onChange={handleInputChange}
                          required
                          className="w-full pl-10 pr-4 py-3 border rounded-lg"
                          style={{
                            backgroundColor: 'var(--color-background)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text)'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Password *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock size={18} style={{ color: 'var(--color-textSecondary)' }} />
                        </div>
                        <input
                          type={showAdminPassword ? "text" : "password"}
                          name="adminPassword"
                          value={formData.adminPassword}
                          onChange={handleInputChange}
                          required
                          className="w-full pl-10 pr-10 py-3 border rounded-lg"
                          style={{
                            backgroundColor: 'var(--color-background)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text)'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminPassword(prev => !prev)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                        >
                          {showAdminPassword ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Phone
                      </label>
                      <input
                        type="tel"
                        name="adminPhone"
                        value={formData.adminPhone}
                        onChange={handleInputChange}
                        placeholder={editingCompany?.admin?.phone || 'Current admin phone'}
                        className="w-full px-4 py-3 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* User Limits */}
                <div className="space-y-4">
                  <h4 className="text-lg font-medium flex items-center" style={{ color: 'var(--color-text)' }}>
                    <Users size={20} className="mr-2" />
                    User Limits
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Limit
                      </label>
                      <input
                        type="number"
                        name="limits.adminLimit"
                        value={formData.limits.adminLimit}
                        onChange={handleInputChange}
                        min="1"
                        required
                        className="w-full px-3 py-2 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Manager Limit
                      </label>
                      <input
                        type="number"
                        name="limits.managerLimit"
                        value={formData.limits.managerLimit}
                        onChange={handleInputChange}
                        min="1"
                        required
                        className="w-full px-3 py-2 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Employee Limit
                      </label>
                      <input
                        type="number"
                        name="limits.userLimit"
                        value={formData.limits.userLimit}
                        onChange={handleInputChange}
                        min="1"
                        required
                        className="w-full px-3 py-2 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-4 mt-4">
                    <h4 className="text-lg font-medium" style={{ color: 'var(--color-text)' }}>
                      Company Permissions
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      {Object.keys(formData.permissions).map((key) => (
                        <label key={key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name={`permissions.${key}`}
                            checked={formData.permissions[key as keyof typeof formData.permissions]}
                            onChange={(e) =>
                              setFormData(prev => ({
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  [key as keyof typeof prev.permissions]: e.target.checked
                                }
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <span className="capitalize text-sm" style={{ color: 'var(--color-text)' }}>
                            {key.replace(/([A-Z])/g, ' $1')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3 px-6 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {isSubmitting ? 'Creating...' : (
                      <>
                        <Save size={18} className="inline mr-2" />
                        Create Company
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className="flex-1 py-3 px-6 rounded-lg border font-medium"
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

      {/* Edit Company Modal */}
      {editingCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="sticky top-0 p-6 border-b" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
                  <Building size={24} className="mr-3" style={{ color: 'var(--color-primary)' }} />
                  Edit Company - {editingCompany.companyName}
                </h3>
                <button
                  onClick={() => {
                    setEditingCompany(null);
                    resetForm();
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <form onSubmit={handleUpdateCompany} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                    Company Name *
                  </label>
                  <input
                    type="text"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border rounded-lg"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                  />
                </div>

                {/* Admin Information */}
                <div className="space-y-4">
                  <h4 className="text-lg font-medium flex items-center" style={{ color: 'var(--color-text)' }}>
                    <Crown size={20} className="mr-2" />
                    Admin Information
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Name
                      </label>
                      <input
                        type="text"
                        name="adminNewName"
                        value={formData.adminNewName}
                        onChange={handleInputChange}
                        placeholder={editingCompany?.admin?.username || 'Current admin name'}
                        className="w-full px-4 py-3 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Email
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail size={18} style={{ color: 'var(--color-textSecondary)' }} />
                        </div>
                        <input
                          type="email"
                          name="adminNewEmail"
                          value={formData.adminNewEmail}
                          onChange={handleInputChange}
                          placeholder={editingCompany?.admin?.email || 'Current admin email'}
                          className="w-full pl-10 pr-4 py-3 border rounded-lg"
                          style={{
                            backgroundColor: 'var(--color-background)',
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text)'
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Phone *
                      </label>
                      <input
                        type="tel"
                        name="adminNewPhone"
                        value={formData.adminNewPhone}
                        onChange={handleInputChange}
                        placeholder={editingCompany?.admin?.phone || 'Current admin phone'}
                        className="w-full px-4 py-3 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-medium" style={{ color: 'var(--color-text)' }}>
                    User Limits
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Admin Limit
                      </label>
                      <input
                        type="number"
                        name="limits.adminLimit"
                        value={formData.limits.adminLimit}
                        onChange={handleInputChange}
                        min="1"
                        required
                        className="w-full px-3 py-2 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Manager Limit
                      </label>
                      <input
                        type="number"
                        name="limits.managerLimit"
                        value={formData.limits.managerLimit}
                        onChange={handleInputChange}
                        min="1"
                        required
                        className="w-full px-3 py-2 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                        Employee Limit
                      </label>
                      <input
                        type="number"
                        name="limits.userLimit"
                        value={formData.limits.userLimit}
                        onChange={handleInputChange}
                        min="1"
                        required
                        className="w-full px-3 py-2 border rounded-lg"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text)'
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-4 mt-4">
                    <h4 className="text-lg font-medium" style={{ color: 'var(--color-text)' }}>
                      Company Permissions
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      {Object.keys(formData.permissions).map((key) => (
                        <label key={key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name={`permissions.${key}`}
                            checked={formData.permissions[key as keyof typeof formData.permissions]}
                            onChange={(e) =>
                              setFormData(prev => ({
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  [key as keyof typeof prev.permissions]: e.target.checked
                                }
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <span className="capitalize text-sm" style={{ color: 'var(--color-text)' }}>
                            {key.replace(/([A-Z])/g, ' $1')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3 px-6 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {isSubmitting ? 'Updating...' : (
                      <>
                        <Save size={18} className="inline mr-2" />
                        Update Company
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCompany(null);
                      resetForm();
                    }}
                    className="flex-1 py-3 px-6 rounded-lg border font-medium"
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

      {/* Change Password Modal */}
      {showPasswordModal && selectedCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg max-w-md w-full" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="p-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold flex items-center" style={{ color: 'var(--color-text)' }}>
                  <Key size={24} className="mr-3" style={{ color: 'var(--color-secondary)' }} />
                  Change Admin Password
                </h3>
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setSelectedCompany(null);
                    setPasswordData({ newPassword: '', confirmPassword: '' });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>
              <p className="text-sm mt-2" style={{ color: 'var(--color-textSecondary)' }}>
                Changing password for admin of <strong>{selectedCompany.companyName}</strong>
              </p>
            </div>

            <div className="p-6">
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                    New Password *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock size={18} style={{ color: 'var(--color-textSecondary)' }} />
                    </div>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      name="newPassword"
                      value={passwordData.newPassword}
                      onChange={handlePasswordInputChange}
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-3 border rounded-lg"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(prev => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock size={18} style={{ color: 'var(--color-textSecondary)' }} />
                    </div>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordInputChange}
                      required
                      minLength={6}
                      className="w-full pl-10 pr-10 py-3 border rounded-lg"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)'
                      }}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(prev => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-3 px-6 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--color-secondary)' }}
                  >
                    {isSubmitting ? 'Updating...' : (
                      <>
                        <Key size={18} className="inline mr-2" />
                        Update Password
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setSelectedCompany(null);
                      setPasswordData({ newPassword: '', confirmPassword: '' });
                    }}
                    className="flex-1 py-3 px-6 rounded-lg border font-medium"
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
    </div>
  );
};

export default SuperAdminPanel;