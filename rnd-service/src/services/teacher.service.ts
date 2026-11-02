import crypto from 'crypto';
import { Types } from 'mongoose';
import { Teacher } from '../models/teacher.model';
import { Student } from '../models/student.model';
import { User } from '../models/user.model';
import { PhoneVerification } from '../models/phoneVerification.model';
import { ProfileUpdateOTP } from '../models/profileUpdateOTP.model';
import { getNextEmployeeId } from '../utils/sequence';
import { isValidPhone } from '../utils/validators';
import { ServiceError } from '../utils/responseHelpers';
import { sendTemplateNotificationSync } from '../config/queue';
import { retryDbWrite } from '../utils/retry';
import { isDuplicateKeyError, duplicateKeyField } from '../utils/mongoErrors';
import redisClient from '../config/redis';
import { clearCache } from '../middlewares/cache.middleware';
import { getPresignedDownloadUrl } from './s3.service';
import { buildDocumentKey, uploadBase64Document, deleteDocumentFromS3, presignDocumentList } from './document.service';
import { processSignatureImage, uploadTeacherSignatureToS3, deleteTeacherSignatureFromS3 } from './signature.service';

const LOG_LABEL = 'Teacher Documents';

const parseClassAndSection = (classStr: string | null | undefined) => {
  if (!classStr) return null;
  const parts = classStr.split('-');
  const className = parts[0];
  let section = parts[1] || '';
  if (section === '' && parts.length > 2) {
    section = '-';
  } else if (!section) {
    section = '-';
  }
  return { className, section };
};

async function syncClassTeacherWithStudents(
  teacherId: string,
  oldClassTeacherOf: string | null | undefined,
  newClassTeacherOf: string | null | undefined
) {
  const oldParsed = parseClassAndSection(oldClassTeacherOf);
  const newParsed = parseClassAndSection(newClassTeacherOf);

  if (oldParsed) {
    await Student.updateMany(
      { class: oldParsed.className, section: oldParsed.section, classTeacher: new Types.ObjectId(teacherId) },
      { $unset: { classTeacher: '' } }
    );
  }
  if (newParsed) {
    await Student.updateMany(
      { class: newParsed.className, section: newParsed.section },
      { $set: { classTeacher: new Types.ObjectId(teacherId) } }
    );
  }
}

const ALLOWED_GENDERS = ['male', 'female', 'other'];

