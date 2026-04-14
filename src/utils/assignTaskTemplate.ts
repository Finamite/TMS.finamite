import ExcelJS from 'exceljs';

export type TaskType = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export interface TemplateUser {
  _id: string;
  username: string;
  email?: string;
  department?: string;
}

export interface TemplateTaskForm {
  id: string;
  title: string;
  description: string;
  taskType: string;
  assignedTo: string[];
  priority: string;
  dueDate: string;
  startDate: string;
  endDate: string;
  isForever: boolean;
  includeSunday: boolean;
  weekOffDays: number[];
  weeklyDays: number[];
  monthlyDay: number;
  yearlyDuration: number;
  attachments: File[];
  requiresApproval: boolean;
  taskTypeLocked?: boolean;
}

export interface TemplateImportSummary {
  fileName: string;
  totalTasks: number;
  countsByTaskType: Record<TaskType, number>;
  warnings: string[];
}

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
] as const;

const PRIORITY_OPTIONS = ['normal', 'high'] as const;
const YES_NO_OPTIONS = ['Yes', 'No'] as const;
const YEARLY_DURATION_OPTIONS = [3, 5, 10] as const;
const SUPPORTED_TASK_TYPES: TaskType[] = ['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

type SheetSpec = {
  taskType: TaskType;
  sheetName: string;
  note: string;
  includeEndDate: boolean;
  includeForever: boolean;
  includeWeeklyDays: boolean;
  includeMonthlyDay: boolean;
  includeYearlyDuration: boolean;
};

const SHEET_SPECS: SheetSpec[] = [
  {
    taskType: 'daily',
    sheetName: 'Daily',
    note: 'Use this sheet for daily recurring tasks. End Date is required unless Forever is set to Yes.',
    includeEndDate: true,
    includeForever: true,
    includeWeeklyDays: false,
    includeMonthlyDay: false,
    includeYearlyDuration: false,
  },
  {
    taskType: 'weekly',
    sheetName: 'Weekly',
    note: 'Use this sheet for weekly recurring tasks. Weekly Days is required.',
    includeEndDate: true,
    includeForever: true,
    includeWeeklyDays: true,
    includeMonthlyDay: false,
    includeYearlyDuration: false,
  },
  {
    taskType: 'fortnightly',
    sheetName: 'Fortnightly',
    note: 'Use this sheet for every-14-days tasks. End Date is required unless Forever is set to Yes.',
    includeEndDate: true,
    includeForever: true,
    includeWeeklyDays: false,
    includeMonthlyDay: false,
    includeYearlyDuration: false,
  },
  {
    taskType: 'monthly',
    sheetName: 'Monthly',
    note: 'Use this sheet for monthly recurring tasks. Monthly Day is required.',
    includeEndDate: true,
    includeForever: true,
    includeWeeklyDays: false,
    includeMonthlyDay: true,
    includeYearlyDuration: false,
  },
  {
    taskType: 'quarterly',
    sheetName: 'Quarterly',
    note: 'Use this sheet for quarterly recurring tasks. Start Date is required. End Date and Forever are not used.',
    includeEndDate: false,
    includeForever: false,
    includeWeeklyDays: false,
    includeMonthlyDay: false,
    includeYearlyDuration: false,
  },
  {
    taskType: 'yearly',
    sheetName: 'Yearly',
    note: 'Use this sheet for yearly recurring tasks. Yearly Duration is used instead of End Date and Forever.',
    includeEndDate: false,
    includeForever: false,
    includeWeeklyDays: false,
    includeMonthlyDay: false,
    includeYearlyDuration: true,
  },
];

const COMMON_HEADERS = [
  'Task Title',
  'Description',
  'Assigned To',
  'Priority',
  'Start Date',
  'End Date',
  'Forever',
  'Include Sunday',
  'Week Off Days',
];

const HEADER_ALIASES: Record<string, string[]> = {
  'Task Title': ['task title', 'title'],
  Description: ['description', 'task description', 'details'],
  'Assigned To': ['assigned to', 'assignee', 'user', 'users'],
  Priority: ['priority'],
  'Start Date': ['start date', 'start'],
  'End Date': ['end date', 'end'],
  Forever: ['forever', 'is forever'],
  'Include Sunday': ['include sunday', 'sunday'],
  'Week Off Days': ['week off days', 'week off', 'off days'],
  'Weekly Days': ['weekly days', 'week days'],
  'Monthly Day': ['monthly day', 'day of month'],
  'Yearly Duration': ['yearly duration', 'years'],
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

const normalizeKey = (value: unknown) =>
  normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const isBlank = (value: unknown) => normalizeText(value) === '';

const parseBooleanValue = (value: unknown, defaultValue = false) => {
  const text = normalizeText(value).toLowerCase();
  if (!text) return defaultValue;
  if (['yes', 'y', 'true', '1', 'on'].includes(text)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(text)) return false;
  return defaultValue;
};

const parseNumberValue = (value: unknown, defaultValue: number, min?: number, max?: number) => {
  const text = normalizeText(value);
  if (!text) return defaultValue;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return defaultValue;

  const rounded = Math.trunc(parsed);
  if (typeof min === 'number' && rounded < min) return defaultValue;
  if (typeof max === 'number' && rounded > max) return defaultValue;
  return rounded;
};

const parseMultiValue = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return [];

  return text
    .split(/[\n,;|/]+/g)
    .map(part => part.trim())
    .filter(Boolean);
};

const parseExcelDateValue = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(value * 24 * 60 * 60 * 1000);
    return new Date(excelEpoch.getTime() + ms).toISOString().slice(0, 10);
  }

  const text = normalizeText(value);
  if (!text) return '';

  const parts = text.split(/[/-]/).map(part => part.trim());
  if (parts.length === 3) {
    const [first, second, third] = parts;
    const firstNum = Number(first);
    const secondNum = Number(second);
    const thirdNum = Number(third);

    if (Number.isFinite(firstNum) && Number.isFinite(secondNum) && Number.isFinite(thirdNum)) {
      const isDdMmYyyy = first.length <= 2 && second.length <= 2 && third.length === 4;
      if (isDdMmYyyy) {
        const parsed = new Date(Date.UTC(thirdNum, secondNum - 1, firstNum));
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10);
        }
      }
    }
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toISOString().slice(0, 10);
};

