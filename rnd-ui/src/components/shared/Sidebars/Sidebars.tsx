import React, { useState, useRef, useEffect } from 'react';
import './Sidebars.css';

import {
  GraduationCap, LayoutDashboard, Users, Mail, CalendarDays, User,
  Settings as SettingsIcon, LogOut, BookOpen, FileText, MessageSquare,
  BarChart2, ClipboardList, Bell, UserCheck, PenTool, ChevronUp, Wallet,
  CalendarCheck, CreditCard,
} from 'lucide-react';
import { useAuth } from '../../../context/authContext';
import { useSchool } from '../../../context/schoolContext';
import { cn } from '../../../lib/utils';

// ─── Shared atoms ──────────────────────────────────────────────────────────────

function NavItem({ Icon, label, active, onClick, collapsed, unreadCount }: {
  Icon: React.ElementType; label: string; active: boolean;
  onClick: () => void; collapsed?: boolean; unreadCount?: number;
}) {
  return (
    <li onClick={onClick} title={collapsed ? label : undefined}
      className={cn(
        'relative list-none flex items-center rounded-lg cursor-pointer transition-all select-none font-[inherit]',
        collapsed ? 'justify-center p-2.5 mx-0' : 'gap-3 px-3 py-2',
        active
          ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950 dark:text-blue-400'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 font-medium dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      )}>
      <Icon
        size={17}
        className={cn('flex-shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-current')}
      />
      {!collapsed && <span className="text-[13px] leading-none truncate transition-all duration-150 overflow-hidden whitespace-nowrap">{label}</span>}
      {!!unreadCount && unreadCount > 0 && (
        <span className={cn(
          'flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex-shrink-0',
          collapsed ? 'absolute -top-1 -right-1' : 'ml-auto'
        )}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </li>
  );
}

/**
 * Bottom user card — replaces the "OTHER" section entirely.
 * Clicking opens a popover with Profile / Settings / Sign Out.
 * Collapses to just the initials avatar when the sidebar is collapsed.
 */
function UserCard({
  name, role, collapsed, onProfile, onSettings, showSettings, onLogout,
}: {
  name: string; role: string; collapsed?: boolean;
  onProfile?: () => void; onSettings?: () => void; showSettings?: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = (name || '?')
    .split(' ')
    .map(n => n[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Role label + badge colour
  const isSuperAdmin = role === 'superadmin';
  const roleLabel = isSuperAdmin ? 'Super Admin' : role === 'admin' ? 'Admin' : (role || 'User');
  const roleBadgeCls = isSuperAdmin
    ? 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
    : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300';

  return (
    <div className="relative mt-auto pt-3 border-t border-slate-100 dark:border-slate-700 flex-shrink-0" ref={ref}>
      {/* Popover — appears above the card */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-50">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{name}</div>
                <span className={cn('inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 leading-none', roleBadgeCls)}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {onProfile && (
              <button
                onClick={() => { onProfile(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group">
                <User size={13} className="text-slate-400 group-hover:text-blue-500 transition-colors" /> My Profile
              </button>
            )}
            {showSettings && onSettings && (
              <button
                onClick={() => { onSettings(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 transition-colors group">
                <SettingsIcon size={13} className="text-slate-400 group-hover:text-blue-500 transition-colors" /> Settings
              </button>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700" />
          <div className="py-1">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
          collapsed ? 'justify-center' : ''
        )}>
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight">{name}</div>
              <div className={cn('text-[10px] font-bold truncate', isSuperAdmin ? 'text-violet-600 dark:text-violet-400' : 'text-blue-600 dark:text-blue-400')}>{roleLabel}</div>
            </div>
            <ChevronUp size={13} className={cn('text-slate-300 dark:text-slate-600 transition-transform flex-shrink-0', open ? '' : 'rotate-180')} />
          </>
        )}
      </button>
    </div>
  );
}

// ─── Logo row ──────────────────────────────────────────────────────────────────
function LogoRow({ schoolName, schoolLogo, collapsed }: { schoolName: string; schoolLogo?: string; collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 mb-5 flex-shrink-0', collapsed ? 'justify-center' : 'px-2')}>
      {schoolLogo ? (
        <div className="w-8 h-8 rounded-full border-2 border-slate-100 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 flex-shrink-0">
          <img src={schoolLogo} alt="School Logo" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
          <GraduationCap size={16} className="text-blue-600 dark:text-blue-400" />
        </div>
      )}
      {!collapsed && (
        <span className="text-[16px] font-extrabold text-slate-900 dark:text-slate-100 tracking-tight truncate">{schoolName}</span>
      )}
    </div>
  );
}

// ─── Admin Sidebar ─────────────────────────────────────────────────────────────

interface AdminSidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  unreadMessagesCount?: number;
  collapsed?: boolean;
  /** Mobile off-canvas drawer open state (<768px). Independent of `collapsed`. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeView, onNavigate, onLogout, unreadMessagesCount = 0, collapsed = false,
  mobileOpen = false, onMobileClose,
}) => {
  const { hasPermission, user } = useAuth();
  const { schoolProfile } = useSchool();
  const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
  const schoolLogo = schoolProfile?.schoolInfo?.logo;

  const menuItems = [
    { key: 'dashboard',  label: 'Dashboard',       Icon: LayoutDashboard, permission: 'dashboard:view' },
    { key: 'fee-analytics', label: 'Fee Analytics',Icon: BarChart2,        permission: 'fees:view' },
    { key: 'teachers',   label: 'Teachers',         Icon: Users,            permission: 'teachers:read' },
    { key: 'students',   label: 'Students',         Icon: GraduationCap,    permission: 'students:read' },
    { key: 'attendance', label: 'Class Attendance', Icon: CalendarDays,     permission: 'attendance:mark' },
    { key: 'marks',      label: 'Exams & Marks',    Icon: BookOpen,         permission: 'reports:view' },
    { key: 'homework',   label: 'Homework',         Icon: ClipboardList,    permission: 'homework:read' },
    { key: 'leaves',     label: 'Leaves',           Icon: Mail,             permission: 'reports:view' },
    { key: 'feedbacks',  label: 'Parent Feedbacks', Icon: Mail,             permission: 'feedback:read' },
    { key: 'messages',   label: 'Direct Messages',  Icon: MessageSquare,    permission: 'messages:read' },
    { key: 'events',     label: 'Notice & Events',  Icon: CalendarDays,     permission: 'events:manage' },
    { key: 'reminders',  label: 'Reminders',        Icon: Bell,             permission: 'fees:view' },
    { key: 'expenditures', label: 'Expenditures',    Icon: Wallet,           permission: 'expenditure:view' },
  ].filter(item => hasPermission(item.permission));

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={cn('sidebar sidebar--responsive bg-white dark:bg-slate-900 dark:border-slate-800', collapsed && 'collapsed', mobileOpen && 'mobile-open')}>
        <LogoRow schoolName={schoolName} schoolLogo={schoolLogo} collapsed={collapsed} />

        {/* Scrollable nav */}
        <div className="sidebar-nav">
          <ul className="flex flex-col gap-0.5 p-0 m-0">
            {menuItems.map(({ key, label, Icon }) => (
              <NavItem
                key={key}
                Icon={Icon}
                label={label}
                active={activeView === key}
                onClick={() => { onNavigate(key); onMobileClose?.(); }}
                collapsed={collapsed}
                unreadCount={key === 'messages' ? unreadMessagesCount : undefined}
              />
            ))}
          </ul>
        </div>

        {/* Bottom user card — replaces Profile / Settings / Logout nav items */}
        <UserCard
          name={user?.name || 'Admin'}
          role={user?.role || 'admin'}
          collapsed={collapsed}
          onProfile={() => { onNavigate('profile'); onMobileClose?.(); }}
          onSettings={() => { onNavigate('settings'); onMobileClose?.(); }}
          showSettings={hasPermission('settings:manage')}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
};

// ─── Teacher Sidebar ───────────────────────────────────────────────────────────

interface TeacherSidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  unreadMessagesCount?: number;
  collapsed?: boolean;
  /** Mobile off-canvas drawer open state (<768px). Independent of `collapsed`. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const TeacherSidebar: React.FC<TeacherSidebarProps> = ({
  activeView, onNavigate, onLogout, unreadMessagesCount = 0, collapsed = false,
  mobileOpen = false, onMobileClose,
}) => {
  const { hasPermission, user } = useAuth();
  const { schoolProfile } = useSchool();
  const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
  const schoolLogo = schoolProfile?.schoolInfo?.logo;

  const menuItems = [
    { key: 'students',    label: 'My Students',        Icon: GraduationCap, permission: 'students:read',  classTeacherOnly: true },
    { key: 'attendance',  label: 'Attendance',          Icon: CalendarDays,  permission: 'attendance:mark' },
    { key: 'marks',       label: 'Marks Entry',         Icon: BookOpen,      permission: 'marks:entry' },
    { key: 'analytics',   label: 'Exam Analytics',      Icon: BarChart2,     permission: 'results:view' },
    { key: 'homework',    label: 'Homework',             Icon: ClipboardList, permission: 'homework:read' },
    { key: 'signature',   label: 'My Signature',        Icon: PenTool,       permission: 'dashboard:view' },
    { key: 'leaves',      label: 'Leave Application',   Icon: Mail,          permission: 'leaves:read' },
    { key: 'messages',    label: 'Direct Messages',     Icon: MessageSquare, permission: 'dashboard:view' },
    { key: 'notices',     label: 'School Notices',      Icon: FileText,      permission: 'dashboard:view' },
    { key: 'fees',        label: 'Fees Management',     Icon: ClipboardList, permission: 'fees:view' },
    { key: 'delegations', label: 'Permission Transfer', Icon: UserCheck,     permission: 'marks:entry' },
  ].filter(item => {
    if (item.classTeacherOnly) {
      const isClassTeacher = user?.role === 'teacher' && !!user.classTeacherOf;
      if (!isClassTeacher) return false;
    }
    return hasPermission(item.permission);
  });

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={cn('sidebar sidebar--responsive dark:bg-slate-900 dark:border-slate-800', collapsed && 'collapsed', mobileOpen && 'mobile-open')}>
        <LogoRow schoolName={schoolName} schoolLogo={schoolLogo} collapsed={collapsed} />

        <div className="sidebar-nav">
          <ul className="flex flex-col gap-0.5 p-0 m-0">
            {menuItems.map(({ key, label, Icon }) => (
              <NavItem
                key={key}
                Icon={Icon}
                label={label}
                active={activeView === key}
                onClick={() => { onNavigate(key); onMobileClose?.(); }}
                collapsed={collapsed}
                unreadCount={key === 'messages' ? unreadMessagesCount : undefined}
              />
            ))}
          </ul>
        </div>

        <UserCard
          name={user?.name || 'Teacher'}
          role="Teacher"
          collapsed={collapsed}
          onProfile={() => { onNavigate('profile'); onMobileClose?.(); }}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
};

// ─── Parent Sidebar ────────────────────────────────────────────────────────────

interface ParentSidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  unreadMessagesCount?: number;
  collapsed?: boolean;
  /** Mobile off-canvas drawer open state (<768px). Independent of `collapsed`. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const ParentSidebar: React.FC<ParentSidebarProps> = ({
  activeView, onNavigate, onLogout, unreadMessagesCount = 0, collapsed = false,
  mobileOpen = false, onMobileClose,
}) => {
  const { user } = useAuth();
  const { schoolProfile } = useSchool();
  const schoolName = schoolProfile?.schoolInfo?.schoolName || 'SchoolHub';
  const schoolLogo = schoolProfile?.schoolInfo?.logo;

  const menuItems = [
    { key: 'dashboard',  label: 'Home Dashboard',      Icon: LayoutDashboard },
    { key: 'profile',    label: 'Child Overview',      Icon: User },
    { key: 'results',    label: 'Academics',           Icon: GraduationCap },
    { key: 'attendance', label: 'Attendance',          Icon: CalendarCheck },
    { key: 'homework',   label: 'Homework',            Icon: ClipboardList },
    { key: 'fees',       label: 'Fee Details',         Icon: CreditCard },
    { key: 'notices',    label: 'Notices & Events',    Icon: Bell },
    { key: 'messages',   label: 'Direct Messages',     Icon: MessageSquare },
    { key: 'feedback',   label: 'Feedback & Help',     Icon: Mail },
  ];

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={cn('sidebar sidebar--responsive dark:bg-slate-900 dark:border-slate-800', collapsed && 'collapsed', mobileOpen && 'mobile-open')}>
        <LogoRow schoolName={schoolName} schoolLogo={schoolLogo} collapsed={collapsed} />

        <div className="sidebar-nav">
          <ul className="flex flex-col gap-0.5 p-0 m-0">
            {menuItems.map(({ key, label, Icon }) => (
              <NavItem
                key={key}
                Icon={Icon}
                label={label}
                active={activeView === key}
                onClick={() => { onNavigate(key); onMobileClose?.(); }}
                collapsed={collapsed}
                unreadCount={key === 'messages' ? unreadMessagesCount : undefined}
              />
            ))}
          </ul>
        </div>

        <UserCard
          name={user?.name || 'Parent'}
          role="Parent"
          collapsed={collapsed}
          onProfile={() => { onNavigate('account'); onMobileClose?.(); }}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
};