export async function createTeacher(body: any) {
  const { name, gender, dob, phone, email, address, subjects, teachingClasses, classTeacherOf, employeeId, cluster, salary } = body;

  if (!name || !gender || !dob || !phone) {
    throw new ServiceError(400, 'Name, gender, dob, and phone are required.');
  }

  // Deterministic validations that Mongoose's schema would otherwise only
  // catch at .save() time — checked BEFORE anything else so a bad `gender` or
  // unparseable `dob` can never slip past the WhatsApp send and only THEN fail
  // to save (see the atomicity review below for why this matters).
  if (!ALLOWED_GENDERS.includes(gender)) {
    throw new ServiceError(400, `Gender must be one of: ${ALLOWED_GENDERS.join(', ')}.`);
  }
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) {
    throw new ServiceError(400, 'Date of birth is not a valid date.');
  }

  if (!isValidPhone(phone.replace(/\D/g, ''))) {
    throw new ServiceError(400, 'Phone number must be exactly 10 digits.');
  }

  const cleanPhone = phone.trim().replace(/\D/g, '');
  const verification = await PhoneVerification.findOne({ phone: cleanPhone, verified: true });
  if (!verification) {
    throw new ServiceError(400, 'Phone number has not been verified. Please send and confirm OTP first.');
  }

  let finalEmpId = employeeId;
  if (!finalEmpId) {
    finalEmpId = await getNextEmployeeId();
  }

  // Username is always the employee ID — never the email. Multiple staff are
  // allowed to share the same contact email (and the same phone number, see
  // below), so email can never be used as a unique login identifier.
  const emailNormalized = email ? email.toLowerCase().trim() : '';
  const finalUsername = finalEmpId.toLowerCase().trim();

  // Phone numbers and email addresses are intentionally not required to be
  // unique across accounts — a school may have several staff sharing one
  // front-desk/notification phone number or a shared contact email.

  const existingTeacherById = await Teacher.findOne({ employeeId: finalEmpId });
  if (existingTeacherById) {
    throw new ServiceError(400, `A teacher with employee ID ${finalEmpId} already exists.`);
  }

  const tempPassword = crypto.randomBytes(4).toString('hex');
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || '';

  // ── Reservation phase ────────────────────────────────────────────────────
  // The findOne checks above are a fast, friendly pre-check but are NOT atomic
  // — two concurrent requests can both pass them before either writes anything
  // (a classic check-then-act race). The real guard is the unique index on
  // User.username / User.email / Teacher.employeeId. So the actual creation
  // happens HERE, now, atomically — but with the User left `isActive: false`
  // (the same flag the login gate in config/passport.ts already checks), so
  // nothing usable exists yet. This deterministically closes the race: the
  // LOSING concurrent request fails right here on a duplicate-key error,
  // BEFORE any WhatsApp message is ever sent for it — instead of both
  // requests racing to send a real WhatsApp message first and only
  // discovering the conflict afterwards.
  let user: InstanceType<typeof User>;
  try {
    user = new User({
      username: finalUsername,
      employeeId: finalEmpId,
      email: emailNormalized || undefined,
      password: tempPassword,
      role: 'teacher',
      firstName,
      lastName,
      phone,
      isActive: false, // reservation only — flipped true after WhatsApp succeeds
      mustChangePassword: true,
    });
    await user.save();
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      const field = duplicateKeyField(err);
      throw new ServiceError(
        400,
        field === 'email' ? `A user with email ${email} already exists.` : `Username or employee ID ${finalUsername} is already in use.`
      );
    }
    throw err;
  }

  let teacher: InstanceType<typeof Teacher>;
  try {
    teacher = new Teacher({
      userId: user._id,
      employeeId: finalEmpId,
      name,
      gender,
      dob: dobDate,
      phone,
      email: email || undefined,
      address: address || '',
      assignedClass: teachingClasses && teachingClasses.length > 0 ? teachingClasses.join(', ') : (classTeacherOf || ''),
      subjects: subjects || [],
      teachingClasses: teachingClasses || [],
      classTeacherOf: classTeacherOf || null,
      cluster: cluster || '',
      salary: salary || 0,
    });
    await teacher.save();
  } catch (err: any) {
    // Compensate: don't leave the User reservation behind if its Teacher half
    // could not be created — this is deleting an inert, never-activated row,
    // not "rolling back" anything meaningful.
    await User.deleteOne({ _id: user._id }).catch(() => {});
    if (isDuplicateKeyError(err)) {
      throw new ServiceError(400, `A teacher with employee ID ${finalEmpId} already exists.`);
    }
    throw err;
  }

  // ── Send phase ────────────────────────────────────────────────────────────
  // Synchronous — bypasses BullMQ/Redis and waits for the real Graph API
  // result (including whatsapp.service's own in-process retry for transient
  // errors). requireLiveSend guards against a misconfigured production deploy
  // silently running in WhatsApp "simulation mode" (see config/queue.ts).
  const sendResult = await sendTemplateNotificationSync(
    'staff.credentials_new',
    {
      to: phone,
      params: {
        name_en: name,
        employee_id_en: finalEmpId,
        temporary_pwd_en: tempPassword,
        name_te: name,
        employee_id_te: finalEmpId,
        temporary_pwd_te: tempPassword
      },
      dedupeKey: `staff-credentials-new:${finalEmpId}`
    },
    { requireLiveSend: true }
  );

  if (!sendResult.success) {
    console.error(`[WhatsApp] staff_credentials_new not accepted by Meta for teacher ${name} (${phone}): ${sendResult.reason}`);
    // Compensate: the reservation was never activated/usable, so removing it
    // leaves the system exactly as if this request had never happened.
    await Teacher.deleteOne({ _id: teacher._id }).catch(() => {});
    await User.deleteOne({ _id: user._id }).catch(() => {});
    throw new ServiceError(502, 'WhatsApp message could not be sent. User was not created.', {
      userCreated: false,
      whatsappSent: false
    });
  }

  // ── Activation phase ─────────────────────────────────────────────────────
  // WhatsApp has already, irreversibly, delivered the credentials. This write
  // now MUST succeed for the account to become usable. A transient Mongo blip
  // is retried a few times (safe — setting isActive true is idempotent). If it
  // still fails, we do NOT pretend to roll anything back (the message is
  // already out and cannot be unsent) — we surface the ambiguous state
  // honestly instead of silently leaving a stuck, inactive account behind.
  try {
    await retryDbWrite(async () => {
      user.isActive = true;
      await user.save();
    });
  } catch (err: any) {
    console.error(
      `[CRITICAL][WhatsApp/DB mismatch] staff_credentials_new was accepted by Meta for teacher ${name} (${phone}, ` +
        `employeeId ${finalEmpId}, userId ${user._id}) but activating the account failed after retries: ${err.message}. ` +
        `The credential message was already delivered — do NOT retry this request (it would send a second, different ` +
        `password to the same person). This account needs manual investigation/finalization.`
    );
    throw new ServiceError(
      502,
      'Credentials were sent via WhatsApp, but the account could not be finalized. Do not retry — contact a system administrator.',
      { userCreated: 'unknown', whatsappSent: true }
    );
  }

  await syncClassTeacherWithStudents(teacher._id.toString(), null, classTeacherOf);
  await clearCache('/api/dashboard/*');

  // The temporary password must not reach production logs — it is a working
  // credential for the account that was just created.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n[TEACHER CREDENTIALS] Name: ${name} | Employee ID: ${finalEmpId} | Password: ${tempPassword} | Phone: ${phone}\n`);
  } else {
    console.log(`[Teacher Created] ${name} (Employee ID: ${finalEmpId}) — credentials delivered via WhatsApp.`);
  }

  await PhoneVerification.deleteOne({ phone: cleanPhone });

  return {
    teacher,
    credentials: { employeeId: finalEmpId, username: finalUsername, whatsappSent: true },
  };
}

