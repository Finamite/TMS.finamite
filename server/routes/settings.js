// routes/settings.js
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { google } from 'googleapis';
import Settings from '../models/Settings.js';
import User from '../models/User.js'; // ✅ ADD MISSING IMPORT
import { sendSystemEmail } from '../Utils/sendEmail.js'; // ✅ ADD MISSING IMPORT
import { restartReportCron } from '../routes/reportmail.js';
import Task from "../models/Task.js";
import { encryptPcmSecret, getPcmSecretTail, maskPcmSecret } from '../services/pcmSecret.js';
import {
  createDefaultWhatsappSettings,
  getOrCreateWhatsappSettings,
  normalizeWhatsappSettings,
  TASK_TEMPLATE_VARIABLE_OPTIONS
} from '../services/taskWhatsapp.js';

dotenv.config();

const router = express.Router();

const defaultTaskCompletionSettings = {
  enabled: false,
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
};

const normalizeTaskCompletionSection = (section = {}) => {
  const allowAttachments = Boolean(section.allowAttachments);
  return {
    allowAttachments,
    mandatoryAttachments: allowAttachments ? Boolean(section.mandatoryAttachments) : false,
    mandatoryRemarks: Boolean(section.mandatoryRemarks)
  };
};

const defaultTaskCalendarSettings = {
  enabled: false,
  holidays: [],
  monthWeekOffRules: []
};

const normalizeNumericArray = (value, allowedValues = []) => {
  const allowed = new Set(allowedValues);
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && allowed.has(item))
  )].sort((a, b) => a - b);
};

const normalizeHolidayDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeHolidayValue = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const date = normalizeHolidayDate(value.date);
    const name = String(value.name || '').trim();
    if (!date || !name) return null;
    return { date, name };
  }

  const legacyDate = normalizeHolidayDate(value);
  if (!legacyDate) return null;
  return {
    date: legacyDate,
    name: 'Holiday'
  };
};

const normalizeTaskCalendarSettings = (data = {}) => ({
  enabled: Boolean(data.enabled),
  holidays: Array.from(
    new Map(
      (Array.isArray(data.holidays) ? data.holidays : [])
        .map(normalizeHolidayValue)
        .filter(Boolean)
        .map((holiday) => [`${holiday.date}__${holiday.name.toLowerCase()}`, holiday])
    ).values()
  ).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.name.localeCompare(b.name);
  }),
  monthWeekOffRules: Array.from(
    new Map(
      [
        ...(Array.isArray(data.monthWeekOffRules) ? data.monthWeekOffRules : []),
        ...normalizeNumericArray(data.weeklyOffDays, [0, 1, 2, 3, 4, 5, 6]).flatMap((weekday) =>
          [1, 2, 3, 4, 5].map((occurrence) => ({ weekday, occurrence }))
        ),
        ...normalizeNumericArray(data.saturdayOffOccurrences, [1, 2, 3, 4, 5]).map((occurrence) => ({
          weekday: 6,
          occurrence
        }))
      ]
        .map((rule) => {
          const weekday = Number(rule?.weekday);
          const occurrence = Number(rule?.occurrence);
          if (
            !Number.isInteger(weekday) ||
            weekday < 0 ||
            weekday > 6 ||
            !Number.isInteger(occurrence) ||
            occurrence < 1 ||
            occurrence > 5
          ) {
            return null;
          }

          return { weekday, occurrence };
        })
        .filter(Boolean)
        .map((rule) => [`${rule.occurrence}-${rule.weekday}`, rule])
    ).values()
  ).sort((a, b) => {
    if (a.occurrence !== b.occurrence) return a.occurrence - b.occurrence;
    return a.weekday - b.weekday;
  })
});

const WHATSAPP_PROVIDER_KEYS = ['interakt', 'wati', 'fichat'];
const FICHAT_CONNECT_STATE_TTL_MS = 10 * 60 * 1000;
const FICHAT_TEMPLATE_BODY_CACHE_TTL_MS = 2 * 60 * 1000;
const pendingFiChatConnectState = new Map();
const pendingFiChatTemplateBodyCache = new Map();
const FICHAT_ENV_CONFIG = {
  baseUrl: String(process.env.FICHAT_BASE_URL || process.env.FICHAT_API_BASE_URL || process.env.FICHAT_URL || '').trim(),
  connectUrlTemplate: String(process.env.FICHAT_CONNECT_URL_TEMPLATE || process.env.FICHAT_AUTH_URL || process.env.FICHAT_LOGIN_URL || '').trim(),
  clientId: String(process.env.FICHAT_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.FICHAT_CLIENT_SECRET || '').trim(),
  redirectUri: String(process.env.FICHAT_REDIRECT_URI || '').trim(),
  partnerAppBaseUrl: String(process.env.PARTNER_APP_BASE_URL || '').trim(),
  scope: String(process.env.FICHAT_SCOPE || '').trim(),
  accessToken: String(process.env.FICHAT_ACCESS_TOKEN || process.env.FICHAT_TOKEN || '').trim(),
  templateLanguage: String(process.env.FICHAT_TEMPLATE_LANGUAGE || 'en_US').trim() || 'en_US'
};

const normalizeFiChatLanguage = (value = '') => {
  const language = String(value || '').trim();
  if (!language) return 'en_US';
  if (language.toLowerCase() === 'en') return 'en_US';
  return language;
};

const prunePendingFiChatConnectState = () => {
  const now = Date.now();
  for (const [state, value] of pendingFiChatConnectState.entries()) {
    if (!value || now - Number(value.createdAt || 0) > FICHAT_CONNECT_STATE_TTL_MS) {
      pendingFiChatConnectState.delete(state);
    }
  }
};

const prunePendingFiChatTemplateBodyCache = () => {
  const now = Date.now();
  for (const [cacheKey, value] of pendingFiChatTemplateBodyCache.entries()) {
    if (!value || now - Number(value.createdAt || 0) > FICHAT_TEMPLATE_BODY_CACHE_TTL_MS) {
      pendingFiChatTemplateBodyCache.delete(cacheKey);
    }
  }
};

const normalizeTextArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === 'string' ? [item] : [item?.name, item?.key, item?.value, item?.placeholder, item?.variable]))
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const extractTemplateBody = (tpl = {}) => {
  const directCandidates = [
    tpl?.body,
    tpl?.templateBody,
    tpl?.message,
    tpl?.content,
    tpl?.text,
    tpl?.preview,
    tpl?.templateText,
    tpl?.bodyText
  ];

  const direct = directCandidates.find((item) => typeof item === 'string' && item.trim());
  if (direct) return String(direct).trim();

  const segments = Array.isArray(tpl?.components) ? tpl.components : Array.isArray(tpl?.messageTemplateComponents) ? tpl.messageTemplateComponents : [];
  const segmentText = segments
    .map((segment) =>
      String(
        segment?.text ||
          segment?.body ||
          segment?.message ||
          segment?.content ||
          segment?.value ||
          segment?.templateText ||
          ''
      ).trim()
    )
    .filter(Boolean)
    .join('\n');

  return segmentText;
};

