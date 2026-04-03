import axios from 'axios';
import dotenv from 'dotenv';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import Settings from '../models/Settings.js';
import Task from '../models/Task.js';
import User from '../models/User.js';

dotenv.config();

export const TASK_EVENT_KEYS = [
  'oneTimeAssigned',
  'oneTimeCompleted',
  'oneTimeOverdue',
  'recurringAssigned',
  'recurringCompleted',
  'recurringOverdue'
];

export const TASK_TEMPLATE_VARIABLE_OPTIONS = [
  'task_title',
  'task_description',
  'task_id',
  'task_type',
  'task_category',
  'due_date',
  'due_date_time',
  'assignee_name',
  'assignee_phone',
  'assigner_name',
  'assigner_phone',
  'completion_remarks',
  'company_id',
  'event_label'
];

const PROVIDERS = ['interakt', 'wati', 'fichat'];
const TEMPLATE_VALUE_FALLBACK = 'N/A';
const FICHAT_ENV_CONFIG = {
  baseUrl: String(process.env.FICHAT_BASE_URL || process.env.FICHAT_API_BASE_URL || process.env.FICHAT_URL || '').trim(),
  clientId: String(process.env.FICHAT_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.FICHAT_CLIENT_SECRET || '').trim(),
  redirectUri: String(process.env.FICHAT_REDIRECT_URI || '').trim(),
  partnerAppBaseUrl: String(process.env.PARTNER_APP_BASE_URL || '').trim(),
  scope: String(process.env.FICHAT_SCOPE || '').trim(),
  accessToken: String(process.env.FICHAT_ACCESS_TOKEN || process.env.FICHAT_TOKEN || '').trim(),
  templateLanguage: String(process.env.FICHAT_TEMPLATE_LANGUAGE || 'en_US').trim() || 'en_US'
};

const resolveFichatRuntimeConfig = (settings = {}) => ({
  baseUrl: String(settings?.baseUrl || '').trim() || FICHAT_ENV_CONFIG.baseUrl,
  accessToken: String(settings?.accessToken || '').trim() || FICHAT_ENV_CONFIG.accessToken,
  templateLanguage: String(settings?.templateLanguage || '').trim() || FICHAT_ENV_CONFIG.templateLanguage
});

const buildDefaultTemplateConfigs = () =>
  TASK_EVENT_KEYS.reduce((acc, key) => {
    acc[key] = {
      enabled: false,
      templateName: '',
      templateVariables: [],
      placeholderCount: 0
    };
    return acc;
  }, {});

const buildDefaultRecipients = () => ({
  oneTimeAssigned: { assignee: true, admins: false },
  oneTimeCompleted: { assignee: false, admins: true },
  oneTimeOverdue: { assignee: true, admins: true },
  recurringAssigned: { assignee: true, admins: false },
  recurringCompleted: { assignee: false, admins: true },
  recurringOverdue: { assignee: true, admins: true }
});

export const createDefaultWhatsappSettings = () => ({
  enabled: false,
  activeProvider: 'interakt',
  recipients: buildDefaultRecipients(),
  interakt: {
    apiKey: '',
    templateLanguage: 'en',
    configs: buildDefaultTemplateConfigs()
  },
  wati: {
    apiKey: '',
    apiEndpoint: '',
    configs: buildDefaultTemplateConfigs()
  },
  fichat: {
    baseUrl: '',
    accessToken: '',
    connected: false,
    accountName: '',
    connectedAt: '',
    templateLanguage: FICHAT_ENV_CONFIG.templateLanguage,
    configs: buildDefaultTemplateConfigs()
  }
});

const normalizeString = (value) => String(value || '').trim();

const normalizeStringArray = (value) => {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
};

const normalizeTemplateConfig = (value, fallback) => ({
  enabled: typeof value?.enabled === 'boolean' ? value.enabled : Boolean(fallback?.enabled),
  templateName: normalizeString(value?.templateName ?? fallback?.templateName),
  templateVariables: normalizeStringArray(value?.templateVariables ?? fallback?.templateVariables),
  placeholderCount: Number(value?.placeholderCount ?? fallback?.placeholderCount ?? 0) || 0
});

