/**
 * Test-only API fixtures for Playwright. Every request to /api/** is answered
 * here so each role's portal can be rendered without a running backend.
 * Nothing in this folder is imported by application code.
 */
import type { Page, Route } from '@playwright/test';

export type Role = 'admin' | 'teacher' | 'parent' | 'superadmin';

export const ALL_PERMISSIONS = [
  'attendance:mark', 'dashboard:view', 'events:manage', 'expenditure:view', 'feedback:read',
  'fees:collect', 'fees:view', 'homework:read', 'leaves:read', 'marks:entry', 'messages:read',
  'reports:view', 'results:view', 'settings:manage', 'students:create', 'students:read',
  'teachers:create', 'teachers:read', 'whatsapp:view',
  'dashboard:widget:academicSnapshot', 'dashboard:widget:attendanceToday', 'dashboard:widget:eventsNotices',
  'dashboard:widget:feeDefaulters', 'dashboard:widget:feesCollected', 'dashboard:widget:outstandingDues',
  'dashboard:widget:pendingApprovals', 'dashboard:widget:recentActivity',
];

const TEACHER_PERMISSIONS = [
  'dashboard:view', 'students:read', 'attendance:mark', 'marks:entry', 'results:view',
  'homework:read', 'leaves:read', 'fees:view',
];

const names = [
  'Aarav Sharma', 'Diya Patel', 'Vihaan Reddy', 'Ananya Iyer', 'Arjun Nair', 'Saanvi Gupta',
  'Reyansh Kumar', 'Ishita Menon', 'Kabir Singh', 'Meera Pillai', 'Rohan Desai', 'Zara Khan',
];

export const students = names.map((name, i) => ({
  _id: `stu${i + 1}`,
  id: `stu${i + 1}`,
  admissionNo: `ADM-2025-${String(i + 101).padStart(4, '0')}`,
  name,
  firstName: name.split(' ')[0],
  lastName: name.split(' ')[1],
  class: i < 8 ? '10' : '9',
  section: i % 2 === 0 ? 'A' : 'B',
  classTeacher: 'Lakshmi Rao',
  rollNumber: i + 1,
  status: 'active',
  whatsappNo: `98765${String(43210 + i)}`,
  motherWhatsappNo: '',
  totalFee: 48000,
  feePaid: 12000 * (i % 4),
  feePending: 48000 - 12000 * (i % 4),
  transportMode: 'school',
  booksFee: 2500,
  preferredLanguage: 'en',
  cluster: '',
  installments: [
    { installmentNo: 1, amount: 12000, dueDate: '2026-06-10', status: 'paid' },
    { installmentNo: 2, amount: 12000, dueDate: '2026-09-10', status: i % 3 === 0 ? 'overdue' : 'unpaid' },
  ],
  payments: [],
}));

export const teachers = [
  { _id: 't1', employeeId: 'EMP-001', name: 'Lakshmi Rao', gender: 'female', dob: '1985-04-12', phone: '9876500001', email: 'lakshmi@school.test', assignedClass: '10-A', subjects: ['Mathematics'], teachingClasses: ['10-A', '10-B'], classTeacherOf: '10-A', status: 'active' },
  { _id: 't2', employeeId: 'EMP-002', name: 'Suresh Menon', gender: 'male', dob: '1980-01-30', phone: '9876500002', email: 'suresh@school.test', assignedClass: '10-B', subjects: ['Science'], teachingClasses: ['10-B'], classTeacherOf: '10-B', status: 'active' },
  { _id: 't3', employeeId: 'EMP-003', name: 'Farah Siddiqui', gender: 'female', dob: '1990-07-22', phone: '9876500003', email: 'farah@school.test', assignedClass: '9-A', subjects: ['English'], teachingClasses: ['9-A'], classTeacherOf: '9-A', status: 'active' },
];

export const events = [
  { _id: 'e1', title: 'Annual Sports Day', description: 'Track and field events for all classes on the main ground.', date: '2026-11-14', media: [], type: 'event', sendAlertsTo: 'both' },
  { _id: 'e2', title: 'Parent–Teacher Meeting', description: 'Term 1 progress review. Please bring the report card.', date: '2026-11-02', media: [], type: 'notice', sendAlertsTo: 'parents' },
  { _id: 'e3', title: 'Diwali Holidays', description: 'School remains closed from 30 Oct to 3 Nov.', date: '2026-10-30', media: [], type: 'notice', sendAlertsTo: 'both' },
];

