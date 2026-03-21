import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import type { PcmPendingStep, PcmFormField } from '../hooks/usePcmIntegration';

interface PcmStepFormModalProps {
  step: PcmPendingStep | null;
  isOpen: boolean;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (step: PcmPendingStep, formData: Record<string, any>, remarks: string) => Promise<void> | void;
}

const normalizeText = (value: any) => String(value ?? '').trim();

const normalizeOptions = (field: PcmFormField) => {
  const rawOptions = Array.isArray(field.options) ? field.options : [];
  return rawOptions
    .map((option) => {
      if (option === null || option === undefined) return null;
      if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') {
        const text = String(option).trim();
        return text ? { value: text, label: text } : null;
      }
      if (typeof option === 'object') {
        const value = normalizeText(option.value ?? option.id ?? option.label ?? option.name);
        const label = normalizeText(option.label ?? option.name ?? option.value ?? value);
        const nextValue = value || label;
        return nextValue ? { value: nextValue, label: label || nextValue } : null;
      }
      const text = normalizeText(option);
      return text ? { value: text, label: text } : null;
    })
    .filter(Boolean) as Array<{ value: string; label: string }>;
};

const getFieldType = (field: PcmFormField) => normalizeText(field.type).toLowerCase();

const isArrayValue = (value: any) => Array.isArray(value);

const normalizeStringArray = (value: any) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
};

const normalizeComparable = (value: any) => {
  if (Array.isArray(value)) return normalizeStringArray(value);
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('value' in value) return normalizeComparable((value as any).value);
    if ('label' in value) return normalizeComparable((value as any).label);
  }
  return String(value).trim();
};

