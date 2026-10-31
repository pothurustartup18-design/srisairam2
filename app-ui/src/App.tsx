/**
 * App.tsx — Thin root orchestrator
 *
 * Responsibilities:
 *  1. Owns shared data that all portals need: students, teachers, events
 *  2. Owns user authentication state
 *  3. Routes to the correct portal based on the logged-in user role
 *
 * All business logic, state, and UI live inside the role-specific portals:
 *  - LoginPage     → role selection + credential input
 *  - AdminPortal   → full admin dashboard (components/admin/*)
 *  - TeacherPortal → teacher dashboard   (components/teacher/*)
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { AlertTriangle, GraduationCap } from 'lucide-react';

const LoginPage = lazy(() => import('./components/shared/LoginPage/LoginPage'));
const SuperAdminLoginPage = lazy(() => import('./components/shared/LoginPage/SuperAdminLoginPage'));
const ForgotPasswordPage = lazy(() => import('./components/shared/LoginPage/ForgotPasswordPage'));
const AdminPortal = lazy(() => import('./components/admin/AdminPortal/AdminPortal'));
const TeacherPortal = lazy(() => import('./components/teacher/TeacherPortal/TeacherPortal'));
const ParentPortal = lazy(() => import('./components/parent/ParentPortal/ParentPortal'));
const VerifyReceipt = lazy(() => import('./components/shared/VerifyReceipt/VerifyReceipt'));
const ForcePasswordChangePage = lazy(() => import('./components/shared/LoginPage/ForcePasswordChangePage'));
const VerifyReportCard = lazy(() => import('./components/shared/VerifyReportCard/VerifyReportCard'));
const SuperAdminPortal = lazy(() => import('./components/superadmin/SuperAdminPortal'));

/** Full-screen splash shown while a screen bundle or the session loads. */
const LoadingFallback = ({ label = 'Loading…' }: { label?: string }) => (
  <div className='min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-canvas' role='status' aria-live='polite'>
    <span className='inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue text-white shadow-raised'>
      <GraduationCap size={26} aria-hidden='true' />
    </span>
    <span className='w-6 h-6 rounded-full border-[3px] border-line border-t-blue animate-spin' aria-hidden='true' />
    <span className='text-sm font-semibold text-muted'>{label}</span>
  </div>
);

import type { StudentData, TeacherData, EventData, ToastState } from './types';
import { API_BASE } from './constants';
import { useAuth } from './context/authContext';
import ErrorBoundary from './components/shared/ErrorBoundary/ErrorBoundary';
import { useMobileApp } from './hooks/useMobileApp';
import { errorMessage } from './lib/http';
import { Button } from './components/ui/Button';

