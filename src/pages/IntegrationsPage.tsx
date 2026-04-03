import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronDown, Eye, EyeOff, Plug, RefreshCw, Save, Settings2, Shield, Sparkles } from 'lucide-react';
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
const supportedVariableLabelMap: Record<string, string> = {
  task_title: 'Task Title',
  task_description: 'Task Description',
  task_id: 'Task ID',
  task_type: 'Task Type',
  task_category: 'Task Category',
  due_date: 'Due Date',
  due_date_time: 'Due Date Time',
  assignee_name: 'Assignee Name',
  assignee_phone: 'Assignee Phone',
  assigner_name: 'Assigner Name',
  assigner_phone: 'Assigner Phone',
  completion_remarks: 'Completion Remarks',
  company_id: 'Company ID',
  event_label: 'Event Label'
};
const getSupportedVariableLabel = (key: string) => supportedVariableLabelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const defaultTemplateConfigs = (): Record<EventKey, TemplateConfig> =>
  Object.fromEntries(
    EVENTS.map((e) => [e.key, { enabled: false, templateName: '', templateVariables: [], placeholderCount: 0 }])
  ) as Record<EventKey, TemplateConfig>;
const emptyEventStringMap = (): Record<EventKey, string> =>
  Object.fromEntries(EVENTS.map((e) => [e.key, ''])) as Record<EventKey, string>;
const emptyEventBooleanMap = (): Record<EventKey, boolean> =>
  Object.fromEntries(EVENTS.map((e) => [e.key, false])) as Record<EventKey, boolean>;
const emptyEventNumberMap = (): Record<EventKey, number> =>
  Object.fromEntries(EVENTS.map((e) => [e.key, 0])) as Record<EventKey, number>;
const defaultRecipients = (): Record<EventKey, RecipientConfig> => ({
  oneTimeAssigned: { assignee: true, admins: false }, oneTimeCompleted: { assignee: false, admins: true }, oneTimeOverdue: { assignee: true, admins: true },
  recurringAssigned: { assignee: true, admins: false }, recurringCompleted: { assignee: false, admins: true }, recurringOverdue: { assignee: true, admins: true }
});
const createDefaultSettings = (): SettingsData => ({
  enabled: false,
  activeProvider: 'interakt',
  recipients: defaultRecipients(),
  interakt: { apiKey: '', templateLanguage: 'en', configs: defaultTemplateConfigs() },
  wati: { apiKey: '', apiEndpoint: '', configs: defaultTemplateConfigs() },
  fichat: {
    baseUrl: '',
    accessToken: '',
    connected: false,
    accountName: '',
    connectedAt: '',
    templateLanguage: 'en_US',
    configs: defaultTemplateConfigs()
  },
  supportedVariableKeys: ['task_title', 'task_description', 'task_id', 'task_type', 'task_category', 'due_date', 'due_date_time', 'assignee_name', 'assignee_phone', 'assigner_name', 'assigner_phone', 'completion_remarks', 'company_id', 'event_label']
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

const Modal = ({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer: React.ReactNode }) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:flex sm:items-center sm:justify-center">
      <div className="w-[min(98vw,1600px)] overflow-hidden rounded-[32px] border bg-[var(--color-surface)] shadow-[0_30px_100px_rgba(15,23,42,0.28)] ring-1 ring-white/30 dark:ring-white/10" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between border-b px-6 py-5 sm:px-8" style={{ borderColor: 'var(--color-border)', background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(250,250,255,0.92))' }}>
          <div>
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{title}</h3>
            <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>Keep this lightweight. Provider connection lives on the cards, and templates refresh after save.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border px-3 py-2 text-sm shadow-sm transition hover:-translate-y-0.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>Close</button>
        </div>
        <div className="max-h-[calc(92vh-140px)] overflow-y-auto px-6 py-5 sm:px-8">{children}</div>
        <div className="border-t px-6 py-4 sm:px-8" style={{ borderColor: 'var(--color-border)', background: 'linear-gradient(180deg, rgba(250,250,255,0.72), rgba(255,255,255,0.92))' }}>{footer}</div>
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
  const [showSecrets, setShowSecrets] = useState({ interakt: false, wati: false, fichat: false });
  const notify = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    toast[type](message, {
      theme: isDark ? 'dark' : 'light',
      autoClose: 4000
    });
  };

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
    setActiveProvider(p);
    if (getProviderConnectionReady(settings[p], p)) {
      await fetchTemplates(p);
    } else {
      setTemplates((prev) => ({ ...prev, [p]: [] }));
      setTemplateError((prev) => ({ ...prev, [p]: '' }));
    }
  };
  const saveSettings = async (providerOverride?: ProviderKey) => {
    if (!companyId) return;
    const providerToSave = providerOverride || activeProvider || settings.activeProvider;
    const issue = getProviderReadinessIssue(providerToSave);
    if (issue) {
      notify('error', issue);
      return;
    }
    setSavingProvider(providerToSave);
    try {
      const res = await axios.post(`${address}/api/settings/whatsapp`, { companyId, ...settings, activeProvider: providerToSave });
      setSettings((prev) => ({ ...prev, ...(res.data?.data || {}) }));
      notify('success', 'Saved successfully.');
    } catch (err: any) {
      notify('error', err?.response?.data?.message || 'Failed to save.');
    } finally {
      setSavingProvider(null);
    }
  };

  const currentTemplates = activeProvider ? templates[activeProvider] : [];
  const currentLoading = activeProvider ? templateLoading[activeProvider] : false;
  const currentError = activeProvider ? templateError[activeProvider] : '';

  const card = (p: ProviderKey) => {
    const cfg = settings[p];
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
        className="group overflow-hidden rounded-[26px] border bg-[var(--color-surface)] p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
        style={{
          borderColor: isActive ? 'rgba(76,61,245,0.5)' : 'var(--color-border)',
          boxShadow: isActive ? '0 14px 30px rgba(76,61,245,0.10)' : undefined
        }}
      >
        <div className="mb-4 h-1 rounded-full" style={{ backgroundColor: isActive ? 'var(--color-primary)' : 'rgba(148,163,184,0.20)' }} />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(76,61,245,0.06)', color: 'var(--color-primary)' }}>
              <Plug size={19} />
            </div>
            <div>
              <p className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{providerLabel[p]}</p>
              <p className="text-xs leading-5" style={{ color: 'var(--color-textSecondary)' }}>
                {p === 'fichat' ? 'Popup connect flow' : 'Credentials and sender control'}
              </p>
            </div>
          </div>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-background)', color: isActive ? '#fff' : 'var(--color-textSecondary)' }}>
            {isActive ? 'Active' : isConnected ? 'Connected' : 'Open'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Templates</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{selected}</p>
          </div>
          <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Enabled</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{enabled}</p>
          </div>
          <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Status</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{isConnected ? 'Ready' : 'Not connected'}</p>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border p-3.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
          {p === 'fichat' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>FiChat</p>
                  <p className="text-sm font-semibold">{cfg.connected ? 'Connected' : 'Needs login'}</p>
                </div>
                <Toggle checked={isActive} onChange={(next) => handleProviderToggle(p, next)} />
              </div>
              <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                {cfg.accountName ? `Connected as ${cfg.accountName}` : 'Click connect to launch the FiChat login popup.'}
              </p>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(100px,120px)]">
                <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Connection</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {cfg.connected ? 'Ready to send' : 'Not connected'}
                  </p>
                </div>
                <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Action</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {cfg.connected ? 'Disconnect available' : 'Connect available'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {cfg.connected ? (
                  <button
                    type="button"
                    onClick={disconnectFiChat}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                    style={{ backgroundColor: '#dc2626' }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectFiChat}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                    style={{ backgroundColor: '#16a34a' }}
                  >
                    Connect FiChat
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => saveSettings(p)}
                  disabled={savingProvider === p}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <Save size={14} />
                  {savingProvider === p ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => openModal(p)}
                  className="rounded-xl border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
                >
                 Open Setup
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>{isActive ? 'Sender active' : 'Sender inactive'}</p>
                  <p className="text-sm font-semibold">{isActive ? 'Current WhatsApp sender' : 'Turn this sender on from the toggle'}</p>
                </div>
                <Toggle checked={isActive} onChange={(next) => handleProviderToggle(p, next)} />
              </div>

              <div className={p === 'interakt' ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(100px,120px)]'}>
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>API Key</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets[p] ? 'text' : 'password'}
                      value={cfg.apiKey || ''}
                      onChange={(e) => updateProvider(p, 'apiKey', e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      placeholder={`${providerLabel[p]} API key`}
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                    />
                    <button type="button" onClick={() => setShowSecrets((prev) => ({ ...prev, [p]: !prev[p] }))} className="rounded-xl border px-3" style={{ borderColor: 'var(--color-border)' }}>
                      {showSecrets[p] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {p === 'wati' ? (
                  <div className="sm:justify-self-start">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Template Language</label>
                    <input
                      value={cfg.templateLanguage || ''}
                      onChange={(e) => updateProvider('wati', 'templateLanguage', e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none sm:w-[120px]"
                      placeholder="en"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                    />
                  </div>
                ) : p === 'interakt' ? (
                  <div className="sm:justify-self-start">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Template Language</label>
                    <input
                      value={cfg.templateLanguage || ''}
                      onChange={(e) => updateProvider(p, 'templateLanguage', e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none sm:w-[120px]"
                      placeholder="en"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                    />
                  </div>
                ) : (
                  <div className="sm:justify-self-start">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Template Language</label>
                    <input
                      value={cfg.templateLanguage || ''}
                      onChange={(e) => updateProvider(p, 'templateLanguage', e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none sm:w-[120px]"
                      placeholder={p === 'interakt' ? 'en' : 'en_US'}
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                    />
                  </div>
                )}
              </div>

              {p === 'wati' ? (
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>API Endpoint</label>
                  <input
                    value={cfg.apiEndpoint || ''}
                    onChange={(e) => updateProvider('wati', 'apiEndpoint', e.target.value)}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                    placeholder="https://your-wati-host/api/v1"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => saveSettings(p)}
                  disabled={savingProvider === p}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <Save size={14} />
                  {savingProvider === p ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => openModal(p)}
                  className="rounded-xl border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  Open Setup
                </button>
              </div>

              <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                Saving refreshes templates right away for the provider you changed.
              </p>
            </div>
          )}
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
    return (
      <div key={`${p}-${k}`} className="rounded-2xl border p-3 sm:p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{sectionTitle(k)}</p>
            <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>Use the approved template for this event.</p>
          </div>
          <Toggle checked={cfg.enabled} onChange={(v) => updateConfig(p, k, 'enabled', v)} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[480px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Template Source</p>
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
                    className="w-full rounded-xl border px-4 py-2.5 outline-none"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                  >
                    <option value="__custom">Custom template</option>
                    {list.map((t) => <option key={t.name} value={t.name}>{t.name}{t.language ? ` - ${t.language}` : ''}{t.status ? ` - ${t.status}` : ''}</option>)}
                  </select>
                ) : (
                  <input
                    value={cfg.templateName}
                    onChange={(e) => updateConfig(p, k, 'templateName', e.target.value)}
                    className="w-full rounded-xl border px-4 py-2.5 outline-none"
                    placeholder="Template name"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                  />
                )}
                {!selectedTemplate || !list.length ? (
                  <input
                    value={cfg.templateName}
                    onChange={(e) => updateConfig(p, k, 'templateName', e.target.value)}
                    className="w-full rounded-xl border px-4 py-2.5 outline-none"
                    placeholder="Custom template name"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => fetchTemplateBody(p, k)}
                  disabled={bodyLoading || !cfg.templateName.trim()}
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <RefreshCw size={14} />
                  {bodyLoading ? 'Loading Body...' : 'Fetch Body'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Body Preview</p>
                <span className="text-[11px]" style={{ color: 'var(--color-textSecondary)' }}>{bodyVariables.length} detected</span>
              </div>
              <div className="mt-2 max-h-56 overflow-auto rounded-2xl border bg-[var(--color-background)] p-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="rounded-2xl border bg-[var(--color-surface)] p-3 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>
                    <span>Message Preview</span>
                    <span>{templateBody ? `${templateBody.length} chars` : 'Draft'}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm leading-6" style={{ color: 'var(--color-text)' }}>
                    {bodyError ? (
                      <span className="text-red-600">{bodyError}</span>
                    ) : templateBody ? (
                      templateBody
                    ) : (
                      <span style={{ color: 'var(--color-textSecondary)' }}>Body not loaded yet. Use Fetch Body to load the selected template.</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {bodyVariables.length ? bodyVariables.map((variable) => (
                  <span
                    key={variable}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-textSecondary)' }}
                  >
                    {variable}
                  </span>
                )) : <span className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>No placeholders detected yet.</span>}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Variable Mapping</p>
                <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                  {placeholderCount > 0 ? 'Map each placeholder to a supported variable.' : 'Fetch the body first, then map placeholders.'}
                </p>
              </div>
              <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--color-border)', color: 'var(--color-textSecondary)' }}>
                {placeholderCount} slot{placeholderCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-3">
              {placeholderCount > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {Array.from({ length: placeholderCount }).map((_, idx) => (
                    <div key={`${p}-${k}-slot-${idx}`} className="grid grid-cols-[40px_1fr] items-center gap-2 rounded-xl border p-2.5" style={{ borderColor: 'var(--color-border)' }}>
                      <span className="rounded-full border px-2 py-1 text-center text-[11px] font-semibold" style={{ borderColor: 'var(--color-border)', color: 'var(--color-textSecondary)' }}>
                        #{idx + 1}
                      </span>
                      <select
                        value={cfg.templateVariables[idx] || '__none'}
                        onChange={(e) => {
                          const next = resizeVariableSlots(cfg.templateVariables || [], placeholderCount);
                          next[idx] = e.target.value === '__none' ? '' : e.target.value;
                          updateConfig(p, k, 'templateVariables', next);
                        }}
                        className="w-full rounded-xl border px-4 py-2.5 outline-none"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                      >
                        <option value="__none">Select variable</option>
                        {settings.supportedVariableKeys.map((variable) => (
                          <option key={`${p}-${k}-${idx}-${variable}`} value={variable}>
                            {getSupportedVariableLabel(variable)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-8 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-textSecondary)' }}>
                  No placeholder slots yet. Choose a template and fetch its body to build the mapping.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Recipients</p>
            <span className="text-[11px]" style={{ color: 'var(--color-textSecondary)' }}>One-time and recurring are separate</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
              <span>Assignee</span>
              <Toggle checked={settings.recipients[k].assignee} onChange={(v) => updateRecipient(k, 'assignee', v)} />
            </label>
            <label className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
              <span>Admins</span>
              <Toggle checked={settings.recipients[k].admins} onChange={(v) => updateRecipient(k, 'admins', v)} />
            </label>
          </div>
        </div>
      </div>
    );
  };

  const providerForm = () => {
    if (!activeProvider) return null;
    const cfg = settings[activeProvider];
    const canRefreshTemplates = activeProvider === 'fichat' ? Boolean(cfg.connected || cfg.accessToken) : true;
    return (
      <Modal
        open={!!activeProvider}
        onClose={() => setActiveProvider(null)}
        title={`${providerLabel[activeProvider]} Integration`}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs" style={{ color: 'var(--color-textSecondary)' }}><Sparkles size={14} className="inline-block align-text-bottom" /> Save the provider card first, then refresh templates separately if needed.</div>
            <div className="flex gap-3">
              <button type="button" onClick={() => fetchTemplates(activeProvider)} disabled={currentLoading || !canRefreshTemplates} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: 'var(--color-border)' }}><RefreshCw size={14} />{currentLoading ? 'Loading...' : 'Refresh Templates'}</button>
              <button type="button" onClick={() => saveSettings(activeProvider)} disabled={savingProvider === activeProvider} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: 'var(--color-primary)' }}><Save size={14} />{savingProvider === activeProvider ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
              <div className="mb-3 flex items-center justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Global</p><p className="text-sm font-semibold">Enable WhatsApp alerts</p></div>
                <Toggle checked={settings.enabled} onChange={(v) => setSettings((prev) => ({ ...prev, enabled: v }))} />
              </div>
            </div>

            <div className="rounded-3xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
              <div className="flex items-center gap-2"><Settings2 size={16} style={{ color: 'var(--color-primary)' }} /><p className="text-sm font-semibold">Provider Snapshot</p></div>
              <div className="mt-3 grid gap-3">
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Current sender</p>
                  <p className="mt-1 text-sm font-semibold">
                    {settings.enabled ? providerLabel[settings.activeProvider] : 'WhatsApp alerts off'}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-textSecondary)' }}>
                    Use the card controls to switch active provider or connect FiChat.
                  </p>
                </div>
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Connection</p>
                  <p className="mt-1 text-sm font-semibold">
                    {settings.enabled
                      ? (activeProvider === 'fichat'
                          ? (settings.fichat.connected ? `FiChat connected${settings.fichat.accountName ? ` as ${settings.fichat.accountName}` : ''}` : 'FiChat not connected')
                          : activeProvider
                            ? `${providerLabel[activeProvider]} ready`
                            : 'Choose a provider')
                      : 'All alerts disabled'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
              <div className="flex items-center gap-2"><Shield size={16} style={{ color: 'var(--color-primary)' }} /><p className="text-sm font-semibold">Supported Variables</p></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {settings.supportedVariableKeys.map((k) => (
                  <span
                    key={k}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-textSecondary)' }}
                  >
                    {getSupportedVariableLabel(k)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {EVENTS.filter((e) => e.section === 'One-time').length ? (
              <div className="space-y-3 rounded-3xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, oneTime: !prev.oneTime }))}
                  className="flex w-full items-start justify-between gap-4 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold">One-time Tasks</p>
                    <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>Assigned, completed, and overdue alerts.</p>
                  </div>
                  <ChevronDown size={16} className={`mt-0.5 shrink-0 transition-transform ${expandedSections.oneTime ? 'rotate-180' : ''}`} style={{ color: 'var(--color-textSecondary)' }} />
                </button>
                {expandedSections.oneTime ? <div className="space-y-3 pt-1">{EVENTS.filter((e) => e.section === 'One-time').map((e) => renderEditor(activeProvider!, e.key))}</div> : null}
              </div>
            ) : null}
            {EVENTS.filter((e) => e.section === 'Recurring').length ? (
              <div className="space-y-3 rounded-3xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, recurring: !prev.recurring }))}
                  className="flex w-full items-start justify-between gap-4 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold">Recurring Tasks</p>
                    <p className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>Assigned, completed, and overdue alerts.</p>
                  </div>
                  <ChevronDown size={16} className={`mt-0.5 shrink-0 transition-transform ${expandedSections.recurring ? 'rotate-180' : ''}`} style={{ color: 'var(--color-textSecondary)' }} />
                </button>
                {expandedSections.recurring ? <div className="space-y-3 pt-1">{EVENTS.filter((e) => e.section === 'Recurring').map((e) => renderEditor(activeProvider!, e.key))}</div> : null}
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-3xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
              <div className="text-xs" style={{ color: 'var(--color-textSecondary)' }}>{currentLoading ? 'Loading templates...' : `${(currentTemplates || []).length} template(s) loaded.`}</div>
              <button type="button" onClick={() => fetchTemplates(activeProvider!)} disabled={!canRefreshTemplates} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: 'var(--color-border)' }}><RefreshCw size={14} />Reload Templates</button>
            </div>
            {currentError ? <p className="text-sm text-red-600">{currentError}</p> : null}
          </div>
        </div>
      </Modal>
    );
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-2" style={{ borderColor: 'var(--color-primary)' }} /></div>;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 pb-10">
      <div className="rounded-[28px] border bg-[var(--color-surface)] p-6 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: 'rgba(76,61,245,0.10)', color: 'var(--color-primary)' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <div className="mb-2 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ borderColor: 'rgba(76,61,245,0.14)', color: 'var(--color-primary)', backgroundColor: 'rgba(76,61,245,0.04)' }}>
                  WhatsApp automation hub
                </div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>Integrations</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--color-textSecondary)' }}>
                  Manage Interakt, WATI, and FiChat from one place. Provider settings stay compact on the cards, and template mapping stays inside the modal.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
            <div className="rounded-2xl border bg-[var(--color-background)] px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Providers</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Interakt, WATI, FiChat</p>
            </div>
            <div className="rounded-2xl border bg-[var(--color-background)] px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-textSecondary)' }}>Mode</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Card-based setup</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">{(['interakt', 'wati', 'fichat'] as ProviderKey[]).map(card)}</div>

      {providerForm()}
    </div>
  );
};

export default IntegrationsPage;
