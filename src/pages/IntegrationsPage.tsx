import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRight, CheckCircle2, ChevronDown, Eye, EyeOff, LockKeyhole, Plug, RefreshCw, Save, Settings2, Shield, Sparkles, Trash2, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { address } from '../../utils/ipAddress';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

type ProviderKey = 'interakt' | 'wati' | 'fichat';
type EventKey = 'oneTimeAssigned' | 'oneTimeCompleted' | 'oneTimeOverdue' | 'recurringAssigned' | 'recurringCompleted' | 'recurringOverdue';

interface TemplateConfig { enabled: boolean; templateName: string; templateVariables: string[]; placeholderCount?: number; }
interface RecipientConfig { assignee: boolean; admins: boolean; }
interface ProviderCfg { configs: Record<EventKey, TemplateConfig>; apiKey?: string; apiEndpoint?: string; baseUrl?: string; accessToken?: string; templateLanguage?: string; connected?: boolean; accountName?: string; connectedAt?: string; }
interface SettingsData { enabled: boolean; activeProvider: ProviderKey; recipients: Record<EventKey, RecipientConfig>; interakt: ProviderCfg; wati: ProviderCfg; fichat: ProviderCfg; supportedVariableKeys: string[]; }
interface TemplateItem { name: string; language?: string; status?: string; placeholderCount?: number; body?: string; variables?: string[]; }

const EVENTS: Array<{ key: EventKey; label: string; section: 'One-time' | 'Recurring' }> = [
  { key: 'oneTimeAssigned', label: 'Assigned', section: 'One-time' },
  { key: 'oneTimeCompleted', label: 'Completed', section: 'One-time' },
  { key: 'oneTimeOverdue', label: 'Overdue', section: 'One-time' },
  { key: 'recurringAssigned', label: 'Assigned', section: 'Recurring' },
  { key: 'recurringCompleted', label: 'Completed', section: 'Recurring' },
  { key: 'recurringOverdue', label: 'Overdue', section: 'Recurring' }
];

const providerLabel: Record<ProviderKey, string> = { interakt: 'Interakt', wati: 'WATI', fichat: 'FiChat' };
const providerTheme: Record<ProviderKey, { accent: string; glow: string; tint: string; ring: string; iconTint: string }> = {
  interakt: {
    accent: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    glow: 'rgba(58, 46, 226, 0.10)',
    tint: 'rgba(58, 46, 226, 0.04)',
    ring: 'rgba(58, 46, 226, 0.18)',
    iconTint: 'var(--color-primary)'
  },
  wati: {
    accent: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    glow: 'rgba(58, 46, 226, 0.10)',
    tint: 'rgba(58, 46, 226, 0.04)',
    ring: 'rgba(58, 46, 226, 0.18)',
    iconTint: 'var(--color-primary)'
  },
  fichat: {
    accent: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    glow: 'rgba(58, 46, 226, 0.10)',
    tint: 'rgba(58, 46, 226, 0.04)',
    ring: 'rgba(58, 46, 226, 0.18)',
    iconTint: 'var(--color-primary)'
  }
};
const supportedVariableLabelMap: Record<string, string> = {
  task_title: 'Task Title',
  task_description: 'Task Description',
  task_id: 'Task ID',
  task_type: 'Task Type',
  task_category: 'Task Category',
  due_date: 'Due Date',
  assignee_name: 'Assigned To',
  // assignee_phone: 'Assigned To Phone',
  assigner_name: 'Assigned By',
  // assigner_phone: 'Assigned By Phone',
  completion_remarks: 'Completion Remarks',
};
const getSupportedVariableLabel = (key: string) => supportedVariableLabelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const defaultTemplateConfigs = (): Record<EventKey, TemplateConfig> =>
  EVENTS.reduce((acc, event) => {
    acc[event.key] = { enabled: false, templateName: '', templateVariables: [], placeholderCount: 0 };
    return acc;
  }, {} as Record<EventKey, TemplateConfig>);
const emptyEventStringMap = (): Record<EventKey, string> =>
  EVENTS.reduce((acc, event) => {
    acc[event.key] = '';
    return acc;
  }, {} as Record<EventKey, string>);
const emptyEventBooleanMap = (): Record<EventKey, boolean> =>
  EVENTS.reduce((acc, event) => {
    acc[event.key] = false;
    return acc;
  }, {} as Record<EventKey, boolean>);
const collapsedEventEditorDefaults = (): Record<EventKey, boolean> =>
  EVENTS.reduce((acc, event) => {
    acc[event.key] = false;
    return acc;
  }, {} as Record<EventKey, boolean>);
const emptyEventNumberMap = (): Record<EventKey, number> =>
  EVENTS.reduce((acc, event) => {
    acc[event.key] = 0;
    return acc;
  }, {} as Record<EventKey, number>);
const defaultRecipients = (): Record<EventKey, RecipientConfig> => ({
  oneTimeAssigned: { assignee: true, admins: false }, oneTimeCompleted: { assignee: false, admins: true }, oneTimeOverdue: { assignee: true, admins: true },
  recurringAssigned: { assignee: true, admins: false }, recurringCompleted: { assignee: false, admins: true }, recurringOverdue: { assignee: true, admins: true }
});
const createDefaultSettings = (): SettingsData => ({
  enabled: false,
  activeProvider: 'interakt',
  recipients: defaultRecipients(),
  interakt: { apiKey: '', templateLanguage: 'en', configs: defaultTemplateConfigs() },
  wati: { apiKey: '', apiEndpoint: '', templateLanguage: 'en', configs: defaultTemplateConfigs() },
  fichat: {
    baseUrl: '',
    accessToken: '',
    connected: false,
    accountName: '',
    connectedAt: '',
    templateLanguage: 'en_US',
    configs: defaultTemplateConfigs()
  },
  supportedVariableKeys: ['assignee_name', 'assigner_name', 'completion_remarks', 'due_date', 'task_category', 'task_description', 'task_id', 'task_title', 'task_type']
});

const getProviderConnectionReady = (cfg: ProviderCfg, provider: ProviderKey) => {
  if (provider === 'interakt') return Boolean(cfg.apiKey?.trim());
  if (provider === 'wati') return Boolean(cfg.apiKey?.trim() && cfg.apiEndpoint?.trim());
  return Boolean(cfg.connected || cfg.accessToken?.trim());
};

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button type="button" onClick={() => onChange(!checked)} className={`inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}>
    <span className={`ml-1 inline-block h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

const Modal = ({ open, onClose, title, children, footer, isDark, zIndex = 50 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer: React.ReactNode; isDark: boolean; zIndex?: number }) => {
  if (!open) return null;
  const modalTextSecondary = isDark ? 'rgba(255,255,255,0.96)' : 'var(--color-textSecondary)';
  return createPortal(
    <div className={`fixed inset-0 p-3 backdrop-blur-sm sm:flex sm:items-center sm:justify-center ${isDark ? 'bg-slate-950/75' : 'bg-slate-950/45'}`} style={{ zIndex }}>
      <div
        className="w-[min(98vw,1600px)] overflow-hidden rounded-[32px] border shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: isDark ? 'rgba(26,32,44,0.98)' : 'var(--color-surface)'
        }}
      >
        <div
          className="flex items-center justify-between border-b px-6 py-5 sm:px-8"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: isDark ? 'rgba(26,32,44,0.98)' : 'var(--color-surface)'
          }}
        >
          <div>
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{title}</h3>
            <p className="text-xs" style={{ color: modalTextSecondary }}>Keep this lightweight. Provider connection lives on the cards, and templates refresh after save.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border px-3 py-2 text-sm shadow-sm transition hover:-translate-y-0.5" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.9)' : 'var(--color-surface)', color: 'var(--color-text)' }}>Close</button>
        </div>
        <div className="max-h-[calc(92vh-140px)] overflow-y-auto px-6 py-5 sm:px-8">{children}</div>
        <div className="border-t px-6 py-4 sm:px-8" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'var(--color-background)' }}>{footer}</div>
      </div>
    </div>,
    document.body
  );
};