const normalizeProviderConfigs = (value, fallbackConfigs) =>
  TASK_EVENT_KEYS.reduce((acc, key) => {
    acc[key] = normalizeTemplateConfig(value?.[key], fallbackConfigs?.[key]);
    return acc;
  }, {});

export const normalizeWhatsappSettings = (input = {}) => {
  const defaults = createDefaultWhatsappSettings();
  const requestedProvider = normalizeString(input?.activeProvider || defaults.activeProvider).toLowerCase();
  const activeProvider = PROVIDERS.includes(requestedProvider) ? requestedProvider : defaults.activeProvider;

  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : defaults.enabled,
    activeProvider,
    recipients: TASK_EVENT_KEYS.reduce((acc, key) => {
      acc[key] = {
        assignee:
          typeof input?.recipients?.[key]?.assignee === 'boolean'
            ? input.recipients[key].assignee
            : defaults.recipients[key].assignee,
        admins:
          typeof input?.recipients?.[key]?.admins === 'boolean'
            ? input.recipients[key].admins
            : defaults.recipients[key].admins
      };
      return acc;
    }, {}),
    interakt: {
      apiKey: normalizeString(input?.interakt?.apiKey),
      templateLanguage: normalizeString(input?.interakt?.templateLanguage) || defaults.interakt.templateLanguage,
      configs: normalizeProviderConfigs(input?.interakt?.configs, defaults.interakt.configs)
    },
    wati: {
      apiKey: normalizeString(input?.wati?.apiKey),
      apiEndpoint: normalizeString(input?.wati?.apiEndpoint),
      configs: normalizeProviderConfigs(input?.wati?.configs, defaults.wati.configs)
    },
    fichat: {
      baseUrl: normalizeString(input?.fichat?.baseUrl),
      accessToken: normalizeString(input?.fichat?.accessToken),
      connected: Boolean(input?.fichat?.connected),
      accountName: normalizeString(input?.fichat?.accountName),
      connectedAt: normalizeString(input?.fichat?.connectedAt),
      templateLanguage:
        normalizeString(input?.fichat?.templateLanguage) || defaults.fichat.templateLanguage,
      configs: normalizeProviderConfigs(input?.fichat?.configs, defaults.fichat.configs)
    }
  };
};

export async function getOrCreateWhatsappSettings(companyId) {
  if (!companyId) return createDefaultWhatsappSettings();

  let settings = await Settings.findOne({ type: 'whatsapp', companyId });
  if (!settings) {
    settings = new Settings({
      type: 'whatsapp',
      companyId,
      data: createDefaultWhatsappSettings()
    });
    await settings.save();
  }

  return normalizeWhatsappSettings(settings.data || {});
}

const normalizeEndpoint = (value = '') => normalizeString(value).replace(/\/+$/, '');

