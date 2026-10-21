'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '4xl' | '6xl';
}

const maxWidthClass = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'lg',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="modal-backdrop fixed inset-0 z-50 bg-dark-950/60 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative w-full ${maxWidthClass[maxWidth]} modal-panel max-h-[90vh] overflow-y-auto rounded-3xl border border-line bg-white shadow-[0_30px_80px_-30px_rgb(20_40_110/0.5)] dark:border-primary-300/15 dark:bg-dark-800 dark:shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-6 py-4 dark:border-primary-300/10 dark:bg-dark-800">
            <div>
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-dark-900 dark:text-white">
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-sm text-dark-500 dark:text-dark-400">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-dark-500 transition-colors hover:bg-primary-50 dark:text-dark-400 dark:hover:bg-white/10"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </>
  );
}

interface ModalFooterProps {
  onCancel: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export function ModalFooter({
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
  confirmLabel = 'Save',
  loading = false,
  loadingLabel,
  disabled = false,
  type = 'button',
}: ModalFooterProps) {
  return (
    <div className="flex justify-end gap-3 border-t border-line pt-4 dark:border-primary-300/10">
      <button type="button" onClick={onCancel} className="btn-secondary">
        {cancelLabel}
      </button>
      <button
        type={type}
        onClick={onConfirm}
        disabled={loading || disabled}
        className="btn-primary"
      >
        {loading ? (loadingLabel ?? 'Saving…') : confirmLabel}
      </button>
    </div>
  );
}
