import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft, ChevronsLeft, ChevronsRight, ChevronUp, GraduationCap, LogOut, Moon,
  MoreHorizontal, Settings as SettingsIcon, Sun, User, X, type LucideIcon,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { registerBackHandler } from '../../../hooks/useMobileApp';
import UpdateDot from '../../shared/AppUpdates/UpdateDot';
import './AppShell.css';

export interface ShellNavItem {
  key: string;
  label: string;
  /** Shorter label for the bottom tab bar / More sheet tiles */
  shortLabel?: string;
  icon: LucideIcon;
  /** Sidebar / More-sheet section heading */
  group?: string;
  badge?: number;
}

export type ShellRole = 'admin' | 'teacher' | 'parent' | 'superadmin' | 'other';

interface AppShellProps {
  role: ShellRole;
  schoolName: string;
  schoolLogo?: string;
  userName: string;
  userRoleLabel: string;
  userAvatar?: string;
  /** Every destination the user may open (already permission-filtered). */
  items: ShellNavItem[];
  /** Up to four item keys shown in the phone tab bar; the rest live under "More". */
  tabs: string[];
  activeKey: string;
  homeKey: string;
  onNavigate: (key: string) => void;
  /** Page title shown in the top bar / app bar. */
  title: string;
  subtitle?: string;
  onProfile: () => void;
  onSettings?: () => void;
  onLogout: () => void;
  /** Desktop top bar, between the title and the account button (search, class picker…). */
  topBarCenter?: ReactNode;
  /** Desktop top bar, right side before the account button. */
  topBarActions?: ReactNode;
  /** Phone app bar, right side before the avatar. */
  mobileActions?: ReactNode;
  /** Let the page fill the viewport height with no outer padding (chat screens). */
  fullHeight?: boolean;
  contentClassName?: string;
  children: ReactNode;
}

const initialsOf = (name: string) =>
  (name || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const onChange = (e: Event) => setDark((e as CustomEvent).detail === 'dark');
    window.addEventListener('theme-changed', onChange);
    return () => window.removeEventListener('theme-changed', onChange);
  }, []);
  return dark;
}

const toggleTheme = () => (window as unknown as { toggleAppTheme?: () => void }).toggleAppTheme?.();

function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  return src ? (
    <img src={src} alt="" className="shell-avatar" style={{ width: size, height: size }} />
  ) : (
    <span className="shell-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

function Badge({ count, dot }: { count?: number; dot?: boolean }) {
  if (!count || count <= 0) return null;
  return <span className={cn('shell-badge', dot && 'shell-badge--dot')}>{count > 99 ? '99+' : count}</span>;
}

/** Groups items by `group`, preserving the order groups first appear in. */
function groupItems(items: ShellNavItem[]) {
  const groups: { name: string; items: ShellNavItem[] }[] = [];
  for (const item of items) {
    const name = item.group || '';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, items: [] }));
    g.items.push(item);
  }
  return groups;
}

/**
 * The application frame shared by every portal.
 *  - ≥1024px: persistent sidebar (collapsible to an icon rail) + top bar.
 *  - 768–1023px: icon rail by default + top bar.
 *  - <768px: app bar, bottom tab bar and a "More" sheet holding every other destination.
 * It also owns the Android back button for navigation: close the More sheet,
 * then return to the home view, then fall through to the app's exit handler.
 */
