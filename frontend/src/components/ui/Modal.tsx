'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/useFocusTrap';

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

/** A centred popup on desktop; on phones a full-screen sheet that slides in from the right, with a back arrow. */
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

  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  if (!open) return null;

  return (
    <>
      <div
        className="modal-backdrop fixed inset-0 z-50 bg-dark-950/60 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 max-sm:items-stretch max-sm:overflow-hidden max-sm:p-0">
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative w-full ${maxWidthClass[maxWidth]} modal-panel max-h-[90vh] overflow-y-auto rounded-3xl border border-line bg-white shadow-[0_30px_80px_-30px_rgb(20_40_110/0.5)] dark:border-line dark:bg-dark-800 dark:shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)] max-sm:max-h-none max-sm:rounded-none max-sm:border-0`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-white px-6 py-4 dark:border-line dark:bg-dark-800 max-sm:px-2">
            <button
              type="button"
              onClick={onClose}
              className="-my-2 hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-dark-700 hover:bg-primary-50 dark:text-dark-200 dark:hover:bg-white/10 max-sm:flex"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
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
              className="rounded-full p-2 text-dark-500 transition-colors hover:bg-primary-50 dark:text-dark-400 dark:hover:bg-white/10 max-sm:hidden"
              aria-label="Close modal"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 max-sm:p-4">{children}</div>
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
    <div className="flex justify-end gap-3 border-t border-line pt-4 dark:border-line">
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
