'use client';

import { Modal } from './Modal';

interface ConfirmDeleteModalProps {
  title?: string;
  description?: string;
  confirmLabel?: string;
  loadingLabel?: string;
  cancelLabel?: string;
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  title = 'Delete Item',
  description = 'Are you sure you want to delete this item? This action cannot be undone.',
  confirmLabel = 'Delete',
  loadingLabel = 'Deleting...',
  cancelLabel = 'Cancel',
  isOpen,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <Modal
      open={isOpen}
      onClose={isLoading ? () => undefined : onCancel}
      title={title}
      maxWidth="md"
    >
      <p className="mb-6 text-dark-600 dark:text-dark-400">{description}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="btn-secondary flex-1"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="inline-flex flex-1 items-center justify-center rounded-control bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgb(212_42_60/0.7)] transition-all hover:bg-red-500 disabled:opacity-50"
        >
          {isLoading ? loadingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