const parseWeekdayList = (value: unknown) => {
  const parts = parseMultiValue(value);
  if (parts.length === 0) return [];

  const parsedDays = parts
    .map(part => {
      const normalized = normalizeKey(part);
      const numeric = Number(part);

      if (Number.isFinite(numeric) && WEEKDAY_OPTIONS.some(option => option.value === numeric)) {
        return numeric;
      }

      const match = WEEKDAY_OPTIONS.find(option =>
        normalizeKey(option.label).startsWith(normalized) ||
        normalizeKey(option.label) === normalized
      );

      return match?.value;
    })
    .filter((value): value is number => typeof value === 'number');

  return Array.from(new Set(parsedDays));
};

const getColumnLetter = (columnNumber: number) => {
  let result = '';
  let current = columnNumber;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const applyHeaderStyles = (worksheet: ExcelJS.Worksheet, rowIndex: number, totalColumns: number) => {
  const row = worksheet.getRow(rowIndex);
  row.height = 22;

  for (let columnIndex = 1; columnIndex <= totalColumns; columnIndex += 1) {
    const cell = row.getCell(columnIndex);
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0F766E' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'D1D5DB' } },
      left: { style: 'thin', color: { argb: 'D1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
      right: { style: 'thin', color: { argb: 'D1D5DB' } },
    };
  }
};

const applyInstructionStyles = (worksheet: ExcelJS.Worksheet, rowIndex: number, totalColumns: number) => {
  const row = worksheet.getRow(rowIndex);
  for (let columnIndex = 1; columnIndex <= totalColumns; columnIndex += 1) {
    const cell = row.getCell(columnIndex);
    cell.font = rowIndex === 1
      ? { bold: true, color: { argb: 'FFFFFF' }, size: 16 }
      : rowIndex === 3
        ? { bold: true }
        : { color: { argb: '334155' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'E2E8F0' } },
      left: { style: 'thin', color: { argb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
      right: { style: 'thin', color: { argb: 'E2E8F0' } },
    };
    if (rowIndex === 1) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1D4ED8' },
      };
    } else if (rowIndex === 3) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'DBEAFE' },
      };
    }
  }
};

