import React, { useState } from 'react';
import { CheckSquare, Paperclip, X, Upload, File } from 'lucide-react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';

interface TaskCompletionModalProps {
  taskId: string;
  taskTitle: string;
  isRecurring?: boolean;
  allowAttachments: boolean;
  mandatoryAttachments: boolean;
  mandatoryRemarks: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const TaskCompletionModal: React.FC<TaskCompletionModalProps> = ({
  taskId,
  taskTitle,
  isRecurring = false,
  allowAttachments,
  mandatoryAttachments,
  mandatoryRemarks,
  onClose,
  onComplete
}) => {
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ remarks?: string; attachments?: string }>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...files]);
      setErrors(prev => ({ ...prev, attachments: '' }));
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (files: File[]): Promise<any[]> => {
    if (files.length === 0) return [];

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const response = await axios.post(`${address}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.files;
    } catch (error) {
      console.error('Error uploading files:', error);
      throw new Error('Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { remarks?: string; attachments?: string } = {};

    if (mandatoryRemarks && !completionRemarks.trim()) {
      newErrors.remarks = 'Completion remarks are required';
    }

    if (mandatoryAttachments && attachments.length === 0) {
      newErrors.attachments = 'At least one attachment is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCompleteTask = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      let uploadedFiles: any[] = [];
      
      if (allowAttachments && attachments.length > 0) {
        uploadedFiles = await uploadFiles(attachments);
      }

      const payload: any = {};
      
      if (completionRemarks.trim()) {
        payload.completionRemarks = completionRemarks.trim();
      }
      
      if (uploadedFiles.length > 0) {
        payload.completionAttachments = uploadedFiles;
      }

      await axios.post(`${address}/api/tasks/${taskId}/complete`, payload);
      onComplete();
    } catch (error) {
      console.error('Error completing task:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-background)] rounded-xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 p-6 border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-[var(--color-success)]/20 rounded-full flex items-center justify-center mr-4">
                <CheckSquare size={24} className="text-[var(--color-success)]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Complete Task</h3>
                <p className="text-sm text-[var(--color-textSecondary)] truncate max-w-md">{taskTitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--color-textSecondary)] hover:text-[var(--color-text)] transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <div className="bg-[var(--color-primary)]/10 p-4 rounded-lg border-l-4 border-[var(--color-primary)] mb-6">
              <p className="text-sm text-[var(--color-text)]">
                {isRecurring 
                  ? "This will mark the current occurrence as complete. The next occurrence will be automatically scheduled according to the task's recurrence pattern."
                  : "This will mark the task as complete. Once completed, this one-time task will be moved to the completed tasks list."
                }
              </p>
            </div>

            <div className="space-y-6">
              {/* Completion Remarks */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                  Completion Remarks {mandatoryRemarks && <span className="text-[var(--color-error)]">*</span>}
                  {!mandatoryRemarks && <span className="text-[var(--color-textSecondary)] text-xs">(Optional)</span>}
                </label>
                <textarea
                  value={completionRemarks}
                  onChange={(e) => {
                    setCompletionRemarks(e.target.value);
                    if (errors.remarks) setErrors(prev => ({ ...prev, remarks: '' }));
                  }}
                  rows={4}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] transition-colors bg-[var(--color-surface)] text-[var(--color-text)] ${
                    errors.remarks ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'
                  }`}
                  placeholder="Add completion notes, observations, results, or any relevant details..."
                />
                {errors.remarks && (
                  <p className="text-sm text-[var(--color-error)] mt-1">{errors.remarks}</p>
                )}
              </div>

              {/* File Attachments */}
              {allowAttachments && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                    Completion Attachments {mandatoryAttachments && <span className="text-[var(--color-error)]">*</span>}
                    {!mandatoryAttachments && <span className="text-[var(--color-textSecondary)] text-xs">(Optional)</span>}
                  </label>
                  
                  <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    errors.attachments ? 'border-[var(--color-error)]' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                  }`}>
                    <Upload size={32} className="mx-auto text-[var(--color-textSecondary)] mb-2" />
                    <p className="text-sm text-[var(--color-textSecondary)] mb-2">
                      Click to select files or drag and drop
                    </p>
                    <p className="text-sm text-[var(--color-textSecondary)] mb-2">
                    Supported formats: PDF, images (JPG, PNG), documents (DOCX, XLSX), voice recordings.
                    </p>
                    <p className="text-xs text-[var(--color-textSecondary)] mb-4">
                      Maximum file size: 10MB per file
                    </p>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                      disabled={uploading || submitting}
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                    >
                      <Paperclip size={16} />
                      Select Files
                    </label>
                  </div>

                  {errors.attachments && (
                    <p className="text-sm text-[var(--color-error)] mt-1">{errors.attachments}</p>
                  )}

                  {/* File List */}
                  {attachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-sm font-medium text-[var(--color-text)]">
                        Selected Files ({attachments.length})
                      </h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {attachments.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <File size={20} className="text-[var(--color-primary)] flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--color-text)] truncate">
                                  {file.name}
                                </p>
                                <p className="text-xs text-[var(--color-textSecondary)]">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeAttachment(index)}
                              disabled={uploading || submitting}
                              className="p-1 text-[var(--color-error)] hover:bg-[var(--color-error)]/10 rounded transition-colors disabled:opacity-50"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex space-x-3 pt-4 border-t border-[var(--color-border)]">
            <button
              onClick={handleCompleteTask}
              disabled={submitting || uploading}
              className="flex-1 py-3 px-4 bg-[var(--color-success)] hover:opacity-90 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting || uploading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {uploading ? 'Uploading...' : 'Completing...'}
                </>
              ) : (
                <>
                  <CheckSquare size={18} />
                  Complete Task
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={submitting || uploading}
              className="flex-1 py-3 px-4 bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-[var(--color-text)] rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskCompletionModal;