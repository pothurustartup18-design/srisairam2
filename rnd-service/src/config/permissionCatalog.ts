import { ALL_PERMISSIONS, DASHBOARD_WIDGET_PERMISSIONS } from './permissions';

export interface CatalogEntry {
  key: string;
  module: string;
  action: string;
  category: 'action' | 'widget';
  displayName: string;
  description?: string;
}

// Friendly labels for the permissions worth a hand-written description. Anything in
// ALL_PERMISSIONS / DASHBOARD_WIDGET_PERMISSIONS not listed here still gets a catalog
// entry — via the auto-derived title-case fallback below — so a new permission string
// added to config/permissions.ts is never silently dropped from the catalog.
const DISPLAY_NAMES: Record<string, { displayName: string; description?: string }> = {
  'dashboard:view': { displayName: 'View Dashboard', description: 'Access the admin dashboard page.' },
  'dashboard:widget:attendanceToday': { displayName: "Today's Attendance widget" },
  'dashboard:widget:feesCollected': { displayName: 'Fees Collected widget' },
  'dashboard:widget:outstandingDues': { displayName: 'Outstanding Dues widget' },
  'dashboard:widget:pendingApprovals': { displayName: 'Pending Approvals widget' },
  'dashboard:widget:eventsNotices': { displayName: 'Events & Notices widget' },
  'dashboard:widget:academicSnapshot': { displayName: 'Academic Snapshot widget' },
  'dashboard:widget:recentActivity': { displayName: 'Recent Activity widget' },
  'dashboard:widget:feeDefaulters': { displayName: 'Fee Defaulters list widget' },

  'students:create': { displayName: 'Create Students' },
  'students:read': { displayName: 'View Students' },
  'students:update': { displayName: 'Edit Students' },
  'students:delete': { displayName: 'Delete Students' },
  'students:promote': { displayName: 'Promote Students to Next Class' },

  'teachers:create': { displayName: 'Create Teachers / Staff' },
  'teachers:read': { displayName: 'View Teachers / Staff' },
  'teachers:update': { displayName: 'Edit Teachers / Staff' },
  'teachers:delete': { displayName: 'Delete Teachers / Staff' },

  'attendance:mark': { displayName: 'Mark Attendance' },
  'attendance:edit': { displayName: 'Edit Attendance' },
  'attendance:view': { displayName: 'View Attendance' },
  'attendance:reports': { displayName: 'Attendance Reports' },

  'fees:manage': { displayName: 'Manage Fee Structures' },
  'fees:collect': { displayName: 'Collect Fees' },
  'fees:view': { displayName: 'View Fees' },
  'fees:reports': { displayName: 'Fee Reports' },

  'expenditure:view': { displayName: 'View Expenditure', description: 'Salaries, variable bills, and the expenditure dashboard — independent of fee-collection access.' },
  'expenditure:manage': { displayName: 'Manage Expenditure', description: 'Mark salaries/bills paid, add variable expenses.' },

  'events:manage': { displayName: 'Manage Events & Notices' },
  'events:view': { displayName: 'View Events & Notices' },
  'gallery:manage': { displayName: 'Manage Gallery' },
  'settings:manage': { displayName: 'Manage Settings (admin accounts, roles, permissions)' },
  'users:manage': { displayName: 'Manage Users' },
  'whatsapp:send': { displayName: 'Send WhatsApp Messages' },
  'whatsapp:view': { displayName: 'View WhatsApp Delivery Status' },
  'reports:view': { displayName: 'View Reports' },
  'results:view': { displayName: 'View Exam Results' },
  'marks:entry': { displayName: 'Enter Marks' },
  'homework:create': { displayName: 'Assign Homework' },
  'homework:read': { displayName: 'View Homework' },
  'leaves:create': { displayName: 'Apply for Leave' },
  'leaves:read': { displayName: 'View Leave Requests' },
  'feedback:create': { displayName: 'Submit Feedback' },
  'feedback:read': { displayName: 'View Feedback' },
  'messages:read': { displayName: 'Direct Messages', description: 'Access the Direct Messages inbox with parents, students, and staff.' }
};

const titleCase = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/[:_-]/g, ' ').trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());

function toCatalogEntry(key: string): CatalogEntry {
  const parts = key.split(':');
  const module = parts[0];
  const action = parts.slice(1).join(':');
  const category: 'action' | 'widget' = parts[1] === 'widget' ? 'widget' : 'action';
  const known = DISPLAY_NAMES[key];
  return {
    key,
    module,
    action,
    category,
    displayName: known?.displayName || titleCase(`${module} ${action}`),
    description: known?.description
  };
}

export const PERMISSION_CATALOG: CatalogEntry[] = Array.from(
  new Set([...ALL_PERMISSIONS, ...DASHBOARD_WIDGET_PERMISSIONS])
).map(toCatalogEntry);
