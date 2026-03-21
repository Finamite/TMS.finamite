import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { address } from '../../utils/ipAddress';

export interface PcmFormField {
  id: string;
  name?: string;
  type?: string;
  label?: string;
  description?: string;
  placeholder?: string;
  options?: any[];
  required?: boolean;
  multiple?: boolean;
  sectionId?: string;
  minSelections?: number;
  maxSelections?: number;
  validation?: Array<Record<string, any>>;
  conditionalLogic?: Record<string, any> | null;
  visibilityConditions?: any;
  showIf?: any;
  allowedFileTypes?: string;
  selectedFileTypes?: string[];
}

export interface PcmFormSection {
  id: string;
  title?: string;
  description?: string;
  order?: number;
  nextSectionId?: string | 'submit';
  conditionalLogic?: Record<string, any> | null;
  visibilityConditions?: any;
}

export interface PcmPendingStep {
  runId: string;
  stepId: string;
  tenantId?: string;
  branchId?: string | null;
  workflowId?: string;
  workflowName?: string;
  displayId?: string | null;
  stepName: string;
  status: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  assignedUserIds?: string[];
  assignedUserNames?: string[];
  assignedUserEmails?: string[];
  isEscalated?: boolean;
  escalationCount?: number;
  formData?: Record<string, any>;
  formFields?: PcmFormField[];
  formSections?: PcmFormSection[];
  formHeader?: Record<string, any> | null;
  formTitle?: string | null;
  formDescription?: string | null;
  formThemeId?: string | null;
  tableHeaders?: any[];
  stepType?: string | null;
}

export interface PcmIntegrationSettings {
  enabled: boolean;
  hasApiKey?: boolean;
  pcmUserEmailMap?: Record<string, string>;
  showInDashboard?: boolean;
  showInPendingPages?: boolean;
}

interface PcmIntegrationResponse {
  enabled: boolean;
  count: number;
  steps: PcmPendingStep[];
  settings?: PcmIntegrationSettings;
}

const hasVisibleDueDate = (step: PcmPendingStep) =>
  Boolean(step.plannedEndAt || step.plannedStartAt || step.startedAt);

const INITIAL_SETTINGS: PcmIntegrationSettings = {
  enabled: false,
  pcmUserEmailMap: {},
  showInDashboard: true,
  showInPendingPages: true,
};

const POLL_INTERVAL_MS = 30000;

export const usePcmIntegration = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PcmIntegrationSettings>(INITIAL_SETTINGS);
  const [steps, setSteps] = useState<PcmPendingStep[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pcmUserEmailMapRef = useRef<Record<string, string>>({});

  const companyId = user?.company?.companyId;
  const userId = user?.id || '';
  const userEmail = user?.email || '';
  const userRole = user?.role || '';
  const isPcmAdmin = userRole === 'admin' || userRole === 'superadmin';
  const resolveEffectivePcmEmail = useCallback((settingsValue?: PcmIntegrationSettings) => {
    if (isPcmAdmin) return '';
    const map = settingsValue?.pcmUserEmailMap || pcmUserEmailMapRef.current || {};
    const mapped = String(map?.[String(userId || '').trim()] || '').trim().toLowerCase();
    return mapped || null;
  }, [isPcmAdmin, userEmail, userId]);

  const loadSettings = useCallback(async () => {
    if (!companyId) {
      setSettings(INITIAL_SETTINGS);
      return INITIAL_SETTINGS;
    }

    const response = await axios.get(`${address}/api/settings/pcm-integration`, {
      params: { companyId },
    });

    const nextSettings: PcmIntegrationSettings = {
      ...INITIAL_SETTINGS,
      ...response.data,
      enabled: Boolean(response.data?.enabled && response.data?.hasApiKey),
      hasApiKey: response.data?.hasApiKey ?? false,
      pcmUserEmailMap: response.data?.pcmUserEmailMap && typeof response.data.pcmUserEmailMap === 'object'
        ? response.data.pcmUserEmailMap
        : {},
      showInDashboard: response.data?.showInDashboard ?? true,
      showInPendingPages: response.data?.showInPendingPages ?? true,
    };

    pcmUserEmailMapRef.current = nextSettings.pcmUserEmailMap || {};
    setSettings(nextSettings);
    return nextSettings;
  }, [companyId]);

  const loadSteps = useCallback(async (settingsOverride?: PcmIntegrationSettings) => {
    if (!companyId) {
      setSteps([]);
      setCount(0);
      return [];
    }

    const effectiveEmail = resolveEffectivePcmEmail(settingsOverride);
    if (!isPcmAdmin && !effectiveEmail) {
      setSteps([]);
      setCount(0);
      return [];
    }

    const response = await axios.get<PcmIntegrationResponse>(`${address}/api/pcm-integration/pending-steps`, {
      params: {
        companyId,
        ...(effectiveEmail ? { userEmail: effectiveEmail } : {}),
        userRole,
      },
    });

    const payload = response.data || { enabled: false, count: 0, steps: [] };
    const nextSteps = Array.isArray(payload.steps) ? payload.steps : [];
    const visibleSteps = nextSteps.filter(hasVisibleDueDate);

    setSteps(visibleSteps);
    setCount(Number(visibleSteps.length || 0));
    return visibleSteps;
  }, [companyId, isPcmAdmin, resolveEffectivePcmEmail, userRole]);

  const refresh = useCallback(async () => {
    if (!companyId) return;

    setLoadingSteps(true);
    setError(null);
    try {
      const nextSettings = await loadSettings();
      if (nextSettings.enabled) {
        await loadSteps(nextSettings);
      } else {
        setSteps([]);
        setCount(0);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load PCM integration');
      setSteps([]);
      setCount(0);
    } finally {
      setLoading(false);
      setLoadingSteps(false);
    }
  }, [companyId, loadSettings, loadSteps]);

  const completeStep = useCallback(async (step: PcmPendingStep, remarks = '', formData: Record<string, any> = {}) => {
    if (!companyId) {
      throw new Error('Company ID is missing');
    }

    const response = await axios.post(`${address}/api/pcm-integration/steps/${encodeURIComponent(step.runId)}/${encodeURIComponent(step.stepId)}/complete`, {
      companyId,
      completedByEmail: String(userEmail || '').trim().toLowerCase(),
      remarks,
      formData,
    });

    await refresh();
    return response.data;
  }, [companyId, refresh, userEmail]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!settings.enabled) return;

    const timer = window.setInterval(() => {
      void loadSteps().catch((err: any) => {
        setError(err?.response?.data?.message || err?.message || 'Failed to refresh PCM steps');
      });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [settings.enabled, loadSteps]);

  return {
    enabled: settings.enabled,
    settings,
    steps,
    count,
    loading: loading || loadingSteps,
    loadingSteps,
    error,
    refresh,
    completeStep,
  };
};
