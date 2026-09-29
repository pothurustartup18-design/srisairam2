/**
 * createTeacher / resetTeacherPassword — atomicity prerequisite:
 *   WhatsApp (staff_credentials_new / staff_credentials_reset) must be ACCEPTED
 *   by Meta before the User document is created / the password is changed.
 *
 * sendTemplateNotificationSync (config/queue) and every Mongoose model are
 * mocked — no Mongo, no Redis, no Graph API. This isolates the ORDERING
 * invariant itself: does the DB write happen only after a real send result?
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  // Shared, scriptable save() implementations. A User instance's .save() calls
  // through to this so a test can queue distinct outcomes per call — e.g.
  // 1st call (reservation) succeeds, 2nd call (activation) fails N times.
  const userSaveImpl = vi.fn().mockResolvedValue(undefined);
  const teacherSaveImpl = vi.fn().mockResolvedValue(undefined);

  const UserMock: any = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data);
    this._id = `user-${Math.random().toString(36).slice(2)}`;
    this.save = () => userSaveImpl();
  });
  const TeacherMock: any = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data);
    this._id = `teacher-${Math.random().toString(36).slice(2)}`;
    this.save = () => teacherSaveImpl();
  });
  UserMock.findOne = vi.fn();
  UserMock.findById = vi.fn();
  UserMock.deleteOne = vi.fn().mockResolvedValue(undefined);
  TeacherMock.findOne = vi.fn();
  TeacherMock.findById = vi.fn();
  TeacherMock.deleteOne = vi.fn().mockResolvedValue(undefined);
  return {
    sendTemplateNotificationSync: vi.fn(),
    UserMock,
    TeacherMock,
    userSaveImpl,
    teacherSaveImpl,
    userFindOne: UserMock.findOne,
    userFindById: UserMock.findById,
    userDeleteOne: UserMock.deleteOne,
    teacherFindOne: TeacherMock.findOne,
    teacherFindById: TeacherMock.findById,
    teacherDeleteOne: TeacherMock.deleteOne,
    phoneVerificationFindOne: vi.fn(),
    phoneVerificationDeleteOne: vi.fn(),
    studentUpdateMany: vi.fn(),
    getNextEmployeeId: vi.fn(),
    clearCache: vi.fn(),
    redisStatus: 'end' as string
  };
});

vi.mock('../../config/queue', () => ({ sendTemplateNotificationSync: h.sendTemplateNotificationSync }));
vi.mock('../../config/redis', () => ({ default: { get status() { return h.redisStatus; }, del: vi.fn() } }));
vi.mock('../../utils/sequence', () => ({ getNextEmployeeId: h.getNextEmployeeId }));
vi.mock('../../middlewares/cache.middleware', () => ({ clearCache: h.clearCache }));
vi.mock('../../models/student.model', () => ({ Student: { updateMany: h.studentUpdateMany } }));
vi.mock('../../models/phoneVerification.model', () => ({
  PhoneVerification: { findOne: h.phoneVerificationFindOne, deleteOne: h.phoneVerificationDeleteOne }
}));
vi.mock('../../models/user.model', () => ({ User: h.UserMock }));
vi.mock('../../models/teacher.model', () => ({ Teacher: h.TeacherMock }));

const UserMock = h.UserMock;
const TeacherMock = h.TeacherMock;

import { createTeacher, resetTeacherPassword } from '../teacher.service';
import { ServiceError } from '../../utils/responseHelpers';

const NEW_TEACHER = { name: 'Asha Rao', gender: 'female', dob: '1990-01-01', phone: '9876543210' };

beforeEach(() => {
  vi.clearAllMocks();
  UserMock.mockClear();
  TeacherMock.mockClear();
  h.userSaveImpl.mockReset().mockResolvedValue(undefined);
  h.teacherSaveImpl.mockReset().mockResolvedValue(undefined);
  h.sendTemplateNotificationSync.mockResolvedValue({ success: true });
  h.userFindOne.mockResolvedValue(null); // no existing user by email
  h.teacherFindOne.mockResolvedValue(null); // no duplicate employeeId
  h.phoneVerificationFindOne.mockResolvedValue({ phone: '9876543210', verified: true });
  h.phoneVerificationDeleteOne.mockResolvedValue(undefined);
  h.studentUpdateMany.mockResolvedValue(undefined);
  h.getNextEmployeeId.mockResolvedValue('EMP-100');
  h.redisStatus = 'end';
});

describe('createTeacher — atomicity (Tests 1, 2, 7)', () => {
  it('Test 1: WhatsApp success → User (and Teacher) are created', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: true });

    const { credentials } = await createTeacher(NEW_TEACHER);

    expect(h.sendTemplateNotificationSync).toHaveBeenCalledWith(
      'staff.credentials_new',
      expect.objectContaining({ to: '9876543210' }),
      { requireLiveSend: true }
    );
    // The User is created (reserved) BEFORE the WhatsApp call, then activated after.
    expect(UserMock).toHaveBeenCalledTimes(1);
    expect(UserMock.mock.instances[0].isActive).toBe(true); // activated post-send
    expect(TeacherMock).toHaveBeenCalledTimes(1);
    expect(credentials.whatsappSent).toBe(true);
    expect(h.userDeleteOne).not.toHaveBeenCalled();
    expect(h.teacherDeleteOne).not.toHaveBeenCalled();
    // Phone verification is consumed only after a successful creation.
    expect(h.phoneVerificationDeleteOne).toHaveBeenCalledWith({ phone: '9876543210' });
  });

  it('reserves the User with isActive:false BEFORE sending WhatsApp', async () => {
    let userWasActiveAtSendTime: boolean | undefined;
    h.sendTemplateNotificationSync.mockImplementation(async () => {
      userWasActiveAtSendTime = UserMock.mock.instances[0]?.isActive;
      return { success: true };
    });

    await createTeacher(NEW_TEACHER);

    expect(userWasActiveAtSendTime).toBe(false);
  });

  it('Test 2: WhatsApp failure → User is NOT created (nor Teacher) — reservation is deleted', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: false, reason: 'template not approved' });

    await expect(createTeacher(NEW_TEACHER)).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/User was not created/i)
    });

    // A User/Teacher WAS momentarily inserted (isActive:false) to atomically
    // claim the username/employeeId before sending — but both are deleted
    // synchronously once WhatsApp fails, so nothing observable remains.
    expect(h.userDeleteOne).toHaveBeenCalledTimes(1);
    expect(h.teacherDeleteOne).toHaveBeenCalledTimes(1);
    // The phone verification record must survive a failed attempt so the admin
    // can retry immediately without re-doing OTP verification.
    expect(h.phoneVerificationDeleteOne).not.toHaveBeenCalled();
  });

  it('Test 2b: the thrown error carries userCreated:false / whatsappSent:false for the route to surface', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: false, reason: 'boom' });
    try {
      await createTeacher(NEW_TEACHER);
      throw new Error('expected createTeacher to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).details).toEqual({ userCreated: false, whatsappSent: false });
    }
  });

  it('Test 7: a duplicate employee ID is rejected BEFORE any WhatsApp send or User creation', async () => {
    h.teacherFindOne.mockResolvedValue({ employeeId: 'EMP-100' }); // duplicate

    await expect(createTeacher({ ...NEW_TEACHER, employeeId: 'EMP-100' })).rejects.toMatchObject({ status: 400 });

    expect(h.sendTemplateNotificationSync).not.toHaveBeenCalled();
    expect(UserMock).not.toHaveBeenCalled();
    expect(TeacherMock).not.toHaveBeenCalled();
  });

  it('Test 7b: a duplicate email is rejected BEFORE any WhatsApp send or User creation', async () => {
    h.userFindOne.mockResolvedValue({ _id: 'existing-user' }); // duplicate email

    await expect(createTeacher({ ...NEW_TEACHER, email: 'asha@school.test' })).rejects.toMatchObject({ status: 400 });

    expect(h.sendTemplateNotificationSync).not.toHaveBeenCalled();
    expect(UserMock).not.toHaveBeenCalled();
  });

  it('an unverified phone is rejected before any WhatsApp send or User creation', async () => {
    h.phoneVerificationFindOne.mockResolvedValue(null);

    await expect(createTeacher(NEW_TEACHER)).rejects.toMatchObject({ status: 400 });

    expect(h.sendTemplateNotificationSync).not.toHaveBeenCalled();
    expect(UserMock).not.toHaveBeenCalled();
  });

  it('a duplicate-key race that slips past the pre-check is caught at the atomic reservation insert, BEFORE WhatsApp is sent', async () => {
    // Simulates two concurrent requests: both pass the findOne pre-checks
    // (mocked to return null above), but this one loses the real race — its
    // insert hits the unique index.
    h.userSaveImpl.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyValue: { username: 'emp-100' }
    }));

    await expect(createTeacher(NEW_TEACHER)).rejects.toMatchObject({ status: 400 });

    expect(h.sendTemplateNotificationSync).not.toHaveBeenCalled();
    expect(TeacherMock).not.toHaveBeenCalled();
    // Nothing to compensate — the insert itself never landed.
    expect(h.userDeleteOne).not.toHaveBeenCalled();
  });

  it('a Teacher-side duplicate employeeId race compensates by deleting the just-reserved User, before WhatsApp is sent', async () => {
    h.teacherSaveImpl.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyValue: { employeeId: 'EMP-100' }
    }));

    await expect(createTeacher(NEW_TEACHER)).rejects.toMatchObject({ status: 400 });

    expect(h.sendTemplateNotificationSync).not.toHaveBeenCalled();
    expect(h.userDeleteOne).toHaveBeenCalledTimes(1); // compensating cleanup
  });

  it('retries the activation write on a transient failure and still reports success', async () => {
    h.userSaveImpl
      .mockResolvedValueOnce(undefined) // reservation save
      .mockRejectedValueOnce(new Error('connect ECONNRESET')) // activation attempt 1
      .mockResolvedValueOnce(undefined); // activation attempt 2

    const { credentials } = await createTeacher(NEW_TEACHER);

    expect(credentials.whatsappSent).toBe(true);
    expect(h.userDeleteOne).not.toHaveBeenCalled(); // WhatsApp already succeeded — never compensate after send
  });

  it('when the activation write is exhausted after WhatsApp already succeeded, surfaces an honest ambiguous-state error (never deletes, never pretends success)', async () => {
    h.userSaveImpl
      .mockResolvedValueOnce(undefined) // reservation save
      .mockRejectedValue(new Error('connect ECONNRESET')); // every activation attempt fails

    await expect(createTeacher(NEW_TEACHER)).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/could not be finalized/i),
      details: { userCreated: 'unknown', whatsappSent: true }
    });

    // The message was already delivered — this must NEVER be cleaned up
    // automatically (that would hide the one durable record of what happened).
    expect(h.userDeleteOne).not.toHaveBeenCalled();
    expect(h.teacherDeleteOne).not.toHaveBeenCalled();
  });
});

describe('resetTeacherPassword — atomicity (Tests 5, 6)', () => {
  const fakeTeacher = { _id: 'teacher-1', userId: 'user-1', phone: '9876543210', employeeId: 'EMP-042' };
  const fakeUser = { _id: 'user-1', username: 'emp-100', phone: '9876543210', password: 'OLD_HASH', save: vi.fn() };

  beforeEach(() => {
    h.teacherFindById.mockResolvedValue({ ...fakeTeacher });
    fakeUser.password = 'OLD_HASH';
    fakeUser.save = vi.fn().mockResolvedValue(undefined);
    h.userFindById.mockResolvedValue(fakeUser);
  });

  it('Test 5: WhatsApp success → new password is saved', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: true });

    const result = await resetTeacherPassword('teacher-1');

    expect(result).toEqual({ passwordChanged: true, whatsappSent: true });
    expect(fakeUser.save).toHaveBeenCalledTimes(1);
    expect(fakeUser.password).not.toBe('OLD_HASH');
    expect(h.sendTemplateNotificationSync).toHaveBeenCalledWith(
      'staff.credentials_reset',
      expect.objectContaining({
        to: '9876543210',
        // The recipient's employee ID, not their (possibly email-based) username.
        params: expect.objectContaining({ username_en: 'EMP-042', username_te: 'EMP-042' })
      }),
      { requireLiveSend: true }
    );
  });

  it('sends the employee ID as the username, not user.username, when the teacher has an email-based login', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: true });
    h.userFindById.mockResolvedValue({ ...fakeUser, username: 'priya.sharma@school.edu' });

    await resetTeacherPassword('teacher-1');

    const [, data] = h.sendTemplateNotificationSync.mock.calls[0];
    expect(data.params.username_en).toBe('EMP-042');
    expect(data.params.username_en).not.toBe('priya.sharma@school.edu');
  });

  it('retries the password save on a transient failure and still reports success', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: true });
    fakeUser.save = vi.fn()
      .mockRejectedValueOnce(new Error('connect ECONNRESET'))
      .mockResolvedValueOnce(undefined);

    const result = await resetTeacherPassword('teacher-1');

    expect(result).toEqual({ passwordChanged: true, whatsappSent: true });
    expect(fakeUser.save).toHaveBeenCalledTimes(2);
  });

  it('when the password save is exhausted after WhatsApp already succeeded, surfaces an honest ambiguous-state error', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: true });
    fakeUser.save = vi.fn().mockRejectedValue(new Error('connect ECONNRESET'));

    await expect(resetTeacherPassword('teacher-1')).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/could not be saved/i),
      details: { passwordChanged: 'unknown', whatsappSent: true }
    });
  });

  it('Test 6: WhatsApp failure → password is NOT saved, old password remains valid', async () => {
    h.sendTemplateNotificationSync.mockResolvedValue({ success: false, reason: 'template rejected' });

    await expect(resetTeacherPassword('teacher-1')).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/Password was not changed/i),
      details: { passwordChanged: false, whatsappSent: false }
    });

    expect(fakeUser.save).not.toHaveBeenCalled();
    expect(fakeUser.password).toBe('OLD_HASH');
  });

  it('never calls WhatsApp when the teacher has no phone on file (nothing to send, nothing changed)', async () => {
    h.teacherFindById.mockResolvedValue({ ...fakeTeacher, phone: undefined });
    h.userFindById.mockResolvedValue({ ...fakeUser, phone: undefined, save: vi.fn() });

    await expect(resetTeacherPassword('teacher-1')).rejects.toMatchObject({ status: 400 });
    expect(h.sendTemplateNotificationSync).not.toHaveBeenCalled();
  });
});