const toDateOrNull = (value: any) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const evaluateSingleCondition = (condition: any, formData: Record<string, any>) => {
  if (!condition) return true;

  const fieldKey = String(condition.field || condition.dependsOn || condition.depends_on || '').trim();
  if (!fieldKey) return true;

  const fieldValue = formData?.[fieldKey];
  const operator = String(condition.operator || condition.condition || condition.comparison || 'equals').trim();
  const targetValue = condition.value ?? condition.values ?? condition.targetValue;
  const left = normalizeComparable(fieldValue);
  const right = normalizeComparable(targetValue);

  switch (operator) {
    case 'equals':
    case 'equal':
    case 'is':
      return Array.isArray(left) ? left.includes(String(right)) : String(left) === String(right);
    case 'not_equals':
    case 'notEqual':
    case 'not':
      return Array.isArray(left) ? !left.includes(String(right)) : String(left) !== String(right);
    case 'contains':
      return String(left).includes(String(right));
    case 'not_contains':
    case 'notContains':
      return !String(left).includes(String(right));
    case 'greater':
    case 'greaterThan':
      return Number(left) > Number(right);
    case 'less':
    case 'lessThan':
      return Number(left) < Number(right);
    case 'greater_equal':
    case 'greaterThanOrEqual':
      return Number(left) >= Number(right);
    case 'less_equal':
    case 'lessThanOrEqual':
      return Number(left) <= Number(right);
    case 'empty':
    case 'isEmpty':
      return left === '' || (Array.isArray(left) && left.length === 0);
    case 'not_empty':
    case 'isNotEmpty':
      return !(left === '' || (Array.isArray(left) && left.length === 0));
    case 'in': {
      const options = Array.isArray(targetValue)
        ? targetValue.map(String)
        : String(targetValue || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      return options.includes(String(fieldValue ?? '').trim());
    }
    case 'not_in':
    case 'notIn': {
      const options = Array.isArray(targetValue)
        ? targetValue.map(String)
        : String(targetValue || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      return !options.includes(String(fieldValue ?? '').trim());
    }
    default:
      return true;
  }
};

const isFieldVisible = (field: PcmFormField, formData: Record<string, any>) => {
  const logic = (field as any).conditionalLogic || (field as any).visibilityConditions || (field as any).showIf;
  if (!logic) return true;

  if (Array.isArray(logic)) {
    return logic.every((condition) => evaluateSingleCondition(condition, formData));
  }

  if (Array.isArray(logic.conditions)) {
    const mode = String(logic.mode || logic.match || logic.logic || 'all').trim().toLowerCase();
    const result = mode === 'any'
      ? logic.conditions.some((condition: any) => evaluateSingleCondition(condition, formData))
      : logic.conditions.every((condition: any) => evaluateSingleCondition(condition, formData));
    return logic.negate === true ? !result : result;
  }

  if (logic.dependsOn || logic.field) {
    return evaluateSingleCondition({
      field: logic.dependsOn || logic.field,
      operator: logic.operator || logic.condition,
      value: logic.value,
      values: logic.values,
    }, formData);
  }

  return true;
};

const isSectionVisible = (section: any, formData: Record<string, any>) => {
  const logic = section?.conditionalLogic || section?.visibilityConditions;
  if (!logic) return true;

  if (Array.isArray(logic)) {
    return logic.every((condition) => evaluateSingleCondition(condition, formData));
  }

  if (Array.isArray(logic.conditions)) {
    const mode = String(logic.mode || logic.match || logic.logic || 'all').trim().toLowerCase();
    const result = mode === 'any'
      ? logic.conditions.some((condition: any) => evaluateSingleCondition(condition, formData))
      : logic.conditions.every((condition: any) => evaluateSingleCondition(condition, formData));
    return logic.negate === true ? !result : result;
  }

  if (logic.dependsOn || logic.field) {
    return evaluateSingleCondition({
      field: logic.dependsOn || logic.field,
      operator: logic.operator || logic.condition,
      value: logic.value,
      values: logic.values,
    }, formData);
  }

  return true;
};

const getValidationMessage = (field: PcmFormField, value: any) => {
  const type = getFieldType(field);
  const label = field.label || field.name || field.id;
  const validationRules = Array.isArray((field as any).validation) ? (field as any).validation : [];
  const requiredRule = validationRules.find((rule: any) => String(rule?.type || '').trim().toLowerCase() === 'required');
  const minCountRule = validationRules.find((rule: any) => String(rule?.type || '').trim().toLowerCase() === 'mincount');
  const required = field.required === true || Boolean(requiredRule);

  const isEmpty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    (type === 'checkbox' && typeof value === 'boolean' && value === false);

  if (isEmpty) {
    if (!required) {
      if ((type === 'checkbox' || type === 'multiselect') && (field.minSelections !== undefined || minCountRule)) {
        const minRequired = Number(field.minSelections ?? minCountRule?.value ?? 0);
        if (minRequired > 0) {
          return String(minCountRule?.message || `Select at least ${minRequired} option(s)`);
        }
      }
      return '';
    }
    return String(requiredRule?.message || `${label} is required`);
  }

  const selections = Array.isArray(value) ? value.map(String) : [];
  const valueString = normalizeText(value);

  const fail = (message: string | undefined, fallback: string) => message || fallback;

  if (validationRules.length === 0) {
    if ((type === 'checkbox' || type === 'multiselect') && required && selections.length === 0) {
      return `${label} is required`;
    }
    return '';
  }

  for (const rule of validationRules) {
    const ruleType = String(rule?.type || '').trim().toLowerCase();
    const ruleValue = rule?.value;
    const ruleValue2 = rule?.value2;
    switch (ruleType) {
      case 'required':
        break;
      case 'minlength':
        if (valueString.length < Number(ruleValue || 0)) return fail(rule?.message, `${label} must be at least ${ruleValue} characters`);
        break;
      case 'maxlength':
        if (valueString.length > Number(ruleValue || 0)) return fail(rule?.message, `${label} must be no more than ${ruleValue} characters`);
        break;
      case 'exactcount':
        if (valueString.length !== Number(ruleValue || 0)) return fail(rule?.message, `${label} must be exactly ${ruleValue} characters`);
        break;
      case 'mincount':
        if (selections.length < Number(ruleValue || 0)) return fail(rule?.message, `${label} requires at least ${ruleValue} selection(s)`);
        break;
      case 'maxcount':
        if (selections.length > Number(ruleValue || 0)) return fail(rule?.message, `${label} allows at most ${ruleValue} selection(s)`);
        break;
      case 'between': {
        const numeric = Number(value);
        if (numeric < Number(ruleValue) || numeric > Number(ruleValue2)) {
          return fail(rule?.message, `${label} must be between ${ruleValue} and ${ruleValue2}`);
        }
        break;
      }
      case 'equal':
        if (Number(value) !== Number(ruleValue)) return fail(rule?.message, `${label} must equal ${ruleValue}`);
        break;
      case 'greaterthan':
        if (Number(value) <= Number(ruleValue)) return fail(rule?.message, `${label} must be greater than ${ruleValue}`);
        break;
      case 'lessthan':
        if (Number(value) >= Number(ruleValue)) return fail(rule?.message, `${label} must be less than ${ruleValue}`);
        break;
      case 'greaterthanorequal':
        if (Number(value) < Number(ruleValue)) return fail(rule?.message, `${label} must be greater than or equal to ${ruleValue}`);
        break;
      case 'lessthanorequal':
        if (Number(value) > Number(ruleValue)) return fail(rule?.message, `${label} must be less than or equal to ${ruleValue}`);
        break;
      case 'min':
        if (Number(value) < Number(ruleValue)) return fail(rule?.message, `${label} must be at least ${ruleValue}`);
        break;
      case 'max':
        if (Number(value) > Number(ruleValue)) return fail(rule?.message, `${label} must be no more than ${ruleValue}`);
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueString)) return fail(rule?.message, `${label} must be a valid email address`);
        break;
      case 'url':
        if (!/^(https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(valueString)) return fail(rule?.message, `${label} must be a valid URL`);
        break;
      case 'phone':
        if (!/^[+\d][\d\s\-()]{6,}$/.test(valueString)) return fail(rule?.message, `${label} must be a valid phone number`);
        break;
      case 'numeric':
        if (!/^\d+$/.test(valueString)) return fail(rule?.message, `${label} must contain only numbers`);
        break;
      case 'numericdecimal':
        if (!/^\d*\.?\d+$/.test(valueString)) return fail(rule?.message, `${label} must contain only numbers and decimals`);
        break;
      case 'alphanumeric':
        if (!/^[a-zA-Z0-9]+$/.test(valueString)) return fail(rule?.message, `${label} must contain only letters and numbers`);
        break;
      case 'pattern':
        try {
          const regex = new RegExp(String(ruleValue || ''));
          if (!regex.test(valueString)) return fail(rule?.message, `${label} does not match the required format`);
        } catch {
          break;
        }
        break;
      case 'dateequal':
      case 'datebefore':
      case 'dateafter':
      case 'datebetween':
      case 'timeequal':
      case 'timebefore':
      case 'timeafter':
      case 'timebetween': {
        const currentDate = toDateOrNull(valueString);
        const compareDate1 = toDateOrNull(ruleValue);
        const compareDate2 = toDateOrNull(ruleValue2);
        if (!currentDate) break;
        if (ruleType === 'dateequal' && compareDate1 && currentDate.getTime() !== compareDate1.getTime()) return fail(rule?.message, `${label} must match the required date`);
        if (ruleType === 'datebefore' && compareDate1 && currentDate.getTime() >= compareDate1.getTime()) return fail(rule?.message, `${label} must be before the required date`);
        if (ruleType === 'dateafter' && compareDate1 && currentDate.getTime() <= compareDate1.getTime()) return fail(rule?.message, `${label} must be after the required date`);
        if (ruleType === 'datebetween' && compareDate1 && compareDate2 && (currentDate.getTime() < compareDate1.getTime() || currentDate.getTime() > compareDate2.getTime())) {
          return fail(rule?.message, `${label} must be between the required dates`);
        }
        if (ruleType === 'timeequal' && String(valueString) !== String(ruleValue)) return fail(rule?.message, `${label} must match the required time`);
        if (ruleType === 'timebefore' && String(valueString) >= String(ruleValue)) return fail(rule?.message, `${label} must be before the required time`);
        if (ruleType === 'timeafter' && String(valueString) <= String(ruleValue)) return fail(rule?.message, `${label} must be after the required time`);
        if (ruleType === 'timebetween' && (String(valueString) < String(ruleValue) || String(valueString) > String(ruleValue2))) {
          return fail(rule?.message, `${label} must be between the required times`);
        }
        break;
      }
      default:
        break;
    }
  }

  if ((type === 'checkbox' || type === 'multiselect') && field.minSelections !== undefined && selections.length < Number(field.minSelections)) {
    return `Select at least ${field.minSelections} option(s)`;
  }

  if ((type === 'checkbox' || type === 'multiselect') && field.maxSelections !== undefined && selections.length > Number(field.maxSelections)) {
    return `Select at most ${field.maxSelections} option(s)`;
  }

  return '';
};

const PcmStepFormModal: React.FC<PcmStepFormModalProps> = ({
  step,
  isOpen,
  submitting = false,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fields = useMemo(() => {
    return Array.isArray(step?.formFields) ? step!.formFields : [];
  }, [step]);

  const sections = useMemo(() => {
    const rawSections = Array.isArray(step?.formSections) ? step!.formSections : [];
    if (rawSections.length > 0) return rawSections;
    return [{ id: '__pcm_root__', title: 'Step Details', description: '' }];
  }, [step]);

  const getInitialValue = (field: PcmFormField) => {
    const type = getFieldType(field);
    const existing = step?.formData?.[field.id];
    if (existing !== undefined) return existing;
    if (type === 'checkbox') {
      return normalizeOptions(field).length > 0 || field.multiple ? [] : false;
    }
    if (type === 'multiselect') return [];
    if (type === 'stepassign') {
      const emails = Array.isArray(step?.assignedUserEmails) ? step.assignedUserEmails.filter(Boolean) : [];
      if (emails.length > 0) return emails.join(', ');
      const ids = Array.isArray(step?.assignedUserIds) ? step.assignedUserIds.filter(Boolean) : [];
      if (ids.length > 0) return ids.join(', ');
      return '';
    }
    if (type === 'file') return [];
    return '';
  };

  useEffect(() => {
    if (!isOpen || !step) return;

    const nextFormData: Record<string, any> = {};
    const fieldList = Array.isArray(step.formFields) ? step.formFields : [];

    fieldList.forEach((field) => {
      nextFormData[field.id] = getInitialValue(field);
    });

    setFormData(nextFormData);
    setRemarks('');
    setErrors({});
  }, [isOpen, step?.runId, step?.stepId]);

  const visibleSections = useMemo(() => {
    return sections.filter((section) => isSectionVisible(section, formData));
  }, [sections, formData]);

  const visibleFields = useMemo(() => {
    const visibleSectionIds = new Set(visibleSections.map((section) => section.id));
    return fields.filter((field) => {
      const sectionId = String(field.sectionId || '').trim();
      const belongsToVisibleSection = !sectionId || visibleSectionIds.has(sectionId);
      return belongsToVisibleSection && isFieldVisible(field, formData);
    });
  }, [fields, formData, visibleSections]);

  const updateField = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!step) return;

    const nextErrors: Record<string, string> = {};
    const visibleFieldSet = new Set(visibleFields.map((field) => field.id));
    for (const field of visibleFields) {
      const message = getValidationMessage(field, formData[field.id]);
      if (message) nextErrors[field.id] = message;
    }

    const sanitizedFormData = Object.fromEntries(
      Object.entries(formData).filter(([fieldId]) => visibleFieldSet.has(fieldId))
    );

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await onSubmit(step, sanitizedFormData, remarks);
  };

  const renderField = (field: PcmFormField) => {
    const type = getFieldType(field);
    const value = formData[field.id];
    const options = normalizeOptions(field);
    const commonInputClass =
      'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]';

    if (type === 'textarea') {
      return (
        <textarea
          rows={4}
          className={commonInputClass}
          placeholder={field.placeholder || ''}
          value={normalizeText(value)}
          onChange={(e) => updateField(field.id, e.target.value)}
        />
      );
    }

    if (type === 'select' || type === 'dropdown' || type === 'multiselect') {
      if (type === 'multiselect') {
        return (
          <select
            multiple
            className={`${commonInputClass} min-h-[120px]`}
            value={isArrayValue(value) ? value.map(String) : []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map((option) => option.value);
              updateField(field.id, selected);
            }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }

      return (
        <select
          className={commonInputClass}
          value={normalizeText(value)}
          onChange={(e) => updateField(field.id, e.target.value)}
        >
          <option value="">Select an option</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (type === 'radio') {
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const checked = normalizeText(value) === option.value;
            return (
              <label
                key={option.value}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                  checked
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-background)]'
                }`}
              >
                <input
                  type="radio"
                  name={field.id}
                  checked={checked}
                  onChange={() => updateField(field.id, option.value)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      );
    }

    if (type === 'checkbox') {
      if (options.length > 0 || field.multiple) {
        const selected = Array.isArray(value) ? value.map(String) : [];
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                    checked
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'border-[var(--color-border)] bg-[var(--color-background)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(option.value);
                      else next.delete(option.value);
                      updateField(field.id, Array.from(next));
                    }}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        );
      }

      return (
        <label className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => updateField(field.id, e.target.checked)}
            className="h-4 w-4 accent-[var(--color-primary)]"
          />
          <span>{field.label || field.name || field.id}</span>
        </label>
      );
    }

    if (type === 'file') {
      return (
        <div className="space-y-2">
          <input
            type="file"
            multiple={field.multiple !== false}
            className={`${commonInputClass} file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white`}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              updateField(
                field.id,
                files.map((file) => ({
                  name: file.name,
                  size: file.size,
                  type: file.type,
                }))
              );
            }}
          />
          {Array.isArray(value) && value.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-xs text-[var(--color-textSecondary)]">
              {value.length} file(s) selected
            </div>
          )}
        </div>
      );
    }

    if (type === 'date' || type === 'time' || type === 'datetime-local' || type === 'datetime') {
      return (
        <input
          type={type === 'datetime' ? 'datetime-local' : type}
          className={commonInputClass}
          value={normalizeText(value)}
          onChange={(e) => updateField(field.id, e.target.value)}
        />
      );
    }

    if (type === 'number' || type === 'numeric' || type === 'numericdecimal') {
      return (
        <input
          type="number"
          step={type === 'numericdecimal' ? 'any' : '1'}
          className={commonInputClass}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => updateField(field.id, e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    }

    if (type === 'email' || type === 'url' || type === 'tel' || type === 'phone' || type === 'password') {
      const inputType = type === 'phone' ? 'tel' : type;
      return (
        <input
          type={inputType}
          className={commonInputClass}
          placeholder={field.placeholder || ''}
          value={normalizeText(value)}
          onChange={(e) => updateField(field.id, e.target.value)}
        />
      );
    }

    if (type === 'stepassign') {
      return (
        <input
          type="text"
          className={commonInputClass}
          placeholder={field.placeholder || 'Enter user ids or emails separated by commas'}
          value={normalizeText(value)}
          onChange={(e) => updateField(field.id, e.target.value)}
        />
      );
    }

    return (
      <input
        type="text"
        className={commonInputClass}
        placeholder={field.placeholder || ''}
        value={normalizeText(value)}
        onChange={(e) => updateField(field.id, e.target.value)}
      />
    );
  };

  if (!isOpen || !step) return null;

  const stepTitle = step.formTitle || step.stepName || 'PCM Step';
  const stepDescription =
    step.formDescription ||
    step.workflowName ||
    'Fill the PCM step fields and complete the step from TMS.';

  const renderSectionFields = (sectionId: string) => {
    if (sectionId === '__pcm_root__') {
    return visibleFields.filter((field) => !field.sectionId);
    }
    return visibleFields.filter((field) => String(field.sectionId || '') === sectionId);
  };

  const hasFields = fields.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-textSecondary)]">
              PCM Pending Process
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--color-text)]">{stepTitle}</h2>
            <p className="mt-1 text-sm text-[var(--color-textSecondary)]">{stepDescription}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-textSecondary)] transition-colors hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-text)]"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid max-h-[calc(92vh-88px)] gap-0 overflow-hidden lg:grid-cols-[1.4fr_0.6fr]">
          <div className="overflow-y-auto px-6 py-5">
            <div className="mb-5 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 font-semibold text-[var(--color-primary)]">
                {step.workflowName || 'PCM Workflow'}
              </span>
              <span className="rounded-full bg-[var(--color-background)] px-3 py-1 font-semibold text-[var(--color-textSecondary)]">
                Run {step.displayId || step.runId}
              </span>
              <span className="rounded-full bg-[var(--color-background)] px-3 py-1 font-semibold text-[var(--color-textSecondary)]">
                {step.stepName}
              </span>
            </div>

            {!hasFields && (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-4 py-8 text-center text-sm text-[var(--color-textSecondary)]">
                This PCM step has no visible form fields. Add remarks and complete it from the side panel.
              </div>
            )}

            {sections.map((section) => {
              const sectionFields = renderSectionFields(section.id);
              if (!sectionFields.length) return null;

              return (
                <section key={section.id} className="mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">
                      {section.title || 'Section'}
                    </h3>
                    {section.description && (
                      <p className="mt-1 text-xs text-[var(--color-textSecondary)]">{section.description}</p>
                    )}
                  </div>

                  <div className="grid gap-4">
                    {sectionFields.map((field) => {
                      const fieldLabel = field.label || field.name || field.id;
                      const fieldError = errors[field.id];
                      return (
                        <div key={field.id} className="space-y-2">
                          <label className="block text-sm font-medium text-[var(--color-text)]">
                            {fieldLabel}
                            {field.required && <span className="ml-1 text-red-500">*</span>}
                          </label>
                          {field.description && (
                            <p className="text-xs text-[var(--color-textSecondary)]">{field.description}</p>
                          )}
                          {renderField(field)}
                          {fieldError && <p className="text-xs font-medium text-red-600">{fieldError}</p>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="border-t border-[var(--color-border)] bg-[var(--color-background)] px-6 py-5 lg:border-l lg:border-t-0">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Completion Notes</h3>
              <p className="mt-1 text-xs text-[var(--color-textSecondary)]">
                These notes are sent back to PCM with the completed form data.
              </p>

              <div className="mt-3 space-y-2">
                <label className="block text-sm font-medium text-[var(--color-text)]">Remarks</label>
                <textarea
                  rows={6}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] transition-colors focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional remarks for the PCM completion"
                />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-textSecondary)]">
              <p className="font-semibold text-[var(--color-text)]">Sync flow</p>
              <ul className="mt-2 space-y-1">
                <li>1. Fill the form in TMS</li>
                <li>2. Submit the step</li>
                <li>3. PCM receives the completed form data</li>
              </ul>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary)]/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Complete Step
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PcmStepFormModal;