const pickTextLikeValue = (input) => {
  if (!input) return '';

  const stack = [input];
  while (stack.length) {
    const item = stack.pop();
    if (!item) continue;

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;
      if (/\{\{\d+\}\}/.test(trimmed)) return trimmed;
      continue;
    }

    if (Array.isArray(item)) {
      for (const child of item) stack.push(child);
      continue;
    }

    if (typeof item === 'object') {
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) continue;
          if (/(body|text|content|preview|message|templateText)/i.test(key)) {
            return trimmed;
          }
          if (/\{\{\d+\}\}/.test(trimmed)) {
            return trimmed;
          }
        } else {
          stack.push(value);
        }
      }
    }
  }

  return '';
};

const extractTemplateVariables = (tpl = {}, body = '') => {
  const detected = new Set();

  normalizeTextArray(tpl?.variables).forEach((item) => detected.add(item));
  normalizeTextArray(tpl?.customParams).forEach((item) => detected.add(item));
  normalizeTextArray(tpl?.placeholders).forEach((item) => detected.add(item));
  normalizeTextArray(tpl?.templateVariables).forEach((item) => detected.add(item));
  normalizeTextArray(tpl?.bodyVariables).forEach((item) => detected.add(item));

  const bodySource = String(body || extractTemplateBody(tpl) || '');
  const bodyMatches = Array.from(bodySource.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g));
  bodyMatches.forEach((match) => {
    const token = String(match?.[1] || '').trim();
    if (token) detected.add(token);
  });

  return Array.from(detected);
};

const normalizeTemplateList = (data = {}) => {
  const candidates = [
    Array.isArray(data) ? data : null,
    data?.templates,
    data?.data?.templates,
    data?.data,
    data?.data?.data,
    data?.data?.messageTemplates,
    data?.data?.whatsAppTemplates,
    data?.data?.whatsappTemplates,
    data?.data?.result?.templates,
    data?.data?.result?.messageTemplates,
    data?.results?.templates,
    data?.data?.results?.templates,
    data?.result?.templates,
    data?.result?.data,
    data?.result?.messageTemplates,
    data?.whatsappTemplates,
    data?.data?.whatsappTemplates,
    data?.messageTemplates,
    data?.message_templates,
    data?.whatsAppTemplates,
    data?.templateList,
    data?.data?.templateList,
    data?.template_list,
    data?.data?.template_list,
    data?.result?.templates
  ];

  const list = candidates.find((item) => Array.isArray(item)) || [];
  return list
    .map((tpl) => {
      const name = String(
        tpl?.name || tpl?.templateName || tpl?.elementName || tpl?.id || ''
      ).trim();
      const language = String(
        tpl?.language || tpl?.languageCode || tpl?.locale || tpl?.lang || 'en'
      ).trim();
      const status = String(
        tpl?.status || tpl?.templateStatus || tpl?.approvalStatus || tpl?.state || 'approved'
      ).trim().toLowerCase();
      const body = pickTemplateBodyFromAny(tpl) || extractTemplateBody(tpl);
      const variables = extractTemplateVariables(tpl, body);
      const placeholderCount = Number(
        tpl?.placeholderCount ||
          tpl?.customParams?.length ||
          tpl?.placeholders?.length ||
          tpl?.variables?.length ||
          parsePlaceholderCountFromAny(body) ||
          variables.length ||
          0
      );

      return { name, language, status, placeholderCount, body, variables };
    })
    .filter((tpl) => tpl.name);
};

const buildWatiAuthHeaders = (apiKey = '') => {
  const token = String(apiKey || '').trim();
  return token
    ? [
        { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        { Authorization: token, 'Content-Type': 'application/json' }
      ]
    : [{ 'Content-Type': 'application/json' }];
};

const isApprovedTemplate = (template = {}) => {
  const status = String(
    template?.status ||
      template?.templateStatus ||
      template?.approvalStatus ||
      template?.state ||
      ''
  ).trim().toLowerCase();
  return !status || status === 'approved';
};

const parsePlaceholderCountFromAny = (input) => {
  let max = 0;
  const stack = [input];

  while (stack.length) {
    const item = stack.pop();
    if (item === null || item === undefined) continue;

    if (typeof item === 'string') {
      const matches = item.match(/\{\{(\d+)\}\}/g) || [];
      for (const token of matches) {
        const num = Number((token.match(/\d+/) || [])[0] || 0);
        if (num > max) max = num;
      }
      continue;
    }

    if (Array.isArray(item)) {
      for (const child of item) stack.push(child);
      continue;
    }

    if (typeof item === 'object') {
      for (const child of Object.values(item)) stack.push(child);
    }
  }

  return max;
};

const pickTemplateBodyFromAny = (input) => {
  if (!input) return '';

  const directCandidates = [
    input?.body,
    input?.text,
    input?.preview,
    input?.content,
    input?.templateBody,
    input?.template?.body,
    input?.template?.text,
    input?.template?.preview,
    input?.data?.body,
    input?.data?.text,
    input?.data?.preview,
    input?.data?.template?.body,
    input?.data?.template?.preview
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  if (directCandidates.length > 0) return directCandidates[0];
  return pickTextLikeValue(input);
};

const buildSyntheticTemplateBody = (templateName = '', placeholderCount = 0) => {
  const count = Number(placeholderCount || 0) || 0;
  const lines = [];
  const header = String(templateName || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  if (header) {
    lines.push(header);
  }
  for (let index = 1; index <= count; index += 1) {
    lines.push(`{{${index}}}`);
  }
  return lines.join('\n').trim();
};

const buildSavedTemplateFallback = (settingsData = {}, provider = 'interakt') => {
  const language =
    provider === 'fichat'
      ? String(settingsData?.fichat?.templateLanguage || 'en_US').trim() || 'en_US'
      : provider === 'wati'
        ? 'en'
        : String(settingsData?.interakt?.templateLanguage || 'en').trim() || 'en';

  const configMap =
    provider === 'fichat'
      ? settingsData?.fichat?.configs
      : provider === 'wati'
        ? settingsData?.wati?.configs
        : settingsData?.interakt?.configs;

  return Object.entries(configMap || {})
    .map(([, config]) => ({
      name: String(config?.templateName || '').trim(),
      language,
      status: 'approved',
      placeholderCount: Array.isArray(config?.templateVariables)
        ? config.templateVariables.length
        : 0
    }))
    .filter((tpl) => tpl.name);
};

const fetchInteraktTemplates = async (apiKey) => {
  const urls = [
    'https://api.interakt.ai/v1/public/track/organization/templates?offset=0&autosubmitted_for=all&approval_status=APPROVED&language=all',
    'https://api.interakt.ai/v1/public/message/templates?offset=0&limit=500',
    'https://api.interakt.ai/v1/public/templates?offset=0&limit=500',
    'https://api.interakt.ai/v1/public/apis/templates?offset=0&limit=500'
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Basic ${apiKey}` },
        timeout: 15000
      });
      const templates = normalizeTemplateList(response.data);
      if (templates.length) {
        return { templates, source: url };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return { templates: [], source: 'interakt_api', error: lastError };
};

const sanitizeWatiEndpoint = (value = '') => String(value || '').trim().replace(/\/+$/, '');

const buildWatiBases = (endpoint = '') => {
  const normalized = sanitizeWatiEndpoint(endpoint);
  if (!normalized) return [];

  const stripped = normalized.replace(/\/api\/(v[12]|ext\/v3)$/i, '');

  return Array.from(
    new Set(
      [
        normalized,
        stripped,
        `${stripped}/api/v1`,
        `${stripped}/api/v2`,
        `${stripped}/api/ext/v3`
      ].filter(Boolean)
    )
  );
};

const fetchWatiTemplates = async (apiKey, apiEndpoint) => {
  const urls = buildWatiBases(apiEndpoint).flatMap((base) => [
    `${base}/getMessageTemplates`,
    `${base}/getMessageTemplates?status=approved`,
    `${base}/getMessageTemplates?pageSize=500&pageNumber=1`,
    `${base}/messageTemplates?status=approved`,
    `${base}/templates`,
    `${base}/messageTemplates`,
    `${base}/whatsappTemplates`,
    `${base}/whatsApp/templates`,
    `${base}/whatsapp/templates`
  ]);

  let lastError = null;
  for (const url of urls) {
    for (const headers of buildWatiAuthHeaders(apiKey)) {
      try {
        const response = await axios.get(url, {
          headers,
          timeout: 15000
        });
        const templates = normalizeTemplateList(response.data).filter(isApprovedTemplate);
        if (templates.length) {
          return { templates, source: url };
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  return { templates: [], source: 'wati_api', error: lastError };
};

const fetchFiChatTemplates = async (baseUrl, accessToken) => {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!cleanBase) return { templates: [], source: 'fichat_api' };

  try {
    const response = await axios.get(
      `${cleanBase}/api/public/v1/templates?approvedOnly=true&sync=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return {
      templates: normalizeTemplateList(response.data).map((tpl) => ({
        ...tpl,
        language: normalizeFiChatLanguage(tpl.language)
      })),
      source: cleanBase
    };
  } catch (error) {
    return { templates: [], source: 'fichat_api', error };
  }
};

const fetchFiChatTemplateDetail = async (baseUrl, accessToken, templateName, language = '') => {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const encodedName = encodeURIComponent(String(templateName || '').trim());
  const encodedLanguage = encodeURIComponent(String(language || '').trim());
  const candidates = [
    `${cleanBase}/api/public/v1/templates?templateName=${encodedName}&language=${encodedLanguage}&approvedOnly=true&sync=true`,
    `${cleanBase}/api/public/v1/templates?name=${encodedName}&language=${encodedLanguage}&approvedOnly=true&sync=true`,
    `${cleanBase}/api/public/v1/templates/${encodedName}`,
    `${cleanBase}/api/public/v1/templates/${encodedName}?language=${encodedLanguage}`,
    `${cleanBase}/api/public/v1/templates/${encodedName}/body`,
    `${cleanBase}/api/public/v1/templates/${encodedName}/details`,
    `${cleanBase}/api/public/v1/templates/details/${encodedName}`,
    `${cleanBase}/api/public/v1/template/${encodedName}`,
    `${cleanBase}/api/public/v1/template/${encodedName}?language=${encodedLanguage}`,
    `${cleanBase}/api/public/v1/template/${encodedName}/body`,
    `${cleanBase}/api/public/v1/template/${encodedName}/details`,
  ].filter(Boolean);

  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000,
        validateStatus: () => true
      });

      if (response.status < 200 || response.status >= 300) {
        lastError = new Error(`HTTP ${response.status} @ ${url}`);
        continue;
      }

      return { body: response.data, source: url };
    } catch (error) {
      lastError = error;
    }
  }

  return { body: null, source: 'fichat_api', error: lastError };
};