const buildTaskForm = (taskType: TaskType): TemplateTaskForm => ({
  id: `${taskType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  title: '',
  description: '',
  taskType,
  assignedTo: [],
  priority: 'normal',
  dueDate: '',
  startDate: '',
  endDate: '',
  isForever: false,
  includeSunday: false,
  weekOffDays: [],
  weeklyDays: [],
  monthlyDay: 1,
  yearlyDuration: 3,
  attachments: [],
  requiresApproval: false,
  taskTypeLocked: true,
});

const findHeaderRow = (worksheet: ExcelJS.Worksheet) => {
  for (let rowIndex = 1; rowIndex <= Math.min(8, worksheet.rowCount || 8); rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    let taskTitleFound = false;
    let assignedFound = false;

    row.eachCell({ includeEmpty: false }, cell => {
      const key = normalizeKey(cell.value);
      if (HEADER_ALIASES['Task Title'].some(alias => key === normalizeKey(alias))) {
        taskTitleFound = true;
      }
      if (HEADER_ALIASES['Assigned To'].some(alias => key === normalizeKey(alias))) {
        assignedFound = true;
      }
    });

    if (taskTitleFound && assignedFound) {
      return rowIndex;
    }
  }

  return null;
};

const buildHeaderMap = (worksheet: ExcelJS.Worksheet, headerRowIndex: number) => {
  const headerMap = new Map<string, number>();
  const row = worksheet.getRow(headerRowIndex);

  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const normalized = normalizeKey(cell.value);

    Object.entries(HEADER_ALIASES).forEach(([canonical, aliases]) => {
      const matches = [canonical, ...aliases].some(alias => normalized === normalizeKey(alias));
      if (matches && !headerMap.has(canonical)) {
        headerMap.set(canonical, columnNumber);
      }
    });
  });

  return headerMap;
};

const getCellText = (row: ExcelJS.Row, headerMap: Map<string, number>, header: string) => {
  const columnNumber = headerMap.get(header);
  if (!columnNumber) return '';
  return normalizeText(row.getCell(columnNumber).value);
};

const getCellValue = (row: ExcelJS.Row, headerMap: Map<string, number>, header: string) => {
  const columnNumber = headerMap.get(header);
  if (!columnNumber) return undefined;
  return row.getCell(columnNumber).value;
};

const resolveUsers = (rawValue: unknown, users: TemplateUser[], rowLabel: string, warnings: string[]) => {
  const entries = parseMultiValue(rawValue);
  if (entries.length === 0) {
    warnings.push(`${rowLabel}: Assigned To is empty.`);
    return [];
  }

  const assignedIds: string[] = [];
  const notFound: string[] = [];

  entries.forEach(entry => {
    const normalized = normalizeText(entry).toLowerCase();
    const matchedUser = users.find(user =>
      user.username.toLowerCase() === normalized ||
      user.username.toLowerCase().includes(normalized) ||
      user.email?.toLowerCase() === normalized ||
      user._id.toLowerCase() === normalized
    );

    if (matchedUser) {
      assignedIds.push(matchedUser._id);
    } else {
      notFound.push(entry);
    }
  });

  if (notFound.length > 0) {
    warnings.push(`${rowLabel}: User not found - ${notFound.join(', ')}`);
  }

  return Array.from(new Set(assignedIds));
};

const applyInputValidation = (
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  headerMap: Map<string, number>,
  maxValidationRow: number,
) => {
  const assignedColumn = headerMap.get('Assigned To');
  const priorityColumn = headerMap.get('Priority');
  const startDateColumn = headerMap.get('Start Date');
  const endDateColumn = headerMap.get('End Date');
  const foreverColumn = headerMap.get('Forever');
  const includeSundayColumn = headerMap.get('Include Sunday');
  const weekOffColumn = headerMap.get('Week Off Days');
  const weeklyDaysColumn = headerMap.get('Weekly Days');
  const monthlyDayColumn = headerMap.get('Monthly Day');
  const yearlyDurationColumn = headerMap.get('Yearly Duration');

  for (let rowNumber = rowIndex; rowNumber <= maxValidationRow; rowNumber += 1) {
    if (assignedColumn) {
      worksheet.getCell(rowNumber, assignedColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['UserNames'],
        showErrorMessage: true,
        errorTitle: 'Select a user',
        error: 'Choose a user from the dropdown or type a valid username.',
      };
    }

    if (priorityColumn) {
      worksheet.getCell(rowNumber, priorityColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${PRIORITY_OPTIONS.join(',')}"`],
      };
    }

    if (startDateColumn) {
      const cell = worksheet.getCell(rowNumber, startDateColumn);
      cell.numFmt = 'dd/mm/yyyy';
      cell.dataValidation = {
        type: 'date',
        operator: 'between',
        allowBlank: false,
        formulae: [new Date('2020-01-01'), new Date('2100-12-31')],
        showInputMessage: true,
        promptTitle: 'Select a start date',
        prompt: 'Enter a date using the DD/MM/YYYY format.',
      };
    }

    if (endDateColumn) {
      const cell = worksheet.getCell(rowNumber, endDateColumn);
      cell.numFmt = 'dd/mm/yyyy';
      cell.dataValidation = {
        type: 'date',
        operator: 'between',
        allowBlank: true,
        formulae: [new Date('2020-01-01'), new Date('2100-12-31')],
        showInputMessage: true,
        promptTitle: 'Select an end date',
        prompt: 'Leave blank if the sheet does not use End Date.',
      };
    }

    if (foreverColumn) {
      worksheet.getCell(rowNumber, foreverColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${YES_NO_OPTIONS.join(',')}"`],
      };
    }

    if (includeSundayColumn) {
      worksheet.getCell(rowNumber, includeSundayColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${YES_NO_OPTIONS.join(',')}"`],
      };
    }

    if (weekOffColumn) {
      worksheet.getCell(rowNumber, weekOffColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${WEEKDAY_OPTIONS.map(option => option.label).join(',')}"`],
      };
    }

    if (weeklyDaysColumn) {
      worksheet.getCell(rowNumber, weeklyDaysColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${WEEKDAY_OPTIONS.map(option => option.label).join(',')}"`],
      };
    }

    if (monthlyDayColumn) {
      worksheet.getCell(rowNumber, monthlyDayColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${Array.from({ length: 31 }, (_, index) => index + 1).join(',')}"`],
      };
    }

    if (yearlyDurationColumn) {
      worksheet.getCell(rowNumber, yearlyDurationColumn).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${YEARLY_DURATION_OPTIONS.join(',')}"`],
      };
    }
  }
};

