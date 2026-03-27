import express from 'express';
import axios from 'axios';
import Settings from '../models/Settings.js';
import { decryptPcmSecret } from '../services/pcmSecret.js';

const router = express.Router();
const PCM_TIMEOUT_MS = 15000;
const PCM_BASE_URL = String(process.env.PCM_BASE_URL || 'http://localhost:5000')
  .trim()
  .replace(/\/+$/, '');
const PCM_ROUTE_PREFIX = String(process.env.PCM_API_PREFIX || '/api/workflow-runs')
  .trim()
  .replace(/\/+$/, '');

const getIntegrationSettings = async (companyId) => {
  if (!companyId) return null;
  const settings = await Settings.findOne({ type: 'pcmIntegration', companyId }).lean();
  return settings?.data || null;
};

const buildHeaders = (apiKey) => ({
  'x-pcm-api-key': String(apiKey || '').trim(),
});

const forwardPcmError = (res, error, fallbackMessage) => {
  const status = Number(error?.response?.status);
  const responseData = error?.response?.data;
  const isUpstreamAuthError = status === 401 || status === 403;
  const responseStatus = isUpstreamAuthError
    ? 502
    : (Number.isFinite(status) ? status : 502);

  if (responseData && typeof responseData === 'object') {
    return res.status(responseStatus).json(responseData);
  }

  return res.status(responseStatus).json({
    message:
      (responseData && typeof responseData === 'object' && responseData.message) ||
      fallbackMessage,
  });
};

router.get('/pending-steps', async (req, res) => {
  try {
    const { companyId, userEmail, userRole } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const settings = await getIntegrationSettings(companyId);
    if (!settings?.enabled) {
      return res.json({
        enabled: false,
        count: 0,
        steps: [],
        settings: {
          enabled: false,
          showInDashboard: false,
          showInPendingPages: false,
        },
      });
    }

    const pcmApiKeyEncrypted = String(settings.pcmApiKeyEncrypted || '').trim();
    let pcmApiKey = '';
    try {
      pcmApiKey = pcmApiKeyEncrypted ? decryptPcmSecret(pcmApiKeyEncrypted) : '';
    } catch (decryptError) {
      console.warn('PCM API key decryption failed for company:', companyId, decryptError?.message || decryptError);
      return res.json({
        message: 'PCM API key needs to be re-saved in PCM Integration settings',
        enabled: false,
        count: 0,
        steps: [],
        settings: {
          enabled: false,
          showInDashboard: settings.showInDashboard ?? true,
          showInPendingPages: settings.showInPendingPages ?? true,
        },
      });
    }

    if (!PCM_BASE_URL || !pcmApiKey) {
      return res.json({
        message: 'PCM integration settings are incomplete',
        enabled: false,
        count: 0,
        steps: [],
        settings: {
          enabled: false,
          showInDashboard: settings.showInDashboard ?? true,
          showInPendingPages: settings.showInPendingPages ?? true,
        },
      });
    }

    const params = {};
    const normalizedRole = String(userRole || '').trim().toLowerCase();
    const isAdminView = normalizedRole === 'admin' || normalizedRole === 'superadmin';
    const effectiveAssignedEmail = isAdminView ? '' : String(userEmail || '').trim().toLowerCase();
    if (effectiveAssignedEmail) {
      params.assignedEmail = effectiveAssignedEmail;
    }

    const pcmRes = await axios.get(`${PCM_BASE_URL}${PCM_ROUTE_PREFIX}/integrations/tms/pending-steps`, {
      params,
      headers: buildHeaders(pcmApiKey),
      timeout: PCM_TIMEOUT_MS,
    });

    const payload = pcmRes.data || {};
    const steps = Array.isArray(payload.steps)
      ? payload.steps.map((step) => ({
        ...step,
        sourceStatus: step?.status,
        status: isAdminView ? 'active' : step?.status,
      }))
      : [];

    res.json({
      enabled: true,
      count: Number(payload.count || 0),
      steps,
      settings: {
        enabled: true,
        showInDashboard: settings.showInDashboard ?? true,
        showInPendingPages: settings.showInPendingPages ?? true,
      },
    });
  } catch (error) {
    console.error('PCM pending steps proxy error:', error?.response?.data || error?.message || error);
    forwardPcmError(res, error, 'Failed to load PCM pending steps');
  }
});

router.post('/steps/:runId/:stepId/complete', async (req, res) => {
  try {
    const { companyId, completedByEmail, remarks, formData } = req.body || {};
    const { runId, stepId } = req.params;

    if (!companyId) {
      return res.status(400).json({ message: 'companyId required' });
    }

    const settings = await getIntegrationSettings(companyId);
    if (!settings?.enabled) {
      return res.status(400).json({ message: 'PCM integration is disabled' });
    }

    const pcmApiKeyEncrypted = String(settings.pcmApiKeyEncrypted || '').trim();
    let pcmApiKey = '';
    try {
      pcmApiKey = pcmApiKeyEncrypted ? decryptPcmSecret(pcmApiKeyEncrypted) : '';
    } catch (decryptError) {
      console.warn('PCM API key decryption failed for company:', companyId, decryptError?.message || decryptError);
      return res.status(400).json({
        message: 'PCM API key needs to be re-saved in PCM Integration settings',
      });
    }

    if (!PCM_BASE_URL || !pcmApiKey) {
      return res.status(400).json({ message: 'PCM integration settings are incomplete' });
    }

    const pcmRes = await axios.post(
      `${PCM_BASE_URL}${PCM_ROUTE_PREFIX}/integrations/tms/complete-step`,
      {
        runId,
        stepId,
        completedByEmail: String(completedByEmail || '').trim(),
        remarks: String(remarks || '').trim(),
        formData: formData || {},
        sourceCompanyId: companyId,
      },
      {
        headers: buildHeaders(pcmApiKey),
        timeout: PCM_TIMEOUT_MS,
      }
    );

    res.json({
      message: 'PCM step completed successfully',
      data: pcmRes.data,
    });
  } catch (error) {
    console.error('PCM step completion proxy error:', error?.response?.data || error?.message || error);
    forwardPcmError(res, error, 'Failed to complete PCM step');
  }
});

export default router;