const isHttpUrl = (value = '') => {
  const raw = normalizeString(value);
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const stripBearerPrefix = (value = '') => normalizeString(value).replace(/^Bearer\s+/i, '');

const sanitizeWatiEndpoint = (value = '') => {
  const raw = normalizeString(value);
  if (!raw) return '';
  if (!isHttpUrl(raw)) return normalizeEndpoint(raw);

  try {
    const parsed = new URL(raw);
    parsed.search = '';
    parsed.hash = '';

    let pathname = String(parsed.pathname || '').replace(/\/+$/, '');
    pathname = pathname
      .replace(/\/sendSessionMessage(?:\/.*)?$/i, '')
      .replace(/\/sendTemplateMessages(?:\/.*)?$/i, '')
      .replace(/\/getMessageTemplates(?:\/.*)?$/i, '')
      .replace(/\/messageTemplates(?:\/.*)?$/i, '')
      .replace(/\/whatsappTemplates(?:\/.*)?$/i, '')
      .replace(/\/whatsApp\/templates(?:\/.*)?$/i, '')
      .replace(/\/whatsapp\/templates(?:\/.*)?$/i, '');

    parsed.pathname = pathname || '/';
    return normalizeEndpoint(parsed.toString());
  } catch {
    return normalizeEndpoint(raw);
  }
};

const buildWatiApiBases = (apiEndpoint = '') => {
  const normalized = sanitizeWatiEndpoint(apiEndpoint);
  if (!normalized) return [];

  const stripped = normalized.replace(/\/api\/(v[12]|ext\/v3)$/i, '');
  const strippedTenant = stripped.replace(/\/\d+$/i, '');

  return Array.from(
    new Set(
      [
        normalized,
        stripped,
        strippedTenant,
        `${stripped}/api/v1`,
        `${stripped}/api/v2`,
        `${stripped}/api/ext/v3`,
        `${strippedTenant}/api/v1`,
        `${strippedTenant}/api/v2`,
        `${strippedTenant}/api/ext/v3`
      ]
        .map((item) => normalizeEndpoint(item))
        .filter(Boolean)
    )
  );
};

const buildWatiHeaders = (apiKey = '') => {
  const key = stripBearerPrefix(apiKey);
  if (!key) return [];

  return [
    {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  ];
};

const isWatiApiSuccess = (response) => {
  const status = Number(response?.status || 0);
  if (status < 200 || status >= 300) return false;

  const data = response?.data;
  if (data === null || data === undefined || typeof data !== 'object') return true;
  if (data.success === false || data.ok === false || data.result === false) return false;
  if (data.error) return false;

  return true;
};

function splitPhone(input) {
  const raw = normalizeString(input);
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  const parsedCandidates = [raw, raw.startsWith('+') ? raw : `+${digits}`].filter(Boolean);

  for (const candidate of parsedCandidates) {
    const parsed = parsePhoneNumberFromString(candidate, 'IN');
    if (parsed?.isValid()) {
      const countryCallingCode = String(parsed.countryCallingCode || '').trim();
      const nationalNumber = String(parsed.nationalNumber || '').trim();
      if (!countryCallingCode || !nationalNumber) continue;

      return {
        full: `${countryCallingCode}${nationalNumber}`,
        countryCode: `+${countryCallingCode}`,
        phoneNumber: nationalNumber
      };
    }
  }

  if (digits.length === 10) {
    return {
      full: `91${digits}`,
      countryCode: '+91',
      phoneNumber: digits
    };
  }

  if (digits.length < 10) return null;

  const localNumber = digits.slice(-10);
  const cc = digits.slice(0, digits.length - 10) || '91';

  return {
    full: `${cc}${localNumber}`,
    countryCode: `+${cc}`,
    phoneNumber: localNumber
  };
}

const formatDate = (value, withTime = false) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }
      : {})
  });
};

const getTaskEventKey = (taskType, eventType) => {
  const isOneTime = normalizeString(taskType) === 'one-time';
  const prefix = isOneTime ? 'oneTime' : 'recurring';

  if (eventType === 'assigned') return `${prefix}Assigned`;
  if (eventType === 'completed') return `${prefix}Completed`;
  return `${prefix}Overdue`;
};

const getTaskCategoryLabel = (taskType) =>
  normalizeString(taskType) === 'one-time' ? 'One Time' : 'Recurring';

const buildFallbackText = ({ eventType, task, assignedUser, assignedByUser }) => {
  const taskTypeLabel = getTaskCategoryLabel(task?.taskType);
  const title = normalizeString(task?.title) || 'Task';
  const dueDate = formatDate(task?.dueDate, true) || 'N/A';
  const assigneeName = normalizeString(assignedUser?.username) || 'User';
  const assignerName = normalizeString(assignedByUser?.username) || 'Admin';

  if (eventType === 'assigned') {
    return `${taskTypeLabel} task assigned: ${title}. Assignee: ${assigneeName}. Due: ${dueDate}. Assigned by: ${assignerName}.`;
  }

  if (eventType === 'completed') {
    return `${taskTypeLabel} task completed: ${title}. Assignee: ${assigneeName}. Completed remarks: ${normalizeString(task?.completionRemarks) || 'N/A'}.`;
  }

  return `${taskTypeLabel} task overdue: ${title}. Assignee: ${assigneeName}. Due: ${dueDate}.`;
};