const mapRowToTaskForm = (
  taskType: TaskType,
  row: ExcelJS.Row,
  headerMap: Map<string, number>,
  users: TemplateUser[],
  warnings: string[],
) => {
  const rowLabel = `${taskType} row ${row.number}`;

  const title = getCellText(row, headerMap, 'Task Title');
  const description = getCellText(row, headerMap, 'Description');
  const assignedTo = resolveUsers(getCellValue(row, headerMap, 'Assigned To'), users, rowLabel, warnings);
  const priorityRaw = getCellText(row, headerMap, 'Priority').toLowerCase();
  const foreverRaw = getCellValue(row, headerMap, 'Forever');
  const startDate = parseExcelDateValue(getCellValue(row, headerMap, 'Start Date'));
  const endDate = parseExcelDateValue(getCellValue(row, headerMap, 'End Date'));
  const isForever =
    taskType === 'yearly'
      ? true
      : parseBooleanValue(foreverRaw, false);
  const includeSunday = parseBooleanValue(getCellValue(row, headerMap, 'Include Sunday'), false);
  const weekOffDays = parseWeekdayList(getCellValue(row, headerMap, 'Week Off Days'));
  const weeklyDays = parseWeekdayList(getCellValue(row, headerMap, 'Weekly Days'));
  const monthlyDay = parseNumberValue(getCellValue(row, headerMap, 'Monthly Day'), 1, 1, 31);
  const yearlyDuration = parseNumberValue(getCellValue(row, headerMap, 'Yearly Duration'), 3, 1, 10);

  const hasAnyValue =
    !isBlank(title) ||
    !isBlank(description) ||
    assignedTo.length > 0 ||
    !isBlank(priorityRaw) ||
    !!startDate ||
    !!endDate ||
    (taskType !== 'yearly' && parseBooleanValue(foreverRaw, false)) ||
    includeSunday ||
    weekOffDays.length > 0 ||
    weeklyDays.length > 0 ||
    monthlyDay !== 1 ||
    yearlyDuration !== 3;

  if (!hasAnyValue) {
    return null;
  }

  if (!title) {
    warnings.push(`${rowLabel}: Task Title is missing.`);
  }

  if (taskType === 'weekly' && weeklyDays.length === 0) {
    warnings.push(`${rowLabel}: Weekly Days is empty.`);
  }

  if (!startDate) {
    warnings.push(`${rowLabel}: Start Date is missing.`);
  }

  if ((taskType === 'daily' || taskType === 'fortnightly' || taskType === 'monthly' || taskType === 'weekly') && !isForever && !endDate) {
    warnings.push(`${rowLabel}: End Date is missing and Forever is not set to Yes.`);
  }

  return {
    ...buildTaskForm(taskType),
    title,
    description,
    assignedTo,
    priority: PRIORITY_OPTIONS.includes(priorityRaw as typeof PRIORITY_OPTIONS[number]) ? priorityRaw : 'normal',
    startDate,
    endDate,
    isForever,
    includeSunday,
    weekOffDays,
    weeklyDays,
    monthlyDay,
    yearlyDuration,
  };
};

