import React from 'react';
import { Modal } from '../../ui';
import './ConfirmDialog.css';

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
      maxWidth="400px"
      footer={
        <>
          <button
            type="button"
            className="confirm-dialog-btn cancel"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog-btn confirm ${variant}`}
            onClick={() => onConfirm()}
            disabled={isProcessing}
          >
            {isProcessing ? 'Please wait…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-dialog-message">{message}</div>
    </Modal>
  );
};

export default ConfirmDialog;
