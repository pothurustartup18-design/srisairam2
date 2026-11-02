import { Student, IStudent } from '../models/student.model';
import { Teacher } from '../models/teacher.model';
import { User } from '../models/user.model';
import { FeeStructure } from '../models/feeStructure.model';
import { SchoolProfile } from '../models/schoolProfile.model';
import { getNextAdmissionNumber, previewNextAdmissionNumber } from '../utils/sequence';
import { isValidPhone } from '../utils/validators';
import { ServiceError } from '../utils/responseHelpers';
import { getPresignedDownloadUrl } from './s3.service';
import { buildDocumentKey, uploadBase64Document, deleteDocumentFromS3, presignDocumentList } from './document.service';
import { clearCache } from '../middlewares/cache.middleware';

const LOG_LABEL = 'Student Documents';

async function findFeeStructure(className: string): Promise<any | null> {
  return FeeStructure.findOne({ class: className }).lean();
}

export async function previewNextAdmissionNo(academicYearQuery?: string): Promise<string> {
  let academicYear = academicYearQuery;
  if (!academicYear) {
    const profile = await SchoolProfile.findOne();
    academicYear = profile?.academicConfig?.currentAcademicYear || '2026-27';
  }
  const startYear = parseInt(academicYear.split('-')[0], 10);
  if (isNaN(startYear)) {
    throw new ServiceError(400, 'Invalid academic year format. Expected e.g. 2026-27');
  }
  return previewNextAdmissionNumber(startYear);
}

export async function createStudent(body: any) {
  const {
    admissionNo, admissionAcademicYear, firstName, lastName, class: className, section,
    classTeacherId, feePaid, feePending, whatsappNo, motherWhatsappNo, rollNumber, status,
    totalFee, transportMode, booksFee, preferredLanguage, cluster, dateOfBirth, gender,
    bloodGroup, house, fatherName, motherName, address,
  } = body;

  const resolvedAdmissionYear = admissionAcademicYear || '2026-27';
  const startYear = parseInt(resolvedAdmissionYear.split('-')[0], 10);

  let finalAdmissionNo = admissionNo;
  const expectedPreviewNo = await previewNextAdmissionNumber(startYear);
  if (!finalAdmissionNo || finalAdmissionNo === 'auto' || finalAdmissionNo === expectedPreviewNo) {
    finalAdmissionNo = await getNextAdmissionNumber(startYear);
  }

  if (!firstName || !className || !section || !whatsappNo) {
    const missing = [];
    if (!firstName || !firstName.trim()) missing.push('First Name');
    if (!className) missing.push('Class');
    if (!section) missing.push('Section');
    if (!whatsappNo) missing.push('Primary WhatsApp');
    throw new ServiceError(400, `Required fields missing: ${missing.join(', ')}`);
  }

  if (!isValidPhone(whatsappNo)) {
    throw new ServiceError(400, 'Primary WhatsApp number must be exactly 10 digits (no spaces, no country code).');
  }
  if (motherWhatsappNo && motherWhatsappNo.trim() !== '' && !isValidPhone(motherWhatsappNo)) {
    throw new ServiceError(400, 'Mother WhatsApp number must be exactly 10 digits (no spaces, no country code).');
  }

  const feeStructure = totalFee === undefined ? await findFeeStructure(className) : null;
  const resolvedTotalFee = totalFee !== undefined ? totalFee : (feeStructure?.totalFee || 0);
  const resolvedBooksFee = booksFee !== undefined ? booksFee : (feeStructure?.booksFee || 0);
  const resolvedInstallments = (feeStructure?.installments || []).map((i: any) => ({
    installmentNo: i.installmentNo,
    amount: i.amount,
    dueDate: i.dueDate,
    status: 'unpaid',
  }));
  const resolvedFeePaid = feePaid || 0;
  const resolvedFeePending = feePending !== undefined ? feePending : (resolvedTotalFee - resolvedFeePaid);

  let resolvedClassTeacher = null;
  if (classTeacherId && String(classTeacherId).trim() !== '') {
    const teacher = await Teacher.findById(classTeacherId);
    if (!teacher) {
      throw new ServiceError(404, 'Selected class teacher not found.');
    }
    resolvedClassTeacher = teacher._id;
  } else {
    const target = `${className}-${section}`;
    const autoTeacher = await Teacher.findOne({
      $or: [
        { classTeacherOf: target },
        { classTeacherOf: className },
        { assignedClass: target }
      ]
    });
    if (autoTeacher) {
      resolvedClassTeacher = autoTeacher._id;
    }
  }

  const existingStudent = await Student.findOne({ admissionNo: finalAdmissionNo });
  if (existingStudent) {
    throw new ServiceError(400, `Student with admission number ${finalAdmissionNo} already exists.`);
  }

  const student = new Student({
    admissionNo: finalAdmissionNo,
    admissionAcademicYear: resolvedAdmissionYear,
    firstName: firstName.trim(),
    lastName: lastName?.trim() || '',
    class: className,
    section,
    classTeacher: resolvedClassTeacher,
    rollNumber,
    status: status || 'active',
    feePaid: resolvedFeePaid,
    feePending: resolvedFeePending,
    totalFee: resolvedTotalFee,
    whatsappNo,
    motherWhatsappNo,
    transportMode: transportMode || 'school',
    booksFee: resolvedBooksFee,
    preferredLanguage: preferredLanguage || 'en',
    installments: resolvedInstallments,
    cluster: cluster || '',
    dateOfBirth: dateOfBirth || undefined,
    gender: gender || undefined,
    bloodGroup: bloodGroup || '',
    house: house || '',
    fatherName: fatherName || '',
    motherName: motherName || '',
    address: address || '',
  });

  await student.save();
  await clearCache('/api/dashboard/*');

  return Student.findById(student._id).populate('classTeacher', 'name assignedClass');
}

