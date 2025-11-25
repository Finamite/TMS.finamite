interface Revision {
  oldDate: string;
  newDate: string;
  remarks: string;
  revisedBy: { username: string };
  revisedAt: string;
}

interface Attachment {
  filename: string;
  originalName: string;
  path: string;
  size: number;
  uploadedAt: string;
}


export interface Task {
  _id: string;
  title: string;
  description: string;
  taskType: string;
  assignedBy: { username: string; email: string };
  assignedTo: {
    _id: any; username: string; email: string 
};
  dueDate?: string;
  priority: string;
  status: string;
  revisionCount: number;
  revisions: Revision[];
  completedAt?: string;
  completionRemarks?: string;
  createdAt: string;
  attachments: Attachment[];
  completionAttachments?: Attachment[];
  
}
  