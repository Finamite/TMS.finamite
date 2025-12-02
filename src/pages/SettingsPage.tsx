import React, { useState, useEffect } from 'react';
import { Settings, Mail, AlertTriangle, Save, X, Loader as Loader2, Send, Calendar, Plus, Pencil, Trash, ClipboardCheck, FileWarning, MessageSquare, Paperclip, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';
import { useAuth } from '../contexts/AuthContext';

// ToggleSwitch Component
interface ToggleSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, disabled = false }) => {
    return (
        <button
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'
                    }`}
            />
        </button>
    );
};

interface ScoringRule {
    id: string;
    name: string;
    enabled: boolean;
    // 0 = initial, 1..limit = revisions
    mapping: Record<number, number>;
    days: Record<number, number>;
}

interface RevisionSettings {
    limit: number;
    scoringModel: 'linear' | 'stepped';
    enableRevisions: boolean;
    maxDays: number;
    enableDaysRule: boolean;
    days: Record<number, number>;
    scoringRules: ScoringRule[];
    enableMaxRevision: boolean;
    restrictHighPriorityRevision: boolean,
}

interface EmailSettings {
    email: string;
    appPassword: string;
    enabled: boolean;
    // New email automation settings
    sendOnTaskCreate: boolean;
    sendOnTaskComplete: boolean;
    sendOnTaskRevision: boolean;
    sendToUsers: string[]; // Array of user IDs to send notifications to
    // Report scheduling
    morningReportTime: string;
    eveningReportTime: string;
    enableMorningReport: boolean;
    enableEveningReport: boolean;
    enableReports: boolean;
    reportRecipients: string[];
}

interface SettingsData {
    taskCompletion: any;
    revision: RevisionSettings;
    email: EmailSettings;
}

interface User {
    _id: string;
    username: string;
    email: string;
    role: string;
}

// Helper to generate default scoring rule based on limit
const buildDefaultScoringRule = (limit: number): ScoringRule => {
    const mapping: Record<number, number> = {};
    // simple stepped: start 100, end 0 on last revision
    const step = limit > 0 ? Math.floor(100 / limit) : 100;
    for (let i = 0; i <= limit; i++) {
        const remaining = Math.max(0, 100 - step * i);
        mapping[i] = remaining;
    }
    mapping[0] = 100;
    mapping[limit] = 0;
    const days: Record<number, number> = {};
    for (let i = 0; i <= limit; i++) {
        days[i] = 7;   // default 7 days for all
    }

    return {
        id: 'default',
        name: 'Default Scoring',
        enabled: true,
        mapping,
        days     // <-- now added!
    };
};

const generateRuleId = () => {
    if (typeof window !== 'undefined' && (window.crypto as any)?.randomUUID) {
        return (window.crypto as any).randomUUID();
    }
    return `rule_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const SettingsPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingEmail, setTestingEmail] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [settings, setSettings] = useState<SettingsData>({
        revision: {
            limit: 3,
            scoringModel: "stepped",
            enableRevisions: false,
            enableMaxRevision: true,
            maxDays: 7,
            enableDaysRule: false,
            restrictHighPriorityRevision: false,
            days: {},                          // <---- ✔ ADD THIS
            scoringRules: [buildDefaultScoringRule(3)]
        },
        email: {
            email: '',
            appPassword: '',
            enabled: false,
            sendOnTaskCreate: true,
            sendOnTaskComplete: false,
            sendOnTaskRevision: true,
            sendToUsers: [],
            morningReportTime: '09:00',
            eveningReportTime: '18:00',
            enableMorningReport: false,
            enableEveningReport: false,
            enableReports: false,
            reportRecipients: []
        },
        taskCompletion: {
            enabled: false,  // 🔥 MAIN TOGGLE
            pendingTasks: {
                allowAttachments: false,
                mandatoryAttachments: false,
                mandatoryRemarks: false
            },
            pendingRecurringTasks: {
                allowAttachments: false,
                mandatoryAttachments: false,
                mandatoryRemarks: false
            }
        }
    });
    const [expandedRevision, setExpandedRevision] = useState(false);
    const [expandedEmail, setExpandedEmail] = useState(false);
    const [expandedReports, setExpandedReports] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Modal state for scoring rules
    const [openNewRuleModal, setOpenNewRuleModal] = useState(false);
    const [openEditRuleModal, setOpenEditRuleModal] = useState(false);
    const [ruleName, setRuleName] = useState('');
    const [ruleMapping, setRuleMapping] = useState<Record<number, number>>({});
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [openEditMaxDays, setOpenEditMaxDays] = useState(false);
    const [confirmDeleteRule, setConfirmDeleteRule] = useState<null | string>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [expandedTask, setExpandedTask] = useState(false);


    useEffect(() => {
        fetchSettings();
        fetchUsers();
        fetchTaskSettings();
    }, [currentUser?.companyId]);

    useEffect(() => {
        if (message.text) {
            const timer = setTimeout(() => setMessage({ type: '', text: '' }), 5000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    useEffect(() => {
        const handleGoogleMessage = (event: any) => {
            if (event.data?.type === "googleConnected") {
                fetchSettings().then(() => {
                    // ⭐ Ensure UI toggle immediately shows enabled
                    setSettings(prev => ({
                        ...prev,
                        email: {
                            ...prev.email,
                            enabled: true
                        }
                    }));

                    setMessage({
                        type: "success",
                        text: "Google connected successfully!"
                    });
                });
            }
        };

        window.addEventListener("message", handleGoogleMessage);
        return () => window.removeEventListener("message", handleGoogleMessage);
    }, []);

    const fetchTaskSettings = async () => {
        if (!currentUser?.companyId) return;

        const res = await axios.get(`${address}/api/settings/task-completion?companyId=${currentUser.companyId}`);

        setSettings(prev => ({
            ...prev,
            taskCompletion: {
                enabled: res.data.enabled ?? false,        // 🔥 NEW
                pendingTasks: res.data.pendingTasks,
                pendingRecurringTasks: res.data.pendingRecurringTasks
            }
        }));
    };

    const updateTaskSetting = (section: string, field: string, value: boolean) => {
        setHasUnsavedChanges(true);

        setSettings(prev => ({
            ...prev,
            taskCompletion: {
                ...prev.taskCompletion,
                [section]: {
                    ...prev.taskCompletion[section],
                    [field]: value
                }
            }
        }));
    };

    const connectGoogle = async () => {
        try {
            setGoogleLoading(true);

            const companyId = currentUser?.companyId;
            if (!companyId) {
                alert("Company ID missing");
                return;
            }

            // 1️⃣ Ask backend to generate OAuth URL
            const res = await axios.get(`${address}/api/settings/email/google-auth`, {
                params: { companyId }
            });

            if (!res.data.url) {
                alert("Failed to load Google authentication URL");
                return;
            }

            // 2️⃣ Append companyId to state param
            const authUrl = res.data.url + `&state=${companyId}`;

            // 3️⃣ Open Popup Window
            const popup = window.open(
                authUrl,
                "_blank",
                "width=500,height=600"
            );

            if (!popup) {
                alert("Popup blocked! Please enable popups.");
                return;
            }

            // 4️⃣ Listen for message from backend callback
            const listener = (event: MessageEvent) => {
                if (event.data?.type === "googleConnected") {
                    popup.close();
                    window.removeEventListener("message", listener);

                    // Reload settings
                    fetchSettings();
                    setMessage({
                        type: "success",
                        text: "Google connected successfully!"
                    });
                }
            };

            window.addEventListener("message", listener);

        } catch (err) {
            console.error("Google auth error:", err);
        } finally {
            setGoogleLoading(false);
        }
    };

    const disconnectGoogle = async () => {
        if (!currentUser?.companyId) return;
        try {
            await axios.post(`${address}/api/settings/email/disconnect`, {
                companyId: currentUser.companyId
            });
            fetchSettings();
        } catch (err) {
            console.error(err);
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${address}/api/users?companyId=${currentUser?.companyId}`);
            setUsers(response.data.users || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    };

    const deleteRule = (id: string) => {
        setHasUnsavedChanges(true);
        setSettings(prev => ({
            ...prev,
            revision: {
                ...prev.revision,
                scoringRules: prev.revision.scoringRules.filter(r => r.id !== id)
            }
        }));
    };

    const fetchSettings = async () => {
        if (!currentUser?.companyId) return;
        setLoading(true);
        try {
            const revRes = await axios.get(`${address}/api/settings/revision?companyId=${currentUser.companyId}`);
            if (revRes.data) {
                const limit = revRes.data.limit ?? 3;
                const existingRules = Array.isArray(revRes.data.scoringRules)
                    ? revRes.data.scoringRules.map((rule: { days: any; }) => ({
                        ...rule,
                        days: rule.days ?? {}   // ensure days exists
                    }))
                    : [buildDefaultScoringRule(limit)];

                setSettings(prev => ({
                    ...prev,
                    revision: {
                        limit,
                        scoringModel: revRes.data.scoringModel ?? 'stepped',
                        enableRevisions: revRes.data.enableRevisions ?? false,
                        maxDays: revRes.data.maxDays ?? 7,
                        enableDaysRule: revRes.data.enableDaysRule ?? false,
                        enableMaxRevision: revRes.data.enableMaxRevision ?? true,
                        restrictHighPriorityRevision: revRes.data.restrictHighPriorityRevision ?? false,
                        days: revRes.data.days ?? {},
                        scoringRules: existingRules
                    }
                }));
            }

            const emailRes = await axios.get(`${address}/api/settings/email?companyId=${currentUser.companyId}`);
            if (emailRes.data) {
                setSettings(prev => ({
                    ...prev,
                    email: {
                        ...prev.email,
                        ...emailRes.data,
                        enabled: emailRes.data.enabled ?? false, // ✅ FIXED: Don't default to true
                        // Set defaults for new fields if not present
                        sendOnTaskCreate: emailRes.data.sendOnTaskCreate ?? true,
                        sendOnTaskComplete: emailRes.data.sendOnTaskComplete ?? true, // ✅ FIXED: Default to true
                        sendOnTaskRevision: emailRes.data.sendOnTaskRevision ?? true,
                        sendToUsers: emailRes.data.sendToUsers || [],
                        morningReportTime: emailRes.data.morningReportTime || '09:00',
                        eveningReportTime: emailRes.data.eveningReportTime || '18:00',
                        enableMorningReport: emailRes.data.enableMorningReport ?? false,
                        enableEveningReport: emailRes.data.enableEveningReport ?? false,
                        enableReports: emailRes.data.enableReports ?? false,
                        reportRecipients: emailRes.data.reportRecipients || []
                    }
                }));
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!currentUser?.companyId) return;
        setSaving(true);
        try {
            const revisionPayload = {
                companyId: currentUser.companyId,
                limit: settings.revision.limit,
                scoringModel: settings.revision.scoringModel,

                enableRevisions: settings.revision.enableRevisions,
                enableMaxRevision: settings.revision.enableMaxRevision,  // ✅ FIXED
                enableDaysRule: settings.revision.enableDaysRule,        // ✅ FIXED
                restrictHighPriorityRevision: settings.revision.restrictHighPriorityRevision ?? false,

                maxDays: settings.revision.enableDaysRule
                    ? settings.revision.maxDays
                    : Infinity,

                days: settings.revision.enableDaysRule
                    ? settings.revision.days
                    : {},

                scoringRules: settings.revision.scoringRules.map(rule => ({
                    ...rule,
                    days: settings.revision.enableDaysRule ? rule.days : undefined
                }))
            };

            await axios.post(`${address}/api/settings/revision`, revisionPayload);;

            await axios.post(`${address}/api/settings/email`, {
                companyId: currentUser.companyId,
                ...settings.email
            });
            await axios.post(`${address}/api/settings/task-completion`, {
                companyId: currentUser.companyId,
                enabled: settings.taskCompletion.enabled,
                pendingTasks: settings.taskCompletion.pendingTasks,
                pendingRecurringTasks: settings.taskCompletion.pendingRecurringTasks
            });

            setHasUnsavedChanges(false);
            setMessage({ type: 'success', text: 'Settings saved successfully!' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    const handleInputChange = (section: keyof SettingsData, field: string, value: any) => {
        setHasUnsavedChanges(true);
        setSettings(prev => ({
            ...prev,
            [section]: { ...prev[section], [field]: value }
        }));
    };


    // Get scoring preview based on active rule
    const getScoringPreview = (limit: number, rules: ScoringRule[]) => {
        const previews: string[] = [];
        const activeRule = rules.find(r => r.enabled) || rules[0];

        if (!activeRule) {
            // Fallback simple behavior
            previews.push('Initial: 100%');
            if (limit === 1) {
                previews.push('Revision 1: 50%');
                return previews;
            }
            const step = 100 / limit;
            for (let i = 1; i <= limit; i++) {
                const remaining = Math.max(0, Math.round(100 - step * i));
                previews.push(`Revision ${i}: ${remaining}%`);
            }
            return previews;
        }

        for (let i = 0; i <= limit; i++) {
            const label = i === 0 ? 'Initial' : `Revision ${i}`;
            let pct = activeRule.mapping[i];

            if (pct === undefined || pct === null) {
                // fallback: linear to zero
                if (i === 0) pct = 100;
                else if (i === limit) pct = 0;
                else {
                    const step = 100 / limit;
                    pct = Math.max(0, Math.round(100 - step * i));
                }
            }

            previews.push(`${label}: ${pct}%`);
        }

        return previews;
    };

    const handleTestEmail = async () => {
        if (!currentUser?.companyId) return;
        setTestingEmail(true);
        try {
            await axios.post(`${address}/api/settings/email/test`, {
                companyId: currentUser.companyId,
                to: currentUser.email,
                subject: 'Test Email from Task Management System',
                text: 'This is a test email to verify your Gmail configuration. Your email settings are working correctly!'
            });
            setMessage({ type: 'success', text: 'Test email sent successfully! Check your inbox.' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send test email' });
        } finally {
            setTestingEmail(false);
        }
    };

    const revisionEnabled = settings.revision.enableRevisions;
    const emailEnabled = settings.email.enabled;
    const reportsEnabled = settings.email.enableReports;

    // ---------- Scoring Rules Handlers ----------

    const openCreateRuleModal = () => {
        setEditingRuleId(null);
        setRuleName('');
        const mapping: Record<number, number> = {};
        const limit = settings.revision.limit;
        const step = limit > 0 ? Math.floor(100 / limit) : 100;
        for (let i = 0; i <= limit; i++) {
            const remaining = Math.max(0, 100 - step * i);
            mapping[i] = remaining;
        }
        mapping[0] = 100;
        mapping[limit] = 0;
        setRuleMapping(mapping);
        setOpenNewRuleModal(true);
    };

    const saveNewRule = () => {
        if (!ruleName.trim()) return;

        const newRule: ScoringRule = {
            id: generateRuleId(),
            name: ruleName.trim(),
            enabled: false,
            mapping: { ...ruleMapping },
            days: Object.fromEntries(
                Object.keys(ruleMapping).map(key => [Number(key), settings.revision.maxDays])
            )
        };

        setHasUnsavedChanges(true);
        setSettings(prev => ({
            ...prev,
            revision: {
                ...prev.revision,
                scoringRules: [...prev.revision.scoringRules, newRule]
            }
        }));

        setOpenNewRuleModal(false);
    };

    const toggleRuleEnable = (id: string) => {
        setHasUnsavedChanges(true);
        setSettings(prev => ({
            ...prev,
            revision: {
                ...prev.revision,
                scoringRules: prev.revision.scoringRules.map(r => {
                    if (r.id === id) {
                        // user toggles this rule
                        return { ...r, enabled: !r.enabled };
                    }
                    // if the clicked rule is being enabled, disable others
                    const clickedRule = prev.revision.scoringRules.find(x => x.id === id);
                    if (clickedRule?.enabled === false) {
                        // clicked rule is being enabled → disable this rule
                        return { ...r, enabled: false };
                    }
                    return r;
                })
            }
        }));
    };



    const handleEditRule = (rule: ScoringRule) => {
        setEditingRuleId(rule.id);
        setRuleName(rule.name);
        setRuleMapping({ ...rule.mapping });
        setOpenEditRuleModal(true);
    };

    const saveEditedRule = () => {
        if (!editingRuleId) return;
        setHasUnsavedChanges(true);
        setSettings(prev => ({
            ...prev,
            revision: {
                ...prev.revision,
                scoringRules: prev.revision.scoringRules.map(r =>
                    r.id === editingRuleId
                        ? {
                            ...r,
                            name: ruleName.trim() || r.name,
                            mapping: { ...ruleMapping },
                            days: settings.revision.days
                        }
                        : r
                )
            }
        }));
        setOpenEditRuleModal(false);
        setEditingRuleId(null);
    };

    const handleLimitChange = (value: number) => {
        const limit = Math.max(1, Math.min(20, value || 1));

        setHasUnsavedChanges(true);
        setSettings(prev => {
            const updatedRules = prev.revision.scoringRules.map(rule => {
                const newMapping: Record<number, number> = {};

                // Always recalc clean stepped scale
                const step = 100 / limit;

                for (let i = 0; i <= limit; i++) {
                    if (i === 0) newMapping[i] = 100;
                    else if (i === limit) newMapping[i] = 0;
                    else newMapping[i] = Math.max(0, Math.round(100 - step * i));
                }

                return {
                    ...rule,
                    mapping: newMapping
                };
            });

            return {
                ...prev,
                revision: {
                    ...prev.revision,
                    limit,
                    scoringRules: updatedRules
                }
            };
        });
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-[var(--color-primary)]" />
                    <p className="text-[var(--color-textSecondary)]">Loading system settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-[var(--color-background)] to-[var(--color-surface)] p-6">
            <div className="max-w-15xl mx-auto">
                {/* Header */}
                <div className="sticky top-0 z-40 bg-[var(--color-background)] bg-opacity-80 backdrop-blur-md 
                px-1 py-4 mb-6 border-b border-[var(--color-border)] flex items-center justify-between">

                    {/* LEFT SIDE */}
                    <div className="flex items-center">
                        <div className="p-3 bg-[var(--color-primary)] rounded-xl mr-4">
                            <Settings className="h-6 w-6 text-[var(--color-background)]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-[var(--color-text)]">System Settings</h1>
                            <p className="text-sm text-[var(--color-textSecondary)] mt-0">
                                Configure system behavior, scoring impact, email automation, and reporting
                            </p>
                        </div>
                    </div>

                    {/* RIGHT SIDE AREA */}
                    <div className="flex items-center gap-4">

                        {/* 🔥 Show pending changes */}
                        {hasUnsavedChanges && (
                            <div className="text-red-500 font-medium text-sm blink-warning">
                                ⚠ Changes are pending to save
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="py-3 px-6 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]
        hover:from-[var(--color-secondary)] hover:to-[var(--color-primary)]
        disabled:opacity-60 disabled:cursor-not-allowed
        text-[var(--color-background)] rounded-xl font-semibold transition-all duration-200
        flex items-center justify-center shadow-lg hover:shadow-xl"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-5 w-5 mr-2" />
                                    Save All Settings
                                </>
                            )}
                        </button>
                    </div>

                </div>
                {/* Success/Error Messages */}
                {message.text && (
                    <div
                        className={`mb-6 p-4 rounded-xl border-l-4 ${message.type === 'success'
                            ? 'bg-[color:var(--color-success)/10] border-[var(--color-success)] text-[var(--color-success)]'
                            : 'bg-[color:var(--color-error)/10] border-[var(--color-error)] text-[var(--color-error)]'
                            }`}
                    >
                        <div className="flex items-center">
                            <div
                                className={`mr-3 ${message.type === 'success'
                                    ? 'text-[var(--color-success)]'
                                    : 'text-[var(--color-error)]'
                                    }`}
                            >
                                {message.type === 'success' ? '✓' : '⚠'}
                            </div>
                            {message.text}
                        </div>
                    </div>
                )}

                <div className="space-y-8">
                    {/* Revision Settings */}
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden transition-all duration-300">
                        {/* Header */}
                        <div
                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[var(--color-background)] transition-colors"
                            onClick={() => setExpandedRevision(!expandedRevision)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[var(--color-accent)]/10 rounded-xl">
                                    <AlertTriangle className="h-6 w-6 text-[var(--color-accent)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-[var(--color-text)]">
                                        Revision & Scoring
                                    </h2>
                                    <p className="text-[var(--color-textSecondary)] text-sm mt-1">
                                        Configure task revision limits and scoring impact on performance
                                    </p>
                                </div>
                            </div>

                            {/* Toggle Switch */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleInputChange('revision', 'enableRevisions', !revisionEnabled);
                                    setExpandedRevision(!revisionEnabled);
                                }}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 shadow-inner ${revisionEnabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${revisionEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>

                        {/* Expanded Content */}
                        {expandedRevision && (
                            <div className="px-6 pb-6 pt-2 border-t border-[var(--color-border)] bg-[var(--color-background)]">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">

                                    {/* LEFT COLUMN */}
                                    <div className="space-y-8">
                                        {/* Configuration Section */}
                                        <div className="space-y-5">
                                            <h3 className="text-xs font-bold text-[var(--color-text)] uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-1 h-4 bg-[var(--color-primary)] rounded-full"></span>
                                                Configuration
                                            </h3>

                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Max Revision */}
                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-3 text-sm font-medium text-[var(--color-text)]">
                                                        <span>Max Revisions</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleInputChange('revision', 'enableMaxRevision', !settings.revision.enableMaxRevision);
                                                            }}
                                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${settings.revision.enableMaxRevision ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                                                                }`}
                                                        >
                                                            <span
                                                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${settings.revision.enableMaxRevision ? 'translate-x-4' : 'translate-x-1'
                                                                    }`}
                                                            />
                                                        </button>
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={20}
                                                        value={settings.revision.limit}
                                                        onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                                                        disabled={!settings.revision.enableMaxRevision}
                                                        className={`w-full px-4 py-3 border border-[var(--color-border)] rounded-lg text-sm
                    bg-[var(--color-surface)] text-[var(--color-text)]
                    focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-all
                    ${!settings.revision.enableMaxRevision ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    />
                                                </div>

                                                {/* Max Days */}
                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-3 text-sm font-medium text-[var(--color-text)]">
                                                        <span>Max Days</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleInputChange('revision', 'enableDaysRule', !settings.revision.enableDaysRule);
                                                            }}
                                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${settings.revision.enableDaysRule ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                                                                }`}
                                                        >
                                                            <span
                                                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${settings.revision.enableDaysRule ? 'translate-x-4' : 'translate-x-1'
                                                                    }`}
                                                            />
                                                        </button>
                                                    </label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={365}
                                                            value={settings.revision.maxDays}
                                                            onChange={(e) =>
                                                                setSettings(prev => ({
                                                                    ...prev,
                                                                    revision: { ...prev.revision, maxDays: parseInt(e.target.value) }
                                                                }))
                                                            }
                                                            disabled={!revisionEnabled}
                                                            className={`flex-1 px-4 py-3 border border-[var(--color-border)] rounded-lg text-sm
                      bg-[var(--color-surface)] text-[var(--color-text)]
                      focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-all
                      ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        />
                                                        <button
                                                            onClick={() => setOpenEditMaxDays(true)}
                                                            disabled={!revisionEnabled}
                                                            className={`p-3 rounded-lg border border-[var(--color-border)] 
                      hover:bg-[var(--color-border)]/30 transition-colors
                      ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <Pencil className="w-4 h-4 text-[var(--color-textSecondary)]" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Restrict High Priority Toggle */}
                                            <div className="flex items-center justify-between p-4 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-all">
                                                <label className="text-sm font-medium text-[var(--color-text)]">
                                                    Restrict High Priority Revisions
                                                </label>
                                                <button
                                                    onClick={() =>
                                                        handleInputChange('revision', 'restrictHighPriorityRevision', !settings.revision.restrictHighPriorityRevision)
                                                    }
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ${settings.revision.restrictHighPriorityRevision ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                                                        }`}
                                                >
                                                    <span
                                                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${settings.revision.restrictHighPriorityRevision ? 'translate-x-6' : 'translate-x-1'
                                                            }`}
                                                    />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Scoring Rules */}
                                        <div className="space-y-4">
                                            <h3 className="text-xs font-bold text-[var(--color-text)] uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-1 h-4 bg-[var(--color-success)] rounded-full"></span>
                                                Scoring Rules
                                            </h3>
                                            <div className="space-y-3">
                                                {settings.revision.scoringRules.map((rule) => (
                                                    <div
                                                        key={rule.id}
                                                        className="p-4 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] 
                    hover:shadow-lg hover:border-[var(--color-primary)]/40 transition-all duration-200"
                                                    >
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <h4 className="font-semibold text-[var(--color-text)]">{rule.name}</h4>
                                                                    {rule.enabled && (
                                                                        <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-success)]/20 
                            text-[var(--color-success)] uppercase tracking-wider">
                                                                            Active
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-[var(--color-textSecondary)] leading-relaxed font-mono">
                                                                    {Object.entries(rule.mapping)
                                                                        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                                                                        .map(([rev, pct]) =>
                                                                            parseInt(rev) === 0 ? `Initial: ${pct}%` : `R${rev}: ${pct}%`
                                                                        )
                                                                        .join(' • ')}
                                                                </p>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                {rule.id !== 'default' && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!revisionEnabled) return;
                                                                            setConfirmDeleteRule(rule.id);
                                                                        }}
                                                                        className="p-2 rounded-lg border border-[var(--color-error)]/50 text-[var(--color-error)]
                            hover:bg-[var(--color-error)] hover:text-white hover:border-[var(--color-error)] transition-all"
                                                                    >
                                                                        <Trash className="w-4 h-4" />
                                                                    </button>
                                                                )}

                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleEditRule(rule);
                                                                    }}
                                                                    disabled={!revisionEnabled}
                                                                    className={`p-2 rounded-lg border border-[var(--color-border)] 
                          hover:bg-[var(--color-border)]/30 transition-colors
                          ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                >
                                                                    <Pencil className="w-4 h-4 text-[var(--color-textSecondary)]" />
                                                                </button>

                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (!revisionEnabled) return;
                                                                        toggleRuleEnable(rule.id);
                                                                    }}
                                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ${rule.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'
                                                                        } ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                >
                                                                    <span
                                                                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${rule.enabled ? 'translate-x-6' : 'translate-x-1'
                                                                            }`}
                                                                    />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold text-[var(--color-text)] uppercase tracking-wider flex items-center gap-2">
                                                <span className="w-1 h-4 bg-[var(--color-secondary)] rounded-full"></span>
                                                Scoring Impact Preview
                                            </h3>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openCreateRuleModal();
                                                }}
                                                disabled={!revisionEnabled}
                                                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold shadow-sm transition-all ${revisionEnabled
                                                    ? 'bg-[var(--color-primary)] text-white hover:opacity-90 hover:shadow-md'
                                                    : 'bg-[var(--color-border)] text-[var(--color-textSecondary)] cursor-not-allowed'
                                                    }`}
                                            >
                                                <Plus className="h-4 w-4" />
                                                New Rule
                                            </button>
                                        </div>

                                        <div
                                            className={`grid grid-cols-2 sm:grid-cols-3 gap-3 p-6 bg-gradient-to-br from-[var(--color-primary)]/5 to-[var(--color-secondary)]/5
              rounded-xl border border-[var(--color-border)] 
              max-h-80 overflow-y-auto custom-scrollbar ${!revisionEnabled ? 'opacity-50 grayscale' : ''}`}
                                        >
                                            {getScoringPreview(settings.revision.limit, settings.revision.scoringRules).map((item, idx) => {
                                                const [label, value] = item.split(': ');
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="bg-[var(--color-surface)] rounded-lg p-4 shadow-sm border border-[var(--color-border)]
                    hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all"
                                                    >
                                                        <div className="text-xs font-semibold text-[var(--color-textSecondary)] mb-2 uppercase tracking-wide">
                                                            {label}
                                                        </div>
                                                        <div
                                                            className={`text-2xl font-bold ${value.includes('0%')
                                                                ? 'text-[var(--color-error)]'
                                                                : value.includes('100%')
                                                                    ? 'text-[var(--color-success)]'
                                                                    : 'text-[var(--color-warning)]'
                                                                }`}
                                                        >
                                                            {value}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Email Configuration */}
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden transition-all duration-300">
                        {/* Header */}
                        <div
                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[var(--color-background)] transition-colors"
                            onClick={() => setExpandedEmail(!expandedEmail)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[var(--color-primary)]/10 rounded-xl">
                                    <Mail className="h-6 w-6 text-[var(--color-primary)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-[var(--color-text)]">Email Notifications</h2>
                                    <p className="text-[var(--color-textSecondary)] text-sm mt-1">
                                        Configure Gmail integration and automation
                                    </p>
                                </div>
                            </div>

                            {/* Toggle Switch */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleInputChange('email', 'enabled', !emailEnabled);
                                    setExpandedEmail(true);
                                }}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 shadow-inner ${emailEnabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${emailEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>

                        {/* Expanded Content */}
                        {expandedEmail && (
                            <div className="px-6 pb-6 pt-2 border-t border-[var(--color-border)] bg-[var(--color-background)]">
                                <div className="space-y-8 mt-6">

                                    {/* Gmail Configuration */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold text-[var(--color-text)] uppercase tracking-wider flex items-center gap-2">
                                            <span className="w-1 h-4 bg-[var(--color-primary)] rounded-full"></span>
                                            Gmail Configuration
                                        </h3>

                                        {/* Google Connection Status */}
                                        {settings.email?.enabled && settings.email?.email ? (
                                            <div className="flex items-center justify-between p-5 bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-xl hover:shadow-md transition-all">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 bg-[var(--color-success)]/20 rounded-lg">
                                                        <Mail className="h-5 w-5 text-[var(--color-success)]" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[var(--color-success)] font-semibold text-sm">Connected to Google</p>
                                                        <p className="text-[var(--color-textSecondary)] text-xs mt-0.5">Email: {settings.email.email}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={disconnectGoogle}
                                                    className="px-4 py-2 bg-[var(--color-error)] hover:bg-[var(--color-error)]/90 text-white rounded-lg font-medium transition-all hover:shadow-md"
                                                >
                                                    Disconnect
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all duration-300">
                                                {/* Left side: Icon + Text */}
                                                <div className="flex items-center gap-3">
                                                    <div className="p-3 bg-[var(--color-error)]/10 text-[var(--color-error)] rounded-xl">
                                                        <Mail className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[var(--color-text)] font-semibold text-sm">
                                                            Google Email Not Connected
                                                        </p>
                                                        <p className="text-[var(--color-textSecondary)] text-xs mt-0.5">
                                                            Connect your Google account to enable email automation
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Right side: Button */}
                                                <button
                                                    onClick={connectGoogle}
                                                    disabled={googleLoading}
                                                    className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[var(--color-error)] to-red-300 text-white text-sm font-semibold shadow-sm hover:shadow-md 
                  hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {googleLoading ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Mail className="h-4 w-4" />
                                                    )}
                                                    Connect with Google
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Email Automation */}
                                    <div className="space-y-5">
                                        <h3 className="text-xs font-bold text-[var(--color-text)] uppercase tracking-wider flex items-center gap-2">
                                            <span className="w-1 h-4 bg-[var(--color-secondary)] rounded-full"></span>
                                            Email Automation
                                        </h3>

                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            {/* Left Column - Checkboxes */}
                                            <div className="space-y-3">
                                                {/* Task Creation */}
                                                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-border)]/20 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.email.sendOnTaskCreate}
                                                        onChange={(e) =>
                                                            handleInputChange('email', 'sendOnTaskCreate', e.target.checked)
                                                        }
                                                        disabled={!emailEnabled}
                                                        className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-2 focus:ring-[var(--color-primary)] border-[var(--color-border)] ${!emailEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                                            }`}
                                                    />
                                                    <label className="text-sm font-medium text-[var(--color-text)] cursor-pointer">
                                                        Send on task creation
                                                    </label>
                                                </div>

                                                {/* Task Completion */}
                                                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-border)]/20 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.email.sendOnTaskComplete}
                                                        onChange={(e) =>
                                                            handleInputChange('email', 'sendOnTaskComplete', e.target.checked)
                                                        }
                                                        disabled={!emailEnabled}
                                                        className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-2 focus:ring-[var(--color-primary)] border-[var(--color-border)] ${!emailEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                                            }`}
                                                    />
                                                    <label className="text-sm font-medium text-[var(--color-text)] cursor-pointer">
                                                        Send on task completion
                                                    </label>
                                                </div>

                                                {/* Task Revision */}
                                                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-border)]/20 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.email.sendOnTaskRevision}
                                                        onChange={(e) =>
                                                            handleInputChange('email', 'sendOnTaskRevision', e.target.checked)
                                                        }
                                                        disabled={!emailEnabled}
                                                        className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-2 focus:ring-[var(--color-primary)] border-[var(--color-border)] ${!emailEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                                            }`}
                                                    />
                                                    <label className="text-sm font-medium text-[var(--color-text)] cursor-pointer">
                                                        Send on task revision
                                                    </label>
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* Test Email Button */}
                                    <div className="pt-4 border-t border-[var(--color-border)]">
                                        <button
                                            onClick={handleTestEmail}
                                            disabled={
                                                !settings.email.enabled ||
                                                !settings.email.email ||
                                                testingEmail
                                            }
                                            className="px-6 py-3 bg-[var(--color-primary)] hover:opacity-90 disabled:bg-[var(--color-border)] disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all flex items-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50"
                                        >
                                            {testingEmail ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Send className="h-4 w-4" />
                                            )}
                                            Test Email Configuration
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Report Scheduling */}
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden transition-all duration-300">
                        {/* Header */}
                        <div
                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[var(--color-background)] transition-colors"
                            onClick={() => setExpandedReports(!expandedReports)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[var(--color-info)]/10 rounded-xl">
                                    <Calendar className="h-6 w-6 text-[var(--color-info)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-[var(--color-text)]">
                                        Automated Reports
                                    </h2>
                                    <p className="text-[var(--color-textSecondary)] text-sm mt-1">
                                        Schedule daily reports and summaries
                                    </p>
                                </div>
                            </div>

                            {/* Toggle Switch */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleInputChange('email', 'enableReports', !reportsEnabled);
                                    setExpandedReports(true);
                                }}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 shadow-inner ${reportsEnabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${reportsEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>

                        {/* Expanded Content */}
                        {expandedReports && (
                            <div className="px-6 pb-6 pt-2 border-t border-[var(--color-border)] bg-[var(--color-background)]">
                                <div className="space-y-8 mt-6">

                                    {/* Report Configuration Grid */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                        {/* Morning Report */}
                                        <div className="space-y-4 p-5 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] hover:shadow-md hover:border-[var(--color-info)]/30 transition-all">
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.email.enableMorningReport}
                                                    onChange={(e) =>
                                                        handleInputChange('email', 'enableMorningReport', e.target.checked)
                                                    }
                                                    disabled={!reportsEnabled}
                                                    className={`w-5 h-5 text-[var(--color-info)] rounded focus:ring-2 focus:ring-[var(--color-info)] border-[var(--color-border)] ${!reportsEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                                        }`}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <label className="text-lg font-semibold text-[var(--color-text)]">
                                                        Morning Report
                                                    </label>
                                                    {settings.email.enableMorningReport && reportsEnabled && (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-info)]/20 text-[var(--color-info)] uppercase tracking-wider">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-[var(--color-text)]">
                                                    Send Time
                                                </label>
                                                <input
                                                    type="time"
                                                    value={settings.email.morningReportTime}
                                                    onChange={(e) =>
                                                        handleInputChange('email', 'morningReportTime', e.target.value)
                                                    }
                                                    disabled={!reportsEnabled || !settings.email.enableMorningReport}
                                                    className={`w-full px-4 py-3 border border-[var(--color-border)] rounded-lg text-sm
                  focus:ring-2 focus:ring-[var(--color-info)] focus:border-[var(--color-info)] 
                  bg-[var(--color-surface)] text-[var(--color-text)] transition-all
                  ${!reportsEnabled || !settings.email.enableMorningReport ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                />
                                                <div className="flex items-start gap-2 mt-2 p-3 bg-[var(--color-info)]/5 rounded-lg border border-[var(--color-info)]/10">
                                                    <div className="w-1 h-1 rounded-full bg-[var(--color-info)] mt-1.5"></div>
                                                    <p className="text-xs text-[var(--color-textSecondary)] leading-relaxed">
                                                        Daily summary of pending tasks and priorities
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Evening Report */}
                                        <div className="space-y-4 p-5 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] hover:shadow-md hover:border-[var(--color-info)]/30 transition-all">
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.email.enableEveningReport}
                                                    onChange={(e) =>
                                                        handleInputChange('email', 'enableEveningReport', e.target.checked)
                                                    }
                                                    disabled={!reportsEnabled}
                                                    className={`w-5 h-5 text-[var(--color-info)] rounded focus:ring-2 focus:ring-[var(--color-info)] border-[var(--color-border)] ${!reportsEnabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                                        }`}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <label className="text-lg font-semibold text-[var(--color-text)]">
                                                        Evening Report
                                                    </label>
                                                    {settings.email.enableEveningReport && reportsEnabled && (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-info)]/20 text-[var(--color-info)] uppercase tracking-wider">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-[var(--color-text)]">
                                                    Send Time
                                                </label>
                                                <input
                                                    type="time"
                                                    value={settings.email.eveningReportTime}
                                                    onChange={(e) =>
                                                        handleInputChange('email', 'eveningReportTime', e.target.value)
                                                    }
                                                    disabled={!reportsEnabled || !settings.email.enableEveningReport}
                                                    className={`w-full px-4 py-3 border border-[var(--color-border)] rounded-lg text-sm
                  focus:ring-2 focus:ring-[var(--color-info)] focus:border-[var(--color-info)] 
                  bg-[var(--color-surface)] text-[var(--color-text)] transition-all
                  ${!reportsEnabled || !settings.email.enableEveningReport ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                />
                                                <div className="flex items-start gap-2 mt-2 p-3 bg-[var(--color-info)]/5 rounded-lg border border-[var(--color-info)]/10">
                                                    <div className="w-1 h-1 rounded-full bg-[var(--color-info)] mt-1.5"></div>
                                                    <p className="text-xs text-[var(--color-textSecondary)] leading-relaxed">
                                                        Daily completion summary and next day preview
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Task Completion Settings */}
                    {/* Task Completion Settings */}
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden transition-all duration-300">

                        {/* Header */}
                        <div
                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[var(--color-background)] transition-colors"
                            onClick={() => setExpandedTask(!expandedTask)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[var(--color-primary)]/10 rounded-xl">
                                    <Settings className="h-6 w-6 text-[var(--color-primary)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-[var(--color-text)]">
                                        Task Completion Settings
                                    </h2>
                                    <p className="text-[var(--color-textSecondary)] text-sm mt-1">
                                        Configure attachments & remarks for different task types
                                    </p>
                                </div>
                            </div>

                            {/* ENABLE/DISABLE MAIN TOGGLE */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSettings(prev => ({
                                        ...prev,
                                        taskCompletion: {
                                            ...prev.taskCompletion,
                                            enabled: !prev.taskCompletion.enabled
                                        }
                                    }));
                                    setExpandedTask(true);
                                    setHasUnsavedChanges(true);
                                }}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 shadow-inner ${settings.taskCompletion.enabled
                                        ? "bg-[var(--color-primary)]"
                                        : "bg-[var(--color-border)]"
                                    }`}
                            >
                                <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${settings.taskCompletion.enabled ? "translate-x-6" : "translate-x-1"
                                        }`}
                                />
                            </button>
                        </div>

                        {/* Body */}
                        {expandedTask && (
                            <div className="px-6 pb-6 pt-4 border-t border-[var(--color-border)] bg-[var(--color-background)]">

                                {/* Responsive Two Columns */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                    {/* -------------------- LEFT: ONE-TIME -------------------- */}
                                    <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:shadow-md transition-all">
                                        <h3 className="text-lg font-semibold mb-8 flex items-center gap-2">
                                            <ClipboardCheck className="w-5 h-5 text-[var(--color-primary)]" />
                                            One-Time Pending Tasks
                                        </h3>

                                        <div className="space-y-6">

                                            {/* Allow Attachments */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-start gap-3">
                                                    <Paperclip className="w-5 h-5 text-[var(--color-primary)] mt-1" />
                                                    <div>
                                                        <p className="font-medium">Allow Attachments</p>
                                                        <p className="text-xs text-[var(--color-textSecondary)]">
                                                            Enable users to upload attachments when completing a task.
                                                        </p>
                                                    </div>
                                                </div>
                                                <ToggleSwitch
                                                    checked={settings.taskCompletion.pendingTasks.allowAttachments}
                                                    disabled={!settings.taskCompletion.enabled}
                                                    onChange={(v) =>
                                                        updateTaskSetting("pendingTasks", "allowAttachments", v)
                                                    }
                                                />
                                            </div>

                                            {/* Mandatory Attachments */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-start gap-3">
                                                    <FileWarning className="w-5 h-5 text-[var(--color-error)] mt-1" />
                                                    <div>
                                                        <p className="font-medium">Mandatory Attachments</p>
                                                        <p className="text-xs text-[var(--color-textSecondary)]">
                                                            Require at least one file to complete the task.
                                                        </p>
                                                    </div>
                                                </div>
                                                <ToggleSwitch
                                                    checked={settings.taskCompletion.pendingTasks.mandatoryAttachments}
                                                    disabled={
                                                        !settings.taskCompletion.enabled ||
                                                        !settings.taskCompletion.pendingTasks.allowAttachments
                                                    }
                                                    onChange={(v) =>
                                                        updateTaskSetting("pendingTasks", "mandatoryAttachments", v)
                                                    }
                                                />
                                            </div>

                                            {/* Mandatory Remarks */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-start gap-3">
                                                    <MessageSquare className="w-5 h-5 text-[var(--color-warning)] mt-1" />
                                                    <div>
                                                        <p className="font-medium">Mandatory Remarks</p>
                                                        <p className="text-xs text-[var(--color-textSecondary)]">
                                                            User must enter a remark before completing.
                                                        </p>
                                                    </div>
                                                </div>
                                                <ToggleSwitch
                                                    checked={settings.taskCompletion.pendingTasks.mandatoryRemarks}
                                                    disabled={!settings.taskCompletion.enabled}
                                                    onChange={(v) =>
                                                        updateTaskSetting("pendingTasks", "mandatoryRemarks", v)
                                                    }
                                                />
                                            </div>

                                        </div>
                                    </div>

                                    {/* -------------------- RIGHT: RECURRING -------------------- */}
                                    <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:shadow-md transition-all">
                                        <h3 className="text-lg font-semibold mb-8 flex items-center gap-2">
                                            <RefreshCw className="w-5 h-5 text-[var(--color-primary)]" />
                                            Recurring Tasks
                                        </h3>

                                        <div className="space-y-6">

                                            {/* Allow Attachments */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-start gap-3">
                                                    <Paperclip className="w-5 h-5 text-[var(--color-primary)] mt-1" />
                                                    <div>
                                                        <p className="font-medium">Allow Attachments</p>
                                                        <p className="text-xs text-[var(--color-textSecondary)]">
                                                            Enable users to upload files when completing recurring tasks
                                                        </p>
                                                    </div>
                                                </div>
                                                <ToggleSwitch
                                                    checked={settings.taskCompletion.pendingRecurringTasks.allowAttachments}
                                                    disabled={!settings.taskCompletion.enabled}
                                                    onChange={(v) =>
                                                        updateTaskSetting("pendingRecurringTasks", "allowAttachments", v)
                                                    }
                                                />
                                            </div>

                                            {/* Mandatory Attachments */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-start gap-3">
                                                    <FileWarning className="w-5 h-5 text-[var(--color-error)] mt-1" />
                                                    <div>
                                                        <p className="font-medium">Mandatory Attachments</p>
                                                        <p className="text-xs text-[var(--color-textSecondary)]">
                                                            Require at least one file to be uploaded when completing recurring tasks
                                                        </p>
                                                    </div>
                                                </div>
                                                <ToggleSwitch
                                                    checked={settings.taskCompletion.pendingRecurringTasks.mandatoryAttachments}
                                                    disabled={
                                                        !settings.taskCompletion.enabled ||
                                                        !settings.taskCompletion.pendingRecurringTasks.allowAttachments
                                                    }
                                                    onChange={(v) =>
                                                        updateTaskSetting(
                                                            "pendingRecurringTasks",
                                                            "mandatoryAttachments",
                                                            v
                                                        )
                                                    }
                                                />
                                            </div>

                                            {/* Mandatory Remarks */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-start gap-3">
                                                    <MessageSquare className="w-5 h-5 text-[var(--color-warning)] mt-1" />
                                                    <div>
                                                        <p className="font-medium">Mandatory Remarks</p>
                                                        <p className="text-xs text-[var(--color-textSecondary)]">
                                                            Require completion remarks to be filled when completing recurring tasks
                                                        </p>
                                                    </div>
                                                </div>
                                                <ToggleSwitch
                                                    checked={settings.taskCompletion.pendingRecurringTasks.mandatoryRemarks}
                                                    disabled={!settings.taskCompletion.enabled}
                                                    onChange={(v) =>
                                                        updateTaskSetting(
                                                            "pendingRecurringTasks",
                                                            "mandatoryRemarks",
                                                            v
                                                        )
                                                    }
                                                />
                                            </div>

                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>



                </div>
            </div>

            {/* New Rule Modal */}
            {openNewRuleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-[var(--color-text)]">
                                Create New Scoring Rule
                            </h3>
                            <button
                                onClick={() => setOpenNewRuleModal(false)}
                                className="p-1 rounded-full hover:bg-[color:var(--color-border)/40]"
                            >
                                <X className="w-4 h-4 text-[var(--color-textSecondary)]" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                    Rule Name
                                </label>
                                <input
                                    value={ruleName}
                                    onChange={e => setRuleName(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-[var(--color-border)] rounded-xl bg-[var(--color-background)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                                    placeholder="e.g., Aggressive Drop Rule"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                    Revision Percentage Mapping
                                </label>
                                <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                                    {Array.from({ length: settings.revision.limit + 1 }).map((_, i) => {
                                        if (i === 0) return null; // 🔥 Hide "Initial" row (only visually)
                                        return (
                                            <div key={i} className="flex items-center space-x-3">
                                                <span className="w-28 text-sm text-[var(--color-textSecondary)]">
                                                    Revision {i}
                                                </span>

                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={ruleMapping[i] ?? 0}
                                                    onChange={e =>
                                                        setRuleMapping(prev => ({
                                                            ...prev,
                                                            [i]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                        }))
                                                    }
                                                    className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-xl 
                bg-[var(--color-background)] text-[var(--color-text)]
                focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                                                />

                                                <span className="text-sm text-[var(--color-textSecondary)]">%</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-[11px] text-[var(--color-textSecondary)] mt-1">
                                    Tip: Usually Initial = 100% and last revision = 0%.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                onClick={() => setOpenNewRuleModal(false)}
                                className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-textSecondary)] hover:bg-[color:var(--color-border)/30]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveNewRule}
                                className="px-5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-secondary)] text-sm font-semibold text-white shadow-md"
                            >
                                Save Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Rule Modal */}
            {openEditRuleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-[var(--color-text)]">
                                Edit Scoring Rule
                            </h3>
                            <button
                                onClick={() => {
                                    setOpenEditRuleModal(false);
                                    setEditingRuleId(null);
                                }}
                                className="p-1 rounded-full hover:bg-[color:var(--color-border)/40]"
                            >
                                <X className="w-4 h-4 text-[var(--color-textSecondary)]" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                    Rule Name
                                </label>
                                <input
                                    value={ruleName}
                                    onChange={e => setRuleName(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-[var(--color-border)] rounded-xl bg-[var(--color-background)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                    Revision Percentage Mapping
                                </label>
                                <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                                    {Array.from({ length: settings.revision.limit + 1 }).map((_, i) => {
                                        if (i === 0) return null; // 🔥 Hide "Initial" row (only visually)
                                        return (
                                            <div key={i} className="flex items-center space-x-3">
                                                <span className="w-28 text-sm text-[var(--color-textSecondary)]">
                                                    Revision {i}
                                                </span>

                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={ruleMapping[i] ?? 0}
                                                    onChange={e =>
                                                        setRuleMapping(prev => ({
                                                            ...prev,
                                                            [i]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                                                        }))
                                                    }
                                                    className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-xl 
                bg-[var(--color-background)] text-[var(--color-text)]
                focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                                                />

                                                <span className="text-sm text-[var(--color-textSecondary)]">%</span>
                                            </div>
                                        );
                                    })}

                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setOpenEditRuleModal(false);
                                    setEditingRuleId(null);
                                }}
                                className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-textSecondary)] hover:bg-[color:var(--color-border)/30]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEditedRule}
                                className="px-5 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-secondary)] text-sm font-semibold text-white shadow-md"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Max Days Modal */}
            {openEditMaxDays && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-lg p-6">

                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-[var(--color-text)]">
                                Edit Maximum Days (Revision-Wise)
                            </h3>
                            <button
                                onClick={() => setOpenEditMaxDays(false)}
                                className="p-1 rounded-full hover:bg-[color:var(--color-border)/40]"
                            >
                                <X className="w-4 h-4 text-[var(--color-textSecondary)]" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="space-y-4">

                            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                Revision-Wise Allowed Days
                            </label>

                            <div className="max-h-64 overflow-y-auto pr-1 space-y-2">

                                {Array.from({ length: settings.revision.limit + 1 }).map((_, i) => {
                                    if (i === 0) return null; // 🔥 Hide Initial row only (NOT removed from data)
                                    return (
                                        <div key={i} className="flex items-center space-x-3">
                                            <span className="w-28 text-sm text-[var(--color-textSecondary)]">
                                                Revision {i}
                                            </span>

                                            <input
                                                type="number"
                                                min={1}
                                                max={365}
                                                value={settings.revision.days?.[i] ?? settings.revision.maxDays}
                                                onChange={e =>
                                                    setSettings(prev => ({
                                                        ...prev,
                                                        revision: {
                                                            ...prev.revision,
                                                            days: {
                                                                ...prev.revision.days,
                                                                [i]: Math.max(1, parseInt(e.target.value) || 1)
                                                            }
                                                        }
                                                    }))
                                                }
                                                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-xl 
                bg-[var(--color-background)] text-[var(--color-text)]
                focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                                            />

                                            <span className="text-sm text-[var(--color-textSecondary)]">days</span>
                                        </div>
                                    );
                                })}

                            </div>

                            <p className="text-xs text-[var(--color-textSecondary)]">
                                Set different day limits for each revision step.
                            </p>

                        </div>

                        {/* Footer */}
                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                onClick={() => setOpenEditMaxDays(false)}
                                className="px-4 py-2 rounded-xl border border-[var(--color-border)]
            text-sm font-medium text-[var(--color-textSecondary)]
            hover:bg-[color:var(--color-border)/30]"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={() => setOpenEditMaxDays(false)}
                                className="px-5 py-2 rounded-xl bg-[var(--color-primary)]
            hover:bg-[var(--color-secondary)] text-sm font-semibold
            text-white shadow-md"
                            >
                                Save Changes
                            </button>
                        </div>

                    </div>
                </div>
            )}
            {confirmDeleteRule && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-sm p-6">

                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-3">
                            Delete Scoring Rule?
                        </h3>

                        <p className="text-sm text-[var(--color-textSecondary)] mb-6">
                            Are you sure you want to delete this scoring rule?
                            This action cannot be undone.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmDeleteRule(null)}
                                className="px-4 py-2 rounded-xl border border-[var(--color-border)]
                               text-sm font-medium text-[var(--color-textSecondary)]
                               hover:bg-[color:var(--color-border)/30]"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={() => {
                                    deleteRule(confirmDeleteRule);
                                    setConfirmDeleteRule(null);
                                }}
                                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 
                               text-sm font-semibold text-white shadow-md"
                            >
                                Delete
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};

export default SettingsPage;