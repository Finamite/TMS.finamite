import ExcelJS from 'exceljs';

/**
 * Generate Excel file for admin/manager reports
 */
export async function generateAdminExcelReport(data, companyName, reportType) {
  const workbook = new ExcelJS.Workbook();
  
  // Set workbook properties
  workbook.creator = 'Task Management System';
  workbook.title = `${reportType} Report - ${companyName}`;
  workbook.created = new Date();

  // ===============================
  // 1. SUMMARY SHEET
  // ===============================
  const summarySheet = workbook.addWorksheet('Summary');
  
  // Header styling
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '366092' } },
    alignment: { horizontal: 'center' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };

  // Add title
  summarySheet.mergeCells('A1:D1');
  summarySheet.getCell('A1').value = `${reportType} Report - ${companyName}`;
  summarySheet.getCell('A1').style = headerStyle;
  summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };

  // Add generated date
  summarySheet.getCell('A2').value = `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  // Company metrics summary
  summarySheet.getCell('A4').value = 'Overall Metrics';
  summarySheet.getCell('A4').style = headerStyle;
  summarySheet.mergeCells('A4:D4');

  const metrics = [
    ['Total Pending Tasks', data.totalPending || 0],
    ['Total Overdue Tasks', data.totalOverdue || 0],
    ['Completed Today', data.completedToday || 0],
    ['Completion Rate', `${data.completionRate || 0}%`]
  ];

  metrics.forEach((metric, index) => {
    const row = 5 + index;
    summarySheet.getCell(`A${row}`).value = metric[0];
    summarySheet.getCell(`B${row}`).value = metric[1];
  });

  // ===============================
  // 2. STAFF PERFORMANCE SHEET
  // ===============================
  if (data.staffPerformance && data.staffPerformance.length > 0) {
    const staffSheet = workbook.addWorksheet('Staff Performance');
    
    staffSheet.mergeCells('A1:H1');
    staffSheet.getCell('A1').value = 'Staff Performance Overview';
    staffSheet.getCell('A1').style = headerStyle;

    // Headers
    const staffHeaders = [
      'Staff Member', 'Today Tasks', 'Overdue Tasks', 'In Progress', 
      'Coming Up (7 days)', 'High Priority', 'Completion Rate', 'Performance'
    ];

    staffHeaders.forEach((header, index) => {
      const cell = staffSheet.getCell(2, index + 1);
      cell.value = header;
      cell.style = headerStyle;
    });

    // Staff data
    data.staffPerformance.forEach((staff, index) => {
      const row = 3 + index;
      staffSheet.getCell(`A${row}`).value = staff.username;
      staffSheet.getCell(`B${row}`).value = staff.todayTasks || 0;
      staffSheet.getCell(`C${row}`).value = staff.overdueTasks || 0;
      staffSheet.getCell(`D${row}`).value = staff.inProgressTasks || 0;
      staffSheet.getCell(`E${row}`).value = staff.upcomingTasks || 0;
      staffSheet.getCell(`F${row}`).value = staff.highPriorityTasks || 0;
      staffSheet.getCell(`G${row}`).value = `${staff.completionRate || 0}%`;
      staffSheet.getCell(`H${row}`).value = staff.performance || 'N/A';
    });
  }

  // ===============================
  // 3. HIGH PRIORITY TASKS SHEET
  // ===============================
  if (data.highPriorityPending && data.highPriorityPending.length > 0) {
    const prioritySheet = workbook.addWorksheet('High Priority Tasks');
    
    prioritySheet.mergeCells('A1:F1');
    prioritySheet.getCell('A1').value = 'High Priority Tasks';
    prioritySheet.getCell('A1').style = headerStyle;

    const priorityHeaders = ['Task Title', 'Assigned To', 'Due Date', 'Priority', 'Status', 'Description'];
    priorityHeaders.forEach((header, index) => {
      const cell = prioritySheet.getCell(2, index + 1);
      cell.value = header;
      cell.style = headerStyle;
    });

    data.highPriorityPending.forEach((task, index) => {
      const row = 3 + index;
      prioritySheet.getCell(`A${row}`).value = task.title;
      prioritySheet.getCell(`B${row}`).value = task.assignedTo?.username || 'Unassigned';
      prioritySheet.getCell(`C${row}`).value = new Date(task.dueDate).toLocaleDateString('en-IN');
      prioritySheet.getCell(`D${row}`).value = task.priority;
      prioritySheet.getCell(`E${row}`).value = task.status;
      prioritySheet.getCell(`F${row}`).value = task.description;
    });
  }

  // ===============================
  // 4. TEAM OVERDUE ANALYSIS
  // ===============================
  if (data.overdueByUser && data.overdueByUser.length > 0) {
    const overdueSheet = workbook.addWorksheet('Overdue Analysis');
    
    overdueSheet.mergeCells('A1:D1');
    overdueSheet.getCell('A1').value = 'Overdue Tasks by Staff';
    overdueSheet.getCell('A1').style = headerStyle;

    const overdueHeaders = ['Staff Member', 'Overdue Count', 'Oldest Overdue', 'Action Required'];
    overdueHeaders.forEach((header, index) => {
      const cell = overdueSheet.getCell(2, index + 1);
      cell.value = header;
      cell.style = headerStyle;
    });

    data.overdueByUser.forEach((user, index) => {
      const row = 3 + index;
      overdueSheet.getCell(`A${row}`).value = user.username;
      overdueSheet.getCell(`B${row}`).value = user.overdueCount;
      overdueSheet.getCell(`C${row}`).value = new Date(user.oldestOverdue).toLocaleDateString('en-IN');
      overdueSheet.getCell(`D${row}`).value = user.overdueCount > 3 ? 'Urgent Follow-up' : 'Follow-up Needed';
    });
  }

  // Auto-fit columns
  workbook.worksheets.forEach(worksheet => {
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate Excel file for personal reports
 */
export async function generatePersonalExcelReport(data, username, reportType) {
  const workbook = new ExcelJS.Workbook();
  
  workbook.creator = 'Task Management System';
  workbook.title = `${reportType} Personal Report - ${username}`;
  workbook.created = new Date();

  // ===============================
  // 1. PERSONAL SUMMARY SHEET
  // ===============================
  const summarySheet = workbook.addWorksheet('My Summary');
  
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '366092' } },
    alignment: { horizontal: 'center' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };

  // Add title
  summarySheet.mergeCells('A1:C1');
  summarySheet.getCell('A1').value = `My ${reportType} Report`;
  summarySheet.getCell('A1').style = headerStyle;

  summarySheet.getCell('A2').value = `User: ${username}`;
  summarySheet.getCell('A3').value = `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  // Personal metrics
  summarySheet.getCell('A5').value = 'Current Status';
  summarySheet.getCell('A5').style = headerStyle;
  summarySheet.mergeCells('A5:C5');

  const personalMetrics = [
    ['Due Today Pending', data.totalPending || 0],
    ['Overdue Tasks', data.totalOverdue || 0],
    ['In Progress', data.inProgressTasks || 0],
    ['Completed Today', data.completedToday || 0]
  ];

  personalMetrics.forEach((metric, index) => {
    const row = 6 + index;
    summarySheet.getCell(`A${row}`).value = metric[0];
    summarySheet.getCell(`B${row}`).value = metric[1];
  });

  // Coming up section
  summarySheet.getCell('A11').value = 'Coming Up (Next 7 Days)';
  summarySheet.getCell('A11').style = headerStyle;
  summarySheet.mergeCells('A11:C11');

  const upcomingMetrics = [
    ['One Time Tasks', data.upcomingOneTime || 0],
    ['Daily Tasks', data.upcomingDaily || 0],
    ['Recurring Tasks', data.upcomingRecurring || 0]
  ];

  upcomingMetrics.forEach((metric, index) => {
    const row = 12 + index;
    summarySheet.getCell(`A${row}`).value = metric[0];
    summarySheet.getCell(`B${row}`).value = metric[1];
  });

  // ===============================
  // 2. TASK DETAILS SHEET
  // ===============================
  if (data.allTasks && data.allTasks.length > 0) {
    const tasksSheet = workbook.addWorksheet('Task Details');
    
    tasksSheet.mergeCells('A1:F1');
    tasksSheet.getCell('A1').value = 'My Task Details';
    tasksSheet.getCell('A1').style = headerStyle;

    const taskHeaders = ['Task Title', 'Type', 'Due Date', 'Priority', 'Status', 'Description'];
    taskHeaders.forEach((header, index) => {
      const cell = tasksSheet.getCell(2, index + 1);
      cell.value = header;
      cell.style = headerStyle;
    });

    data.allTasks.forEach((task, index) => {
      const row = 3 + index;
      tasksSheet.getCell(`A${row}`).value = task.title;
      tasksSheet.getCell(`B${row}`).value = task.taskType;
      tasksSheet.getCell(`C${row}`).value = new Date(task.dueDate).toLocaleDateString('en-IN');
      tasksSheet.getCell(`D${row}`).value = task.priority;
      tasksSheet.getCell(`E${row}`).value = task.status;
      tasksSheet.getCell(`F${row}`).value = task.description;
    });
  }

  // Auto-fit columns
  workbook.worksheets.forEach(worksheet => {
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
  });

  return await workbook.xlsx.writeBuffer();
}