import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Exam } from '../models/exam.model';
import { Teacher } from '../models/teacher.model';
import { SchoolProfile } from '../models/schoolProfile.model';
import { Attendance } from '../models/attendance.model';
import { getS3Client, extractS3Key } from './s3.service';
import { getGradeBands, gradeFor } from './grading.service';
import { ReportCardTokenService } from './reportCardToken.service';

// ─── Image inlining ───────────────────────────────────────────────────────────
// Every image on a report card (logo, signatures, student photo) is resolved
// to a base64 data URI HERE, server-side, before the response ever reaches
// the browser. This is the fix for the original bug report: loading these
// images directly from S3 in the browser hit CORS + "multiple auth
// mechanisms" failures that silently dropped signatures from the generated
// PDF. A data URI needs no network fetch on the client at all.
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function fetchS3ObjectAsDataUri(s3Key: string): Promise<string | null> {
  try {
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Key })
    );
    const buffer = await streamToBuffer(response.Body);
    const contentType = response.ContentType || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn('[ReportCardService] Failed to fetch S3 object for', s3Key, err);
    return null;
  }
}

// Resolves ANY stored image reference (data URI, S3 key/URL — including a
// stale presigned URL whose query-string signature already expired, since we
// re-fetch the object directly via the S3 SDK instead of trusting the URL's
// own signature — or an arbitrary external URL) to a data URI.
async function resolveImageToDataUri(urlOrKey: string | null | undefined): Promise<string | null> {
  if (!urlOrKey) return null;
  if (urlOrKey.startsWith('data:')) return urlOrKey;

  // If it's a raw S3 key (doesn't start with HTTP/HTTPS protocol)
  if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
    return fetchS3ObjectAsDataUri(urlOrKey);
  }

  const s3Key = extractS3Key(urlOrKey);
  if (s3Key) {
    return fetchS3ObjectAsDataUri(s3Key);
  }

  try {
    const res = await fetch(urlOrKey);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer: Buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn('[ReportCardService] Failed to fetch external image', urlOrKey, err);
    return null;
  }
}

// ─── Attendance ───────────────────────────────────────────────────────────────
// Same working-days/present-days computation as GET /attendance/summary/student/:id,
// but returns an explicit no-data status instead of defaulting percentage to 0.
export interface AttendanceSummary {
  status: 'ok' | 'no-data';
  workingDays: number;
  presentDays: number;
  percentage: number | null;
}

async function computeAttendanceSummary(studentId: string): Promise<AttendanceSummary> {
  let workingDays = 0;
  let presentDays = 0;

  const records = await Attendance.find({ 'records.student': studentId });
  workingDays = records.length;
  records.forEach((reg) => {
    const rec = reg.records.find((r: any) => String(r.student) === studentId);
    if (rec) {
      if (rec.morningStatus || rec.afternoonStatus) {
        let dayPres = 0;
        if (rec.morningStatus === 'present') dayPres += 0.5;
        if (rec.afternoonStatus === 'present') dayPres += 0.5;
        presentDays += dayPres;
      } else if (rec.status === 'present') {
        presentDays += 1;
      }
    }
  });

  if (workingDays === 0) {
    return { status: 'no-data', workingDays: 0, presentDays: 0, percentage: null };
  }
  return {
    status: 'ok',
    workingDays,
    presentDays,
    percentage: Number(((presentDays / workingDays) * 100).toFixed(2)),
  };
}