const findMatchingTemplate = (templates = [], templateName = '', language = '') => {
  const normalizedName = String(templateName || '').trim().toLowerCase();
  const normalizedLanguage = normalizeFiChatLanguage(language).toLowerCase();
  if (!normalizedName) return null;

  return (
    templates.find((tpl) => {
      const candidateName = String(tpl?.name || tpl?.templateName || '').trim().toLowerCase();
      const candidateLanguage = normalizeFiChatLanguage(tpl?.language || tpl?.languageCode || tpl?.locale || 'en_US').toLowerCase();
      return candidateName === normalizedName && (!normalizedLanguage || candidateLanguage === normalizedLanguage);
    }) ||
    templates.find((tpl) => String(tpl?.name || tpl?.templateName || '').trim().toLowerCase() === normalizedName) ||
    null
  );
};

const resolveFiChatRuntimeConfig = (providerSettings = {}) => ({
  baseUrl: String(providerSettings?.baseUrl || '').trim() || FICHAT_ENV_CONFIG.baseUrl,
  accessToken: String(providerSettings?.accessToken || '').trim() || FICHAT_ENV_CONFIG.accessToken,
  templateLanguage: String(providerSettings?.templateLanguage || '').trim() || FICHAT_ENV_CONFIG.templateLanguage
});

const replaceFiChatTemplateTokens = (template = '', values = {}) =>
  String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_]+)\s*\}/g, (match, braceKey, dollarKey) => {
    const key = String(braceKey || dollarKey || '').trim();
    const normalizedKey = key.toLowerCase();
    const lookup = {
      companyid: values.companyId,
      state: values.state,
      clientid: values.clientId,
      redirecturi: values.redirectUri,
      partnerappbaseurl: values.partnerAppBaseUrl,
      baseurl: values.baseUrl,
      scope: values.scope,
      responsetype: values.responseType,
      response_type: values.responseType
    };

    return lookup[normalizedKey] ?? match;
  });

const buildFiChatAuthUrl = (companyId, options = {}) => {
  const template = FICHAT_ENV_CONFIG.connectUrlTemplate;
  if (!template) return '';

  const resolved = replaceFiChatTemplateTokens(template, {
    companyId,
    state: options.state || companyId,
    clientId: FICHAT_ENV_CONFIG.clientId,
    redirectUri: FICHAT_ENV_CONFIG.redirectUri,
    partnerAppBaseUrl: FICHAT_ENV_CONFIG.partnerAppBaseUrl,
    baseUrl: FICHAT_ENV_CONFIG.baseUrl,
    scope: FICHAT_ENV_CONFIG.scope,
    responseType: 'code',
    codeChallenge: options.codeChallenge || '',
    code_challenge: options.codeChallenge || ''
  });

  try {
    const base = FICHAT_ENV_CONFIG.partnerAppBaseUrl || FICHAT_ENV_CONFIG.baseUrl;
    const url = /^https?:\/\//i.test(resolved) ? new URL(resolved) : new URL(resolved, base || undefined);

    const state = String(options.state || companyId || '').trim();
    if (state) {
      url.searchParams.set('state', state);
    }
    if (FICHAT_ENV_CONFIG.clientId && !url.searchParams.has('client_id')) {
      url.searchParams.set('client_id', FICHAT_ENV_CONFIG.clientId);
    }
    if (FICHAT_ENV_CONFIG.redirectUri && !url.searchParams.has('redirect_uri')) {
      url.searchParams.set('redirect_uri', FICHAT_ENV_CONFIG.redirectUri);
    }
    if (FICHAT_ENV_CONFIG.scope && !url.searchParams.has('scope')) {
      url.searchParams.set('scope', FICHAT_ENV_CONFIG.scope);
    }
    if (FICHAT_ENV_CONFIG.baseUrl && !url.searchParams.has('base_url')) {
      url.searchParams.set('base_url', FICHAT_ENV_CONFIG.baseUrl);
    }
    if (FICHAT_ENV_CONFIG.partnerAppBaseUrl && !url.searchParams.has('partner_app_base_url')) {
      url.searchParams.set('partner_app_base_url', FICHAT_ENV_CONFIG.partnerAppBaseUrl);
    }
    if (!url.searchParams.has('response_type')) {
      url.searchParams.set('response_type', 'code');
    }
    if (String(options.codeChallenge || '').trim()) {
      url.searchParams.set('code_challenge', String(options.codeChallenge).trim());
      if (!url.searchParams.has('code_challenge_method')) {
        url.searchParams.set('code_challenge_method', 'S256');
      }
    }

    return url.toString();
  } catch {
    return resolved;
  }
};