export async function listStudents() {
  return Student.find({}).populate('classTeacher', 'name assignedClass').lean();
}

export async function updateStudent(studentId: string, body: any) {
  const {
    admissionAcademicYear, firstName, lastName, class: className, section, classTeacherId,
    feePaid, feePending, whatsappNo, motherWhatsappNo, rollNumber, status, totalFee,
    transportMode, booksFee, preferredLanguage, cluster, dateOfBirth, gender, bloodGroup,
    house, fatherName, motherName, address,
  } = body;

  if (whatsappNo && !isValidPhone(whatsappNo)) {
    throw new ServiceError(400, 'Primary WhatsApp number must be exactly 10 digits (no spaces, no country code).');
  }
  if (motherWhatsappNo && motherWhatsappNo.trim() !== '' && !isValidPhone(motherWhatsappNo)) {
    throw new ServiceError(400, 'Mother WhatsApp number must be exactly 10 digits (no spaces, no country code).');
  }

  const student = await Student.findById(studentId);
  if (!student) {
    throw new ServiceError(404, 'Student not found.');
  }

  if (admissionAcademicYear) {
    student.admissionAcademicYear = admissionAcademicYear;
  } else if (!student.admissionAcademicYear) {
    student.admissionAcademicYear = '2026-27';
  }

  if (firstName) student.firstName = firstName;
  if (lastName) student.lastName = lastName;
  if (className) student.class = className;
  if (section) student.section = section;
  if (classTeacherId !== undefined) student.classTeacher = (classTeacherId && String(classTeacherId).trim() !== '') ? classTeacherId : null;
  if (rollNumber) student.rollNumber = rollNumber;
  if (status) student.status = status;
  if (feePaid !== undefined) student.feePaid = feePaid;
  if (feePending !== undefined) student.feePending = feePending;
  if (totalFee !== undefined) student.totalFee = totalFee;
  if (whatsappNo) student.whatsappNo = whatsappNo;
  if (motherWhatsappNo !== undefined) {
    student.motherWhatsappNo = motherWhatsappNo.trim() === '' ? undefined : motherWhatsappNo;
  }
  if (transportMode) student.transportMode = transportMode;
  if (booksFee !== undefined) student.booksFee = booksFee;
  if (preferredLanguage) {
    student.preferredLanguage = preferredLanguage === '' ? 'en' : (preferredLanguage as any);
  }
  if (cluster !== undefined) student.cluster = cluster;
  if (dateOfBirth !== undefined) {
    student.dateOfBirth = dateOfBirth === '' ? null : (dateOfBirth as any);
  }
  if (gender !== undefined) {
    student.gender = gender === '' ? null : (gender as any);
  }
  if (bloodGroup !== undefined) student.bloodGroup = bloodGroup;
  if (house !== undefined) student.house = house;
  if (fatherName !== undefined) student.fatherName = fatherName;
  if (motherName !== undefined) student.motherName = motherName;
  if (address !== undefined) student.address = address;

  await student.save();
  await clearCache('/api/dashboard/*');

  return Student.findById(student._id).populate('classTeacher', 'name assignedClass');
}