export async function previewNextEmployeeId(): Promise<string> {
  const extractNum = (empId: string): number => {
    const match = empId.match(/EMP-(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  };

  let maxNum = 0;
  const allTeachers = await Teacher.find({}, { employeeId: 1, _id: 0 }).lean();
  if (allTeachers.length > 0) {
    const nums = allTeachers.map((t) => extractNum(t.employeeId || ''));
    maxNum = Math.max(...nums);
  }
  return `EMP-${(maxNum + 1).toString().padStart(3, '0')}`;
}

export async function listTeachers() {
  const teachers = await Teacher.find({}).populate('userId', 'lastLogin').lean();
  return teachers.map((t: any) => ({
    ...t,
    lastLogin: t.userId?.lastLogin || null
  }));
}

export async function getTeacherStudents(teacherId: string) {
  const teacher = await Teacher.findById(teacherId).lean();
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  const students = await Student.find({ classTeacher: teacherId }).populate('classTeacher', 'name').lean();
  return { teacherName: teacher.name, assignedClass: teacher.assignedClass, studentCount: students.length, students };
}

export async function updateTeacher(teacherId: string, body: any) {
  const { name, gender, dob, phone, email, address, subjects, teachingClasses, classTeacherOf, employeeId, status, cluster, salary } = body;

  const teacher = await Teacher.findById(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  if (employeeId && employeeId !== teacher.employeeId) {
    const existing = await Teacher.findOne({ employeeId });
    if (existing) throw new ServiceError(400, `Teacher with employee ID ${employeeId} already exists.`);
  }

  if (teacher.userId) {
    const user = await User.findById(teacher.userId);
    if (user) {
      // Email is a shared contact field, not a unique login identifier —
      // multiple staff may use the same email, so no uniqueness check here.
      // Username always tracks the employee ID instead (see createTeacher),
      // never the email, so it's unaffected by email changes.
      if (email !== undefined) {
        user.email = email ? email.toLowerCase().trim() : undefined;
      }
      if (employeeId && employeeId !== teacher.employeeId) {
        user.username = employeeId.toLowerCase().trim();
      }

      if (phone && phone !== user.phone) {
        user.phone = phone;
      }

      if (name) {
        const nameParts = name.trim().split(/\s+/);
        user.firstName = nameParts[0];
        user.lastName = nameParts.slice(1).join(' ') || '-';
      }

      if (status) {
        user.isActive = status === 'active';
      }

      await user.save();

      if (redisClient && redisClient.status === 'ready') {
        await redisClient.del(`user:profile:${user._id}`).catch(() => {});
      }
    }
  }

  if (name) teacher.name = name;
  if (gender) teacher.gender = gender;
  if (dob) teacher.dob = new Date(dob);
  if (phone !== undefined) teacher.phone = phone;
  if (email !== undefined) teacher.email = email;
  if (address !== undefined) teacher.address = address;
  if (subjects) teacher.subjects = subjects;
  if (teachingClasses !== undefined) {
    teacher.teachingClasses = teachingClasses;
  }
  const oldClassTeacherOf = teacher.classTeacherOf;
  if (classTeacherOf !== undefined) {
    teacher.classTeacherOf = classTeacherOf || null;
  }
  // assignedClass is required and must never be blanked out: only replace it when
  // the incoming data actually supplies a non-empty value to replace it with.
  if (teachingClasses && teachingClasses.length > 0) {
    teacher.assignedClass = teachingClasses.join(', ');
  } else if (classTeacherOf) {
    teacher.assignedClass = classTeacherOf;
  }
  if (employeeId) teacher.employeeId = employeeId;
  if (status) teacher.status = status;
  if (cluster !== undefined) teacher.cluster = cluster;
  if (salary !== undefined) teacher.salary = salary;

  await teacher.save();
  if (classTeacherOf !== undefined) {
    await syncClassTeacherWithStudents(teacher._id.toString(), oldClassTeacherOf, classTeacherOf);
  }
  await clearCache('/api/dashboard/*');
  return teacher;
}

export async function deleteTeacher(teacherId: string, password: string | undefined, requestUserId: string) {
  if (!password) throw new ServiceError(400, 'Password is required to delete.');

  let isPasswordCorrect = false;
  const adminUser = await User.findById(requestUserId).select('+password');
  if (adminUser) {
    isPasswordCorrect = await adminUser.comparePassword(password);
  }
  if (!isPasswordCorrect) throw new ServiceError(403, 'Invalid admin password. Deletion unauthorized.');

  const teacher = await Teacher.findByIdAndDelete(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  await Student.updateMany({ classTeacher: new Types.ObjectId(teacherId) }, { $unset: { classTeacher: '' } });

  if (teacher.userId) {
    await User.deleteOne({ _id: teacher.userId });
  }

  await clearCache('/api/dashboard/*');
}

export async function resetTeacherPassword(teacherId: string): Promise<{ passwordChanged: boolean; whatsappSent: boolean }> {
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  const user = await User.findById(teacher.userId);
  if (!user) throw new ServiceError(404, 'Linked user credentials not found.');

  const targetPhone = teacher.phone || user.phone;
  if (!targetPhone) {
    throw new ServiceError(400, 'No registered WhatsApp number found. Password was not changed.', {
      passwordChanged: false,
      whatsappSent: false
    });
  }

  // Generate the new password and send it BEFORE touching the database. The
  // teacher's existing password must remain valid until Meta actually accepts
  // staff_credentials_reset — otherwise a WhatsApp failure would leave the
  // account with a new password nobody received.
  const tempPassword = crypto.randomBytes(4).toString('hex');
  // The teacher's login identity is best communicated as their employee ID —
  // `user.username` may instead be an email address when one was supplied at
  // creation, which isn't what admins/teachers think of as their "username".
  const displayUsername = teacher.employeeId || user.username;
  const sendResult = await sendTemplateNotificationSync(
    'staff.credentials_reset',
    {
      to: targetPhone,
      params: {
        username_en: displayUsername,
        password_en: tempPassword,
        username_te: displayUsername,
        password_te: tempPassword
      },
      dedupeKey: `staff-credentials-reset:${user._id}:${Date.now()}`
    },
    { requireLiveSend: true }
  );

  if (!sendResult.success) {
    console.error(`[WhatsApp] staff_credentials_reset not accepted by Meta for teacher ${teacherId} (${targetPhone}): ${sendResult.reason}`);
    throw new ServiceError(502, 'WhatsApp message could not be sent. Password was not changed.', {
      passwordChanged: false,
      whatsappSent: false
    });
  }

  // WhatsApp has already, irreversibly, delivered the new password. This write
  // now MUST land for the account to actually be usable with it. Retry a
  // transient Mongo blip a few times; if it still fails, do not pretend the
  // old password is safe to rely on either — surface the ambiguity honestly
  // (see createTeacher's activation phase for the identical reasoning).
  try {
    await retryDbWrite(async () => {
      user.password = tempPassword;
      user.mustChangePassword = true;
      await user.save();
    });
  } catch (err: any) {
    console.error(
      `[CRITICAL][WhatsApp/DB mismatch] staff_credentials_reset was accepted by Meta for teacher ${teacherId} ` +
        `(userId ${user._id}, ${targetPhone}) but saving the new password failed after retries: ${err.message}. ` +
        `The new password was already delivered via WhatsApp — do NOT retry this request (it would send yet ` +
        `another different password to the same person). This account needs manual investigation.`
    );
    throw new ServiceError(
      502,
      'A new password was sent via WhatsApp, but it could not be saved. Do not retry — contact a system administrator.',
      { passwordChanged: 'unknown', whatsappSent: true }
    );
  }

  if (redisClient && redisClient.status === 'ready') {
    await redisClient.del(`user:profile:${user._id}`).catch(() => {});
  }

  return { passwordChanged: true, whatsappSent: true };
}

// ─── Documents vault ──────────────────────────────────────────────────────

export async function addTeacherDocument(teacherId: string, docType: string, filename: string, base64: string) {
  if (!docType || !filename || !base64) {
    throw new ServiceError(400, 'docType, filename, and base64 are required.');
  }

  const teacher = await Teacher.findById(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  const year = new Date().getFullYear();
  const s3Key = buildDocumentKey(`teachers/${year}/${teacher.employeeId || teacherId}`, filename);
  await uploadBase64Document(base64, s3Key);

  if (!teacher.documents) teacher.documents = [];
  teacher.documents.push({ docType, filename, s3Key, uploadedAt: new Date() } as any);
  await teacher.save();

  const savedDoc = teacher.documents[teacher.documents.length - 1];
  const downloadUrl = await getPresignedDownloadUrl(s3Key);
  return { _id: savedDoc._id, docType, filename, s3Key, uploadedAt: savedDoc.uploadedAt, downloadUrl };
}

export async function listTeacherDocuments(teacherId: string) {
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  return presignDocumentList(
    (teacher.documents || []).map((doc: any) => ({ _id: doc._id, docType: doc.docType, filename: doc.filename, uploadedAt: doc.uploadedAt, s3Key: doc.s3Key })),
    LOG_LABEL
  );
}

export async function deleteTeacherDocument(teacherId: string, docId: string) {
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  const doc: any = teacher.documents.find((d: any) => d._id.toString() === docId);
  if (!doc) throw new ServiceError(404, 'Document not found.');

  await deleteDocumentFromS3(doc.s3Key, LOG_LABEL);

  const docIdx = teacher.documents.findIndex((d: any) => d._id.toString() === docId);
  if (docIdx !== -1) {
    teacher.documents.splice(docIdx, 1);
    await teacher.save();
  }
}

// ─── Signature management ──────────────────────────────────────────────────

export async function resolveTeacherFromReqUser(user: any): Promise<any> {
  if (!user) return null;
  let teacher = await Teacher.findOne({ userId: user._id });
  if (!teacher && user.teacherId) {
    teacher = await Teacher.findById(user.teacherId);
  }
  return teacher;
}

// ─── Self-service profile (teacher editing their own contact details) ──────
// Deliberately narrower than updateTeacher(): only phone/email/cluster/address
// may be touched here — name, status, class assignment etc. stay admin-only.
export async function getMyTeacherProfile(reqUser: any) {
  const teacher = await resolveTeacherFromReqUser(reqUser);
  if (!teacher) throw new ServiceError(404, 'Teacher profile not found.');
  return {
    name: teacher.name,
    employeeId: teacher.employeeId,
    phone: teacher.phone || '',
    email: teacher.email || '',
    cluster: teacher.cluster || '',
    address: teacher.address || '',
  };
}

export async function updateMyTeacherProfile(reqUser: any, body: any) {
  const teacher = await resolveTeacherFromReqUser(reqUser);
  if (!teacher) throw new ServiceError(404, 'Teacher profile not found.');

  const { phone, email, cluster, address, otpCode } = body;
  const allowedFields: Record<string, any> = {};

  if (phone !== undefined) {
    const cleanNewPhone = String(phone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const cleanOldPhone = String(teacher.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');

    if (cleanNewPhone && cleanNewPhone !== cleanOldPhone) {
      if (!/^[6-9]\d{9}$/.test(cleanNewPhone)) {
        throw new ServiceError(400, 'Phone number must be a valid 10-digit Indian mobile number.');
      }
      if (!otpCode || typeof otpCode !== 'string' || !otpCode.trim()) {
        throw new ServiceError(400, 'WhatsApp OTP verification is required to update your mobile number.');
      }

      const userId = reqUser._id || reqUser.id;
      const hashedOTP = crypto.createHash('sha256').update(String(otpCode).trim()).digest('hex');
      const otpRecord = await ProfileUpdateOTP.findOne({
        userId,
        phone: cleanNewPhone,
        expiresAt: { $gt: new Date() },
      });

      if (!otpRecord || otpRecord.otp !== hashedOTP) {
        throw new ServiceError(400, 'Invalid or expired WhatsApp OTP code. Please request a new code.');
      }

      // Valid OTP: consume it
      await ProfileUpdateOTP.deleteMany({ userId, phone: cleanNewPhone });
      allowedFields.phone = cleanNewPhone;
    } else if (cleanNewPhone) {
      allowedFields.phone = cleanNewPhone;
    }
  }

  if (email !== undefined) allowedFields.email = email;
  if (cluster !== undefined) allowedFields.cluster = cluster;
  if (address !== undefined) allowedFields.address = address;

  const updated = await updateTeacher(teacher._id.toString(), allowedFields);
  return {
    name: updated.name,
    employeeId: updated.employeeId,
    phone: updated.phone || '',
    email: updated.email || '',
    cluster: updated.cluster || '',
    address: updated.address || '',
  };
}

export async function getTeacherSignature(reqUser: any) {
  const teacher = await resolveTeacherFromReqUser(reqUser);
  if (!teacher) throw new ServiceError(404, 'Teacher profile not found.');

  if (!teacher.signatureUrl) {
    return { data: null, message: 'No signature uploaded' };
  }

  let presignedUrl = teacher.signatureUrl;
  if (teacher.signatureUrl.includes('.amazonaws.com/')) {
    const s3Key = teacher.signatureUrl.split('.amazonaws.com/')[1];
    if (s3Key) {
      presignedUrl = await getPresignedDownloadUrl(s3Key);
    }
  }

  return {
    data: {
      teacherName: teacher.name,
      signatureUrl: presignedUrl,
      signatureUploadedAt: teacher.signatureUploadedAt || null,
      signatureUpdatedAt: teacher.signatureUpdatedAt || null,
    },
  };
}

export async function uploadTeacherSignature(reqUser: any, signatureImage: string) {
  const teacher = await resolveTeacherFromReqUser(reqUser);
  if (!teacher) throw new ServiceError(404, 'Teacher profile not found.');

  if (!signatureImage) {
    throw new ServiceError(400, 'signatureImage base64 data is required.');
  }

  const base64Data = signatureImage.includes(',') ? signatureImage.split(',')[1] : signatureImage;
  const inputBuffer = Buffer.from(base64Data, 'base64');

  const processed = await processSignatureImage(inputBuffer);

  const teacherIdStr = (teacher as any)._id.toString();
  const { url: presignedUrl, s3Key } = await uploadTeacherSignatureToS3(teacherIdStr, processed.processedBuffer);

  const now = new Date();
  teacher.signatureUrl = presignedUrl;
  if (!teacher.signatureUploadedAt) teacher.signatureUploadedAt = now;
  teacher.signatureUpdatedAt = now;
  await teacher.save();

  const { queueAssetOptimization } = require('../config/queue');
  await queueAssetOptimization({ assetType: 'signature', s3Key, modelType: 'teacher', modelId: teacherIdStr });

  return {
    signatureUrl: presignedUrl,
    signatureUploadedAt: teacher.signatureUploadedAt || now,
    signatureUpdatedAt: teacher.signatureUpdatedAt || now,
  };
}

export async function deleteTeacherSignature(reqUser: any) {
  const teacher = await resolveTeacherFromReqUser(reqUser);
  if (!teacher) throw new ServiceError(404, 'Teacher profile not found.');

  const teacherIdStr = (teacher as any)._id.toString();
  await deleteTeacherSignatureFromS3(teacherIdStr);

  teacher.signatureUrl = undefined;
  teacher.signatureUploadedAt = undefined;
  teacher.signatureUpdatedAt = undefined;
  await teacher.save();
}

export async function getClassTeacherSignature(className: string) {
  const teacher: any = await Teacher.findOne({
    $or: [{ classTeacherOf: className }, { assignedClass: { $regex: className, $options: 'i' } }],
  });

  if (!teacher) {
    return { teacherName: 'Class Teacher', signatureUrl: null };
  }

  let presignedUrl = teacher.signatureUrl || null;
  if (teacher.signatureUrl && teacher.signatureUrl.includes('.amazonaws.com/')) {
    const s3Key = teacher.signatureUrl.split('.amazonaws.com/')[1];
    if (s3Key) {
      presignedUrl = await getPresignedDownloadUrl(s3Key);
    }
  }

  return { teacherName: teacher.name, signatureUrl: presignedUrl };
}
