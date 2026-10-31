import React from 'react';
import { Modal, Button } from '../../ui';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  isProcessing?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isProcessing = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!isProcessing) onCancel(); }}
      title={title}
      maxWidth="420px"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <Button variant="secondary" onClick={onCancel} disabled={isProcessing} className="w-full sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={() => onConfirm()}
            loading={isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Please wait…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-base text-ink-2 leading-relaxed">{message}</div>
    </Modal>
  );
};

export default ConfirmDialog;
