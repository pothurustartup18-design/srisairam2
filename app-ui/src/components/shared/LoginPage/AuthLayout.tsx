import React from 'react';
import './LoginPage.css';
import '../Toast/Toast.css';
import { AlertCircle, CheckCircle2, CalendarCheck, CreditCard, MessageSquare, GraduationCap } from 'lucide-react';
import type { ToastState } from '../../../types';
import { useSchool } from '../../../context/schoolContext';

interface AuthLayoutProps {
  children: React.ReactNode;
  toast?: ToastState;
  maxWidth?: string; // e.g., '420px', '460px'
  className?: string;
  showDecorativeGlows?: boolean;
}

const HIGHLIGHTS = [
  { icon: CalendarCheck, title: 'Attendance', text: 'Daily roll call and term history for every class.' },
  { icon: CreditCard, title: 'Fees & receipts', text: 'Collections, dues and verifiable receipts.' },
  { icon: MessageSquare, title: 'Parent connect', text: 'Notices, homework and direct messages.' },
];

/**
 * Frame for every signed-out screen: a brand panel beside the form on large
 * screens, a compact brand header above it on phones.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  toast,
  maxWidth = '420px',
  className = '',
}) => {
  const { schoolProfile } = useSchool();
  const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
  const schoolLogo = schoolProfile?.schoolInfo?.logo;

  return (
    <div className="login-page-container">
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand-top">
          <span className="auth-brand-mark">
            {schoolLogo ? <img src={schoolLogo} alt="" /> : <GraduationCap size={20} />}
          </span>
          <span className="auth-brand-name">{schoolName}</span>
        </div>
        <div className="auth-brand-body">
          <h2>Everything your school runs on, in one place.</h2>
          <p>One secure sign-in for administrators, teachers and parents.</p>
          <ul>
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="auth-brand-icon"><Icon size={18} /></span>
                <span>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-brand-foot">© {new Date().getFullYear()} {schoolName}</p>
      </aside>

      <main className="auth-main">
        {toast && toast.show && (
          <div className="toast-notification" role={toast.type === 'success' ? 'status' : 'alert'} aria-live="polite">
            {toast.type === 'success'
              ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              : <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        )}

        <div className={`login-card ${className}`} style={{ maxWidth }}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default AuthLayout;