/** Shown over a portal when the shared student/teacher/event lists failed to load. */
const DataLoadAlert = ({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) => (
  <div
    role='alert'
    className='fixed left-4 right-4 md:left-auto md:right-6 md:w-[420px] z-[60] flex items-center gap-3 rounded-xl border border-danger/30 bg-surface px-4 py-3 shadow-overlay bottom-[calc(var(--bottomnav-h,64px)+var(--sab,0px)+12px)] md:bottom-6'
  >
    <AlertTriangle size={18} className='text-danger shrink-0' aria-hidden='true' />
    <span className='flex-1 min-w-0 text-sm text-ink-2'>{message}</span>
    <Button size='sm' variant='secondary' onClick={onRetry}>Retry</Button>
  </div>
);

export default function App() {
  useMobileApp();
  const { user, logout, loading: authLoading, isAuthenticated, updateUserProfile } = useAuth();

  // ─── Routing Views for password reset ──────────────────────────────────────────
  const [currentView, setCurrentView] = useState<'login' | 'forgot-password'>('login');

  // ─── Shared Data ─────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<StudentData[]>([]);
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // ─── Login toast (only needed on login screen) ────────────────────────────────
  const [loginToast, setLoginToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  const showLoginToast = (message: string, type: 'success' | 'error' = 'success') => {
    setLoginToast({ show: true, message, type });
    setTimeout(() => setLoginToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // ─── Load shared data from the API ───────────────────────────────────────────
  const loadData = async (silent?: boolean) => {
    const isSilent = silent ?? (students.length > 0 || teachers.length > 0 || !loading);
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const [resStudents, resTeachers, resEvents] = await Promise.all([
        fetch(`${API_BASE}/dashboard/students?t=${Date.now()}`),
        fetch(`${API_BASE}/teachers?t=${Date.now()}`),
        fetch(`${API_BASE}/events?t=${Date.now()}`),
      ]);
      // 401/403 just mean this role can't see that list; anything 5xx is a real failure.
      const serverFailed = [resStudents, resTeachers, resEvents].some((r) => r.status >= 500);
      const [jsStudents, jsTeachers, jsEvents] = await Promise.all([
        resStudents.json().catch(() => ({})),
        resTeachers.json().catch(() => ({})),
        resEvents.json().catch(() => ({})),
      ]);

      if (jsStudents.success) setStudents(jsStudents.data);
      if (jsTeachers.success) setTeachers(jsTeachers.data);
      if (jsEvents.success) setEvents(jsEvents.data);
      setDataError(serverFailed ? 'Some school records couldn’t be loaded. The server ran into a problem.' : null);
    } catch (err) {
      console.error('Error loading database records.', err);
      setDataError(errorMessage(err, 'School records couldn’t be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // ─── Theme Initialization & Global Expose ──────────────────────────────────
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    (window as any).toggleAppTheme = () => {
      const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      
      localStorage.setItem('theme', nextTheme);
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: nextTheme }));
    };
  }, []);

  // ─── Route to Public Receipt Verification ──────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const verifyToken = urlParams.get('verify_token');
  if (verifyToken) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <VerifyReceipt />
      </Suspense>
    );
  }

  // ─── Route to Public Report Card Verification ───────────────────────────────────
  const reportVerifyToken = urlParams.get('report_verify_token');
  if (reportVerifyToken) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <VerifyReportCard />
      </Suspense>
    );
  }

  // ─── Loading screen ───────────────────────────────────────────────────────────
  if (authLoading || (isAuthenticated && loading)) {
    return <LoadingFallback label='Loading SchoolHub…' />;
  }

  // ─── Route to Login or Forgot Password ───────────────────────────────────────────
  if (!isAuthenticated || !user) {
    const isSuperAdminRoute = window.location.pathname === '/superadmin' || window.location.pathname === '/super-admin';

    if (currentView === 'forgot-password') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <ForgotPasswordPage
            toast={loginToast}
            onBackToLogin={() => setCurrentView('login')}
            onShowToast={showLoginToast}
          />
        </Suspense>
      );
    }

    if (isSuperAdminRoute) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <SuperAdminLoginPage
            toast={loginToast}
            onShowToast={showLoginToast}
            onForgotPasswordClick={() => setCurrentView('forgot-password')}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<LoadingFallback />}>
        <LoginPage
          teachers={teachers}
          students={students}
          toast={loginToast}
          onLogin={() => {}}
          onShowToast={showLoginToast}
          onForgotPasswordClick={() => setCurrentView('forgot-password')}
        />
      </Suspense>
    );
  }

  // ─── Route to Force Password Change ────────────────────────────────────────────
  if (user.mustChangePassword) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <ForcePasswordChangePage
          user={user}
          onPasswordChanged={() => {
            updateUserProfile({ mustChangePassword: false });
          }}
          onLogout={logout}
          showToast={showLoginToast}
        />
      </Suspense>
    );
  }

  // ─── Route to SuperAdmin Portal ───────────────────────────────────────────────
  if (user.role === 'superadmin') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <SuperAdminPortal user={user} onLogout={logout} />
      </Suspense>
    );
  }

  // ─── Route to Admin Portal ────────────────────────────────────────────────────
  // 'other' (custom employee) goes here too, not to TeacherPortal: AdminPortal's
  // sidebar and view-switching are already permission-gated throughout
  // (hasPermission(...) checks per section, with an auto-redirect to whichever
  // view the user actually has access to — see the useEffect right after this
  // component's props). TeacherPortal has no fee/student/settings screens at
  // all, so a custom employee granted e.g. fees:view had literally nowhere to
  // see that data before this — permissions were being checked but there was no
  // permission-aware screen for a custom employee to land on.
  if (user.role === 'admin' || user.role === 'other') {
    return (
      <>
        <Suspense fallback={<LoadingFallback />}>
          <AdminPortal
            user={user}
            students={students}
            teachers={teachers}
            events={events}
            onLogout={logout}
            onDataReload={loadData}
          />
        </Suspense>
        {dataError && <DataLoadAlert message={dataError} onRetry={() => loadData(true)} />}
      </>
    );
  }

  // ─── Route to Teacher Portal ──────────────────────────────────────────────────
  if (user.role === 'teacher') {
    return (
      <>
        <Suspense fallback={<LoadingFallback />}>
          <TeacherPortal
            user={user}
            students={students}
            teachers={teachers}
            events={events}
            onLogout={logout}
          />
        </Suspense>
        {dataError && <DataLoadAlert message={dataError} onRetry={() => loadData(true)} />}
      </>
    );
  }

  // ─── Route to Parent Portal ──────────────────────────────────────────────────
  if (user.role === 'parent') {
    return (
      <>
        <Suspense fallback={<LoadingFallback />}>
          <ParentPortal
            user={user}
            students={students}
            teachers={teachers}
            events={events}
            onLogout={logout}
          />
        </Suspense>
        {dataError && <DataLoadAlert message={dataError} onRetry={() => loadData(true)} />}
      </>
    );
  }

  // ─── Fallback ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '12px' }}>
      <h2 style={{ color: '#1e293b' }}>Unknown role</h2>
      <button className="action-btn" onClick={logout}>Return to Login</button>
    </div>
  );
}