export function AppShell({
  role, schoolName, schoolLogo, userName, userRoleLabel, userAvatar,
  items, tabs, activeKey, homeKey, onNavigate, title, subtitle,
  onProfile, onSettings, onLogout, topBarCenter, topBarActions, mobileActions,
  fullHeight, contentClassName, children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024,
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isDark = useIsDark();
  const contentRef = useRef<HTMLDivElement>(null);

  const tabItems = tabs.map((k) => items.find((i) => i.key === k)).filter(Boolean) as ShellNavItem[];
  const moreItems = items.filter((i) => !tabs.includes(i.key));
  const moreActive = moreOpen || (!tabs.includes(activeKey));
  const moreBadge = moreItems.reduce((sum, i) => sum + (i.badge || 0), 0);

  const go = (key: string) => {
    setMoreOpen(false);
    setMenuOpen(false);
    onNavigate(key);
  };

  // Each view starts at the top
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeKey]);

  // Hardware back button. Registered once (reading live values through a ref)
  // so handlers that screens register later stay above it on the stack.
  const backState = useRef({ moreOpen, menuOpen, activeKey, homeKey, onNavigate });
  backState.current = { moreOpen, menuOpen, activeKey, homeKey, onNavigate };
  useEffect(() => registerBackHandler(() => {
    const s = backState.current;
    if (s.moreOpen) { setMoreOpen(false); return true; }
    if (s.menuOpen) { setMenuOpen(false); return true; }
    if (s.activeKey !== s.homeKey) { s.onNavigate(s.homeKey); return true; }
    return false;
  }), []);

  return (
    <div className="shell" data-role={role}>
      {/* ── Sidebar (tablet / desktop) ─────────────────────────────────── */}
      <aside className={cn('shell-sidebar', collapsed && 'is-collapsed')} aria-label="Main navigation">
        <div className="shell-brand">
          <span className="shell-brand-mark">
            {schoolLogo ? <img src={schoolLogo} alt="" /> : <GraduationCap size={18} />}
          </span>
          {!collapsed && <span className="shell-brand-name" title={schoolName}>{schoolName}</span>}
        </div>

        <nav className="shell-nav">
          {groupItems(items).map((g) => (
            <div key={g.name || 'main'} className="shell-nav-group">
              {g.name && !collapsed && <div className="shell-nav-heading">{g.name}</div>}
              <ul>
                {g.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.key === activeKey;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        data-nav={item.key}
                        className={cn('shell-nav-item', active && 'is-active')}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        onClick={() => go(item.key)}
                      >
                        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                        {!collapsed && <span className="shell-nav-label">{item.label}</span>}
                        <Badge count={item.badge} dot={collapsed} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <AccountMenu
          open={menuOpen}
          setOpen={setMenuOpen}
          collapsed={collapsed}
          userName={userName}
          userRoleLabel={userRoleLabel}
          userAvatar={userAvatar}
          isDark={isDark}
          onProfile={() => { setMenuOpen(false); onProfile(); }}
          onSettings={onSettings ? () => { setMenuOpen(false); onSettings(); } : undefined}
          onLogout={onLogout}
        />
      </aside>

      <div className="shell-main">
        {/* ── Top bar (tablet / desktop) ───────────────────────────────── */}
        <header className="shell-topbar">
          <button
            type="button"
            className="shell-icon-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
          <div className="shell-topbar-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {topBarCenter && <div className="shell-topbar-center">{topBarCenter}</div>}
          <div className="shell-topbar-actions">
            {topBarActions}
            <button type="button" className="shell-account-chip" onClick={onProfile} aria-label="My profile">
              <span className="relative inline-flex">
                <Avatar name={userName} src={userAvatar} size={34} />
                <UpdateDot />
              </span>
              <span className="shell-account-chip-text">
                <span className="shell-account-name">{userName}</span>
                <span className="shell-account-role">{userRoleLabel}</span>
              </span>
            </button>
          </div>
        </header>

        {/* ── App bar (phone) ──────────────────────────────────────────── */}
        <header className="shell-appbar">
          {activeKey !== homeKey ? (
            <button type="button" className="shell-icon-btn shell-icon-btn--ghost" onClick={() => go(homeKey)} aria-label="Back to home">
              <ChevronLeft size={22} />
            </button>
          ) : (
            <span className="shell-brand-mark shell-brand-mark--sm" aria-hidden="true">
              {schoolLogo ? <img src={schoolLogo} alt="" /> : <GraduationCap size={17} />}
            </span>
          )}
          <div className="shell-appbar-title">
            <span className="shell-appbar-heading">{activeKey === homeKey ? schoolName : title}</span>
            {activeKey === homeKey && <span className="shell-appbar-sub">{userRoleLabel} portal</span>}
          </div>
          <div className="shell-appbar-actions">
            {mobileActions}
            <button type="button" className="shell-avatar-btn" onClick={onProfile} aria-label="My profile">
              <Avatar name={userName} src={userAvatar} size={34} />
              <UpdateDot />
            </button>
          </div>
        </header>

        <main
          ref={contentRef}
          className={cn('shell-content', fullHeight && 'shell-content--full')}
          id="main-content"
        >
          <div className={cn('shell-page', fullHeight && 'shell-page--full', contentClassName)}>{children}</div>
        </main>
      </div>

      {/* ── Bottom tab bar (phone) ─────────────────────────────────────── */}
      <nav className="shell-tabbar" aria-label="Primary">
        {tabItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey && !moreOpen;
          return (
            <button
              key={item.key}
              type="button"
              data-nav={item.key}
              className={cn('shell-tab', active && 'is-active')}
              aria-current={active ? 'page' : undefined}
              onClick={() => go(item.key)}
            >
              <span className="shell-tab-icon">
                <Icon size={21} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <Badge count={item.badge} />
              </span>
              <span className="shell-tab-label">{item.shortLabel || item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          data-nav="__more"
          className={cn('shell-tab', moreActive && 'is-active')}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen((o) => !o)}
        >
          <span className="shell-tab-icon">
            <MoreHorizontal size={21} strokeWidth={moreActive ? 2.2 : 1.8} aria-hidden="true" />
            <Badge count={moreBadge} />
          </span>
          <span className="shell-tab-label">More</span>
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet
          items={moreItems}
          activeKey={activeKey}
          userName={userName}
          userRoleLabel={userRoleLabel}
          userAvatar={userAvatar}
          isDark={isDark}
          onClose={() => setMoreOpen(false)}
          onNavigate={go}
          onProfile={() => { setMoreOpen(false); onProfile(); }}
          onSettings={onSettings ? () => { setMoreOpen(false); onSettings(); } : undefined}
          onLogout={() => { setMoreOpen(false); onLogout(); }}
        />
      )}
    </div>
  );
}

// ─── Account menu (sidebar footer) ─────────────────────────────────────────────

function AccountMenu({
  open, setOpen, collapsed, userName, userRoleLabel, userAvatar, isDark, onProfile, onSettings, onLogout,
}: {
  open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void; collapsed: boolean;
  userName: string; userRoleLabel: string; userAvatar?: string; isDark: boolean;
  onProfile: () => void; onSettings?: () => void; onLogout: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen]);

  return (
    <div className="shell-account" ref={ref}>
      {open && (
        <div className="shell-menu" role="menu">
          <button type="button" role="menuitem" className="shell-menu-item" onClick={onProfile}>
            <User size={16} /> My profile
          </button>
          {onSettings && (
            <button type="button" role="menuitem" className="shell-menu-item" onClick={onSettings}>
              <SettingsIcon size={16} /> Settings
            </button>
          )}
          <button type="button" role="menuitem" className="shell-menu-item" onClick={toggleTheme}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />} {isDark ? 'Light mode' : 'Dark mode'}
          </button>
          <div className="shell-menu-sep" />
          <button type="button" role="menuitem" className="shell-menu-item is-danger" onClick={onLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        className={cn('shell-account-btn', collapsed && 'is-collapsed')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${userName}`}
      >
        <span className="relative inline-flex">
          <Avatar name={userName} src={userAvatar} size={34} />
          <UpdateDot />
        </span>
        {!collapsed && (
          <>
            <span className="shell-account-chip-text">
              <span className="shell-account-name">{userName}</span>
              <span className="shell-account-role">{userRoleLabel}</span>
            </span>
            <ChevronUp size={15} className={cn('shell-account-caret', !open && 'rotate-180')} />
          </>
        )}
      </button>
    </div>
  );
}

// ─── More sheet (phone) ───────────────────────────────────────────────────────

function MoreSheet({
  items, activeKey, userName, userRoleLabel, userAvatar, isDark,
  onClose, onNavigate, onProfile, onSettings, onLogout,
}: {
  items: ShellNavItem[]; activeKey: string; userName: string; userRoleLabel: string; userAvatar?: string;
  isDark: boolean; onClose: () => void; onNavigate: (key: string) => void;
  onProfile: () => void; onSettings?: () => void; onLogout: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);

  return (
    <div className="shell-sheet-root">
      <div className="shell-sheet-backdrop" onClick={onClose} />
      <div
        className="shell-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="All sections"
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="shell-sheet-head">
          <button type="button" className="shell-sheet-profile" onClick={onProfile}>
            <Avatar name={userName} src={userAvatar} size={42} />
            <span className="min-w-0 text-left">
              <span className="shell-account-name block">{userName}</span>
              <span className="shell-account-role block">{userRoleLabel} · View profile</span>
            </span>
          </button>
          <button type="button" className="shell-icon-btn shell-icon-btn--ghost" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="shell-sheet-body">
          {items.map((item) => (
            <MoreRow key={item.key} item={item} active={item.key === activeKey} onClick={() => onNavigate(item.key)} />
          ))}

          {onSettings && (
            <button type="button" className="shell-acc shell-acc-head" onClick={onSettings}>
              <SettingsIcon size={22} className="shell-acc-icon" aria-hidden="true" />
              <span className="shell-acc-label">Settings</span>
            </button>
          )}
          <button type="button" className="shell-acc shell-acc-head" onClick={toggleTheme}>
            {isDark
              ? <Sun size={22} className="shell-acc-icon" aria-hidden="true" />
              : <Moon size={22} className="shell-acc-icon" aria-hidden="true" />}
            <span className="shell-acc-label">{isDark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button type="button" className="shell-acc shell-acc-head is-danger" onClick={onLogout}>
            <LogOut size={22} className="shell-acc-icon" aria-hidden="true" />
            <span className="shell-acc-label">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** A More-sheet destination, shown as its own card. */
function MoreRow({ item, active, onClick }: { item: ShellNavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-nav={item.key}
      className={cn('shell-acc shell-acc-head', active && 'is-active')}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon size={22} className="shell-acc-icon" aria-hidden="true" />
      <span className="shell-acc-label">{item.label}</span>
      <Badge count={item.badge} />
    </button>
  );
}
