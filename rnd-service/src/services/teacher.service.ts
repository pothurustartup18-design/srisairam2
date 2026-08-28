import crypto from 'crypto';
import { Types } from 'mongoose';
import { Teacher } from '../models/teacher.model';
import { Student } from '../models/student.model';
import { User } from '../models/user.model';
import { PhoneVerification } from '../models/phoneVerification.model';
import { getNextEmployeeId } from '../utils/sequence';
import { isValidPhone } from '../utils/validators';
import { ServiceError } from '../utils/responseHelpers';
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

export async function createTeacher(body: any) {
  const { name, gender, dob, phone, email, address, subjects, teachingClasses, classTeacherOf, employeeId, cluster, salary } = body;

  if (!name || !gender || !dob || !phone) {
    throw new ServiceError(400, 'Name, gender, dob, and phone are required.');
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

  let finalUsername = '';
  let emailNormalized = '';
  if (email) {
    emailNormalized = email.toLowerCase().trim();
    const existingUserByEmail = await User.findOne({ email: emailNormalized });
    if (existingUserByEmail) {
      throw new ServiceError(400, `A user with email ${email} already exists.`);
    }
    finalUsername = emailNormalized;
  } else {
    finalUsername = finalEmpId.toLowerCase().trim();
  }

  // Phone numbers are intentionally not required to be unique across accounts — a
  // school may have several staff sharing one front-desk or notification number.

  const existingTeacherById = await Teacher.findOne({ employeeId: finalEmpId });
  if (existingTeacherById) {
    throw new ServiceError(400, `A teacher with employee ID ${finalEmpId} already exists.`);
  }

  const tempPassword = crypto.randomBytes(4).toString('hex');
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || '';

  const user = new User({
    username: finalUsername,
    email: emailNormalized || undefined,
    password: tempPassword,
    role: 'teacher',
    firstName,
    lastName,
    phone,
    isActive: true,
    mustChangePassword: true,
  });
  await user.save();

  const teacher = new Teacher({
    userId: user._id,
    employeeId: finalEmpId,
    name,
    gender,
    dob: new Date(dob),
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
  await syncClassTeacherWithStudents(teacher._id.toString(), null, classTeacherOf);
  await clearCache('/api/dashboard/*');

  // The temporary password must not reach production logs — it is a working
  // credential for the account that was just created.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n[TEACHER CREDENTIALS] Name: ${name} | Employee ID: ${finalEmpId} | Password: ${tempPassword} | Phone: ${phone}\n`);
  } else {
    console.log(`[Teacher Created] ${name} (Employee ID: ${finalEmpId}) — credentials delivered via WhatsApp.`);
  }

  let whatsappSent = false;
  try {
    const { normalizePhone, sendWhatsAppTemplate } = require('./whatsapp.service');
    const phoneResult = normalizePhone(phone);
    if (phoneResult.ok && phoneResult.e164) {
      const welcomeText = `Welcome to SchoolHub, ${name}! Your Employee Portal credentials are: Employee ID: ${finalEmpId} | Temporary Password: ${tempPassword} | Please change your password after first login.`;
      const sent = await sendWhatsAppTemplate(phoneResult.e164, 'school_notification', 'en_US', [welcomeText]);
      if (sent) {
        whatsappSent = true;
        console.log(`[WhatsApp Onboarding Dispatch] Successfully sent welcome credentials to: ${phoneResult.e164}`);
      } else {
        console.warn(`[WhatsApp Onboarding Dispatch] Delivery failed (sandbox restriction?) for: ${phoneResult.e164}`);
      }
    } else {
      console.warn('[WhatsApp Onboarding Warning]: Phone number normalization failed:', phoneResult.reason);
    }
  } catch (err: any) {
    console.error('[Teacher Registration Onboarding WhatsApp Error]:', err.message);
  }

  await PhoneVerification.deleteOne({ phone: cleanPhone });

  return {
    teacher,
    credentials: { employeeId: finalEmpId, username: finalEmpId, password: tempPassword, whatsappSent },
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
      if (email !== undefined) {
        const emailNormalized = email ? email.toLowerCase().trim() : '';
        if (emailNormalized) {
          if (emailNormalized !== user.email) {
            const existingUser = await User.findOne({ email: emailNormalized, _id: { $ne: user._id } });
            if (existingUser) throw new ServiceError(400, `Email ${email} is already in use by another account.`);
            user.email = emailNormalized;
            user.username = emailNormalized;
          }
        } else {
          user.email = undefined;
          user.username = (employeeId || teacher.employeeId).toLowerCase().trim();
        }
      } else if (employeeId && employeeId !== teacher.employeeId && !user.email) {
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

      const redisClient = require('../config/redis').default;
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

export async function resetTeacherPassword(teacherId: string) {
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  const user = await User.findById(teacher.userId);
  if (!user) throw new ServiceError(404, 'Linked user credentials not found.');

  const tempPassword = crypto.randomBytes(4).toString('hex');
  user.password = tempPassword;
  user.mustChangePassword = true;
  await user.save();

  const redisClient = require('../config/redis').default;
  if (redisClient && redisClient.status === 'ready') {
    await redisClient.del(`user:profile:${user._id}`).catch(() => {});
  }

  try {
    const { normalizePhone, sendWhatsAppTemplate } = require('./whatsapp.service');
    const phoneResult = normalizePhone(teacher.phone || user.phone || '');
    if (phoneResult.ok && phoneResult.e164) {
      const resetText = `Your SchoolHub password has been reset. Your credentials are: Username: ${user.email} | Password: ${tempPassword}`;
      await sendWhatsAppTemplate(phoneResult.e164, 'school_notification', 'en_US', [resetText]);
      console.log(`[WhatsApp Onboarding Reset Dispatch] Successfully sent reset credentials to: ${phoneResult.e164}`);
    } else {
      console.warn('[WhatsApp Onboarding Reset Warning]: Phone number normalization failed:', phoneResult.reason);
    }
  } catch (err: any) {
    console.error('[Teacher Password Reset Onboarding WhatsApp Error]:', err.message);
  }
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

  const { phone, email, cluster, address } = body;
  const allowedFields: Record<string, any> = {};
  if (phone !== undefined) allowedFields.phone = phone;
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