const normalizeFiChatBaseUrl = (value = '') => String(value || '').trim().replace(/\/+$/, '');

const getFiChatTokenUrl = () => {
  const configuredUrl = String(process.env.FICHAT_TOKEN_URL || process.env.FICHAT_OAUTH_TOKEN_URL || '').trim();
  if (configuredUrl) return configuredUrl;

  const baseUrl = normalizeFiChatBaseUrl(FICHAT_ENV_CONFIG.baseUrl);
  if (!baseUrl) return '';

  return `${baseUrl}/api/oauth/token`;
};

const exchangeFiChatCodeForToken = async (code, codeVerifier = '') => {
  if (!FICHAT_ENV_CONFIG.clientId || !FICHAT_ENV_CONFIG.clientSecret) {
    throw new Error('FiChat OAuth token settings are incomplete');
  }

  const payload = new URLSearchParams();
  payload.set('grant_type', 'authorization_code');
  payload.set('code', String(code));
  if (FICHAT_ENV_CONFIG.redirectUri) {
    payload.set('redirect_uri', FICHAT_ENV_CONFIG.redirectUri);
  }
  if (String(codeVerifier || '').trim()) {
    payload.set('code_verifier', String(codeVerifier).trim());
  }

  const tokenUrl = getFiChatTokenUrl();
  if (!tokenUrl) {
    throw new Error('FiChat token endpoint is not configured');
  }

  try {
    const response = await axios.post(tokenUrl, payload.toString(), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${FICHAT_ENV_CONFIG.clientId}:${FICHAT_ENV_CONFIG.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    });

    return response.data || {};
  } catch (error) {
    const errorDescription = String(error?.response?.data?.error_description || error?.response?.data?.message || '').toLowerCase();
    if (error?.response?.status === 400 && errorDescription.includes('already used')) {
      const alreadyUsedError = new Error('FiChat authorization code already used');
      alreadyUsedError.alreadyUsed = true;
      alreadyUsedError.responseData = error.response.data || null;
      throw alreadyUsedError;
    }
    throw error;
  }
};

// --- Ensure env variables are present ---
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.warn("Missing Google OAuth environment variables");
}

// Helper to create a new OAuth2 client
const createOAuthClient = () =>
  new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

