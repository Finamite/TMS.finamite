import React, { useState, useEffect } from 'react';
import {
    Settings,
    Mail,
    AlertTriangle,
    Save,
    X,
    Loader2,
    Send,
    Calendar,
    Plus,
    Pencil,
    Trash
} from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';
import { useAuth } from '../contexts/AuthContext';

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
            maxDays: 7,
            enableDaysRule: false,
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
        }
    });
    const [expandedRevision, setExpandedRevision] = useState(true);
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

    useEffect(() => {
        fetchSettings();
        fetchUsers();
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
                });
            }
        };

        window.addEventListener("message", handleGoogleMessage);
        return () => window.removeEventListener("message", handleGoogleMessage);
    }, []);


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
                        enabled: emailRes.data.enabled ?? true,
                        // Set defaults for new fields if not present
                        sendOnTaskCreate: emailRes.data.sendOnTaskCreate ?? true,
                        sendOnTaskComplete: emailRes.data.sendOnTaskComplete ?? false,
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
                maxDays: settings.revision.maxDays,

                // 🔥 send actual days data
                days: settings.revision.enableDaysRule
                    ? settings.revision.days
                    : {},

                scoringRules: settings.revision.scoringRules.map(rule => ({
                    ...rule,
                    // send per-rule days only if enabled
                    days: settings.revision.enableDaysRule ? rule.days : undefined
                })),

                enableDaysRule: settings.revision.enableDaysRule
            };

            await axios.post(`${address}/api/settings/revision`, revisionPayload);;

            await axios.post(`${address}/api/settings/email`, {
                companyId: currentUser.companyId,
                ...settings.email
            });

            setHasUnsavedChanges(false);
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

    const handleUserSelection = (field: 'sendToUsers' | 'reportRecipients', userId: string, checked: boolean) => {
        setHasUnsavedChanges(true);
        setSettings(prev => {
            const currentUsers = prev.email[field];
            const updatedUsers = checked
                ? [...currentUsers, userId]
                : currentUsers.filter(id => id !== userId);

            return {
                ...prev,
                email: {
                    ...prev.email,
                    [field]: updatedUsers
                }
            };
        });
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
        if (!settings.email.enabled || !settings.email.email) {
            setMessage({ type: 'error', text: 'Connect Google account first.' });
            return;
        }
        setTestingEmail(true);
        try {
            await axios.post(`${address}/api/settings/email/test`, {
                companyId: currentUser?.companyId,
            });
            setMessage({ type: 'success', text: 'Test email sent!' });
        } catch (err) {
            setMessage({ type: 'error', text: 'Test email failed.' });
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
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-lg border border-[var(--color-border)] overflow-hidden">
                        {/* Header */}
                        <div
                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[var(--color-surface)]/80 transition-colors"
                            onClick={() => setExpandedRevision(!expandedRevision)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[var(--color-accent)]/10 rounded-xl">
                                    <AlertTriangle className="h-6 w-6 text-[var(--color-accent)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-[var(--color-text)]">Revision & Scoring</h2>
                                    <p className="text-[var(--color-textSecondary)] text-sm mt-0.5">
                                        Configure task revision limits and scoring impact on performance
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Toggle Switch */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleInputChange('revision', 'enableRevisions', !revisionEnabled);
                                        setExpandedRevision(true);
                                    }}
                                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 ${revisionEnabled ? 'bg-[var(--color-accent)]' : 'bg-gray-300'
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${revisionEnabled ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {expandedRevision && (
                            <div className="px-6 pb-6 pt-4 border-t border-[var(--color-border)]">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                                    {/* LEFT COLUMN */}
                                    <div className="space-y-6">
                                        {/* Configuration Section */}
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">
                                                Configuration
                                            </h3>

                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Max Revision */}
                                                <div>
                                                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                                        Max Revisions
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={20}
                                                        value={settings.revision.limit}
                                                        onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                                                        disabled={!revisionEnabled}
                                                        className={`w-full px-4 py-2.5 border border-[var(--color-border)] rounded-xl text-sm
                                        focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]
                                        bg-[var(--color-surface)] text-[var(--color-text)]
                                        ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    />
                                                </div>

                                                {/* Max Days */}
                                                <div>
                                                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                                        Max Days
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
                                                            className={`flex-1 px-4 py-2.5 border border-[var(--color-border)] rounded-xl text-sm
                                            focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]
                                            bg-[var(--color-surface)] text-[var(--color-text)]
                                            ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        />
                                                        <button
                                                            onClick={() => setOpenEditMaxDays(true)}
                                                            disabled={!revisionEnabled}
                                                            className={`p-2.5 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-border)]/20 transition-colors
                                            ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <Pencil className="w-4 h-4 text-[var(--color-text)]" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Enable Days Rule Checkbox */}
                                            <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.revision.enableDaysRule}
                                                    onChange={(e) =>
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            revision: { ...prev.revision, enableDaysRule: e.target.checked }
                                                        }))
                                                    }
                                                    disabled={!revisionEnabled}
                                                    className="w-4 h-4 text-[var(--color-primary)] border-[var(--color-border)] rounded focus:ring-2 focus:ring-[var(--color-primary)]"
                                                />
                                                <span className="text-sm text-[var(--color-text)]">Enable Days Rule</span>
                                            </label>
                                        </div>

                                        {/* Scoring Rules */}
                                        <div>
                                            <h3 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide mb-4">
                                                Scoring Rules
                                            </h3>
                                            <div className="space-y-3">
                                                {settings.revision.scoringRules.map((rule) => (
                                                    <div
                                                        key={rule.id}
                                                        className="p-4 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] hover:border-[var(--color-border)]/60 transition-all"
                                                    >
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <h4 className="font-medium text-[var(--color-text)]">{rule.name}</h4>
                                                                    {rule.enabled && (
                                                                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] uppercase tracking-wider">
                                                                            Active
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-[var(--color-textSecondary)] leading-relaxed">
                                                                    {Object.entries(rule.mapping)
                                                                        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                                                                        .map(([rev, pct]) =>
                                                                            parseInt(rev) === 0 ? `Initial: ${pct}%` : `R${rev}: ${pct}%`
                                                                        )
                                                                        .join(' • ')}
                                                                </p>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                {/* ❌ Delete Button — hidden for default rule */}
                                                                {rule.id !== 'default' && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!revisionEnabled) return;
                                                                            setConfirmDeleteRule(rule.id); // 🔥 open confirmation popup
                                                                        }}
                                                                        className="p-2.5 rounded-xl border border-red-400 text-red-500 
                   hover:bg-red-500 hover:text-white transition-all"
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
                                                                    className={`p-2.5 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-border)]/20 transition-colors
                                                    ${!revisionEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                >
                                                                    <Pencil className="w-4 h-4 text-[var(--color-text)]" />
                                                                </button>



                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (!revisionEnabled) return;
                                                                        toggleRuleEnable(rule.id);
                                                                    }}
                                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ${rule.enabled ? 'bg-[var(--color-success)]' : 'bg-gray-300'
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
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">
                                                Scoring Impact Preview
                                            </h3>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openCreateRuleModal();
                                                }}
                                                disabled={!revisionEnabled}
                                                className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium shadow-sm transition-all
                                ${revisionEnabled
                                                        ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-secondary)]'
                                                        : 'bg-[var(--color-border)] text-[var(--color-textSecondary)] cursor-not-allowed'
                                                    }`}
                                            >
                                                <Plus className="h-4 w-4" />
                                                New Rule
                                            </button>
                                        </div>

                                        <div
                                            className={`grid grid-cols-2 sm:grid-cols-3 gap-3 p-5 bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-border)]/10 rounded-xl border border-[var(--color-border)] max-h-72 overflow-y-auto
                            ${!revisionEnabled ? 'opacity-50' : ''}`}
                                        >
                                            {getScoringPreview(settings.revision.limit, settings.revision.scoringRules).map((item, idx) => {
                                                const [label, value] = item.split(': ');

                                                return (
                                                    <div key={idx} className="bg-[var(--color-surface)] rounded-xl p-3 shadow-sm border border-[var(--color-border)]">
                                                        <div className="text-xs font-medium text-[var(--color-textSecondary)] mb-1.5">
                                                            {label}
                                                        </div>
                                                        <div
                                                            className={`text-lg font-bold ${value.includes('0%')
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
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-lg border border-[var(--color-border)] overflow-hidden">
                        <div
                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[color:var(--color-surface)/80] transition-colors"
                            onClick={() => setExpandedEmail(!expandedEmail)}
                        >
                            <div className="flex items-center">
                                <div className="p-2 bg-[color:var(--color-primary)/10] rounded-lg mr-4">
                                    <Mail className="h-6 w-6 text-[var(--color-primary)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-[var(--color-text)]">Email Notifications</h2>
                                    <p className="text-[var(--color-textSecondary)] text-sm">
                                        Configure Gmail integration and automation
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2 cursor-pointer">
                                    <div
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleInputChange('email', 'enabled', !emailEnabled);
                                            setExpandedEmail(true);
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all 
                                            ${emailEnabled
                                                ? 'bg-[var(--color-primary)]'
                                                : 'bg-gray-300'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all
                                                ${emailEnabled
                                                    ? 'translate-x-5'
                                                    : 'translate-x-1'
                                                }`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {expandedEmail && (
                            <div className="p-6 border-t border-[var(--color-border)]">
                                <div className="space-y-8">
                                    {/* Gmail Configuration */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
                                            Gmail Configuration
                                        </h3>
                                        <div className="space-y-4">

                                            {/* Google Connection Status */}
                                            {settings.email?.enabled && settings.email?.email ? (
                                                <div className="flex items-center justify-between p-4 bg-green-100 border border-green-300 rounded-xl">
                                                    <div>
                                                        <p className="text-green-700 font-semibold">Connected to Google</p>
                                                        <p className="text-green-700 text-sm">Email: {settings.email.email}</p>
                                                    </div>

                                                    <button
                                                        onClick={disconnectGoogle}
                                                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl"
                                                    >
                                                        Disconnect
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:shadow-md transition-all duration-300">

                                                    {/* Left side: Icon + Text */}
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                                                            <Mail className="h-5 w-5" />
                                                        </div>

                                                        <div>
                                                            <p className="text-[var(--color-text)] font-semibold text-sm">
                                                                Google Email Not Connected
                                                            </p>
                                                            <p className="text-[var(--color-textSecondary)] text-xs">
                                                                Connect your Google account to enable email automation.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Right side: Button */}
                                                    <button
                                                        onClick={connectGoogle}
                                                        disabled={googleLoading}
                                                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-medium shadow-md hover:shadow-lg 
                   hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
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
                                    </div>

                                    {/* Email Automation */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">
                                            Email Automation
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="space-y-4">
                                                <div className="flex items-center space-x-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.email.sendOnTaskCreate}
                                                        onChange={e =>
                                                            handleInputChange(
                                                                'email',
                                                                'sendOnTaskCreate',
                                                                e.target.checked
                                                            )
                                                        }
                                                        disabled={!emailEnabled}
                                                        className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-[var(--color-primary)] ${!emailEnabled
                                                            ? 'opacity-50 cursor-not-allowed'
                                                            : ''
                                                            }`}
                                                    />
                                                    <label className="text-sm font-medium text-[var(--color-text)]">
                                                        Send on task creation
                                                    </label>
                                                </div>
                                                <div className="flex items-center space-x-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.email.sendOnTaskComplete}
                                                        onChange={e =>
                                                            handleInputChange(
                                                                'email',
                                                                'sendOnTaskComplete',
                                                                e.target.checked
                                                            )
                                                        }
                                                        disabled={!emailEnabled}
                                                        className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-[var(--color-primary)] ${!emailEnabled
                                                            ? 'opacity-50 cursor-not-allowed'
                                                            : ''
                                                            }`}
                                                    />
                                                    <label className="text-sm font-medium text-[var(--color-text)]">
                                                        Send on task completion
                                                    </label>
                                                </div>
                                                <div className="flex items-center space-x-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.email.sendOnTaskRevision}
                                                        onChange={e =>
                                                            handleInputChange(
                                                                'email',
                                                                'sendOnTaskRevision',
                                                                e.target.checked
                                                            )
                                                        }
                                                        disabled={!emailEnabled}
                                                        className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-[var(--color-primary)] ${!emailEnabled
                                                            ? 'opacity-50 cursor-not-allowed'
                                                            : ''
                                                            }`}
                                                    />
                                                    <label className="text-sm font-medium text-[var(--color-text)]">
                                                        Send on task revision
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-semibold text-[var(--color-text)] mb-3">
                                                    Email Recipients
                                                </label>
                                                <div
                                                    className={`max-h-48 overflow-y-auto bg-[color:var(--color-border)/10] rounded-xl p-4 space-y-2 ${!emailEnabled ? 'opacity-50' : ''
                                                        }`}
                                                >
                                                    {users.map(user => (
                                                        <div
                                                            key={user._id}
                                                            className="flex items-center space-x-3 p-2 hover:bg-[color:var(--color-surface)/80] rounded-lg"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.email.sendToUsers.includes(
                                                                    user._id
                                                                )}
                                                                onChange={e =>
                                                                    handleUserSelection(
                                                                        'sendToUsers',
                                                                        user._id,
                                                                        e.target.checked
                                                                    )
                                                                }
                                                                disabled={!emailEnabled}
                                                                className={`w-4 h-4 text-[var(--color-primary)] rounded focus:ring-[var(--color-primary)] ${!emailEnabled
                                                                    ? 'cursor-not-allowed'
                                                                    : ''
                                                                    }`}
                                                            />
                                                            <div className="flex-1">
                                                                <div className="text-sm font-medium text-[var(--color-text)]">
                                                                    {user.username}
                                                                </div>
                                                                <div className="text-xs text-[var(--color-textSecondary)]">
                                                                    {user.email}
                                                                </div>
                                                            </div>
                                                            <span className="px-2 py-1 text-xs bg-[color:var(--color-primary)/10] text-[var(--color-primary)] rounded">
                                                                {user.role}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex space-x-4">
                                        <button
                                            onClick={handleTestEmail}  // Or whatever the handler is
                                            disabled={!settings.email.enabled || !settings.email.email}
                                            className="px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-secondary)] text-sm font-semibold text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {testingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                                            Send Test Email
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Report Scheduling */}
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-lg border border-[var(--color-border)] overflow-hidden">
                        <div
                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[color:var(--color-surface)/80] transition-colors"
                            onClick={() => setExpandedReports(!expandedReports)}
                        >
                            <div className="flex items-center">
                                <div className="p-2 bg-[color:var(--color-info)/10] rounded-lg mr-4">
                                    <Calendar className="h-6 w-6 text-[var(--color-info)]" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-[var(--color-text)]">
                                        Automated Reports
                                    </h2>
                                    <p className="text-[var(--color-textSecondary)] text-sm">
                                        Schedule daily reports and summaries
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2 cursor-pointer">
                                    <div
                                        onClick={e => {
                                            e.stopPropagation();
                                            handleInputChange('email', 'enableReports', !reportsEnabled);
                                            setExpandedReports(true);
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all 
                                            ${reportsEnabled
                                                ? 'bg-[var(--color-info)]'
                                                : 'bg-gray-300'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all
                                                ${reportsEnabled
                                                    ? 'translate-x-5'
                                                    : 'translate-x-1'
                                                }`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {expandedReports && (
                            <div className="p-6 border-t border-[var(--color-border)]">
                                <div className="space-y-8">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Morning Report */}
                                        <div className="space-y-4">
                                            <div className="flex items-center space-x-3">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.email.enableMorningReport}
                                                    onChange={e =>
                                                        handleInputChange(
                                                            'email',
                                                            'enableMorningReport',
                                                            e.target.checked
                                                        )
                                                    }
                                                    disabled={!reportsEnabled}
                                                    className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-[var(--color-primary)] ${!reportsEnabled
                                                        ? 'opacity-50 cursor-not-allowed'
                                                        : ''
                                                        }`}
                                                />
                                                <label className="text-lg font-semibold text-[var(--color-text)]">
                                                    Morning Report
                                                </label>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                                    Send Time
                                                </label>
                                                <input
                                                    type="time"
                                                    value={settings.email.morningReportTime}
                                                    onChange={e =>
                                                        handleInputChange(
                                                            'email',
                                                            'morningReportTime',
                                                            e.target.value
                                                        )
                                                    }
                                                    disabled={!reportsEnabled}
                                                    className={`w-full px-4 py-3 border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] bg-[var(--color-surface)] text-[var(--color-text)] ${!reportsEnabled
                                                        ? 'opacity-50 cursor-not-allowed'
                                                        : ''
                                                        }`}
                                                />
                                                <p className="text-xs text-[var(--color-textSecondary)] mt-1">
                                                    Daily summary of pending tasks and priorities
                                                </p>
                                            </div>
                                        </div>

                                        {/* Evening Report */}
                                        <div className="space-y-4">
                                            <div className="flex items-center space-x-3">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.email.enableEveningReport}
                                                    onChange={e =>
                                                        handleInputChange(
                                                            'email',
                                                            'enableEveningReport',
                                                            e.target.checked
                                                        )
                                                    }
                                                    disabled={!reportsEnabled}
                                                    className={`w-5 h-5 text-[var(--color-primary)] rounded focus:ring-[var(--color-primary)] ${!reportsEnabled
                                                        ? 'opacity-50 cursor-not-allowed'
                                                        : ''
                                                        }`}
                                                />
                                                <label className="text-lg font-semibold text-[var(--color-text)]">
                                                    Evening Report
                                                </label>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                                    Send Time
                                                </label>
                                                <input
                                                    type="time"
                                                    value={settings.email.eveningReportTime}
                                                    onChange={e =>
                                                        handleInputChange(
                                                            'email',
                                                            'eveningReportTime',
                                                            e.target.value
                                                        )
                                                    }
                                                    disabled={!reportsEnabled}
                                                    className={`w-full px-4 py-3 border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] bg-[var(--color-surface)] text-[var(--color-text)] ${!reportsEnabled
                                                        ? 'opacity-50 cursor-not-allowed'
                                                        : ''
                                                        }`}
                                                />
                                                <p className="text-xs text-[var(--color-textSecondary)] mt-1">
                                                    Daily completion summary and next day preview
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Report Recipients */}
                                    <div>
                                        <label className="block text-sm font-semibold text-[var(--color-text)] mb-3">
                                            Report Recipients
                                        </label>
                                        <div
                                            className={`max-h-48 overflow-y-auto bg-[color:var(--color-border)/10] rounded-xl p-4 space-y-2 ${!reportsEnabled ? 'opacity-50' : ''
                                                }`}
                                        >
                                            {users.map(user => (
                                                <div
                                                    key={user._id}
                                                    className="flex items-center space-x-3 p-2 hover:bg-[color:var(--color-surface)/80] rounded-lg"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.email.reportRecipients.includes(
                                                            user._id
                                                        )}
                                                        onChange={e =>
                                                            handleUserSelection(
                                                                'reportRecipients',
                                                                user._id,
                                                                e.target.checked
                                                            )
                                                        }
                                                        disabled={!reportsEnabled}
                                                        className={`w-4 h-4 text-[var(--color-info)] rounded focus:ring-[var(--color-info)] ${!reportsEnabled ? 'cursor-not-allowed' : ''
                                                            }`}
                                                    />
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium text-[var(--color-text)]">
                                                            {user.username}
                                                        </div>
                                                        <div className="text-xs text-[var(--color-textSecondary)]">
                                                            {user.email}
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-1 text-xs bg-[color:var(--color-info)/10] text-[var(--color-info)] rounded">
                                                        {user.role}
                                                    </span>
                                                </div>
                                            ))}
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
