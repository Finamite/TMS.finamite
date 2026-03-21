import React, { useEffect } from 'react';
import { ExternalLink, GitBranch, X } from 'lucide-react';
import type { PcmPendingStep } from '../hooks/usePcmIntegration';

interface PcmFormFrameModalProps {
  open: boolean;
  url: string;
  step?: PcmPendingStep | null;
  onClose: () => void;
  onCompleted?: (step?: PcmPendingStep | null) => void;
}

const PcmFormFrameModal: React.FC<PcmFormFrameModalProps> = ({ open, url, step, onClose, onCompleted }) => {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !step?.runId || !step?.stepId) return;

    let allowedOrigin = '*';
    try {
      allowedOrigin = new URL(url).origin;
    } catch {
      allowedOrigin = '*';
    }

    const handleMessage = (event: MessageEvent) => {
      if (allowedOrigin !== '*' && event.origin !== allowedOrigin) return;

      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      const type = String((payload as any).type || '').trim();
      const runId = String((payload as any).runId || '').trim();
      const stepId = String((payload as any).stepId || '').trim();

      if (runId !== String(step.runId || '').trim() || stepId !== String(step.stepId || '').trim()) {
        return;
      }

      if (type === 'pcm-step-completed') {
        onCompleted?.(step);
        onClose();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [open, onClose, onCompleted, step?.runId, step?.stepId, url, step]);

  if (!open) return null;

  const title = step?.stepName || 'PCM Step Form';
  const subtitle = [step?.workflowName || 'PCM Workflow', step?.displayId || step?.runId]
    .filter(Boolean)
    .join(' | ');

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-2">
  <div className="flex items-center gap-3 min-w-0">
    
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-textSecondary)] whitespace-nowrap">
      <GitBranch size={14} />
      PCM Step
    </div>

    <h3 className="truncate text-lg font-bold text-[var(--color-text)]">
      {title}
    </h3>

    <p className="truncate text-xs text-[var(--color-textSecondary)]">
      {subtitle}
    </p>

  </div>

  <button
    type="button"
    onClick={onClose}
    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary)]/10"
    aria-label="Close PCM form"
  >
    <X size={18} />
  </button>
</div>

        <div className="min-h-0 flex-1 bg-[var(--color-background)]">
          <iframe
            title={title}
            src={url}
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-6 py-3 text-xs text-[var(--color-textSecondary)]">
          <span className="inline-flex items-center gap-2">
            <ExternalLink size={14} />
            Complete the step directly inside PCM without leaving TMS
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary)]/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PcmFormFrameModal;
