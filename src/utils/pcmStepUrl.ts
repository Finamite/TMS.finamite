import type { PcmPendingStep } from '../hooks/usePcmIntegration';

type PcmStepUrlContext = {
  companyId?: string;
  userEmail?: string;
  userRole?: string;
};

const replaceTokens = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_match, a, b) => {
    const key = String(a || b || '').trim();
    return encodeURIComponent(values[key] || '');
  });

export const buildPcmStepFormUrl = (step: PcmPendingStep, context: PcmStepUrlContext = {}) => {
  const template = String(import.meta.env.VITE_PCM_STEP_FORM_URL_TEMPLATE || '').trim();
  const baseUrl = String(import.meta.env.VITE_PCM_FRONTEND_URL || import.meta.env.VITE_PCM_WEB_URL || '').trim().replace(/\/+$/, '');

  const values = {
    runId: String(step.runId || '').trim(),
    stepId: String(step.stepId || '').trim(),
    companyId: String(context.companyId || '').trim(),
    userEmail: String(context.userEmail || '').trim(),
    userRole: String(context.userRole || '').trim(),
    displayId: String(step.displayId || '').trim(),
    workflowId: String(step.workflowId || '').trim(),
  };

  if (template) {
    return replaceTokens(template, values);
  }

  if (!baseUrl) return '';

  const url = new URL(`${baseUrl}/step-form`);
  Object.entries(values).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};
