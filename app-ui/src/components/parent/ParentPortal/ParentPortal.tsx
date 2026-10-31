import React, { useState, useEffect, lazy, Suspense, useMemo, useRef } from 'react';
import { errorMessage, readJson } from '../../../lib/http';
import type { DataStatus } from '../../../hooks/useApiData';

import {
  Home,
  CalendarCheck,
  Award,
  CreditCard,
  Bell,
  ClipboardList,
  MessageSquare,
  LifeBuoy,
  UserRound,
} from 'lucide-react';
import type {
  UserProfile,
  StudentData,
  TeacherData,
  EventData,
  FeedbackData,
  StudentExamResult,
  ToastState,
} from '../../../types';
import { API_BASE } from '../../../constants';
import Toast from '../../shared/Toast/Toast';
import ErrorBoundary from '../../shared/ErrorBoundary/ErrorBoundary';
import { AppShell, type ShellNavItem } from '../../ui/AppShell/AppShell';
import { SkeletonPage } from '../../ui';
import { useSchool } from '../../../context/schoolContext';

type LoadState = { status: DataStatus; error: string | null };

// ─── Lazy Loaded Views ───────────────────────────────────────────────────────
const ParentDashboard = lazy(() => import('../ParentDashboard/ParentDashboard'));
const ParentProfile = lazy(() => import('../ParentProfile/ParentProfile'));
const ParentResults = lazy(() => import('../ParentResults/ParentResults'));
const ParentAttendance = lazy(() => import('../ParentAttendance/ParentAttendance'));
const ParentFees = lazy(() => import('../ParentFees/ParentFees'));
const ParentFeedback = lazy(() => import('../ParentFeedback/ParentFeedback'));
const ParentMessages = lazy(() => import('../ParentMessages/ParentMessages'));
const HomeworkBoard = lazy(() => import('../../shared/HomeworkBoard/HomeworkBoard'));
const ParentAccountProfile = lazy(() => import('../ParentAccountProfile/ParentAccountProfile'));
const AppUpdates = lazy(() => import('../../shared/AppUpdates/AppUpdates'));
const ParentNotices = lazy(() => import('../ParentNotices/ParentNotices'));

export type ParentView =
  | 'dashboard'
  | 'profile'
  | 'results'
  | 'attendance'
  | 'homework'
  | 'fees'
  | 'feedback'
  | 'messages'
  | 'account'
  | 'notices';

const VIEW_TITLES: Record<ParentView, string> = {
  dashboard: 'Home',
  profile: 'Child Overview',
  results: 'Academic Results',
  attendance: 'Attendance',
  homework: 'Homework',
  fees: 'Fee Details',
  feedback: 'Feedback & Help',
  messages: 'Messages',
  account: 'My Account',
  notices: 'Notices & Events',
};

interface ParentPortalProps {
  user: UserProfile;
  students: StudentData[];
  teachers?: TeacherData[];
  events: EventData[];
  onLogout: () => void;
}

