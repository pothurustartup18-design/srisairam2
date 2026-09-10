import React, { useState, useEffect, lazy, Suspense, useMemo } from 'react';
import { Search, Menu, Users } from 'lucide-react';
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
import { ParentSidebar } from '../../shared/Sidebars/Sidebars';
import ErrorBoundary from '../../shared/ErrorBoundary/ErrorBoundary';

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
  const [searchQuery, setSearchQuery] = useState('');

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

  // ─── Theme Integration ─────────────────────────────────────────────────────
  const [theme, setTheme] = useState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      setTheme((e as CustomEvent).detail);
    };
    window.addEventListener('theme-changed', handleThemeChange);
    return () => window.removeEventListener('theme-changed', handleThemeChange);
  }, []);

  const handleToggleTheme = () => {
    if ((window as any).toggleAppTheme) {
      (window as any).toggleAppTheme();
    }
  };

  const [examResults, setExamResults] = useState<StudentExamResult[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackData[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [messagesRecipient, setMessagesRecipient] = useState<'admin' | 'teacher'>('admin');

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileSidebarOpen((o) => !o);
    } else {
      setSidebarCollapsed((c) => !c);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3500);
  };

  // ─── Data Loaders ──────────────────────────────────────────────────────────
  const loadResults = async () => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    try {
      const res = await fetch(`${API_BASE}/marks/student/${studentId}`);
      const data = await res.json();
      if (data.success) setExamResults(data.data || []);
    } catch (err) {
      console.error('Failed to load exam results:', err);
    }
  };

  const loadFeedbacks = async () => {
    if (!ward) return;
    const studentId = ward.id || ward._id;
    try {
      const res = await fetch(`${API_BASE}/feedbacks/student/${studentId}`);
      const data = await res.json();
      if (data.success) setFeedbackList(data.data || []);
    } catch (err) {
      console.error('Failed to load feedbacks:', err);
    }
  };

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

  return (
    <div className="dashboard-container">
      {/* Toast Notification */}
      <Toast toast={toast} />

      {/* Responsive Parent Sidebar */}
      <ParentSidebar
        activeView={activeView}
        onNavigate={(view) => {
          if (view.startsWith('messages:')) {
            setMessagesRecipient(view.split(':')[1] as 'admin' | 'teacher');
            setActiveView('messages');
          } else {
            setActiveView(view as ParentView);
          }
          setMobileSidebarOpen(false);
        }}
        onLogout={onLogout}
        unreadMessagesCount={unreadMessagesCount}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <main className="main-layout">
        {/* Top Navigation Header */}
        <header className="top-header">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              type="button"
              className="action-icon-btn !rounded-lg"
              onClick={handleToggleSidebar}
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Toggle Sidebar'}
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>

            {/* Quick Search */}
            <div className="search-bar-container">
              <Search className="search-icon" />
              <input
                type="text"
                placeholder="Search notices, exams, or fee details..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="header-right">
            {/* Child Switcher in Header if multiple wards */}
            {allWards.length > 1 && (
              <div className="hidden sm:flex items-center gap-2 mr-2">
                <Users size={15} className="text-slate-400" />
                <select
                  className="h-8 pl-2.5 pr-7 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer shadow-2xs"
                  value={selectedWardId}
                  onChange={(e) => setSelectedWardId(e.target.value)}
                >
                  {allWards.map((w) => (
                    <option key={w.id || w._id} value={w.id || w._id}>
                      {w.name} ({w.class}-{w.section})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Parent User Info */}
            <div
              className="user-profile cursor-pointer"
              onClick={() => setActiveView('account')}
              title="Account & Security Settings"
            >
              <div
                className="user-avatar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#4f46e5',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                {(user.name || '').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'PR'}
              </div>
              <div className="user-info hidden md:flex flex-col">
                <span className="user-name truncate max-w-[140px]">{user.name}</span>
                <span className="user-role">Parent</span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content View */}
        <div className="content-area">
          <div className="dashboard-main-view">
            <div className="w-full">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '50vh',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          border: '3px solid #e2e8f0',
                          borderTop: '3px solid #6366f1',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                      <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                        Loading Section…
                      </span>
                      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                    </div>
                  }
                >
                  {activeView === 'dashboard' && (
                    <ParentDashboard
                      ward={ward}
                      allWards={allWards}
                      onSelectWard={(id) => setSelectedWardId(id)}
                      user={user}
                      teachers={teachers}
                      examResults={examResults}
                      events={events}
                      unreadMessagesCount={unreadMessagesCount}
                      onNavigate={(view) => {
                        if (view.startsWith('messages:')) {
                          setMessagesRecipient(view.split(':')[1] as 'admin' | 'teacher');
                          setActiveView('messages');
                        } else {
                          setActiveView(view as ParentView);
                        }
                      }}
                      showToast={showToast}
                    />
                  )}

                  {activeView === 'profile' && (
                    <ParentProfile ward={ward} user={user} teachers={teachers} events={events} />
                  )}

                  {activeView === 'results' && (
                    <ParentResults examResults={examResults} />
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
                      onShowToast={showToast}
                    />
                  )}

                  {activeView === 'messages' && (
                    <ParentMessages ward={ward} initialRecipient={messagesRecipient} />
                  )}

                  {activeView === 'account' && (
                    <ParentAccountProfile showToast={showToast} />
                  )}

                  {activeView === 'notices' && (
                    <ParentNotices events={events} />
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ParentPortal;