// ---------------------------
// Task Completion endpoints
// ---------------------------
router.get('/task-completion', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'taskCompletion', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'taskCompletion',
        companyId,
        data: defaultTaskCompletionSettings
      });
      await settings.save();
    }

    res.json({
      ...defaultTaskCompletionSettings,
      ...(settings.data || {}),
      pendingTasks: {
        ...defaultTaskCompletionSettings.pendingTasks,
        ...normalizeTaskCompletionSection(settings.data?.pendingTasks)
      },
      pendingRecurringTasks: {
        ...defaultTaskCompletionSettings.pendingRecurringTasks,
        ...normalizeTaskCompletionSection(settings.data?.pendingRecurringTasks)
      }
    });
  } catch (error) {
    console.error('Error fetching task completion settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/task-completion', async (req, res) => {
  try {
    const { companyId, enabled, pendingTasks, pendingRecurringTasks } = req.body;

    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const payload = {
      ...defaultTaskCompletionSettings,
      enabled: enabled ?? false,
      pendingTasks: {
        ...defaultTaskCompletionSettings.pendingTasks,
        ...normalizeTaskCompletionSection(pendingTasks)
      },
      pendingRecurringTasks: {
        ...defaultTaskCompletionSettings.pendingRecurringTasks,
        ...normalizeTaskCompletionSection(pendingRecurringTasks)
      }
    };

    const settings = await Settings.findOneAndUpdate(
      { type: 'taskCompletion', companyId },
      { $set: { data: payload } },
      { upsert: true, new: true }
    );

    res.json({ message: 'Settings saved', data: settings.data });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------
// Task Calendar endpoints
// ---------------------------
router.get('/task-calendar', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'taskCalendar', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'taskCalendar',
        companyId,
        data: defaultTaskCalendarSettings
      });
      await settings.save();
    }

    res.json({
      ...defaultTaskCalendarSettings,
      ...normalizeTaskCalendarSettings(settings.data || {})
    });
  } catch (error) {
    console.error('Error fetching task calendar settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/task-calendar', async (req, res) => {
  try {
    const { companyId, enabled, holidays, monthWeekOffRules, weeklyOffDays, saturdayOffOccurrences } = req.body;

    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const payload = normalizeTaskCalendarSettings({
      ...defaultTaskCalendarSettings,
      enabled,
      holidays,
      monthWeekOffRules,
      weeklyOffDays,
      saturdayOffOccurrences
    });

    const settings = await Settings.findOneAndUpdate(
      { type: 'taskCalendar', companyId },
      { $set: { data: payload } },
      { upsert: true, new: true }
    );

    res.json({ message: 'Task calendar settings saved', data: settings.data });
  } catch (error) {
    console.error('Error saving task calendar settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------
// PCM Integration endpoints
// ---------------------------
router.get('/pcm-integration', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'pcmIntegration', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'pcmIntegration',
        companyId,
        data: {
          enabled: false,
          pcmApiKeyEncrypted: '',
          pcmApiKeyLast4: '',
          pcmUserEmailMap: {},
          showInDashboard: true,
          showInPendingPages: true
        }
      });
      await settings.save();
    }

    const data = settings.data || {};
    res.json({
      ...data,
      hasApiKey: Boolean(data.pcmApiKeyEncrypted),
      pcmApiKeyLast4: String(data.pcmApiKeyLast4 || ''),
      pcmApiKeyMasked: maskPcmSecret(data.pcmApiKeyLast4),
      pcmUserEmailMap: data.pcmUserEmailMap && typeof data.pcmUserEmailMap === 'object' ? data.pcmUserEmailMap : {},
      pcmApiKey: '',
    });
  } catch (error) {
    console.error('Error fetching PCM integration settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/pcm-integration', async (req, res) => {
  try {
    const {
      companyId,
      enabled,
      pcmApiKey,
      pcmUserEmailMap,
      showInDashboard,
      showInPendingPages
    } = req.body;

    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const payload = {
      enabled: enabled ?? false,
      showInDashboard: showInDashboard ?? true,
      showInPendingPages: showInPendingPages ?? true,
    };

    const existing = await Settings.findOne({ type: 'pcmIntegration', companyId }).lean();
    const existingData = existing?.data || {};
    const incomingApiKey = String(pcmApiKey || '').trim();
    if (incomingApiKey) {
      payload.pcmApiKeyEncrypted = encryptPcmSecret(incomingApiKey);
      payload.pcmApiKeyLast4 = getPcmSecretTail(incomingApiKey);
    } else if (String(existingData.pcmApiKeyEncrypted || '').trim()) {
      payload.pcmApiKeyEncrypted = String(existingData.pcmApiKeyEncrypted || '').trim();
      payload.pcmApiKeyLast4 = String(existingData.pcmApiKeyLast4 || '').trim();
    } else {
      payload.pcmApiKeyEncrypted = '';
      payload.pcmApiKeyLast4 = '';
    }

    const hasIncomingMap = Object.prototype.hasOwnProperty.call(req.body || {}, 'pcmUserEmailMap');
    const normalizedMap = {};
    if (hasIncomingMap && pcmUserEmailMap && typeof pcmUserEmailMap === 'object' && !Array.isArray(pcmUserEmailMap)) {
      Object.entries(pcmUserEmailMap).forEach(([userId, pcmEmail]) => {
        const cleanUserId = String(userId || '').trim();
        const cleanPcmEmail = String(pcmEmail || '').trim().toLowerCase();
        if (cleanUserId && cleanPcmEmail) {
          normalizedMap[cleanUserId] = cleanPcmEmail;
        }
      });
    }
    payload.pcmUserEmailMap = hasIncomingMap
      ? normalizedMap
      : (existingData.pcmUserEmailMap && typeof existingData.pcmUserEmailMap === 'object'
        ? existingData.pcmUserEmailMap
        : {});

    const settings = await Settings.findOneAndUpdate(
      { type: 'pcmIntegration', companyId },
      { $set: { data: payload } },
      { upsert: true, new: true }
    );

    const data = settings.data || {};
    res.json({
      message: 'PCM integration settings saved',
      data: {
        ...data,
        hasApiKey: Boolean(data.pcmApiKeyEncrypted),
        pcmApiKeyMasked: maskPcmSecret(data.pcmApiKeyLast4),
        pcmUserEmailMap: data.pcmUserEmailMap && typeof data.pcmUserEmailMap === 'object' ? data.pcmUserEmailMap : {},
        pcmApiKey: '',
      },
    });
  } catch (error) {
    console.error('Error saving PCM integration settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------
// Task WhatsApp Integration endpoints
// ---------------------------
router.get('/whatsapp', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const settings = await getOrCreateWhatsappSettings(companyId);
    res.json({
      ...settings,
      supportedVariableKeys: TASK_TEMPLATE_VARIABLE_OPTIONS
    });
  } catch (error) {
    console.error('Error fetching WhatsApp settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/whatsapp', async (req, res) => {
  try {
    const { companyId, ...incoming } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const existing = await Settings.findOne({ type: 'whatsapp', companyId }).lean();
    const merged = {
      ...(existing?.data || createDefaultWhatsappSettings()),
      ...incoming
    };
    const normalized = normalizeWhatsappSettings(merged);

    const settings = await Settings.findOneAndUpdate(
      { type: 'whatsapp', companyId },
      { $set: { data: normalized } },
      { upsert: true, new: true }
    );

    res.json({
      message: 'WhatsApp integration settings saved',
      data: {
        ...normalizeWhatsappSettings(settings.data || {}),
        supportedVariableKeys: TASK_TEMPLATE_VARIABLE_OPTIONS
      }
    });
  } catch (error) {
    console.error('Error saving WhatsApp settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/whatsapp/templates', async (req, res) => {
  try {
    const { companyId, provider } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!WHATSAPP_PROVIDER_KEYS.includes(normalizedProvider)) {
      return res.status(400).json({ message: 'provider must be interakt, wati, or fichat' });
    }

    const settings = await getOrCreateWhatsappSettings(companyId);
    const providerSettings = settings?.[normalizedProvider] || {};

    let result = { templates: [], source: `${normalizedProvider}_api` };
    if (normalizedProvider === 'interakt') {
      const apiKey = String(providerSettings.apiKey || '').trim();
      if (!apiKey) {
        return res.status(400).json({ message: 'Interakt API key is required before fetching templates' });
      }
      result = await fetchInteraktTemplates(apiKey);
    } else if (normalizedProvider === 'wati') {
      const apiKey = String(providerSettings.apiKey || '').trim();
      const apiEndpoint = String(providerSettings.apiEndpoint || '').trim();
      if (!apiKey || !apiEndpoint) {
        return res.status(400).json({ message: 'WATI API key and endpoint are required before fetching templates' });
      }
      result = await fetchWatiTemplates(apiKey, apiEndpoint);
    } else if (normalizedProvider === 'fichat') {
      const resolvedFiChat = resolveFiChatRuntimeConfig(providerSettings);
      if (!resolvedFiChat.baseUrl || !resolvedFiChat.accessToken) {
        return res.status(400).json({
          message: 'FiChat base URL and access token must be set in the backend environment or saved in settings before fetching templates'
        });
      }
      result = await fetchFiChatTemplates(resolvedFiChat.baseUrl, resolvedFiChat.accessToken);
    }

    const fallbackTemplates = buildSavedTemplateFallback(settings, normalizedProvider);
    const templates = (result.templates || []).length > 0 ? result.templates : fallbackTemplates;

    return res.json({
      provider: normalizedProvider,
      templates,
      variableKeys: TASK_TEMPLATE_VARIABLE_OPTIONS,
      source: result.source || `${normalizedProvider}_api`,
      warning: (result.templates || []).length > 0
        ? ''
        : 'Using templates saved in settings because the provider list endpoint did not return results.'
    });
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/whatsapp/template-body', async (req, res) => {
  try {
    const { companyId, provider, name, language } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!WHATSAPP_PROVIDER_KEYS.includes(normalizedProvider)) {
      return res.status(400).json({ message: 'provider must be interakt, wati, or fichat' });
    }

    const templateName = String(name || '').trim();
    if (!templateName) {
      return res.status(400).json({ message: 'Template name is required' });
    }

    const settings = await getOrCreateWhatsappSettings(companyId);
    const providerSettings = settings?.[normalizedProvider] || {};
    const encodedName = encodeURIComponent(templateName);
    const normalizedLanguage =
      normalizedProvider === 'fichat'
        ? normalizeFiChatLanguage(language || providerSettings?.templateLanguage || 'en_US')
        : String(language || providerSettings?.templateLanguage || 'en').trim();

    if (normalizedProvider === 'interakt') {
      const apiKey = String(providerSettings.apiKey || '').trim();
      if (!apiKey) {
        return res.status(400).json({ message: 'Interakt API key is required before fetching template body' });
      }

      const endpointCandidates = [
        {
          method: 'get',
          url: `https://api.interakt.ai/v1/public/track/organization/templates?offset=0&template_name=${encodedName}&autosubmitted_for=all&approval_status=APPROVED&language=all`
        },
        { method: 'get', url: `https://api.interakt.ai/v1/public/message/templates/${encodedName}` },
        {
          method: 'get',
          url: `https://api.interakt.ai/v1/public/message/templates?name=${encodedName}&language=${encodeURIComponent(normalizedLanguage)}`
        },
        {
          method: 'post',
          url: 'https://api.interakt.ai/v1/public/message/templates',
          data: { name: templateName, languageCode: normalizedLanguage }
        },
        { method: 'get', url: `https://api.interakt.ai/v1/public/templates/${encodedName}` },
        { method: 'get', url: `https://api.interakt.ai/v1/public/apis/templates/${encodedName}` },
        {
          method: 'get',
          url: `https://api.interakt.ai/v1/public/templates?name=${encodedName}&language=${encodeURIComponent(normalizedLanguage)}`
        },
        {
          method: 'post',
          url: 'https://api.interakt.ai/v1/public/apis/templates/search',
          data: { name: templateName, languageCode: normalizedLanguage }
        },
        {
          method: 'post',
          url: 'https://api.interakt.ai/v1/public/templates/search',
          data: { name: templateName, languageCode: normalizedLanguage }
        }
      ];

      let foundBody = '';
      let lastErr = null;
      let source = '';

      for (const candidate of endpointCandidates) {
        try {
          const response = await axios({
            method: candidate.method,
            url: candidate.url,
            data: candidate.data,
            headers: {
              Authorization: `Basic ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000,
            validateStatus: () => true
          });

          if (response.status < 200 || response.status >= 300) {
            lastErr = new Error(`HTTP ${response.status}`);
            continue;
          }

          const body = pickTemplateBodyFromAny(response.data);
          if (body) {
            foundBody = body;
            source = `${String(candidate.method || 'get').toUpperCase()} ${candidate.url}`;
            break;
          }
        } catch (error) {
          lastErr = error;
        }
      }

      if (!foundBody) {
        return res.status(502).json({
          message:
            'Template body is not available from Interakt API for this template. Use manual placeholder mapping.',
          detail: lastErr?.message || 'Template body not found from Interakt response'
        });
      }

      return res.json({
        templateName,
        language: normalizedLanguage,
        body: foundBody,
        placeholderCount: parsePlaceholderCountFromAny(foundBody),
        source
      });
    }

    if (normalizedProvider === 'wati') {
      const apiKey = String(providerSettings.apiKey || '').trim();
      const apiEndpoint = String(providerSettings.apiEndpoint || '').trim();
      if (!apiKey || !apiEndpoint) {
        return res.status(400).json({ message: 'WATI API key and endpoint are required before fetching template body' });
      }

      const apiBases = buildWatiBases(apiEndpoint);
      const endpointCandidates = apiBases.flatMap((base) => [
        `${base}/getMessageTemplates`,
        `${base}/getMessageTemplates?templateName=${encodedName}`,
        `${base}/getMessageTemplates?name=${encodedName}`,
        `${base}/messageTemplates?name=${encodedName}`,
        `${base}/messageTemplates?templateName=${encodedName}`,
        `${base}/templates/${encodedName}`,
        `${base}/messageTemplates/${encodedName}`,
        `${base}/whatsappTemplates/${encodedName}`,
        `${base}/whatsApp/templates/${encodedName}`,
        `${base}/whatsapp/templates/${encodedName}`
      ]);

      let foundBody = '';
      let lastErr = null;
      let source = '';

      for (const url of endpointCandidates) {
        for (const headers of buildWatiAuthHeaders(apiKey)) {
          try {
            const response = await axios.get(url, {
              headers,
              timeout: 15000,
              validateStatus: () => true
            });

            if (response.status < 200 || response.status >= 300) {
              lastErr = new Error(`HTTP ${response.status} @ ${url}`);
              continue;
            }

            const items = normalizeTemplateList(response.data).filter(isApprovedTemplate);
            const byName = (Array.isArray(items) ? items : []).find((item) => {
              const candidate = String(item?.name || item?.templateName || item?.elementName || item?.id || '').trim().toLowerCase();
              return candidate === templateName.toLowerCase();
            });

            const body = pickTemplateBodyFromAny(byName || response.data);
            if (body) {
              foundBody = body;
              source = `GET ${url}`;
              break;
            }
          } catch (error) {
            lastErr = error;
          }
        }

        if (foundBody) {
          break;
        }
      }

      if (!foundBody) {
        return res.status(502).json({
          message:
            'Template body is not available from WATI API for this template. Use manual placeholder mapping.',
          detail: lastErr?.message || 'Template body not found from WATI response'
        });
      }

      return res.json({
        templateName,
        language: 'en',
        body: foundBody,
        placeholderCount: parsePlaceholderCountFromAny(foundBody),
        source
      });
    }

    const resolvedFiChat = resolveFiChatRuntimeConfig(providerSettings);
    if (!resolvedFiChat.baseUrl || !resolvedFiChat.accessToken) {
      return res.status(400).json({
        message: 'FiChat base URL and access token must be set in settings before fetching template body'
      });
    }

    prunePendingFiChatTemplateBodyCache();
    const cacheKey = `${companyId}|${normalizedProvider}|${templateName.toLowerCase()}|${normalizedLanguage.toLowerCase()}`;
    const cached = pendingFiChatTemplateBodyCache.get(cacheKey);
    if (cached && cached.body) {
      return res.json({
        templateName,
        language: cached.language || normalizedLanguage || 'en_US',
        body: cached.body,
        placeholderCount: parsePlaceholderCountFromAny(cached.body),
        source: cached.source || 'fichat_api_cache'
      });
    }

    const detail = await fetchFiChatTemplateDetail(
      resolvedFiChat.baseUrl,
      resolvedFiChat.accessToken,
      templateName,
      normalizedLanguage
    );
    const detailTemplates = normalizeTemplateList(detail.body || {});
    const matchedDetailTemplate = findMatchingTemplate(detailTemplates, templateName, normalizedLanguage);
    const detailBody =
      String(matchedDetailTemplate?.body || pickTemplateBodyFromAny(detail.body || {}) || '').trim();
    if (detailBody) {
      const responsePayload = {
        templateName,
        language: normalizedLanguage || 'en_US',
        body: detailBody,
        placeholderCount: parsePlaceholderCountFromAny(detailBody),
        source: detail.source || 'fichat_api'
      };

      pendingFiChatTemplateBodyCache.set(cacheKey, {
        body: responsePayload.body,
        language: responsePayload.language,
        source: responsePayload.source,
        createdAt: Date.now()
      });

      return res.json(responsePayload);
    }

    const result = await fetchFiChatTemplates(resolvedFiChat.baseUrl, resolvedFiChat.accessToken);
    const templates = Array.isArray(result.templates) ? result.templates : [];
    const selectedTemplate = findMatchingTemplate(templates, templateName, normalizedLanguage);

    const savedConfig = Object.values(providerSettings?.configs || {}).find((config) => {
      const candidate = String(config?.templateName || '').trim().toLowerCase();
      return candidate === templateName.toLowerCase();
    });
    const fallbackPlaceholderCount = Number(
      selectedTemplate?.placeholderCount ||
        savedConfig?.placeholderCount ||
        (Array.isArray(savedConfig?.templateVariables) ? savedConfig.templateVariables.length : 0) ||
        parsePlaceholderCountFromAny(selectedTemplate || result)
    ) || 0;
    const fallbackBody = buildSyntheticTemplateBody(templateName, fallbackPlaceholderCount);
    const resolvedBody = fallbackBody || '';

    if (!resolvedBody) {
      return res.status(502).json({
        message:
          'Template body could not be fetched from FiChat API for this template. Use manual placeholder mapping.'
      });
    }

    const responsePayload = {
      templateName,
      language: String(selectedTemplate?.language || normalizedLanguage || 'en_US').trim(),
      body: resolvedBody,
      placeholderCount: parsePlaceholderCountFromAny(resolvedBody),
      source: 'fichat_api_fallback'
    };

    if (normalizedProvider === 'fichat' && responsePayload.body) {
      pendingFiChatTemplateBodyCache.set(cacheKey, {
        body: responsePayload.body,
        language: responsePayload.language,
        source: responsePayload.source,
        createdAt: Date.now()
      });
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error('Error fetching WhatsApp template body:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/whatsapp/fichat/connect', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    prunePendingFiChatConnectState();
    const state = crypto.randomUUID();
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    pendingFiChatConnectState.set(state, {
      companyId: String(companyId).trim(),
      codeVerifier,
      createdAt: Date.now()
    });

    const url = buildFiChatAuthUrl(companyId, { state, codeChallenge });
    if (!url) {
      pendingFiChatConnectState.delete(state);
      return res.status(400).json({
        message: 'FiChat connect URL is not configured'
      });
    }

    res.json({ url, state });
  } catch (error) {
    console.error('Error generating FiChat auth url:', error);
    res.status(500).json({ message: 'Failed to create FiChat auth url' });
  }
});

router.get('/whatsapp/fichat/callback', async (req, res) => {
  try {
    const { code, state, companyId: companyIdQuery, access_token: accessTokenQuery, token, base_url: baseUrlQuery, baseUrl: baseUrlCamel, account_name: accountNameQuery, accountName: accountNameCamel } = req.query;
    prunePendingFiChatConnectState();
    const stateKey = String(state || '').trim();
    const pending = stateKey ? pendingFiChatConnectState.get(stateKey) : null;
    const companyId = String(pending?.companyId || companyIdQuery || '').trim();

    if (!companyId) {
      return res.status(400).json({ message: 'Missing companyId (state)' });
    }

    const currentSettings = await getOrCreateWhatsappSettings(companyId);
    const resolvedBaseUrl = String(baseUrlQuery || baseUrlCamel || currentSettings?.fichat?.baseUrl || FICHAT_ENV_CONFIG.baseUrl || '').trim();
    const resolvedTemplateLanguage = String(currentSettings?.fichat?.templateLanguage || FICHAT_ENV_CONFIG.templateLanguage || 'en_US').trim() || 'en_US';

    let accessToken = String(accessTokenQuery || token || '').trim();
    let accountName = String(accountNameQuery || accountNameCamel || '').trim();

    if (!accessToken && code) {
      try {
        const tokenResponse = await exchangeFiChatCodeForToken(code, pending?.codeVerifier);
        accessToken = String(
          tokenResponse?.access_token ||
            tokenResponse?.accessToken ||
            tokenResponse?.token ||
            ''
        ).trim();
        accountName = String(
          tokenResponse?.account_name ||
            tokenResponse?.accountName ||
            tokenResponse?.company_name ||
            tokenResponse?.workspace_name ||
            accountName
        ).trim();
      } catch (exchangeError) {
        const codeAlreadyUsed = Boolean(exchangeError?.alreadyUsed);
        if (codeAlreadyUsed) {
          const refreshedSettings = await getOrCreateWhatsappSettings(companyId);
          const refreshedFiChat = refreshedSettings?.fichat || {};
          if (refreshedFiChat.connected && String(refreshedFiChat.accessToken || '').trim()) {
            accessToken = String(refreshedFiChat.accessToken || '').trim();
            accountName = String(refreshedFiChat.accountName || accountName || '').trim();
          } else {
            throw exchangeError;
          }
        } else {
          throw exchangeError;
        }
      }
    }

    if (!accessToken) {
      return res.status(400).json({ message: 'FiChat access token was not returned by the login flow' });
    }

    const updatedData = {
      ...(currentSettings || {}),
      fichat: {
        ...(currentSettings?.fichat || {}),
        baseUrl: resolvedBaseUrl,
        accessToken,
        connected: true,
        accountName,
        connectedAt: new Date().toISOString(),
        templateLanguage: resolvedTemplateLanguage
      },
      activeProvider: 'fichat'
    };

    await Settings.findOneAndUpdate(
      { type: 'whatsapp', companyId },
      { $set: { data: normalizeWhatsappSettings(updatedData) } },
      { upsert: true, new: true }
    );

    const safeCompanyId = JSON.stringify(companyId);

    res.send(`
      <html>
        <body>
          <script>
            window.opener && window.opener.postMessage({ type: 'fichatConnected', companyId: ${safeCompanyId} }, '*');
            document.write('<p>FiChat connected. You can close this window.</p>');
            setTimeout(() => window.close(), 800);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('FiChat callback error:', error);
    res.status(500).json({ message: 'FiChat authentication failed', error: String(error) });
  } finally {
    const stateKey = String(req.query?.state || '').trim();
    if (stateKey) {
      pendingFiChatConnectState.delete(stateKey);
    }
  }
});

router.post('/whatsapp/fichat/disconnect', async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const currentSettings = await getOrCreateWhatsappSettings(companyId);
    const updatedData = {
      ...(currentSettings || {}),
      fichat: {
        ...(currentSettings?.fichat || {}),
        accessToken: '',
        connected: false,
        accountName: '',
        connectedAt: ''
      },
      activeProvider: currentSettings?.activeProvider === 'fichat' ? 'interakt' : currentSettings?.activeProvider
    };

    const settings = await Settings.findOneAndUpdate(
      { type: 'whatsapp', companyId },
      { $set: { data: normalizeWhatsappSettings(updatedData) } },
      { upsert: true, new: true }
    );

    res.json({
      message: 'FiChat disconnected',
      data: {
        ...normalizeWhatsappSettings(settings.data || {}),
        supportedVariableKeys: TASK_TEMPLATE_VARIABLE_OPTIONS
      }
    });
  } catch (error) {
    console.error('Error disconnecting FiChat:', error);
    res.status(500).json({ message: 'Failed to disconnect FiChat', error: error.message });
  }
});

router.get('/admin-approval', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'adminApproval', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'adminApproval',
        companyId,
        data: {
          enabled: false,  // Default disabled
          defaultForOneTime: false,  // Checkbox default when enabled
          defaultForUsers: false
        }
      });
      await settings.save();
    }

    res.json(settings.data);
  } catch (error) {
    console.error('Error fetching admin approval settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/admin-approval', async (req, res) => {
  try {
    const { companyId, enabled, defaultForOneTime, defaultForUsers } = req.body;

    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const payload = {
      enabled: enabled ?? false,
      defaultForOneTime: defaultForOneTime ?? false,
      defaultForUsers: defaultForUsers ?? false
    };

    const settings = await Settings.findOneAndUpdate(
      { type: 'adminApproval', companyId },
      { $set: { data: payload } },
      { upsert: true, new: true }
    );

    res.json({ message: 'Admin approval settings saved', data: settings.data });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------
// Revision endpoints
// ---------------------------
router.get('/revision', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'revision', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'revision',
        companyId,
        data: {
          limit: 3,
          scoringModel: 'stepped',
          enableRevisions: false,
          enableMaxRevision: true,    // ✅ add
          enableDaysRule: false,      // ✅ add
          restrictHighPriorityRevision: false,
          maxDays: 7,
          scoringRules: [
            {
              id: 'default',
              name: 'Default Scoring',
              enabled: true,
              // 0 = initial, 1..limit = revisions
              mapping: {
                0: 100,
                1: 70,
                2: 40,
                3: 0
              }
            }
          ]
        }
      });
      await settings.save();
    }

    res.json(settings.data);
  } catch (error) {
    console.error('Error fetching revision settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/revision', async (req, res) => {
  try {
    const { companyId, ...settingsData } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const settings = await Settings.findOneAndUpdate(
      { type: 'revision', companyId },
      { $set: { data: settingsData } },
      { upsert: true, new: true }
    );

    res.json({ message: 'Revision settings saved successfully', data: settings.data });
  } catch (error) {
    console.error('Error saving revision settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------
// Email endpoints (Gmail OAuth)
// ---------------------------

// GET /email - fetch email settings for a company (safe)
router.get('/email', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'email', companyId });

    if (!settings) {
      // create default email doc (no tokens)
      settings = new Settings({
        type: 'email',
        companyId,
        data: {
          enabled: false,
          email: '',
          // googleTokens will be added on successful OAuth
          sendOnTaskCreate: true,
          sendOnTaskComplete: true,
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
      await settings.save();
    }

    // Return safe data (do not include tokens)
    const safeData = { ...settings.data };
    if (safeData.googleTokens) delete safeData.googleTokens;
    res.json(safeData);
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /email - save email settings (non-sensitive fields)
router.post('/email', async (req, res) => {
  try {
    const { companyId, ...settingsData } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const existing = await Settings.findOne({ type: 'email', companyId });

    const newData = {
      ...existing?.data,  // ← preserve Google tokens + automation
      ...settingsData     // ← update UI fields (sendOnTaskCreate etc)
    };

    const settings = await Settings.findOneAndUpdate(
      { type: 'email', companyId },
      { $set: { data: newData } },
      { upsert: true, new: true }
    );

    // ✅ RESTART CRON TO PICK UP NEW REPORT TIMES/ENABLED STATES
    await restartReportCron();

    const safe = { ...settings.data };
    delete safe.googleTokens;

    res.json({ message: 'Email settings saved successfully', data: safe });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET /email/google-auth - returns Google OAuth URL
router.get('/email/google-auth', (req, res) => {
  try {
    const oauth2Client = createOAuthClient();

    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // get refresh_token
      prompt: 'consent',
      scope: scopes
    });

    res.json({ url });
  } catch (error) {
    console.error('Error generating google auth url:', error);
    res.status(500).json({ message: 'Failed to create google auth url' });
  }
});

// GET /google/callback - Google redirects here after user consents
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const companyId = state || req.query.companyId;

    if (!code || !companyId) {
      return res.status(400).json({ message: 'Missing code or companyId (state)' });
    }

    const oauth2Client = createOAuthClient();

    // 1️⃣ Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(String(code));
    oauth2Client.setCredentials(tokens);

    // 2️⃣ Get Google user email
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userinfo = await oauth2.userinfo.get();
    const userEmail = userinfo?.data?.email || '';

    // 3️⃣ Fetch existing settings FIRST
    const existing = await Settings.findOne({ type: 'email', companyId });

    // 4️⃣ Merge token + preserve automation fields
    const updatedData = {
      ...(existing?.data || {}),
      enabled: true,
      email: userEmail,
      googleTokens: tokens
    };

    // 5️⃣ Save into DB
    await Settings.findOneAndUpdate(
      { type: 'email', companyId },
      { $set: { data: updatedData } },
      { upsert: true, new: true }
    );

    // 6️⃣ Close popup and notify frontend
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ type: 'googleConnected' }, '*');
            document.write('<p>Google connected. You can close this window.</p>');
            setTimeout(()=>window.close(), 800);
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Google callback error:', error);
    res.status(500).json({ message: 'Google authentication failed', error: String(error) });
  }
});

// ✅ FIXED: POST /email/test - send a test email using Gmail API and stored tokens
router.post('/email/test', async (req, res) => {
  try {
    const { companyId, to, subject, text } = req.body;

    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }

    // ✅ Check if email is enabled and configured
    const emailSettings = await Settings.findOne({ type: 'email', companyId });
    if (!emailSettings?.data?.enabled || !emailSettings?.data?.googleTokens) {
      return res.status(400).json({ message: "Email not enabled or Gmail not connected" });
    }

    // ✅ Get admin user for fallback email
    const admin = await User.findOne({
      companyId,
      role: "admin",
      isActive: true
    });

    const emailTo = to || admin?.email || emailSettings.data.email;
    const emailSubject = subject || "Test Email from Task Management System";
    const emailText = text || "This is a test email to verify your Gmail configuration. Your email settings are working correctly!";

    // ✅ Use the centralized email function
    await sendSystemEmail(companyId, emailTo, emailSubject, emailText);

    res.json({ message: "Test email sent successfully" });
  } catch (error) {
    console.error("Test email failed:", error);
    res.status(500).json({ message: "Test email failed", error: error.message });
  }
});

// Optional: endpoint to disconnect / revoke tokens (not required, but handy)
router.post('/email/disconnect', async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const settings = await Settings.findOne({ type: 'email', companyId });
    if (!settings?.data?.googleTokens) {
      return res.json({ message: 'No google connection found' });
    }

    // Remove tokens from DB but keep the email & enabled false
    const updated = await Settings.findOneAndUpdate(
      { type: 'email', companyId },
      { $set: { data: { enabled: false, email: '' } } },
      { new: true }
    );

    res.json({ message: 'Disconnected Google account', data: updated.data });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({ message: 'Failed to disconnect', error: error.message });
  }
});

// ---------------------------
// Bin Settings endpoints
// ---------------------------
router.get('/bin', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    let settings = await Settings.findOne({ type: 'bin', companyId });

    if (!settings) {
      settings = new Settings({
        type: 'bin',
        companyId,
        data: {
          enabled: false,
          retentionDays: 15
        }
      });
      await settings.save();
    }

    res.json(settings.data);
  } catch (error) {
    console.error('Error fetching bin settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/bin', async (req, res) => {
  try {
    const { companyId, enabled, retentionDays } = req.body;

    if (!companyId) return res.status(400).json({ message: 'companyId required' });

    const payload = {
      enabled: enabled ?? false,
      retentionDays: retentionDays || 15
    };

    // ⭐ 1. SAVE THE SETTINGS
    const settings = await Settings.findOneAndUpdate(
      { type: 'bin', companyId },
      { $set: { data: payload } },
      { upsert: true, new: true }
    );

    // ⭐ 2. UPDATE autoDeleteAt FOR ALL soft-deleted tasks of this company
    const ms = (retentionDays || 15) * 24 * 60 * 60 * 1000;

    await Task.updateMany(
      {
        companyId,
        isActive: false,         // only deleted tasks
        deletedAt: { $exists: true }
      },
      [
        {
          $set: {
            autoDeleteAt: { $add: ["$deletedAt", ms] }
          }
        }
      ]
    );

    res.json({ message: 'Bin settings saved and autoDeleteAt updated', data: settings.data });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


export default router;
