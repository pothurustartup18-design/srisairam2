import React from 'react';
import './Toast.css';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { ToastState } from '../../../types';

interface ToastProps {
  toast: ToastState;
}

const Toast: React.FC<ToastProps> = ({ toast }) => {
  if (!toast.show) return null;

  return (
    <div className="toast-notification" role={toast.type === 'error' ? 'alert' : 'status'} aria-live="polite">
      {toast.type === 'success' ? (
        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" aria-hidden="true" />
      )}
      <span>{toast.message}</span>
    </div>
  );
};

export default Toast;