const buildTaskVariableMap = ({ eventType, task, assignedUser, assignedByUser }) => ({
  task_title: normalizeString(task?.title),
  task_description: normalizeString(task?.description),
  task_id: normalizeString(task?.taskId || task?._id),
  task_type: normalizeString(task?.taskType),
  task_category: getTaskCategoryLabel(task?.taskType),
  due_date: formatDate(task?.dueDate, false),
  due_date_time: formatDate(task?.dueDate, true),
  assignee_name: normalizeString(assignedUser?.username),
  assignee_phone: normalizeString(assignedUser?.phone),
  assigner_name: normalizeString(assignedByUser?.username),
  assigner_phone: normalizeString(assignedByUser?.phone),
  completion_remarks: normalizeString(task?.completionRemarks),
  company_id: normalizeString(task?.companyId),
  event_label:
    eventType === 'assigned'
      ? 'Task Assigned'
      : eventType === 'completed'
        ? 'Task Completed'
        : 'Task Overdue'
});

const buildTemplateValues = (config, variableMap, fallbackText) => {
  const keys = Array.isArray(config?.templateVariables) ? config.templateVariables : [];
  const placeholderCount = Number(config?.placeholderCount || 0) || 0;
  if (keys.length < 1) {
    if (placeholderCount > 0) {
      return Array.from({ length: placeholderCount }, () => TEMPLATE_VALUE_FALLBACK);
    }
    return fallbackText ? [fallbackText] : [];
  }

  const values = keys.map((key) => {
    const value = String(variableMap[key] ?? '').trim();
    return value || TEMPLATE_VALUE_FALLBACK;
  });

  if (placeholderCount > values.length) {
    values.push(...Array.from({ length: placeholderCount - values.length }, () => TEMPLATE_VALUE_FALLBACK));
  }

  return values;
};

const normalizeInteraktCountryCode = (value = '') => String(value || '').replace(/\D/g, '') || '91';
const normalizeInteraktPhoneNumber = (value = '') => String(value || '').replace(/\D/g, '');

const applyNumberedTemplate = (template, values) =>
  String(template || '').replace(/\{\{(\d+)\}\}/g, (_, idxRaw) => {
    const idx = Number(idxRaw) - 1;
    return Number.isInteger(idx) && idx >= 0 ? String(values[idx] ?? '') : '';
  });

