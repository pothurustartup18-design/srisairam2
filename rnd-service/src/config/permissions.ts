// Individual dashboard widgets — introduced alongside the PBAC permission engine
// (services/permissionEngine.ts) so a widget can be hidden per-user without the
// old single `dashboard:view` toggling the whole page. Only admin/superadmin get
// these by default since AdminDashboard.tsx is unreachable by teacher/parent.
export const DASHBOARD_WIDGET_PERMISSIONS: string[] = [
  'dashboard:widget:attendanceToday',
  'dashboard:widget:feesCollected',
  'dashboard:widget:outstandingDues',
  'dashboard:widget:pendingApprovals',
  'dashboard:widget:eventsNotices',
  'dashboard:widget:academicSnapshot',
  'dashboard:widget:recentActivity',
  'dashboard:widget:feeDefaulters'
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'dashboard:view',
    'students:create',
    'students:read',
    'students:update',
    'students:delete',
    'students:promote',
    'teachers:create',
    'teachers:read',
    'teachers:update',
    'teachers:delete',
    'attendance:mark',
    'attendance:edit',
    'attendance:view',
    'attendance:reports',
    'fees:manage',
    'fees:collect',
    'fees:view',
    'fees:reports',
    'expenditure:view',
    'expenditure:manage',
    'events:manage',
    'events:view',
    'gallery:manage',
    'settings:manage',
    'users:manage',
    'whatsapp:send',
    'whatsapp:view',
    'reports:view',
    'results:view',
    'marks:entry',
    'homework:create',
    'homework:read',
    'feedback:read',
    'messages:read',
    ...DASHBOARD_WIDGET_PERMISSIONS
  ],
  superadmin: [
    'dashboard:view',
    'students:create',
    'students:read',
    'students:update',
    'students:delete',
    'students:promote',
    'teachers:create',
    'teachers:read',
    'teachers:update',
    'teachers:delete',
    'attendance:mark',
    'attendance:edit',
    'attendance:view',
    'attendance:reports',
    'fees:manage',
    'fees:collect',
    'fees:view',
    'fees:reports',
    'expenditure:view',
    'expenditure:manage',
    'events:manage',
    'events:view',
    'gallery:manage',
    'settings:manage',
    'users:manage',
    'whatsapp:send',
    'whatsapp:view',
    'reports:view',
    'results:view',
    'marks:entry',
    'homework:create',
    'homework:read',
    'feedback:read',
    'messages:read',
    ...DASHBOARD_WIDGET_PERMISSIONS
  ],
  teacher: [
    'dashboard:view',
    'students:create',
    'students:read',
    'teachers:read',
    'attendance:mark',
    'attendance:edit',
    'attendance:view',
    'marks:entry',
    'events:view',
    'leaves:create',
    'leaves:read',
    'results:view',
    'homework:create',
    'homework:read'
  ],
  parent: [
    'dashboard:view',
    'results:view',
    'feedback:create',
    'feedback:read',
    'homework:read'
  ]
};

// Permissions the admin role can never lose via the role-management API,
// otherwise an admin could lock everyone (including themselves) out.
export const PROTECTED_ADMIN_PERMISSIONS = ['settings:manage'];

// Union of every known permission string (for the role-management UI)
export const ALL_PERMISSIONS: string[] = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat())
).sort();
