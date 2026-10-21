'use client';

import { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';

interface SimpleModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 'sm' | 'md' (default) | 'lg' */
  size?: 'sm' | 'md' | 'lg';
}

/** Always-open modal for conditionally rendered dialogs; wraps `Modal`. */
export function SimpleModal({
  title,
  onClose,
  children,
  size = 'md',
}: SimpleModalProps) {
  return (
    <Modal open onClose={onClose} title={title} maxWidth={size}>
      {children}
    </Modal>
  );
}