const configureWorksheetLayout = (
  worksheet: ExcelJS.Worksheet,
  headers: string[],
  note: string,
  sheetTitle: string,
) => {
  const totalColumns = headers.length;
  worksheet.views = [{ state: 'frozen', ySplit: 3 }];
  worksheet.columns = headers.map((header) => {
    const widthMap: Record<string, number> = {
      'Task Title': 28,
      Description: 36,
      'Assigned To': 24,
      Priority: 12,
      'Start Date': 14,
      'End Date': 14,
      Forever: 10,
      'Include Sunday': 14,
      'Week Off Days': 20,
      'Weekly Days': 20,
      'Monthly Day': 12,
      'Yearly Duration': 14,
    };

    return { width: widthMap[header] ?? 16 };
  });

  worksheet.mergeCells(1, 1, 1, totalColumns);
  worksheet.getCell(1, 1).value = sheetTitle;
  worksheet.mergeCells(2, 1, 2, totalColumns);
  worksheet.getCell(2, 1).value = note;

  headers.forEach((header, columnIndex) => {
    worksheet.getCell(3, columnIndex + 1).value = header;
  });

  applyInstructionStyles(worksheet, 1, totalColumns);
  applyInstructionStyles(worksheet, 2, totalColumns);
  applyHeaderStyles(worksheet, 3, totalColumns);

  worksheet.autoFilter = `A3:${getColumnLetter(totalColumns)}3`;
};