const IntegrationsPage: React.FC = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const companyId = user?.company?.companyId || user?.companyId || '';
  const [settings, setSettings] = useState<SettingsData>(createDefaultSettings());
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<ProviderKey | null>(null);
  const [templates, setTemplates] = useState<Record<ProviderKey, TemplateItem[]>>({ interakt: [], wati: [], fichat: [] });
  const [templateLoading, setTemplateLoading] = useState<Record<ProviderKey, boolean>>({ interakt: false, wati: false, fichat: false });
  const [templateError, setTemplateError] = useState<Record<ProviderKey, string>>({ interakt: '', wati: '', fichat: '' });
  const [savingProvider, setSavingProvider] = useState<ProviderKey | null>(null);
  const [templateBodies, setTemplateBodies] = useState<Record<ProviderKey, Record<EventKey, string>>>({
    interakt: emptyEventStringMap(),
    wati: emptyEventStringMap(),
    fichat: emptyEventStringMap()
  });
  const [templateBodyLoading, setTemplateBodyLoading] = useState<Record<ProviderKey, Record<EventKey, boolean>>>({
    interakt: emptyEventBooleanMap(),
    wati: emptyEventBooleanMap(),
    fichat: emptyEventBooleanMap()
  });
  const [templateBodyError, setTemplateBodyError] = useState<Record<ProviderKey, Record<EventKey, string>>>({
    interakt: emptyEventStringMap(),
    wati: emptyEventStringMap(),
    fichat: emptyEventStringMap()
  });
  const [fiChatTemplateBodyCache, setFiChatTemplateBodyCache] = useState<Record<string, { body: string; placeholderCount: number; language: string }>>({});
  const templateBodyRequestSeq = useRef<Record<ProviderKey, Record<EventKey, number>>>({
    interakt: emptyEventNumberMap(),
    wati: emptyEventNumberMap(),
    fichat: emptyEventNumberMap()
  });
  const [expandedSections, setExpandedSections] = useState<Record<'oneTime' | 'recurring', boolean>>({
    oneTime: false,
    recurring: false
  });
  const [expandedEventEditors, setExpandedEventEditors] = useState<Record<EventKey, boolean>>(collapsedEventEditorDefaults);
  const [showSecrets, setShowSecrets] = useState({ interakt: false, wati: false, fichat: false });
  const [pendingClear, setPendingClear] = useState<{ provider: ProviderKey; field: 'apiKey' | 'apiEndpoint' } | null>(null);
  const integrationsLocked = user?.company?.permissions?.integrationspage === false;
  const modalSurface = isDark ? 'rgba(26,32,44,0.92)' : 'rgba(255,255,255,0.72)';
  const modalSurfaceStrong = isDark ? 'rgba(30,41,59,0.98)' : 'rgba(255,255,255,0.82)';
  const modalSurfaceSoft = isDark ? 'rgba(30,41,59,0.82)' : 'rgba(255,255,255,0.74)';
  const modalSurfaceMuted = isDark ? 'rgba(30,41,59,0.66)' : 'rgba(255,255,255,0.52)';
  const modalSurfaceInset = isDark ? 'rgba(15,23,42,0.70)' : 'rgba(255,255,255,0.72)';
  const modalTextSecondary = isDark ? 'rgba(255,255,255,0.96)' : 'var(--color-textSecondary)';
  const notify = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    toast[type](message, {
      theme: isDark ? 'dark' : 'light',
      autoClose: 4000
    });
  };
  const notifyLocked = () => notify('warning', 'Integrations are disabled for this company.');

  const loadSettings = async () => {
    if (!companyId) return;
    try {
      setFiChatTemplateBodyCache({});
      const res = await axios.get(`${address}/api/settings/whatsapp`, { params: { companyId } });
      setSettings({ ...createDefaultSettings(), ...(res.data || {}) });
    } catch {
      notify('error', 'Failed to load integration settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadSettings();
  }, [companyId]);

  const updateProvider = (p: ProviderKey, field: keyof ProviderCfg, value: any) => setSettings((prev) => ({ ...prev, [p]: { ...prev[p], [field]: value } }));
  const updateConfig = (p: ProviderKey, k: EventKey, field: keyof TemplateConfig, value: any) => setSettings((prev) => ({ ...prev, [p]: { ...prev[p], configs: { ...prev[p].configs, [k]: { ...prev[p].configs[k], [field]: value } } } }));
  const updateRecipient = (k: EventKey, field: keyof RecipientConfig, value: boolean) => setSettings((prev) => ({ ...prev, recipients: { ...prev.recipients, [k]: { ...prev.recipients[k], [field]: value } } }));
  const resizeVariableSlots = (values: string[] = [], count = 0) =>
    Array.from({ length: Math.max(0, count) }, (_, idx) => String(values[idx] || ''));
  const getFiChatTemplateCacheKey = (templateName: string, language: string) =>
    `${String(templateName || '').trim().toLowerCase()}|${String(language || '').trim().toLowerCase()}`;

  const getProviderReadinessIssue = (provider: ProviderKey) => {
    const cfg = settings[provider];

    if (provider === 'interakt') {
      if (!cfg.apiKey?.trim()) return 'Save the Interakt API key before enabling or saving this provider.';
      return '';
    }

    if (provider === 'wati') {
      if (!cfg.apiKey?.trim()) return 'Save the WATI API key before enabling or saving this provider.';
      if (!cfg.apiEndpoint?.trim()) return 'Save the WATI API endpoint before enabling or saving this provider.';
      return '';
    }

    if (!cfg.connected && !cfg.accessToken?.trim()) {
      return 'Connect FiChat before enabling or saving this provider.';
    }

    return '';
  };

  const setActiveProviderExclusive = (provider: ProviderKey) => {
    setSettings((prev) => ({ ...prev, enabled: true, activeProvider: provider }));
  };

  const handleProviderToggle = (provider: ProviderKey, checked: boolean) => {
    if (integrationsLocked) {
      notifyLocked();
      return;
    }
    if (checked) {
      const issue = getProviderReadinessIssue(provider);
      if (issue) {
        notify('error', issue);
        return;
      }
      setActiveProviderExclusive(provider);
      return;
    }

    setSettings((prev) => ({ ...prev, enabled: false }));
  };

  const fetchTemplates = async (p: ProviderKey) => {
    if (!companyId) return;
    if (integrationsLocked) {
      notifyLocked();
      return;
    }

    if (!getProviderConnectionReady(settings[p], p)) {
      setTemplateError((prev) => ({
        ...prev,
        [p]: `Save ${providerLabel[p]} credentials first, then refresh templates.`
      }));
      setTemplates((prev) => ({ ...prev, [p]: [] }));
      return;
    }

    setTemplateLoading((prev) => ({ ...prev, [p]: true }));
    setTemplateError((prev) => ({ ...prev, [p]: '' }));
    try {
      const res = await axios.get(`${address}/api/settings/whatsapp/templates`, { params: { companyId, provider: p } });
      setTemplates((prev) => ({ ...prev, [p]: Array.isArray(res.data?.templates) ? res.data.templates : [] }));
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Unable to fetch templates.';
      setTemplateError((prev) => ({ ...prev, [p]: message }));
      notify('error', message);
      setTemplates((prev) => ({ ...prev, [p]: [] }));
    } finally {
      setTemplateLoading((prev) => ({ ...prev, [p]: false }));
    }
  };

  const fetchTemplateBody = async (provider: ProviderKey, eventKey: EventKey, templateNameOverride?: string, languageOverride?: string) => {
    if (!companyId) return;
    if (integrationsLocked) {
      notifyLocked();
      return;
    }

    const nextSeq = (templateBodyRequestSeq.current[provider][eventKey] || 0) + 1;
    templateBodyRequestSeq.current[provider][eventKey] = nextSeq;

    const cfg = settings[provider].configs[eventKey];
    const templateName = String(templateNameOverride || cfg.templateName || '').trim();
    if (!templateName) {
      notify('warning', 'Select a template first.');
      setTemplateBodyError((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: 'Select a template first.' }
      }));
      return;
    }

    const selectedTemplate = (templates[provider] || []).find((item) => item.name === templateName);
    const fallbackLanguage =
      provider === 'fichat'
        ? settings.fichat.templateLanguage || 'en_US'
        : provider === 'wati'
          ? settings.wati.templateLanguage || 'en'
          : settings.interakt.templateLanguage || 'en';
    const language = String(languageOverride || selectedTemplate?.language || fallbackLanguage).trim() || fallbackLanguage;
    const fiChatCacheKey = provider === 'fichat' ? getFiChatTemplateCacheKey(templateName, language) : '';
    const cachedFiChatTemplate = provider === 'fichat' ? fiChatTemplateBodyCache[fiChatCacheKey] : undefined;

    if (provider === 'fichat' && cachedFiChatTemplate?.body) {
      const cachedBody = String(cachedFiChatTemplate.body || '').trim();
      const cachedCount = Number(cachedFiChatTemplate.placeholderCount || 0) || 0;
      setTemplateBodies((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: cachedBody }
      }));
      updateConfig(provider, eventKey, 'placeholderCount', cachedCount);
      updateConfig(provider, eventKey, 'templateVariables', resizeVariableSlots([], cachedCount));
      if (selectedTemplate?.language || cachedCount) {
        updateConfig(provider, eventKey, 'templateName', templateName);
      }
      setTemplateBodyLoading((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: false }
      }));
      setTemplateBodyError((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: '' }
      }));
      return;
    }

    setTemplateBodyLoading((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [eventKey]: true }
    }));
    setTemplateBodyError((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [eventKey]: '' }
    }));

    try {
      const res = await axios.get(`${address}/api/settings/whatsapp/template-body`, {
        params: {
          companyId,
          provider,
          name: templateName,
          language
        }
      });

      if (templateBodyRequestSeq.current[provider][eventKey] !== nextSeq) return;

      const fetchedBody = String(res.data?.body || '').trim();
      const placeholderCount = Number(res.data?.placeholderCount ?? selectedTemplate?.placeholderCount ?? 0) || 0;
      const nextSlots = resizeVariableSlots([], placeholderCount);

      setTemplateBodies((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: fetchedBody }
      }));
      if (provider === 'fichat') {
        setFiChatTemplateBodyCache((prev) => ({
          ...prev,
          [fiChatCacheKey]: {
            body: fetchedBody,
            placeholderCount,
            language
          }
        }));
      }
      updateConfig(provider, eventKey, 'placeholderCount', placeholderCount);
      updateConfig(provider, eventKey, 'templateVariables', nextSlots);
      if (selectedTemplate?.language || placeholderCount) {
        updateConfig(provider, eventKey, 'templateName', templateName);
      }
    } catch (err: any) {
      if (templateBodyRequestSeq.current[provider][eventKey] !== nextSeq) return;

      const fallbackPreviewBody = provider === 'fichat'
        ? String(cachedFiChatTemplate?.body || '').trim()
        : String(selectedTemplate?.body || templateBodies[provider]?.[eventKey] || '').trim();
      setTemplateBodies((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: fallbackPreviewBody }
      }));
      const message = err?.response?.data?.message || 'Unable to fetch template body.';
      setTemplateBodyError((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: message }
      }));
      notify('error', message);
      const fallbackCount = Number(selectedTemplate?.placeholderCount || 0) || 0;
      if (fallbackCount > 0) {
        updateConfig(provider, eventKey, 'placeholderCount', fallbackCount);
        updateConfig(provider, eventKey, 'templateVariables', resizeVariableSlots([], fallbackCount));
      }
    } finally {
      if (templateBodyRequestSeq.current[provider][eventKey] !== nextSeq) return;
      setTemplateBodyLoading((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], [eventKey]: false }
      }));
    }
  };

  const connectFiChat = async () => {
    if (!companyId) return;
    if (integrationsLocked) {
      notifyLocked();
      return;
    }

    try {
      const res = await axios.get(`${address}/api/settings/whatsapp/fichat/connect`, {
        params: { companyId }
      });

      const connectUrl = String(res.data?.url || '').trim();
      if (!connectUrl) {
        notify('error', 'FiChat connect URL is missing.');
        return;
      }

      const width = 520;
      const height = 680;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        connectUrl,
        '_blank',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        notify('error', 'Popup blocked. Please allow popups to connect FiChat.');
        return;
      }

      const listener = async (event: MessageEvent) => {
        if (event.data?.type !== 'fichatConnected') return;

        popup.close();
        window.removeEventListener('message', listener);
        await loadSettings();
        setActiveProviderExclusive('fichat');
        await fetchTemplates('fichat');
        notify('success', 'FiChat connected successfully.');
      };

      window.addEventListener('message', listener);
    } catch (error: any) {
      notify('error', error?.response?.data?.message || 'Failed to start FiChat connection.');
    }
  };

  const disconnectFiChat = async () => {
    if (!companyId) return;
    if (integrationsLocked) {
      notifyLocked();
      return;
    }

    try {
      const res = await axios.post(`${address}/api/settings/whatsapp/fichat/disconnect`, { companyId });
      setSettings((prev) => ({ ...prev, ...(res.data?.data || {}), activeProvider: res.data?.data?.activeProvider || 'interakt' }));
      setTemplates((prev) => ({ ...prev, fichat: [] }));
      setTemplateError((prev) => ({ ...prev, fichat: '' }));
      const fallbackProvider: ProviderKey = settings.wati.apiKey ? 'wati' : 'interakt';
      setActiveProviderExclusive((res.data?.data?.activeProvider || fallbackProvider) as ProviderKey);
      notify('success', 'FiChat disconnected.');
    } catch (error: any) {
      notify('error', error?.response?.data?.message || 'Failed to disconnect FiChat.');
    }
  };

  const openModal = async (p: ProviderKey) => {
    if (integrationsLocked) {
      notifyLocked();
      return;
    }
    setActiveProvider(p);
    setExpandedEventEditors(collapsedEventEditorDefaults());
    if (getProviderConnectionReady(settings[p], p)) {
      await fetchTemplates(p);
    } else {
      setTemplates((prev) => ({ ...prev, [p]: [] }));
      setTemplateError((prev) => ({ ...prev, [p]: '' }));
    }
  };
  const persistSettings = async (nextSettings: SettingsData, providerToSave: ProviderKey, options?: { refreshTemplates?: boolean }) => {
    if (!companyId) return;
    setSavingProvider(providerToSave);
    try {
      const normalizedSettings = {
        ...nextSettings,
        wati: {
          ...nextSettings.wati,
          templateLanguage: String(nextSettings.wati.templateLanguage || 'en').trim() || 'en'
        },
        activeProvider: providerToSave
      };
      const res = await axios.post(`${address}/api/settings/whatsapp`, { companyId, ...normalizedSettings });
      setSettings((prev) => ({ ...prev, ...(res.data?.data || {}) }));
      if (options?.refreshTemplates && providerToSave === 'wati' && normalizedSettings.wati.apiKey?.trim() && normalizedSettings.wati.apiEndpoint?.trim()) {
        await fetchTemplates('wati');
      }
      notify('success', 'Saved successfully.');
    } catch (err: any) {
      notify('error', err?.response?.data?.message || 'Failed to save.');
    } finally {
      setSavingProvider(null);
    }
  };

  const saveSettings = async (providerOverride?: ProviderKey) => {
    if (!companyId) return;
    if (integrationsLocked) {
      notifyLocked();
      return;
    }
    const providerToSave = providerOverride || activeProvider || settings.activeProvider;
    const issue = getProviderReadinessIssue(providerToSave);
    if (issue) {
      notify('error', issue);
      return;
    }
    await persistSettings(settings, providerToSave, { refreshTemplates: true });
  };

  const requestClearField = (provider: ProviderKey, field: 'apiKey' | 'apiEndpoint') => {
    if (integrationsLocked) {
      notifyLocked();
      return;
    }
    setPendingClear({ provider, field });
  };

  const confirmClearField = async () => {
    if (!pendingClear) return;
    const { provider, field } = pendingClear;
    const nextSettings: SettingsData = {
      ...settings,
      [provider]: {
        ...settings[provider],
        [field]: '',
        ...(provider === 'wati' && field === 'apiKey' ? { apiEndpoint: '' } : {})
      }
    };
    setSettings(nextSettings);
    if (field === 'apiKey') {
      setShowSecrets((prev) => ({ ...prev, [provider]: false }));
    }
    setPendingClear(null);
    await persistSettings(nextSettings, provider, { refreshTemplates: false });
  };

  const renderClearConfirmModal = () => {
    if (!pendingClear) return null;
    return createPortal(
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
        <div
          className="w-[min(92vw,520px)] overflow-hidden rounded-[32px] border shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: isDark ? 'rgba(26,32,44,0.98)' : 'var(--color-surface)'
          }}
        >
          <div
            className="flex items-center justify-between border-b px-6 py-5"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: isDark ? 'rgba(26,32,44,0.98)' : 'var(--color-surface)'
            }}
          >
            <div>
              <h3 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Are you sure?</h3>
              <p className="text-xs" style={{ color: modalTextSecondary }}>This action removes the saved value from the form.</p>
            </div>
            <button
              type="button"
              onClick={() => setPendingClear(null)}
              className="rounded-xl border px-3 py-2 text-sm shadow-sm transition hover:-translate-y-0.5"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: isDark ? 'rgba(45,55,72,0.9)' : 'var(--color-surface)',
                color: 'var(--color-text)'
              }}
            >
              Close
            </button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="flex items-start gap-3 rounded-[24px] border px-4 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
              <div className="mt-0.5 rounded-2xl border p-2" style={{ borderColor: 'rgba(239,68,68,0.22)', backgroundColor: isDark ? 'rgba(127,29,29,0.22)' : 'rgba(254,226,226,0.75)', color: '#ef4444' }}>
                <Trash2 size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Clear {pendingClear.field === 'apiEndpoint' ? 'API Endpoint' : 'API Key'} for {providerLabel[pendingClear.provider]}
                </p>
                <p className="mt-1 text-sm leading-6" style={{ color: modalTextSecondary }}>
                  This will permanently remove the saved {pendingClear.field === 'apiEndpoint' ? 'endpoint' : 'credential'} from the form. You can add it again later, but this field will be empty now.
                </p>
              </div>
            </div>
            <p className="text-xs" style={{ color: modalTextSecondary }}>
              This only clears the local integration setting for the current company.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t px-6 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'var(--color-background)' }}>
            <button
              type="button"
              onClick={() => setPendingClear(null)}
              className="rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: modalSurface,
                color: 'var(--color-text)'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmClearField}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              }}
            >
              <Trash2 size={14} />
              Clear
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const currentTemplates = activeProvider ? templates[activeProvider] : [];
  const currentLoading = activeProvider ? templateLoading[activeProvider] : false;
  const currentError = activeProvider ? templateError[activeProvider] : '';
  const providerOrder: ProviderKey[] = ['fichat', 'interakt', 'wati'];
  const configuredEventCount = providerOrder.reduce((sum, provider) => (
    sum + Object.values(settings[provider].configs).filter((cfg) => cfg.enabled).length
  ), 0);
  const activeSenderLabel = settings.enabled ? providerLabel[settings.activeProvider] : 'Alerts off';

  const card = (p: ProviderKey) => {
    const cfg = settings[p];
    const theme = providerTheme[p];
    const enabled = Object.values(cfg.configs).filter((x) => x.enabled).length;
    const selected = Object.values(cfg.configs).filter((x) => x.templateName).length;
    const isActive = settings.enabled && settings.activeProvider === p;
    const isConnected = p === 'fichat'
      ? Boolean(cfg.connected || cfg.accessToken)
      : p === 'wati'
        ? Boolean(cfg.apiKey && cfg.apiEndpoint)
        : Boolean(cfg.apiKey);
    return (
      <div
        key={p}
        className="group relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-[28px] border bg-[var(--color-surface)] shadow-[0_16px_50px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(15,23,42,0.1)]"
        style={{
          borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
          boxShadow: isActive ? '0 0 0 1px rgba(58,46,226,0.12), 0 18px 40px rgba(58,46,226,0.12)' : undefined,
          backgroundColor: isActive && isDark ? 'rgba(26,32,44,0.96)' : isActive ? 'rgba(58,46,226,0.02)' : 'var(--color-surface)'
        }}
      >
        {isActive ? <div className="relative h-1.5" style={{ background: 'var(--color-primary)' }} /> : <div className="h-1.5" />}
        <div className={`relative flex flex-1 flex-col p-5 ${integrationsLocked ? 'pointer-events-none select-none opacity-60' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.95)' : 'var(--color-background)', color: 'var(--color-primary)' }}>
                <Plug size={20} />
              </div>
              <div>
                <p className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{providerLabel[p]}</p>
                <p className="text-xs leading-5" style={{ color: 'var(--color-textSecondary)' }}>
                  {p === 'fichat' ? 'Connect account' : 'Add credentials'}
                </p>
              </div>
            </div>
            <span className="rounded-full border px-3 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.95)' : 'var(--color-background)', color: integrationsLocked ? 'var(--color-warning)' : 'var(--color-textSecondary)' }}>
              {integrationsLocked ? 'Locked' : isActive ? 'Active' : isConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(15,23,42,0.55)' : 'var(--color-background)' }}>
            {p === 'fichat' ? (
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{cfg.connected ? 'Connected and ready' : 'Needs account connection'}</p>
                    <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                      {cfg.accountName ? `Connected as ${cfg.accountName}` : 'Launch the FiChat login popup to connect.'}
                    </p>
                  </div>
                  <Toggle checked={isActive} onChange={(next) => handleProviderToggle(p, next)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.86)' : 'var(--color-surface)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Connection</p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {cfg.connected ? 'Ready to send' : 'Not connected'}
                    </p>
                  </div>
                  <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.86)' : 'var(--color-surface)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Templates</p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{selected}</p>
                  </div>
                  <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.86)' : 'var(--color-surface)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Updated</p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {cfg.connectedAt ? new Date(cfg.connectedAt).toLocaleDateString() : 'Not yet'}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed px-4 py-3 text-xs leading-5" style={{ borderColor: 'var(--color-border)', color: 'var(--color-textSecondary)' }}>
                  {cfg.connected
                    ? 'FiChat is linked and ready to be used as the active WhatsApp sender.'
                    : 'Connect FiChat first, then save to keep the sender ready for templates.'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {cfg.connected ? (
                    <button
                      type="button"
                      onClick={disconnectFiChat}
                      className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                      style={{ backgroundColor: 'var(--color-error)' }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={connectFiChat}
                      className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                      style={{ backgroundColor: 'var(--color-success)' }}
                    >
                      Connect FiChat
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => saveSettings(p)}
                    disabled={savingProvider === p}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <Save size={14} />
                    {savingProvider === p ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal(p)}
                    className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
                    style={{ borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    Open Setup
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{isActive ? 'Current WhatsApp sender' : 'Turn this sender on with the toggle'}</p>
                    <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                      {isActive ? 'This provider is used for WhatsApp alerts.' : 'Save credentials first, then enable it.'}
                    </p>
                  </div>
                  <Toggle checked={isActive} onChange={(next) => handleProviderToggle(p, next)} />
                </div>

                <div className="grid gap-3">
                  <div>
                    <label className="mb-2 block text-xs font-semibold" style={{ color: 'var(--color-textSecondary)' }}>API Key</label>
                    <div className="flex items-center gap-2">
                      <input
                        type={showSecrets[p] ? 'text' : 'password'}
                        value={cfg.apiKey || ''}
                        onChange={(e) => updateProvider(p, 'apiKey', e.target.value)}
                        className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none transition placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)]"
                        placeholder={`${providerLabel[p]} API key`}
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowSecrets((prev) => ({ ...prev, [p]: !prev[p] }))}
                          className="flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--color-background)]"
                          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-textSecondary)' }}
                          aria-label={showSecrets[p] ? 'Hide API Key' : 'Show API Key'}
                        >
                          {showSecrets[p] ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestClearField(p, 'apiKey')}
                          disabled={!cfg.apiKey}
                          className="flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition hover:-translate-y-0.5 hover:bg-[rgba(239,68,68,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-textSecondary)' }}
                          aria-label="Clear API Key"
                          title="Clear API Key"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {p === 'wati' ? (
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                      <div>
                        <label className="mb-2 block text-xs font-semibold" style={{ color: 'var(--color-textSecondary)' }}>API Endpoint</label>
                        <div className="flex items-center gap-2">
                          <input
                            type={showSecrets[p] ? 'text' : 'password'}
                            value={cfg.apiEndpoint || ''}
                            onChange={(e) => updateProvider('wati', 'apiEndpoint', e.target.value)}
                            className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none transition placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)]"
                            placeholder="https://your-wati-host/api/v1"
                            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold" style={{ color: 'var(--color-textSecondary)' }}>Template Language</label>
                        <input
                          value={cfg.templateLanguage || ''}
                          readOnly
                          aria-readonly="true"
                          className="w-full rounded-2xl border px-3 py-3 text-sm outline-none transition focus:border-[var(--color-primary)] md:max-w-[140px]"
                          placeholder="en"
                          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'default' }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-2 block text-xs font-semibold" style={{ color: 'var(--color-textSecondary)' }}>Template Language</label>
                      <input
                      value={cfg.templateLanguage || ''}
                      onChange={(e) => updateProvider(p, 'templateLanguage', e.target.value)}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)]"
                      placeholder={p === 'fichat' ? 'en_US' : 'en'}
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                    />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => saveSettings(p)}
                    disabled={savingProvider === p}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    <Save size={14} />
                    {savingProvider === p ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal(p)}
                    className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    Open Setup
                    <ArrowRight size={14} />
                  </button>
                </div>

                <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                  Saving refreshes templates right away for the provider you changed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const sectionTitle = (k: EventKey) => EVENTS.find((e) => e.key === k)?.label || k;

  const renderEditor = (p: ProviderKey, k: EventKey) => {
    const cfg = settings[p].configs[k];
    const list = templates[p] || [];
    const selectedTemplate = list.find((t) => t.name === cfg.templateName);
    const bodyLoading = Boolean(templateBodyLoading[p]?.[k]);
    const currentFiChatLanguage =
      p === 'fichat'
        ? String(selectedTemplate?.language || settings.fichat.templateLanguage || 'en_US').trim() || 'en_US'
        : '';
    const currentFiChatCache = p === 'fichat' && cfg.templateName
      ? fiChatTemplateBodyCache[getFiChatTemplateCacheKey(cfg.templateName, currentFiChatLanguage)]
      : undefined;
    const templateBody = String(
      bodyLoading
        ? templateBodies[p]?.[k]
        : (p === 'fichat'
            ? templateBodies[p]?.[k] || currentFiChatCache?.body || ''
            : templateBodies[p]?.[k] || selectedTemplate?.body || '')
    ).trim();
    const placeholderCount = bodyLoading
      ? 0
      : Math.max(0, Number(
        p === 'fichat'
          ? cfg.placeholderCount || currentFiChatCache?.placeholderCount || 0
          : cfg.placeholderCount || selectedTemplate?.placeholderCount || 0
      ));
    const bodyError = String(templateBodyError[p]?.[k] || '').trim();
    const bodyVariables = Array.from(
      new Set(
        Array.from(templateBody.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g))
          .map((match) => String(match?.[1] || '').trim())
          .filter(Boolean)
      )
    );
    const isExpanded = expandedEventEditors[k];
    return (
      <div
        key={`${p}-${k}`}
        className={`overflow-hidden rounded-[28px] border bg-[var(--color-surface)] p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] sm:p-5 ${integrationsLocked ? 'pointer-events-none select-none opacity-60' : ''}`}
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpandedEventEditors((prev) => ({ ...prev, [k]: !prev[k] }))}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface, color: modalTextSecondary }}>
              <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{sectionTitle(k)}</p>
              <p className="text-xs" style={{ color: modalTextSecondary }}>Use the approved template for this event.</p>
            </div>
          </button>
          <Toggle checked={cfg.enabled} onChange={(v) => updateConfig(p, k, 'enabled', v)} />
        </div>

        {isExpanded ? (
          <>
            <div className="mt-4 grid gap-4 xl:grid-cols-[480px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: modalTextSecondary }}>Template Source</p>
                  <div className="mt-2 space-y-3">
                    {list.length > 0 ? (
                      <select
                        value={selectedTemplate ? selectedTemplate.name : '__custom'}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '__custom') {
                            updateConfig(p, k, 'templateName', '');
                            updateConfig(p, k, 'placeholderCount', 0);
                            updateConfig(p, k, 'templateVariables', []);
                            setTemplateBodies((prev) => ({ ...prev, [p]: { ...prev[p], [k]: '' } }));
                            setTemplateBodyLoading((prev) => ({ ...prev, [p]: { ...prev[p], [k]: false } }));
                            setTemplateBodyError((prev) => ({ ...prev, [p]: { ...prev[p], [k]: '' } }));
                            return;
                          }

                          const next = list.find((item) => item.name === value);
                          updateConfig(p, k, 'templateName', value);
                          updateConfig(p, k, 'placeholderCount', 0);
                          updateConfig(p, k, 'templateVariables', []);
                          const nextLanguage = String(next?.language || (p === 'fichat' ? settings.fichat.templateLanguage || 'en_US' : '')).trim();
                          const nextCache = p === 'fichat' ? fiChatTemplateBodyCache[getFiChatTemplateCacheKey(value, nextLanguage)] : undefined;
                          setTemplateBodies((prev) => ({ ...prev, [p]: { ...prev[p], [k]: nextCache?.body || '' } }));
                          setTemplateBodyLoading((prev) => ({ ...prev, [p]: { ...prev[p], [k]: p === 'fichat' ? !nextCache?.body : false } }));
                          setTemplateBodyError((prev) => ({ ...prev, [p]: { ...prev[p], [k]: '' } }));
                          if (p === 'fichat' && value !== '__custom' && !nextCache?.body) {
                            void fetchTemplateBody(p, k, value, nextLanguage || 'en_US');
                          }
                        }}
                        className="w-full rounded-2xl border px-4 py-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceStrong, color: 'var(--color-text)' }}
                      >
                        <option value="__custom">Custom template</option>
                        {list.map((t) => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={cfg.templateName}
                        onChange={(e) => updateConfig(p, k, 'templateName', e.target.value)}
                        className="w-full rounded-2xl border px-4 py-3 text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)]"
                        placeholder="Template name"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceStrong, color: 'var(--color-text)' }}
                      />
                    )}
                    {!selectedTemplate || !list.length ? (
                      <input
                        value={cfg.templateName}
                        onChange={(e) => updateConfig(p, k, 'templateName', e.target.value)}
                        className="w-full rounded-2xl border px-4 py-3 text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)]"
                        placeholder="Custom template name"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceStrong, color: 'var(--color-text)' }}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => fetchTemplateBody(p, k)}
                      disabled={bodyLoading || !cfg.templateName.trim()}
                      className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceSoft, color: 'var(--color-text)' }}
                    >
                      <RefreshCw size={14} />
                      {bodyLoading ? 'Loading Body...' : 'Fetch Body'}
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: modalTextSecondary }}>Body Preview</p>
                    <span className="text-[11px]" style={{ color: modalTextSecondary }}>{bodyVariables.length} detected</span>
                  </div>
                  <div className="mt-3 max-h-56 overflow-auto rounded-2xl border bg-[var(--color-background)] p-3" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="rounded-2xl border bg-[var(--color-surface)] p-4 shadow-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.88)' : 'var(--color-surface)' }}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: modalTextSecondary }}>
                        <span>Message Preview</span>
                        <span>{templateBody ? `${templateBody.length} chars` : 'Draft'}</span>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm leading-6" style={{ color: 'var(--color-text)' }}>
                        {bodyError ? (
                          <span className="text-red-600">{bodyError}</span>
                        ) : templateBody ? (
                          templateBody
                        ) : (
                          <span style={{ color: modalTextSecondary }}>Body not loaded yet. Use Fetch Body to load the selected template.</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bodyVariables.length ? bodyVariables.map((variable) => (
                      <span
                        key={variable}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface, color: modalTextSecondary }}
                      >
                        {variable}
                      </span>
                    )) : <span className="text-xs" style={{ color: modalTextSecondary }}>No placeholders detected yet.</span>}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: modalTextSecondary }}>Variable Mapping</p>
                    <p className="text-xs" style={{ color: modalTextSecondary }}>
                      {placeholderCount > 0 ? 'Map each placeholder to a supported variable.' : 'Fetch the body first, then map placeholders.'}
                    </p>
                  </div>
                  <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface, color: modalTextSecondary }}>
                    {placeholderCount} slot{placeholderCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-3">
                  {placeholderCount > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {Array.from({ length: placeholderCount }).map((_, idx) => (
                        <div key={`${p}-${k}-slot-${idx}`} className="grid grid-cols-[40px_1fr] items-center gap-2 rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                          <span className="rounded-full border px-2 py-1 text-center text-[11px] font-semibold" style={{ borderColor: 'var(--color-border)', color: modalTextSecondary }}>
                            #{idx + 1}
                          </span>
                          <select
                            value={cfg.templateVariables[idx] || '__none'}
                            onChange={(e) => {
                              const next = resizeVariableSlots(cfg.templateVariables || [], placeholderCount);
                              next[idx] = e.target.value === '__none' ? '' : e.target.value;
                              updateConfig(p, k, 'templateVariables', next);
                            }}
                            className="w-full rounded-2xl border px-4 py-3 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)]"
                            style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceStrong, color: 'var(--color-text)' }}
                          >
                            <option value="__none">Select variable</option>
                            {sortedSupportedVariableKeys.map((variable) => (
                              <option key={`${p}-${k}-${idx}-${variable}`} value={variable}>
                                {getSupportedVariableLabel(variable)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed px-4 py-8 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceMuted, color: modalTextSecondary }}>
                      No placeholder slots yet. Choose a template and fetch its body to build the mapping.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border px-4 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: modalTextSecondary }}>Recipients</p>
                <span className="text-[11px]" style={{ color: modalTextSecondary }}>One-time and recurring are separate</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceSoft }}>
                  <span style={{ color: 'var(--color-text)' }}>Assignee</span>
                  <Toggle checked={settings.recipients[k].assignee} onChange={(v) => updateRecipient(k, 'assignee', v)} />
                </label>
                <label className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceSoft }}>
                  <span style={{ color: 'var(--color-text)' }}>Admins</span>
                  <Toggle checked={settings.recipients[k].admins} onChange={(v) => updateRecipient(k, 'admins', v)} />
                </label>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-[24px] border border-dashed px-4 py-4 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceMuted, color: modalTextSecondary }}>
            Collapsed. Click the chevron to open {sectionTitle(k)} and edit its template mapping.
          </div>
        )}
      </div>
    );
  };

  const providerForm = () => {
    if (!activeProvider) return null;
    const cfg = settings[activeProvider];
    const theme = providerTheme[activeProvider];
    const canRefreshTemplates = activeProvider === 'fichat' ? Boolean(cfg.connected || cfg.accessToken) : true;
    return (
      <>
        <Modal
          open={!!activeProvider}
          onClose={() => setActiveProvider(null)}
          title={`${providerLabel[activeProvider]} Integration`}
          isDark={isDark}
          footer={
            <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${integrationsLocked ? 'pointer-events-none select-none opacity-60' : ''}`}>
              <div className="text-xs" style={{ color: modalTextSecondary }}>
                <Sparkles size={14} className="inline-block align-text-bottom" /> Save the provider card first, then refresh templates to update the editor.
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => fetchTemplates(activeProvider)}
                  disabled={currentLoading || !canRefreshTemplates}
                  className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
                  style={{ borderColor: theme.ring, backgroundColor: modalSurface, color: 'var(--color-text)' }}
                >
                  <RefreshCw size={14} />
                  {currentLoading ? 'Loading...' : 'Refresh Templates'}
                </button>
                <button
                  type="button"
                  onClick={() => saveSettings(activeProvider)}
                  disabled={savingProvider === activeProvider}
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                  style={{ background: theme.accent }}
                >
                  <Save size={14} />
                  {savingProvider === activeProvider ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          }
        >
          <div className={`space-y-5 ${integrationsLocked ? 'pointer-events-none select-none opacity-60' : ''}`}>
            {integrationsLocked ? (
              <div className="rounded-[28px] border px-4 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-2xl border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceInset }}>
                    <LockKeyhole size={16} style={{ color: 'var(--color-warning)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Integrations locked</p>
                    <p className="text-xs" style={{ color: modalTextSecondary }}>
                      Enable the Integrations Page permission in SuperAdmin to edit providers and templates.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-[28px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: modalTextSecondary }}>Global</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Enable WhatsApp alerts</p>
                    </div>
                    <Toggle checked={settings.enabled} onChange={(v) => setSettings((prev) => ({ ...prev, enabled: v }))} />
                  </div>
                  <p className="text-xs" style={{ color: modalTextSecondary }}>
                    When this is off, no provider sends notifications even if individual templates are enabled.
                  </p>
                </div>

                <div className="rounded-[28px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} style={{ color: theme.iconTint }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Provider Snapshot</p>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceInset }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: modalTextSecondary }}>Connection</p>
                      <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        {settings.enabled
                          ? (activeProvider === 'fichat'
                              ? (settings.fichat.connected ? `FiChat connected${settings.fichat.accountName ? ` as ${settings.fichat.accountName}` : ''}` : 'FiChat not connected')
                              : activeProvider
                                ? `${providerLabel[activeProvider]} ready`
                                : 'Choose a provider')
                          : 'All alerts disabled'}
                      </p>
                    </div>
                    <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurfaceInset }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: modalTextSecondary }}>Events active</p>
                      <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        {configuredEventCount} of {EVENTS.length * providerOrder.length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                  <div className="flex items-center gap-2">
                    <Shield size={16} style={{ color: theme.iconTint }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Supported Variables</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sortedSupportedVariableKeys.map((k) => (
                      <span
                        key={k}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface, color: modalTextSecondary }}
                      >
                        {getSupportedVariableLabel(k)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {EVENTS.filter((e) => e.section === 'One-time').length ? (
                  <div className="space-y-3 rounded-[28px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                    <button
                      type="button"
                      onClick={() => setExpandedSections((prev) => ({ ...prev, oneTime: !prev.oneTime }))}
                      className="flex w-full items-start justify-between gap-4 text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>One-time Tasks</p>
                        <p className="text-xs" style={{ color: modalTextSecondary }}>Assigned, completed, and overdue alerts.</p>
                      </div>
                      <ChevronDown size={16} className={`mt-0.5 shrink-0 transition-transform ${expandedSections.oneTime ? 'rotate-180' : ''}`} style={{ color: modalTextSecondary }} />
                    </button>
                    {expandedSections.oneTime ? <div className="space-y-3 pt-1">{EVENTS.filter((e) => e.section === 'One-time').map((e) => renderEditor(activeProvider!, e.key))}</div> : null}
                  </div>
                ) : null}
                {EVENTS.filter((e) => e.section === 'Recurring').length ? (
                  <div className="space-y-3 rounded-[28px] border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                    <button
                      type="button"
                      onClick={() => setExpandedSections((prev) => ({ ...prev, recurring: !prev.recurring }))}
                      className="flex w-full items-start justify-between gap-4 text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Recurring Tasks</p>
                        <p className="text-xs" style={{ color: modalTextSecondary }}>Assigned, completed, and overdue alerts.</p>
                      </div>
                      <ChevronDown size={16} className={`mt-0.5 shrink-0 transition-transform ${expandedSections.recurring ? 'rotate-180' : ''}`} style={{ color: modalTextSecondary }} />
                    </button>
                    {expandedSections.recurring ? <div className="space-y-3 pt-1">{EVENTS.filter((e) => e.section === 'Recurring').map((e) => renderEditor(activeProvider!, e.key))}</div> : null}
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-[28px] border px-4 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: modalSurface }}>
                  <div className="text-xs" style={{ color: modalTextSecondary }}>{currentLoading ? 'Loading templates...' : `${currentTemplates.length} template(s) loaded.`}</div>
                  <button
                    type="button"
                    onClick={() => fetchTemplates(activeProvider!)}
                    disabled={!canRefreshTemplates}
                    className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
                    style={{ borderColor: theme.ring, backgroundColor: modalSurface, color: 'var(--color-text)' }}
                  >
                    <RefreshCw size={14} />
                    Reload Templates
                  </button>
                </div>
                {currentError ? <p className="text-sm text-red-600">{currentError}</p> : null}
              </div>
            </div>
          </div>
        </Modal>
      </>
    );
  };

  const sortedSupportedVariableKeys = [...(settings.supportedVariableKeys || [])].sort((a, b) =>
    getSupportedVariableLabel(a).localeCompare(getSupportedVariableLabel(b))
  );

  const pageShellClass = isDark ? 'min-h-screen bg-[var(--color-background)]' : 'min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/80';

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[var(--color-background)]">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 mx-auto" style={{ borderColor: 'var(--color-primary)' }} />
          <p className="mt-4 text-sm font-medium" style={{ color: 'var(--color-textSecondary)' }}>Loading integrations workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={pageShellClass}>
      <div className="mx-auto w-full max-w-[1800px] space-y-5 px-4 py-5 pb-10 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
          <div className="px-6 py-6 sm:px-8 sm:py-7">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: 'var(--color-text)' }}>Integrations</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--color-textSecondary)' }}>
              Manage FiChat, Interakt, and WATI from one place.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-textSecondary)' }}>
              Use the provider cards below to connect, save, and open setup when needed.
            </p>
          </div>
        </div>

        {integrationsLocked && (
          <div className="rounded-[28px] border px-5 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(26,32,44,0.94)' : 'var(--color-surface)' }}>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: isDark ? 'rgba(45,55,72,0.95)' : 'var(--color-background)' }}>
                <LockKeyhole size={16} style={{ color: 'var(--color-warning)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Integrations are disabled for this company</p>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-textSecondary)' }}>
                  Enable the Integrations Page permission in SuperAdmin to edit provider credentials, template mappings, and recipients.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-3">{providerOrder.map(card)}</div>

        {providerForm()}
        {renderClearConfirmModal()}
      </div>
    </div>
  );
};

export default IntegrationsPage;