export async function deleteStudent(studentId: string, password: string | undefined, requestUserId: string) {
  if (!password) {
    throw new ServiceError(400, 'Password is required to delete.');
  }

  let isPasswordCorrect = false;
  const adminUser = await User.findById(requestUserId).select('+password');
  if (adminUser) {
    isPasswordCorrect = await adminUser.comparePassword(password);
  }
  if (!isPasswordCorrect) {
    throw new ServiceError(403, 'Invalid admin password. Deletion unauthorized.');
  }

  const student = await Student.findByIdAndDelete(studentId);
  if (!student) {
    throw new ServiceError(404, 'Student not found.');
  }
  await clearCache('/api/dashboard/*');
}

// '2026-27' -> '2027-28'. Falls back to the unchanged value if it isn't in that shape.
function nextAcademicYear(current: string): string {
  const match = (current || '').match(/^(\d{4})-(\d{2,4})$/);
  if (!match) return current;
  const startYear = parseInt(match[1], 10) + 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

// Bulk-promotes the given students to an admin-chosen destination class+section,
// rolling their academic year forward and reassigning them to whichever teacher is
// class-teacher of that destination. Deliberately preserves everything else —
// admission number, fee history, documents, contact details — so re-enrolling a
// returning student each year never means re-entering their record from scratch.
// The destination is the same for the whole batch, which is why this is meant to be
// used on a single class+section roster at a time (the frontend enforces that).
export async function promoteStudents(studentIds: string[], toClass: string, toSection: string, _adminUserId?: string) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ServiceError(400, 'studentIds must be a non-empty array.');
  }
  if (!toClass || !toSection) {
    throw new ServiceError(400, 'toClass and toSection are required.');
  }

  const students = await Student.find({ _id: { $in: studentIds } });
  const newClassTeacher = await Teacher.findOne({ classTeacherOf: `${toClass}-${toSection}` });

  const promoted: Array<{ id: string; name: string; fromClass: string; fromSection: string; toClass: string; toSection: string; teacherReassigned: boolean }> = [];

  for (const student of students) {
    const name = `${student.firstName} ${student.lastName || ''}`.trim();
    const fromClass = student.class;
    const fromSection = student.section;

    student.class = toClass;
    student.section = toSection;
    student.admissionAcademicYear = nextAcademicYear(student.admissionAcademicYear);
    student.rollNumber = undefined;
    if (newClassTeacher) {
      student.classTeacher = newClassTeacher._id as any;
    }
    await student.save();

    promoted.push({
      id: String(student._id), name, fromClass, fromSection, toClass, toSection,
      teacherReassigned: !!newClassTeacher
    });
  }

  await clearCache('/api/dashboard/*');
  return { promoted, skipped: [] as Array<{ id: string; name: string; reason: string }> };
}