export const generateAssignTaskTemplate = async (users: TemplateUser[]) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Task Management System';
  workbook.title = 'Assign Task Template';
  workbook.created = new Date();

  const instructionsSheet = workbook.addWorksheet('Instructions');
  instructionsSheet.columns = [
    { width: 24 },
    { width: 24 },
    { width: 48 },
    { width: 48 },
  ];

  instructionsSheet.mergeCells('A1:D1');
  instructionsSheet.getCell('A1').value = 'Assign Task Excel Template';
  instructionsSheet.mergeCells('A2:D2');
  instructionsSheet.getCell('A2').value =
    'Fill one row per task. Use the task-type sheet that matches the task schedule. Row 3 is the header row and row 4 is the first data row.';
  instructionsSheet.getCell('A4').value = 'Task Type';
  instructionsSheet.getCell('B4').value = 'Required Fields';
  instructionsSheet.getCell('C4').value = 'Notes';

  const instructionRows = [
    ['Daily', 'Task Title, Assigned To, Start Date, End Date', 'Include Sunday and Week Off Days are optional.'],
    ['Weekly', 'Task Title, Assigned To, Start Date, End Date, Weekly Days', 'Weekly Days is required. Week Off Days is optional.'],
    ['Fortnightly', 'Task Title, Assigned To, Start Date, End Date', 'Include Sunday and Week Off Days are optional.'],
    ['Monthly', 'Task Title, Assigned To, Start Date, End Date, Monthly Day', 'Monthly Day is required.'],
    ['Quarterly', 'Task Title, Assigned To, Start Date', 'End Date and Forever are not used on this sheet.'],
    ['Yearly', 'Task Title, Assigned To, Start Date, Yearly Duration', 'Yearly Duration uses 3, 5, or 10 years. End Date and Forever are not used.'],
  ];

  instructionRows.forEach((row, index) => {
    const rowNumber = 5 + index;
    instructionsSheet.getCell(`A${rowNumber}`).value = row[0];
    instructionsSheet.getCell(`B${rowNumber}`).value = row[1];
    instructionsSheet.getCell(`C${rowNumber}`).value = row[2];
    instructionsSheet.mergeCells(`C${rowNumber}:D${rowNumber}`);
  });

  instructionsSheet.getCell('A13').value = 'Shared rules';
  instructionsSheet.getCell('A14').value = 'Assigned To';
  instructionsSheet.getCell('B14').value = 'Choose one or more users from the dropdown or type usernames separated by commas.';
  instructionsSheet.mergeCells('B14:D14');
  instructionsSheet.getCell('A15').value = 'Forever';
  instructionsSheet.getCell('B15').value = 'Defaults to No if left blank.';
  instructionsSheet.mergeCells('B15:D15');
  instructionsSheet.getCell('A16').value = 'Include Sunday';
  instructionsSheet.getCell('B16').value = 'Defaults to No if left blank.';
  instructionsSheet.mergeCells('B16:D16');
  instructionsSheet.getCell('A17').value = 'Priority';
  instructionsSheet.getCell('B17').value = 'Use normal or high. Leave blank to use normal.';
  instructionsSheet.mergeCells('B17:D17');
  instructionsSheet.getCell('A18').value = 'Week Off Days / Weekly Days';
  instructionsSheet.getCell('B18').value = 'Use comma-separated weekday names such as Mon, Wed or Friday, Sunday.';
  instructionsSheet.mergeCells('B18:D18');
  instructionsSheet.getCell('A19').value = 'Dates';
  instructionsSheet.getCell('B19').value = 'Use DD/MM/YYYY format. The sheet applies date validation to any date cells that appear on the selected sheet.';
  instructionsSheet.mergeCells('B19:D19');

  for (let rowIndex = 1; rowIndex <= 19; rowIndex += 1) {
    applyInstructionStyles(instructionsSheet, rowIndex, 4);
  }

  instructionsSheet.getCell('A13').font = { bold: true, size: 12 };
  instructionsSheet.getCell('A13').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'E0F2FE' },
  };

  if (users.length > 0) {
    const usersSheet = workbook.addWorksheet('Users');
    usersSheet.columns = [{ header: 'Username', key: 'username', width: 28 }];
    usersSheet.getRow(1).font = { bold: true };
    usersSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0F766E' },
    };
    usersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };

    users.forEach((user, index) => {
      usersSheet.getCell(index + 2, 1).value = user.username;
    });

    workbook.definedNames.add(`Users!$A$2:$A$${users.length + 1}`, 'UserNames');
    usersSheet.state = 'hidden';
  }

  SHEET_SPECS.forEach((spec) => {
    const worksheet = workbook.addWorksheet(spec.sheetName);
    const headers = [...COMMON_HEADERS];

    if (spec.includeWeeklyDays) {
      headers.push('Weekly Days');
    }

    if (spec.includeMonthlyDay) {
      headers.push('Monthly Day');
    }

    if (spec.includeYearlyDuration) {
      headers.push('Yearly Duration');
    }

    if (!spec.includeEndDate) {
      const endDateIndex = headers.indexOf('End Date');
      if (endDateIndex >= 0) {
        headers.splice(endDateIndex, 1);
      }
    }

    if (!spec.includeForever) {
      const foreverIndex = headers.indexOf('Forever');
      if (foreverIndex >= 0) {
        headers.splice(foreverIndex, 1);
      }
    }

    configureWorksheetLayout(
      worksheet,
      headers,
      spec.note,
      `${spec.sheetName} Recurring Task Template`,
    );

    if (users.length > 0) {
      applyInputValidation(worksheet, 4, new Map(headers.map((header, index) => [header, index + 1])), 1000);
    } else {
      const assignedColumn = headers.indexOf('Assigned To') + 1;
      if (assignedColumn > 0) {
        worksheet.getCell(4, assignedColumn).note = 'Load users in the app to enable the dropdown list.';
      }
    }
  });

  return workbook.xlsx.writeBuffer();
};