const sendInteraktTemplateMessage = async ({
  apiKey,
  templateName,
  language,
  to,
  bodyValues
}) => {
  await axios.post(
    'https://api.interakt.ai/v1/public/message/',
    {
      countryCode: normalizeInteraktCountryCode(to.countryCode),
      phoneNumber: normalizeInteraktPhoneNumber(to.phoneNumber),
      type: 'Template',
      callbackData: 'tms-task-alert',
      template: {
        name: templateName,
        languageCode: language || 'en',
        bodyValues
      }
    },
    {
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
};

const sendWatiTemplateMessage = async ({
  apiEndpoint,
  apiKey,
  to,
  templateName,
  parameters,
  eventKey
}) => {
  const urls = buildWatiApiBases(apiEndpoint).map((base) => `${base}/sendTemplateMessages`);
  const headersVariants = buildWatiHeaders(apiKey);
  const toDigits = String(to?.full || '').replace(/\D/g, '');
  const broadcastName = `tms_${normalizeString(eventKey).toLowerCase()}`;

  let lastError = null;

  for (const url of urls) {
    for (const headers of headersVariants) {
      const payloads = [
        {
          template_name: templateName,
          broadcast_name: broadcastName,
          receivers: [
            {
              whatsappNumber: toDigits,
              customParams: parameters.map((item) => ({
                name: item.name,
                value: item.value
              }))
            }
          ]
        },
        {
          template_name: templateName,
          broadcast_name: broadcastName,
          receivers: [
            {
              whatsappNumber: toDigits,
              customParams: parameters.map((item) => ({
                paramName: item.name,
                paramValue: item.value
              }))
            }
          ]
        }
      ];

      for (const payload of payloads) {
        try {
          const response = await axios.post(url, payload, {
            headers,
            timeout: 15000,
            validateStatus: () => true
          });

          if (isWatiApiSuccess(response)) {
            return;
          }

          lastError = new Error(
            `WATI template send failed: HTTP ${response.status} @ ${url} :: ${JSON.stringify(
              response?.data || {}
            )}`
          );
        } catch (error) {
          lastError = error;
        }
      }
    }
  }

  throw lastError || new Error('WATI template send failed');
};

const sendFichatTemplateMessage = async ({
  baseUrl,
  accessToken,
  templateName,
  language,
  to,
  variables
}) => {
  await axios.post(
    `${normalizeEndpoint(baseUrl)}/api/public/v1/templates/send`,
    {
      phone: `+${to.full}`,
      templateName,
      language: language || 'en_US',
      variables
    },
    {
      headers: {
        Authorization: `Bearer ${stripBearerPrefix(accessToken)}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );
};

const buildRecipients = async ({ companyId, assignedUser, eventRecipientConfig }) => {
  const recipients = [];
  const assigneePhone = splitPhone(assignedUser?.phone)?.full || '';

  if (eventRecipientConfig?.assignee && assignedUser?.phone) {
    recipients.push({
      id: String(assignedUser._id || assignedUser.id || 'assignee'),
      name: assignedUser.username,
      phone: assignedUser.phone
    });
  }

  if (eventRecipientConfig?.admins) {
    const admins = await User.find({
      companyId,
      role: { $in: ['admin', 'manager'] },
      isActive: true
    })
      .select('username phone')
      .lean();

    admins.forEach((admin) => {
      if (admin?.phone) {
        const adminPhone = splitPhone(admin.phone)?.full || '';
        if (assigneePhone && adminPhone === assigneePhone) {
          return;
        }
        recipients.push({
          id: String(admin._id || ''),
          name: admin.username,
          phone: admin.phone
        });
      }
    });
  }

  const deduped = [];
  const seen = new Set();
  recipients.forEach((item) => {
    const parsed = splitPhone(item.phone);
    if (!parsed) return;
    if (seen.has(parsed.full)) return;
    seen.add(parsed.full);
    deduped.push({
      ...item,
      phone: parsed
    });
  });

  return deduped;
};

export async function notifyTaskWhatsAppEvent({ task, eventType }) {
  try {
    const companyId = normalizeString(task?.companyId);
    if (!companyId) {
      return { processed: false, sentCount: 0 };
    }

    const settings = await getOrCreateWhatsappSettings(companyId);
    if (!settings?.enabled) {
      return { processed: true, sentCount: 0 };
    }

    const activeProvider = settings.activeProvider;
    if (!PROVIDERS.includes(activeProvider)) {
      return { processed: false, sentCount: 0 };
    }

    const eventKey = getTaskEventKey(task?.taskType, eventType);
    const providerSettings = settings[activeProvider] || {};
    const templateConfig = providerSettings?.configs?.[eventKey];

    if (!templateConfig?.enabled) {
      return { processed: true, sentCount: 0 };
    }

    const assignedUser = task?.assignedTo?.username
      ? task.assignedTo
      : await User.findById(task.assignedTo).select('username phone').lean();
    const assignedByUser = task?.assignedBy?.username
      ? task.assignedBy
      : await User.findById(task.assignedBy).select('username phone').lean();

    const eventRecipientConfig = settings?.recipients?.[eventKey];
    const recipients = await buildRecipients({
      companyId,
      assignedUser,
      eventRecipientConfig
    });

    if (recipients.length < 1) {
      return { processed: true, sentCount: 0 };
    }

    if (activeProvider === 'interakt' && !normalizeString(providerSettings.apiKey)) {
      return { processed: false, sentCount: 0 };
    }

    if (
      activeProvider === 'wati' &&
      (!normalizeString(providerSettings.apiKey) || !isHttpUrl(providerSettings.apiEndpoint))
    ) {
      return { processed: false, sentCount: 0 };
    }

    const fichatRuntime = activeProvider === 'fichat' ? resolveFichatRuntimeConfig(providerSettings) : null;

    if (
      activeProvider === 'fichat' &&
      (!normalizeString(fichatRuntime?.baseUrl) ||
        !isHttpUrl(fichatRuntime.baseUrl) ||
        !normalizeString(fichatRuntime.accessToken))
    ) {
      return { processed: false, sentCount: 0 };
    }

    if (!normalizeString(templateConfig.templateName)) {
      return { processed: false, sentCount: 0 };
    }

    const fallbackText = buildFallbackText({
      eventType,
      task,
      assignedUser,
      assignedByUser
    });
    const variableMap = buildTaskVariableMap({
      eventType,
      task,
      assignedUser,
      assignedByUser
    });
    const values = buildTemplateValues(templateConfig, variableMap, fallbackText);

    let sentCount = 0;
    let hadSuccessfulSend = false;

    for (const recipient of recipients) {
      try {
        if (activeProvider === 'interakt') {
          await sendInteraktTemplateMessage({
            apiKey: providerSettings.apiKey,
            templateName: templateConfig.templateName,
            language: providerSettings.templateLanguage,
            to: recipient.phone,
            bodyValues: values
          });
        } else if (activeProvider === 'wati') {
          const parameters =
            (templateConfig.templateVariables || []).length > 0
              ? templateConfig.templateVariables.map((key, index) => ({
                  name: key,
                  value: String(values[index] ?? '')
                }))
              : values.map((value, index) => ({
                  name: String(index + 1),
                  value: String(value ?? '')
                }));

          await sendWatiTemplateMessage({
            apiEndpoint: providerSettings.apiEndpoint,
            apiKey: providerSettings.apiKey,
            to: recipient.phone,
            templateName: templateConfig.templateName,
            parameters,
            eventKey
          });
        } else {
          await sendFichatTemplateMessage({
            baseUrl: fichatRuntime.baseUrl,
            accessToken: fichatRuntime.accessToken,
            templateName: templateConfig.templateName,
            language: fichatRuntime.templateLanguage,
            to: recipient.phone,
            variables: values
          });
        }

        hadSuccessfulSend = true;
        sentCount += 1;
      } catch (error) {
        console.error(
          `Task WhatsApp send failed (${activeProvider}, ${eventKey}) for company ${companyId}:`,
          error?.response?.data || error?.message || error
        );
      }
    }

    return {
      processed: hadSuccessfulSend || recipients.length < 1,
      sentCount
    };
  } catch (error) {
    console.error('notifyTaskWhatsAppEvent failed:', error);
    return { processed: false, sentCount: 0 };
  }
}

export async function processOverdueTaskNotifications() {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const overdueTasks = await Task.find({
      isActive: true,
      status: 'pending',
      dueDate: { $lt: startOfToday },
      $or: [{ overdueAlertSentAt: { $exists: false } }, { overdueAlertSentAt: null }]
    })
      .select(
        '_id title description taskType assignedBy assignedTo dueDate taskId companyId completionRemarks overdueAlertSentAt'
      )
      .lean();

    let processedCount = 0;

    for (const task of overdueTasks) {
      const result = await notifyTaskWhatsAppEvent({ task, eventType: 'overdue' });
      if (result?.processed) {
        await Task.updateOne(
          { _id: task._id },
          { $set: { overdueAlertSentAt: new Date() } }
        );
        processedCount += 1;
      }
    }

    return { scanned: overdueTasks.length, processed: processedCount };
  } catch (error) {
    console.error('processOverdueTaskNotifications failed:', error);
    return { scanned: 0, processed: 0 };
  }
}
