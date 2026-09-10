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

const LoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
    <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>Loading...</span>
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

import type { StudentData, TeacherData, EventData, ToastState } from './types';
import { API_BASE } from './constants';
import { useAuth } from './context/authContext';
import ErrorBoundary from './components/shared/ErrorBoundary/ErrorBoundary';

export default function App() {
  const { user, logout, loading: authLoading, isAuthenticated, updateUserProfile } = useAuth();

  // ─── Routing Views for password reset ──────────────────────────────────────────
  const [currentView, setCurrentView] = useState<'login' | 'forgot-password'>('login');

  // ─── Shared Data ─────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<StudentData[]>([]);
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

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
      const [jsStudents, jsTeachers, jsEvents] = await Promise.all([
        resStudents.json(),
        resTeachers.json(),
        resEvents.json(),
      ]);

      if (jsStudents.success) setStudents(jsStudents.data);
      if (jsTeachers.success) setTeachers(jsTeachers.data);
      if (jsEvents.success) setEvents(jsEvents.data);
    } catch (err) {
      console.error('Error loading database records. Lists will remain empty.', err);
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
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>Loading SchoolHub...</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
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
    );
  }

  // ─── Route to Teacher Portal ──────────────────────────────────────────────────
  if (user.role === 'teacher') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <TeacherPortal
          user={user}
          students={students}
          teachers={teachers}
          events={events}
          onLogout={logout}
        />
      </Suspense>
    );
  }

  // ─── Route to Parent Portal ──────────────────────────────────────────────────
  if (user.role === 'parent') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <ParentPortal
          user={user}
          students={students}
          teachers={teachers}
          events={events}
          onLogout={logout}
        />
      </Suspense>
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