export const parseAssignTaskTemplate = async (
  file: File,
  users: TemplateUser[],
) => {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const tasks: TemplateTaskForm[] = [];
  const warnings: string[] = [];
  const countsByTaskType = {
    daily: 0,
    weekly: 0,
    fortnightly: 0,
    monthly: 0,
    quarterly: 0,
    yearly: 0,
  } satisfies Record<TaskType, number>;

  SHEET_SPECS.forEach((spec) => {
    const worksheet = workbook.getWorksheet(spec.sheetName);
    if (!worksheet) {
      return;
    }

    const headerRowIndex = findHeaderRow(worksheet);
    if (!headerRowIndex) {
      warnings.push(`${spec.sheetName}: Header row not found.`);
      return;
    }

    const headerMap = buildHeaderMap(worksheet, headerRowIndex);
    if (!headerMap.has('Task Title') || !headerMap.has('Assigned To')) {
      warnings.push(`${spec.sheetName}: Missing Task Title or Assigned To header.`);
      return;
    }

    for (let rowNumber = headerRowIndex + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const task = mapRowToTaskForm(spec.taskType, row, headerMap, users, warnings);
      if (!task) {
        continue;
      }

      tasks.push(task);
      countsByTaskType[spec.taskType] += 1;
    }
  });

  return {
    tasks,
    summary: {
      fileName: file.name,
      totalTasks: tasks.length,
      countsByTaskType,
      warnings,
    } satisfies TemplateImportSummary,
  };
};

export const TASK_TEMPLATE_TASK_TYPES = SUPPORTED_TASK_TYPES;

export const TASK_TEMPLATE_LABELS: Record<TaskType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export const TASK_TEMPLATE_DAY_OPTIONS = WEEKDAY_OPTIONS.map(option => ({
  value: option.value,
  label: option.label,
}));