export function userFor(role: Role) {
  switch (role) {
    case 'admin':
      return { _id: 'u-admin', role: 'admin', firstName: 'Priya', lastName: 'Raman', username: 'admin', email: 'admin@school.test', phone: '9000000001', permissions: ALL_PERMISSIONS };
    case 'teacher':
      return { _id: 't1', role: 'teacher', firstName: 'Lakshmi', lastName: 'Rao', username: 'lakshmi', assignedClass: '10-A,10-B', classTeacherOf: '10-A', permissions: TEACHER_PERMISSIONS };
    case 'parent':
      return { _id: 'stu1', role: 'parent', firstName: 'Rakesh', lastName: 'Aarav Sharma', username: 'ADM-2025-0101', phone: '9876543210', permissions: [] };
    case 'superadmin':
      return { _id: 'u-sa', role: 'superadmin', firstName: 'Platform', lastName: 'Owner', username: 'root', permissions: ALL_PERMISSIONS };
  }
}

const ok = (data: unknown) => ({ success: true, data });

export function bodyFor(path: string, role: Role): unknown {
  if (path.endsWith('/auth/refresh')) return { success: true, accessToken: 'test-token' };
  if (path.includes('/auth/me')) return { success: true, user: userFor(role) };
  if (path.endsWith('/auth/logout')) return { success: true };
  if (path.includes('/dashboard/students') || /\/students(\/class\/[^/]+)?$/.test(path)) return ok(students);
  if (/\/teachers$/.test(path)) return ok(teachers);
  if (/\/events$/.test(path)) return ok(events);
  if (path.includes('/delegations')) return ok({ sent: [], received: [] });
  if (path.includes('/attendance/student-stats')) return { success: true, stats: Object.fromEntries(students.map((s, i) => [s.id, [92, 68, 81, 45, 97, 88][i % 6]])) };
  if (path.includes('/attendance/history')) return { success: true, data: null };
  if (path.includes('/dashboard/attendance-today')) {
    const b = (present: number, total: number) => ({ present, total, pct: Math.round((present / total) * 100) });
    return ok({ percentage: 91.7, present: 11, absent: 1, breakdown: { primary: b(0, 1), middle: b(3, 4), secondary: b(8, 8) } });
  }
  if (path.includes('/dashboard/academic-snapshot')) return ok({ unmarkedClasses: { count: 1 }, hwPending: { count: 3 }, examsThisWeek: { count: 1 }, marksPending: { count: 2 } });
  if (/\/classes$/.test(path)) return ok([['10', 'A'], ['10', 'B'], ['9', 'A'], ['9', 'B']].map(([className, section], i) => ({ _id: `c${i}`, className, section })));
  if (path.includes('/expenditure/dashboard')) return ok({ month: '2026-10', income: 216000, salary: { total: 150000, paid: 100000, pending: 50000, paidCount: 2, totalCount: 3 }, variable: { total: 22000, paid: 15000, pending: 7000, count: 4 }, combinedOutflowPaid: 115000, combinedOutflowPending: 57000, netProfit: 101000 });
  if (path.includes('/expenditure/salaries')) return ok({ rows: [] });
  if (path.includes('/attendance/summary/student')) return ok({ presentDays: 88, absentDays: 6, workingDays: 94, percentage: 93.6 });
  if (path.endsWith('/messages/threads')) return ok({ studentThreads: [], teacherThreads: [] });
  if (path.includes('/settings/system-config')) return ok({ marksUpdateEnabledClasses: ['10'], attendanceMode: 'full' });
  if (path.includes('/school-profile') || path.includes('/settings')) return ok({ schoolInfo: { schoolName: 'Greenfield Public School' } });
  return ok([]);
}

/** Answer every API call with fixture data for `role`. */
export async function mockApi(page: Page, role: Role) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bodyFor(url.pathname, role)) });
  });
  await page.route('**/socket.io/**', (route) => route.abort());
}

/** Signed-out state: refresh is rejected so the login screen renders. */
export async function mockSignedOut(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/refresh')) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) });
  });
  await page.route('**/socket.io/**', (route) => route.abort());
}

export const VIEWPORTS: [number, number][] = [
  [320, 568], [360, 640], [360, 800], [375, 812], [390, 844], [393, 873],
  [412, 915], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900],
];

/**
 * Returns visible elements that stick out past the right edge of the viewport,
 * ignoring anything inside a deliberately horizontally scrollable container.
 */
export async function findOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const scrollsX = (el: Element) => {
      const s = getComputedStyle(el);
      return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
    };
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (scrollsX(p)) return true;
        const s = getComputedStyle(p);
        if (s.position === 'fixed' && s.transform !== 'none' && p.getBoundingClientRect().right <= 0) return true; // off-canvas drawer
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
      if (r.right > vw + 1 && r.left < vw && !clipped(el)) {
        const parent = el.parentElement;
        if (parent && parent.getBoundingClientRect().right > vw + 1 && !clipped(parent)) continue; // report the outermost only
        const cls = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.split(' ').slice(0, 3).join('.') : '';
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(r.right)} vw=${vw} "${text}"`);
      }
    }
    const docOverflow = document.documentElement.scrollWidth > vw + 1;
    return { docOverflow, elements: out.slice(0, 8) };
  });
}