// ─── Promotion (heuristic — no dedicated Promotion module exists in the DB) ──
// Derived purely from the pass/fail grade band and a best-effort parse of the
// next class name. Never presented as ERP-sourced fact — see StudentReportEntry.
function getNextClassName(currentClass: string): string | null {
  const match = currentClass.match(/\d+/);
  if (!match) return null;
  return `Grade ${parseInt(match[0], 10) + 1}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportCardSubjectRow {
  subject: string;
  totalMarks: number;
  obtainedMarks: number | null;
  percentage: number | null;
  grade: string;
  gradePoint: string;
  remarks: string;
}

export interface OtherExamPerformance {
  examName: string;
  overallPercentage: number;
  overallGrade: string;
  result: 'PASS' | 'FAIL' | 'ABSENT';
}

export interface StudentReportEntry {
  studentId: string;
  admissionNo: string;
  name: string;
  rollNumber: number | null;
  class: string;
  section: string;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  house: string | null;
  fatherName: string | null;
  motherName: string | null;
  address: string | null;
  mobileNumber: string | null;
  photoDataUri: string | null;
  marks: ReportCardSubjectRow[];
  totalObtained: number;
  totalPossible: number;
  overallPercentage: number;
  overallGrade: string;
  gpa: string;
  result: 'PASS' | 'FAIL' | 'ABSENT';
  rank: string;
  attendance: AttendanceSummary;
  teacherRemarks: string;
  promotion: { status: 'promoted' | 'retained' | 'unknown'; nextClass: string | null };
  documentId: string;
  verificationUrl: string;
  otherExams?: OtherExamPerformance[];
}

export interface ReportCardViewModel {
  school: {
    name: string;
    code: string;
    logoDataUri: string | null;
    phone: string;
    email: string;
    website: string;
    addressLine: string;
    academicYear: string;
    principal: { name: string; signatureDataUri: string | null };
  };
  exam: {
    id: string;
    examName: string;
    examType?: 'final' | 'middle' | 'regular';
    class: string;
    subjects: { name: string; totalMarks: number }[];
    gradeBands: { min: number; grade: string; gradePoint: string; remarks: string }[];
  };
  classTeacher: { name: string; signatureDataUri: string | null };
  generatedAt: string;
  students: StudentReportEntry[];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function buildReportCardViewModel(
  examId: string,
  studentId?: string
): Promise<ReportCardViewModel | null> {
  const bands = await getGradeBands();

  let examDoc: any;
  let allStudents: any[];
  let classTeacherDoc: any;
  let schoolProfileDoc: any;

  examDoc = await Exam.findById(examId)
    .populate('studentMarks.student')
    .populate('classTeacher')
    .lean();
  if (!examDoc) return null;
  allStudents = (examDoc.studentMarks || [])
    .map((sm: any) => sm.student)
    .filter(Boolean);
  classTeacherDoc = examDoc.classTeacher || (await Teacher.findById(examDoc.classTeacher).lean());
  schoolProfileDoc = await SchoolProfile.findOne().lean();

  const appHost = process.env.APP_HOST || 'localhost:5173';

  // Resolve shared (non-per-student) images once
  let logoKey = schoolProfileDoc?.schoolInfo?.logo || null;
  let principalSigKey = schoolProfileDoc?.principalInfo?.signatureUrl || null;
  let teacherSigKey = classTeacherDoc?.signatureUrl || null;

  const { getOrCreateOptimizedVersion } = require('./assetOptimization.service');
  if (logoKey && schoolProfileDoc) {
    logoKey = await getOrCreateOptimizedVersion('schoolProfile', schoolProfileDoc._id.toString(), undefined, logoKey, 'logo');
  }
  if (principalSigKey && schoolProfileDoc) {
    principalSigKey = await getOrCreateOptimizedVersion('schoolProfile', schoolProfileDoc._id.toString(), undefined, principalSigKey, 'signature');
  }
  if (teacherSigKey && classTeacherDoc) {
    teacherSigKey = await getOrCreateOptimizedVersion('teacher', classTeacherDoc._id.toString(), undefined, teacherSigKey, 'signature');
  }

  const [logoDataUri, principalSignatureDataUri, teacherSignatureDataUri] = await Promise.all([
    resolveImageToDataUri(logoKey),
    resolveImageToDataUri(principalSigKey),
    resolveImageToDataUri(teacherSigKey),
  ]);

  // Ranks are computed across the FULL class roster regardless of which
  // student(s) are being requested, so a single-student report still shows
  // the student's real rank within the class.
  const totalPossible = examDoc.subjects.reduce((acc: number, s: any) => acc + s.totalMarks, 0);
  const totals = examDoc.studentMarks.map((sm: any) => ({
    studentId: String(sm.student?._id || sm.student),
    total: sm.marks.reduce((acc: number, m: any) => acc + m.obtainedMarks, 0),
  }));
  const sortedTotals = [...totals].sort((a, b) => b.total - a.total);
  const rankMap = new Map<string, string>();
  let rank = 0;
  let prevTotal: number | null = null;
  sortedTotals.forEach((row, i) => {
    if (row.total !== prevTotal) {
      rank = i + 1;
      prevTotal = row.total;
    }
    const ord = ['th', 'st', 'nd', 'rd'];
    const v = rank % 100;
    const suffix = ord[(v - 20) % 10] || ord[v] || ord[0];
    rankMap.set(row.studentId, `${rank}${suffix}`);
  });

  const targetStudents = studentId
    ? allStudents.filter((s: any) => String(s._id) === String(studentId))
    : allStudents;

  const studentEntries: StudentReportEntry[] = await Promise.all(
    targetStudents.map(async (student: any): Promise<StudentReportEntry> => {
      const sId = String(student._id);
      const smRecord = examDoc.studentMarks.find(
        (sm: any) => String(sm.student?._id || sm.student) === sId
      );

      const marks: ReportCardSubjectRow[] = examDoc.subjects.map((sub: any) => {
        const match = smRecord?.marks.find((m: any) => m.subject === sub.name);
        if (match === undefined) {
          return {
            subject: sub.name,
            totalMarks: sub.totalMarks,
            obtainedMarks: null,
            percentage: null,
            grade: 'F',
            gradePoint: '0.0',
            remarks: 'Absent',
          };
        }
        const pct = sub.totalMarks > 0 ? (match.obtainedMarks / sub.totalMarks) * 100 : 0;
        const band = gradeFor(pct, bands);
        return {
          subject: sub.name,
          totalMarks: sub.totalMarks,
          obtainedMarks: match.obtainedMarks,
          percentage: Math.round(pct * 10) / 10,
          grade: band.grade,
          gradePoint: band.gradePoint,
          remarks: band.remarks,
        };
      });

      const hasAnyMarks = marks.some((m) => m.obtainedMarks !== null);
      const totalObtained = marks.reduce((acc, m) => acc + (m.obtainedMarks || 0), 0);
      const overallPercentage = totalPossible > 0 ? (totalObtained / totalPossible) * 100 : 0;
      const overallBand = gradeFor(overallPercentage, bands);
      const lowestBand = [...bands].sort((a, b) => a.min - b.min)[0];
      const passed = hasAnyMarks && overallBand.grade !== lowestBand.grade;
      const result: 'PASS' | 'FAIL' | 'ABSENT' = !hasAnyMarks ? 'ABSENT' : passed ? 'PASS' : 'FAIL';

      const studentClass = student.class || examDoc.class || '';
      const photoDoc = (student.documents || []).find((d: any) => d.docType === 'Photo');
      let photoKey = photoDoc ? photoDoc.s3Key : null;

      if (photoKey && true) {
        const { getOrCreateOptimizedVersion } = require('./assetOptimization.service');
        photoKey = await getOrCreateOptimizedVersion(
          'student',
          sId,
          photoDoc._id.toString(),
          photoKey,
          'photo'
        );
      }

      const photoDataUri = photoKey ? await resolveImageToDataUri(photoKey) : null;

      const attendance = await computeAttendanceSummary(sId);

      const token = ReportCardTokenService.generateToken({ examId, studentId: sId });
      const verificationUrl = `http://${appHost}/?report_verify_token=${token}`;

      const admissionDigits = (student.admissionNo || '').replace(/\D/g, '').slice(-4) || '0000';
      const documentId = `REP-${(schoolProfileDoc?.academicConfig?.currentAcademicYear || '').split('-')[0] || new Date().getFullYear()}-${studentClass.replace(/\s+/g, '')}-${admissionDigits}`;

      // If the current exam is a final exam, retrieve other exams' percentages for this student
      let otherExamsPerformance: OtherExamPerformance[] = [];

      const isFinalExam = examDoc.examType === 'final' || examDoc.examName.toLowerCase().includes('final');
      if (isFinalExam) {
        let classExams: any[] = [];
        classExams = await Exam.find({ class: examDoc.class }).lean();

        for (const ex of classExams) {
          if (String(ex._id) === String(examDoc._id)) continue;

          const studentRecord = ex.studentMarks.find(
            (sm: any) => String(sm.student?._id || sm.student) === sId
          );

          if (studentRecord) {
            const exTotalPossible = ex.subjects.reduce((sum: number, s: any) => sum + s.totalMarks, 0);
            const exTotalObtained = studentRecord.marks.reduce((sum: number, m: any) => sum + m.obtainedMarks, 0);
            const exPct = exTotalPossible > 0 ? (exTotalObtained / exTotalPossible) * 100 : 0;
            const exBand = gradeFor(exPct, bands);
            const exHasMarks = studentRecord.marks.length > 0;
            const exPassed = exHasMarks && exBand.grade !== lowestBand.grade;
            const exResult: 'PASS' | 'FAIL' | 'ABSENT' = !exHasMarks ? 'ABSENT' : exPassed ? 'PASS' : 'FAIL';

            otherExamsPerformance.push({
              examName: ex.examName,
              overallPercentage: Math.round(exPct * 10) / 10,
              overallGrade: exHasMarks ? exBand.grade : 'N/A',
              result: exResult,
            });
          }
        }
      }

      return {
        studentId: sId,
        admissionNo: student.admissionNo,
        name: `${student.firstName} ${student.lastName}`.trim(),
        rollNumber: student.rollNumber ?? null,
        class: studentClass,
        section: student.section || '',
        dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString() : null,
        gender: student.gender || null,
        bloodGroup: student.bloodGroup || null,
        house: student.house || null,
        fatherName: student.fatherName || null,
        motherName: student.motherName || null,
        address: student.address || null,
        mobileNumber: student.whatsappNo || student.motherWhatsappNo || null,
        photoDataUri,
        marks,
        totalObtained,
        totalPossible,
        overallPercentage: Math.round(overallPercentage * 10) / 10,
        overallGrade: hasAnyMarks ? overallBand.grade : 'N/A',
        gpa: hasAnyMarks ? overallBand.gradePoint : '0.0',
        result,
        rank: rankMap.get(sId) || 'N/A',
        attendance,
        teacherRemarks: smRecord?.remarks || 'No remarks available.',
        promotion: {
          status: !hasAnyMarks ? 'unknown' : passed ? 'promoted' : 'retained',
          nextClass: passed ? getNextClassName(studentClass) : null,
        },
        documentId,
        verificationUrl,
        otherExams: otherExamsPerformance,
      };
    })
  );

  return {
    school: {
      name: schoolProfileDoc?.schoolInfo?.schoolName || 'RND School',
      code: schoolProfileDoc?.schoolInfo?.schoolCode || 'CBSE/AFF/123456',
      logoDataUri,
      phone: schoolProfileDoc?.contactInfo?.phone || '',
      email: schoolProfileDoc?.contactInfo?.email || '',
      website: schoolProfileDoc?.contactInfo?.website || '',
      addressLine: [
        schoolProfileDoc?.address?.addressLine,
        schoolProfileDoc?.address?.city,
        schoolProfileDoc?.address?.state,
        schoolProfileDoc?.address?.pincode,
      ]
        .filter(Boolean)
        .join(', '),
      academicYear: schoolProfileDoc?.academicConfig?.currentAcademicYear || '2025-2026',
      principal: {
        name: schoolProfileDoc?.principalInfo?.name || 'Principal',
        signatureDataUri: principalSignatureDataUri,
      },
    },
    exam: {
      id: examId,
      examName: examDoc.examName,
      examType: (examDoc.examType === 'final' || examDoc.examName.toLowerCase().includes('final')) ? 'final' : (examDoc.examType || 'regular'),
      class: examDoc.class,
      subjects: examDoc.subjects.map((s: any) => ({ name: s.name, totalMarks: s.totalMarks })),
      gradeBands: bands,
    },
    classTeacher: {
      name: classTeacherDoc?.name || 'Class Teacher',
      signatureDataUri: teacherSignatureDataUri,
    },
    generatedAt: new Date().toISOString(),
    students: studentEntries,
  };
}
