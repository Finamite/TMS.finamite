import React, { useState } from 'react';
import { CheckSquare, Paperclip, X, Upload, File } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
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
  allowAttachments,
  mandatoryAttachments,
  mandatoryRemarks,
  onClose,
  onComplete
}) => {
  const { isDark } = useTheme();
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ remarks?: string; attachments?: string }>({});
  const [showFullTitle, setShowFullTitle] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...files]);
      setErrors(prev => ({ ...prev, attachments: '' }));
    }
  };

  const isMobile = window.innerWidth <= 768;

  // Limit based on device
  const limit = isMobile ? 15 : 55;

  const truncatedTitle =
    taskTitle.length > limit ? taskTitle.substring(0, limit) + "..." : taskTitle;

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

  const modalStyle = {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-hidden rounded-[28px] border shadow-2xl shadow-black/20"
        style={modalStyle}
      >
        <div
          className="sticky top-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-6 py-5 backdrop-blur-xl"
          style={{ backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.92)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-success)]/12 text-[var(--color-success)] ring-1 ring-[var(--color-success)]/15">
                <CheckSquare size={24} className="text-[var(--color-success)]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">Complete Task</h3>
                <div className="max-w-md text-sm leading-snug text-[var(--color-textSecondary)]">
                  {showFullTitle ? taskTitle : truncatedTitle}

                  {taskTitle.length > limit && (
                    <button
                      onClick={() => setShowFullTitle((prev) => !prev)}
                      className="ml-1 text-xs font-semibold text-[var(--color-primary)] underline decoration-[var(--color-primary)]/40 underline-offset-4"
                    >
                      {showFullTitle ? "Show Less" : "Show More"}
                    </button>
                  )}
                </div>


              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/80 p-2 text-[var(--color-textSecondary)] transition hover:border-[var(--color-primary)]/30 hover:text-[var(--color-text)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-6">
            <div className="space-y-6">
              {/* Completion Remarks */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
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
                  className={`w-full rounded-2xl border px-4 py-3 text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-textSecondary)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 bg-[var(--color-surface)] ${errors.remarks ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'
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
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                    Completion Attachments {mandatoryAttachments && <span className="text-[var(--color-error)]">*</span>}
                    {!mandatoryAttachments && <span className="text-[var(--color-textSecondary)] text-xs">(Optional)</span>}
                  </label>

                  <div className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${errors.attachments ? 'border-[var(--color-error)]' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/40 bg-[var(--color-surface)]/70'
                    }`}>
                    <Upload size={30} className="mx-auto mb-2 text-[var(--color-textSecondary)]" />
                    <p className="mb-2 text-sm text-[var(--color-textSecondary)]">
                      Click to select files or drag and drop
                    </p>
                    <p className="mb-2 text-sm text-[var(--color-textSecondary)]">
                      Supported formats: PDF, images (JPG, JPEG, PNG), documents (DOCX, XLSX), voice recordings.
                    </p>
                    <p className="mb-4 text-xs text-[var(--color-textSecondary)]">
                      Maximum file size: 10MB per file
                    </p>
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,audio/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                      disabled={uploading || submitting}
                    />
                    <label
                      htmlFor="file-upload"
                      className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-2.5 font-semibold text-white shadow-[0_10px_22px_rgba(14,165,233,0.20)] transition hover:-translate-y-0.5 hover:opacity-95"
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
                      <h4 className="text-sm font-semibold text-[var(--color-text)]">
                        Selected Files ({attachments.length})
                      </h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {attachments.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <File size={20} className="text-[var(--color-primary)] flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--color-text)]">
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
                              className="rounded-xl p-1.5 text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10 disabled:opacity-50"
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

          <div className="flex gap-3 border-t border-[var(--color-border)] pt-4">
            <button
              onClick={handleCompleteTask}
              disabled={submitting || uploading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-success)] px-4 py-3 font-semibold text-white shadow-[0_12px_24px_rgba(16,185,129,0.18)] transition hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting || uploading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  {uploading ? 'Uploading...' : 'Completing...'}
                </>
              ) : (
                <>
                  <CheckSquare size={18} />
                  Complete
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={submitting || uploading}
              className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50"
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