const ParentPortal: React.FC<ParentPortalProps> = ({ user, students, teachers = [], events, onLogout }) => {
  const [activeView, setActiveView] = useState<ParentView>('dashboard');
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  // ─── Multi-ward Detection & Selection ──────────────────────────────────────
  const allWards = useMemo(() => {
    if (students && students.length > 0) {
      // First find primary ward by admissionNo or studentId
      const primaryWards = students.filter(
        (s) => s.admissionNo === user.admissionNo || s.id === user.studentId || (s as any)._id === user.studentId
      );

      // Also find any sibling matching the parent's phone
      const siblingWards = user.phone
        ? students.filter(
          (s) =>
            (s.whatsappNo === user.phone || s.motherWhatsappNo === user.phone) &&
            !primaryWards.some((p) => (p.id || p._id) === (s.id || s._id))
        )
        : [];

      const combined = [...primaryWards, ...siblingWards];
      if (combined.length > 0) return combined;
      return students.slice(0, 1);
    }

    // Default fallback ward constructed from user profile if students list is empty (e.g. for Parent role)
    const fallback: StudentData = {
      id: user.studentId || 'ward-1',
      _id: user.studentId || 'ward-1',
      admissionNo: user.admissionNo || user.username || 'ADM-001',
      name: user.studentName || user.name || 'Student',
      class: user.assignedClass ? user.assignedClass.split('-')[0] : '10',
      section: user.assignedClass ? user.assignedClass.split('-')[1] || 'A' : 'A',
      classTeacher: 'Class Teacher',
      feePaid: 0,
      feePending: 0,
      whatsappNo: user.phone || '',
      motherWhatsappNo: '',
      transportMode: 'school',
      booksFee: 0,
      preferredLanguage: 'en',
      cluster: '',
    };
    return [fallback];
  }, [students, user]);

  const [selectedWardId, setSelectedWardId] = useState<string>(() => {
    if (allWards.length > 0) {
      return allWards[0].id || allWards[0]._id || '';
    }
    return user.studentId || '';
  });

  // Keep selectedWardId synced if wards load after mount
  useEffect(() => {
    if (allWards.length > 0 && !allWards.some((w) => (w.id || w._id) === selectedWardId)) {
      setSelectedWardId(allWards[0].id || allWards[0]._id || '');
    }
  }, [allWards, selectedWardId]);

  const handleSelectWard = (id: string) => {
    setSelectedWardId(id);
  };

  const ward = useMemo(() => {
    const found = allWards.find((s) => (s.id || s._id) === selectedWardId);
    return (
      found ||
      allWards[0] || {
        id: user.studentId || 'ward-1',
        _id: user.studentId || 'ward-1',
        admissionNo: user.admissionNo || 'ADM-001',
        name: user.studentName || user.name || 'Student',
        class: '10',
        section: 'A',
        classTeacher: 'Class Teacher',
        feePaid: 0,
        feePending: 0,
        whatsappNo: user.phone || '',
        motherWhatsappNo: '',
        transportMode: 'school',
        booksFee: 0,
        preferredLanguage: 'en',
        cluster: '',
      }
    );
  }, [allWards, selectedWardId, user]);

  const [examResults, setExamResults] = useState<StudentExamResult[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackData[]>([]);
  const [resultsLoad, setResultsLoad] = useState<LoadState>({ status: 'loading', error: null });
  const [feedbackLoad, setFeedbackLoad] = useState<LoadState>({ status: 'loading', error: null });
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const [messagesRecipient, setMessagesRecipient] = useState<'admin' | 'teacher'>('admin');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  // ─── Data Loaders ──────────────────────────────────────────────────────────
  // Answers for a ward that is no longer selected are ignored.
  const currentWardId = useRef<string | undefined>(undefined);
  currentWardId.current = ward?.id || ward?._id;

  const loadResults = async () => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    setResultsLoad((s) => ({ status: s.status === 'success' ? 'success' : 'loading', error: null }));
    try {
      const data = await readJson(await fetch(`${API_BASE}/marks/student/${studentId}`));
      if (currentWardId.current !== studentId) return;
      setExamResults(data.data || []);
      setResultsLoad({ status: 'success', error: null });
    } catch (err) {
      console.error('Failed to load exam results:', err);
      if (currentWardId.current !== studentId) return;
      setResultsLoad((s) => ({ status: s.status === 'success' ? 'success' : 'error', error: errorMessage(err, 'Exam results couldn’t be loaded.') }));
    }
  };

  const loadFeedbacks = async () => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    setFeedbackLoad((s) => ({ status: s.status === 'success' ? 'success' : 'loading', error: null }));
    try {
      const data = await readJson(await fetch(`${API_BASE}/feedbacks/student/${studentId}`));
      if (currentWardId.current !== studentId) return;
      setFeedbackList(data.data || []);
      setFeedbackLoad({ status: 'success', error: null });
    } catch (err) {
      console.error('Failed to load feedbacks:', err);
      if (currentWardId.current !== studentId) return;
      setFeedbackLoad((s) => ({ status: s.status === 'success' ? 'success' : 'error', error: errorMessage(err, 'Feedback couldn’t be loaded.') }));
    }
  };

  // A different ward starts from a fresh load instead of showing the old ward's data.
  useEffect(() => {
    setExamResults([]);
    setFeedbackList([]);
    setResultsLoad({ status: 'loading', error: null });
    setFeedbackLoad({ status: 'loading', error: null });
  }, [ward?.id, ward?._id]);

  const fetchUnreadCount = async () => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    try {
      const [resAdmin, resTeacher] = await Promise.all([
        fetch(`${API_BASE}/messages/student/${studentId}?recipient=admin`),
        fetch(`${API_BASE}/messages/student/${studentId}?recipient=teacher`),
      ]);
      const dataAdmin = await resAdmin.json();
      const dataTeacher = await resTeacher.json();

      let count = 0;
      if (dataAdmin.success && Array.isArray(dataAdmin.data)) {
        count += dataAdmin.data.filter((m: any) => m.sender === 'admin' && !m.read).length;
      }
      if (dataTeacher.success && Array.isArray(dataTeacher.data)) {
        count += dataTeacher.data.filter((m: any) => m.sender === 'teacher' && !m.read).length;
      }
      setUnreadMessagesCount(count);
    } catch (err) {
      console.error('Failed to load unread message count:', err);
    }
  };

  useEffect(() => {
    loadResults();
    loadFeedbacks();
    fetchUnreadCount();

    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [ward, activeView]);


  const { schoolProfile } = useSchool();

  const handleNavigate = (view: string) => {
    if (view.startsWith('messages:')) {
      setMessagesRecipient(view.split(':')[1] as 'admin' | 'teacher');
      setActiveView('messages');
    } else {
      setActiveView(view as ParentView);
    }
  };

  const navItems: ShellNavItem[] = [
    { key: 'dashboard', label: 'Home', icon: Home, group: 'Overview' },
    { key: 'attendance', label: 'Attendance', icon: CalendarCheck, group: 'Overview' },
    { key: 'results', label: 'Academics', shortLabel: 'Results', icon: Award, group: 'Overview' },
    { key: 'fees', label: 'Fee Details', shortLabel: 'Fees', icon: CreditCard, group: 'Overview' },
    { key: 'homework', label: 'Homework', icon: ClipboardList, group: 'School life' },
    { key: 'notices', label: 'Notices & Events', shortLabel: 'Notices', icon: Bell, group: 'School life' },
    { key: 'profile', label: 'Child Overview', shortLabel: 'Child info', icon: UserRound, group: 'School life' },
    { key: 'messages', label: 'Messages', icon: MessageSquare, group: 'Connect', badge: unreadMessagesCount },
    { key: 'feedback', label: 'Feedback & Help', shortLabel: 'Feedback', icon: LifeBuoy, group: 'Connect' },
  ];

  const wardSwitcher = allWards.length > 1 && (
    <label className="flex items-center gap-2 text-xs font-semibold text-muted">
      <span className="hidden lg:inline">Child</span>
      <select
        className="h-control-sm pl-3 pr-8 border border-line-strong rounded-md text-sm font-semibold text-ink bg-surface outline-none focus:border-blue-500 cursor-pointer max-w-[220px]"
        value={selectedWardId}
        onChange={(e) => setSelectedWardId(e.target.value)}
        aria-label="Select child"
      >
        {allWards.map((w) => (
          <option key={w.id || w._id} value={w.id || w._id}>
            {w.name} ({w.class}-{w.section})
          </option>
        ))}
      </select>
    </label>
  );

  const isMessages = activeView === 'messages';

  return (
    <>
      <Toast toast={toast} />
      <AppShell
        role="parent"
        schoolName={schoolProfile?.schoolInfo?.schoolName || 'SchoolHub'}
        schoolLogo={schoolProfile?.schoolInfo?.logo}
        userName={user.name || 'Parent'}
        userRoleLabel="Parent"
        items={navItems}
        tabs={['dashboard', 'attendance', 'results', 'fees']}
        activeKey={activeView}
        homeKey="dashboard"
        onNavigate={handleNavigate}
        title={VIEW_TITLES[activeView]}
        subtitle={ward ? `${ward.name} · Class ${ward.class}-${ward.section}` : undefined}
        onProfile={() => setActiveView('account')}
        onLogout={onLogout}
        topBarCenter={wardSwitcher || undefined}
        fullHeight={isMessages}
      >
        <ErrorBoundary key={activeView}>
          <Suspense fallback={<SkeletonPage />}>
            {activeView === 'dashboard' && (
              <ParentDashboard
                ward={ward}
                allWards={allWards}
                onSelectWard={(id) => setSelectedWardId(id)}
                user={user}
                teachers={teachers}
                examResults={examResults}
                resultsLoading={resultsLoad.status === 'loading'}
                events={events}
                unreadMessagesCount={unreadMessagesCount}
                onNavigate={handleNavigate}
                showToast={showToast}
              />
            )}

            {activeView === 'profile' && (
              <ParentProfile ward={ward} user={user} teachers={teachers} events={events} />
            )}

            {activeView === 'results' && (
              <ParentResults examResults={examResults} status={resultsLoad.status} error={resultsLoad.error} onRetry={loadResults} />
            )}

            {activeView === 'attendance' && (
              <ParentAttendance ward={ward} />
            )}

            {activeView === 'homework' && (
              <HomeworkBoard
                mode="parent"
                wardClassRoom={ward ? `${ward.class}-${ward.section}` : undefined}
                wardId={ward?.id || ward?._id}
                showToast={showToast}
              />
            )}

            {activeView === 'fees' && (
              <ParentFees ward={ward} showToast={showToast} />
            )}

            {activeView === 'feedback' && (
              <ParentFeedback
                ward={ward}
                feedbackList={feedbackList}
                loadFeedbacks={loadFeedbacks}
                status={feedbackLoad.status}
                error={feedbackLoad.error}
                onShowToast={showToast}
              />
            )}

            {isMessages && (
              <div className="flex-1 flex flex-col min-h-0">
                <ParentMessages ward={ward} initialRecipient={messagesRecipient} />
              </div>
            )}

            {activeView === 'account' && (
              <>
                <ParentAccountProfile
                  user={user}
                  ward={ward}
                  allWards={allWards}
                  onSelectWard={handleSelectWard}
                  onLogout={onLogout}
                  showToast={showToast}
                />
                <AppUpdates />
              </>
            )}

            {activeView === 'notices' && (
              <ParentNotices events={events} />
            )}
          </Suspense>
        </ErrorBoundary>
      </AppShell>
    </>
  );
};

export default ParentPortal;
