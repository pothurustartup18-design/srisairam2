import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.REDIS_PORT = '6399';
});

import Module from 'node:module';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import passport from 'passport';
import type { AddressInfo } from 'net';

/**
 * Holiday calendar: routes + role-based access + the working-day rules that
 * attendance percentages and report cards rely on. Opt-in: set TEST_MONGODB_URI
 * to a THROWAWAY database (the suite drops it).
 */
const TEST_DB = process.env.TEST_MONGODB_URI;

const nodeLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: any[]) {
  if (request === '../config/redis') return { default: { status: 'end' } };
  return nodeLoad.call(this, request, ...rest);
};

let base = '';
let server: any;
let AcademicCalendar: any;
let svc: any;
const PW = 'Cal-test-pw-1';

const call = (method: string, path: string, token?: string, body?: any) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
const login = async (username: string) =>
  (await (await call('POST', '/api/auth/login', undefined, { username, password: PW })).json()).accessToken as string;

describe.skipIf(!TEST_DB)('holiday calendar (integration)', { timeout: 60_000 }, () => {
  let admin = '';
  let parent = '';

  beforeAll(async () => {
    await mongoose.connect(TEST_DB!);
    await mongoose.connection.db!.dropDatabase();
    await import('../../../config/passport');
    const { User } = await import('../../../models/user.model');
    const { Student } = await import('../../../models/student.model');
    AcademicCalendar = (await import('../../../models/academicCalendar.model')).AcademicCalendar;
    svc = await import('../../../services/calendar.service');
    await User.create({ username: 'cal-admin', password: PW, role: 'admin', firstName: 'A', lastName: 'B', phone: '9876543210', email: 'cal-admin@example.com', isActive: true });
    await User.create({ username: 'cal-parent', password: PW, role: 'parent', firstName: 'P', lastName: 'Q', phone: '9876543211', isActive: true, studentId: new mongoose.Types.ObjectId() });
    void Student;

    const authRoutes = (await import('../../shared/auth.routes')).default;
    const calendarRoutes = (await import('../calendar.routes')).default;
    const { authenticateJWT } = await import('../../../middlewares/auth.middleware');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(passport.initialize());
    app.use('/api/auth', authRoutes);
    app.use('/api/calendar', authenticateJWT, calendarRoutes);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    admin = await login('cal-admin');
    parent = await login('cal-parent');
  });

  afterAll(async () => {
    await new Promise(r => server?.close(r));
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await AcademicCalendar.deleteMany({});
  });

  it('requires authentication, and parents cannot declare or remove holidays', async () => {
    expect((await call('GET', '/api/calendar/holidays')).status).toBe(401);
    expect((await call('POST', '/api/calendar/holidays', parent, { title: 'x', date: '2026-11-04' })).status).toBe(403);
    expect((await call('POST', '/api/calendar/override-sunday', parent, { date: '2026-11-08' })).status).toBe(403);
    const made = await call('POST', '/api/calendar/holidays', admin, { title: 'Diwali', date: '2026-11-04' });
    const id = (await made.json()).data._id;
    expect((await call('DELETE', `/api/calendar/holidays/${id}`, parent)).status).toBe(403);
    expect(await AcademicCalendar.countDocuments({})).toBe(1);
  });

  it('admin can create, list by month, and delete a holiday and a vacation range', async () => {
    const h = await call('POST', '/api/calendar/holidays', admin, { title: 'Diwali', date: '2026-11-04' });
    expect(h.status).toBe(201);
    expect((await h.json()).data.type).toBe('holiday');
    const v = await call('POST', '/api/calendar/holidays', admin, { title: 'Winter break', date: '2026-12-24', endDate: '2027-01-02' });
    expect((await v.json()).data.type).toBe('vacation');
    expect((await call('POST', '/api/calendar/holidays', admin, { date: '2026-11-04' })).status).toBe(400);

    const nov = await (await call('GET', '/api/calendar/holidays?month=2026-11', admin)).json();
    expect(nov.data.map((x: any) => x.title)).toEqual(['Diwali']);
    const jan = await (await call('GET', '/api/calendar/holidays?month=2027-01', admin)).json();
    expect(jan.data.map((x: any) => x.title)).toEqual(['Winter break']);

    const id = (await AcademicCalendar.findOne({ title: 'Diwali' }))._id;
    expect((await call('DELETE', `/api/calendar/holidays/${id}`, admin)).status).toBe(200);
    expect((await call('DELETE', `/api/calendar/holidays/${id}`, admin)).status).toBe(404);
  });

  it('Sundays are non-working unless overridden, school-wide or per class', async () => {
    const sunday = '2026-11-08';
    expect(await svc.isDateWorkingDay(sunday, '5')).toBe(false);
    await call('POST', '/api/calendar/override-sunday', admin, { date: sunday, applicableClasses: ['5'] });
    expect(await svc.isDateWorkingDay(sunday, '5')).toBe(true);
    expect(await svc.isDateWorkingDay(sunday, '6')).toBe(false);
    await call('POST', '/api/calendar/override-sunday', admin, { date: sunday });
    expect(await svc.isDateWorkingDay(sunday, '6')).toBe(true);
    await call('POST', '/api/calendar/override-sunday', admin, { date: sunday, enabled: false });
    expect(await svc.isDateWorkingDay(sunday, '5')).toBe(false);
  });

  it('holidays and vacations are excluded from attendance registers; class-scoped ones only for that class', async () => {
    await call('POST', '/api/calendar/holidays', admin, { title: 'Diwali', date: '2026-11-04' });
    await call('POST', '/api/calendar/holidays', admin, { title: 'Class 7 trip', date: '2026-11-05', isSchoolWide: false, applicableClasses: ['7'] });
    const regs = [
      { date: '2026-11-03', class: '7' },
      { date: '2026-11-04', class: '7' }, // school-wide holiday
      { date: '2026-11-05', class: '7' }, // class 7 only
      { date: '2026-11-05', class: '8' },
      { date: '2026-11-08', class: '8' } // Sunday
    ];
    const kept = await svc.filterWorkingAttendanceRegisters(regs);
    expect(kept.map((r: any) => `${r.date}:${r.class}`)).toEqual(['2026-11-03:7', '2026-11-05:8']);
    expect(await svc.filterWorkingAttendanceRegisters([])).toEqual([]);
  });
});