export async function addStudentDocument(studentId: string, docType: string, filename: string, base64: string) {
  if (!docType || !filename || !base64) {
    throw new ServiceError(400, 'docType, filename, and base64 are required.');
  }

  const student = await Student.findById(studentId);
  if (!student) throw new ServiceError(404, 'Student not found.');

  const year = new Date().getFullYear();
  const s3Key = buildDocumentKey(`students/${year}/${student.class}/${student.section}/students_info/${student.admissionNo}`, filename);
  await uploadBase64Document(base64, s3Key);

  student.documents.push({ docType, filename, s3Key, uploadedAt: new Date() } as any);
  await student.save();

  const savedDoc = student.documents[student.documents.length - 1];

  if (docType === 'Photo') {
    const { queueAssetOptimization } = require('../config/queue');
    await queueAssetOptimization({
      assetType: 'photo',
      s3Key,
      modelType: 'student',
      modelId: student._id.toString(),
      docId: savedDoc._id!.toString(),
    });
  }

  const downloadUrl = await getPresignedDownloadUrl(s3Key);
  return { _id: savedDoc._id, docType, filename, s3Key, uploadedAt: savedDoc.uploadedAt, downloadUrl };
}

export async function listStudentDocuments(studentId: string) {
  const student = await Student.findById(studentId);
  if (!student) throw new ServiceError(404, 'Student not found.');

  return presignDocumentList(
    student.documents.map((doc: any) => ({ _id: doc._id, docType: doc.docType, filename: doc.filename, uploadedAt: doc.uploadedAt, s3Key: doc.s3Key })),
    LOG_LABEL
  );
}

export async function deleteStudentDocument(studentId: string, docId: string) {
  const student = await Student.findById(studentId);
  if (!student) throw new ServiceError(404, 'Student not found.');

  const doc: any = student.documents.find((d: any) => d._id.toString() === docId);
  if (!doc) throw new ServiceError(404, 'Document not found.');

  await deleteDocumentFromS3(doc.s3Key, LOG_LABEL);

  student.documents = student.documents.filter((d: any) => d._id.toString() !== docId) as any;
  await student.save();
}

export async function listStudentReceipts(studentId: string) {
  const student = await Student.findById(studentId);
  if (!student) throw new ServiceError(404, 'Student not found.');

  const studentClass = student.class || 'unknown';
  const studentSection = student.section || 'unknown';
  const studentFolder = student.admissionNo || studentId;

  return Promise.all((student.payments || []).map(async (payment: any) => {
    const paymentYear = new Date(payment.date).getFullYear();
    const s3Key = `students/${paymentYear}/${studentClass}/${studentSection}/fees/${studentFolder}/receipt_${payment.receiptNo}.pdf`;
    let downloadUrl = '';
    try {
      downloadUrl = await getPresignedDownloadUrl(s3Key);
    } catch (err) {
      console.error('[Receipts List] Failed to presign receipt:', s3Key, err);
    }
    return { receiptNo: payment.receiptNo, amount: payment.amount, date: payment.date, paymentMode: payment.paymentMode, downloadUrl };
  }));
}

export async function getStudentReceiptDownloadUrl(studentId: string, receiptNo: string) {
  const student = await Student.findById(studentId);
  if (!student) throw new ServiceError(404, 'Student not found.');

  const payment = student.payments.find((p: any) => p.receiptNo === receiptNo);
  if (!payment) throw new ServiceError(404, 'Payment record not found.');

  const studentClass = student.class || 'unknown';
  const studentSection = student.section || 'unknown';
  const studentFolder = student.admissionNo || studentId;
  const paymentYear = new Date(payment.date).getFullYear();
  const s3Key = `students/${paymentYear}/${studentClass}/${studentSection}/fees/${studentFolder}/receipt_${receiptNo}.pdf`;

  try {
    return await getPresignedDownloadUrl(s3Key);
  } catch (err) {
    console.error('[Receipt Download] Failed to presign:', s3Key, err);
    throw new ServiceError(500, 'Failed to generate download link.');
  }
}
