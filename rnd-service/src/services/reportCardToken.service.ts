import jwt from 'jsonwebtoken';
import { Exam } from '../models/exam.model';
import { Student } from '../models/student.model';
import { Teacher } from '../models/teacher.model';
import { JWT_SECRET } from '../config/secrets';

// Same secret family as receipts (src/services/receipt.service.ts) — both are
// short-lived document-verification tokens signed by this server.
const SECRET_KEY = JWT_SECRET;

export interface ReportCardTokenPayload {
  examId: string;
  studentId: string;
  issuedAt: number;
}

// ─── Report Card Token Service ───────────────────────────────────────────────
export class ReportCardTokenService {
  static generateToken(payload: Omit<ReportCardTokenPayload, 'issuedAt'>): string {
    const fullPayload: ReportCardTokenPayload = {
      ...payload,
      issuedAt: Date.now(),
    };
    return jwt.sign(fullPayload, SECRET_KEY);
  }

  static verifyToken(token: string): ReportCardTokenPayload | null {
    try {
      const decoded = jwt.verify(token, SECRET_KEY) as ReportCardTokenPayload;
      if (decoded && decoded.examId && decoded.studentId) {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }
}

// ─── Report Card Verification Service ────────────────────────────────────────
// Mirrors ReceiptVerificationService: the token only carries IDs, every
// displayed fact is re-fetched from the live ERP database, never trusted
// from the token/QR itself.
export class ReportCardVerificationService {
  static async verifyReportCard(token: string) {
    const payload = ReportCardTokenService.verifyToken(token);
    if (!payload) {
      return { status: 'INVALID' as const, reason: 'Report card has been modified or signature is invalid.' };
    }

    const { examId, studentId } = payload;

    let exam: any;
    let student: any;
    let classTeacherName = 'N/A';

    exam = await Exam.findById(examId);
    student = await Student.findById(studentId);
    if (exam) {
      const teacher = await Teacher.findById(exam.classTeacher);
      classTeacherName = teacher ? teacher.name : 'N/A';
    }

    if (!exam || !student) {
      return { status: 'INVALID' as const, reason: 'Report card record not found in ERP database.' };
    }

    const smRecord = exam.studentMarks.find(
      (sm: any) => String(sm.student?._id || sm.student) === String(studentId)
    );
    if (!smRecord) {
      return { status: 'INVALID' as const, reason: 'Student marks not found for this exam.' };
    }

    const totalPossible = exam.subjects.reduce((acc: number, s: any) => acc + s.totalMarks, 0);
    const totalObtained = smRecord.marks.reduce((acc: number, m: any) => acc + m.obtainedMarks, 0);
    const percentage = totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100 * 10) / 10 : 0;

    return {
      status: 'VERIFIED' as const,
      reportCard: {
        examName: exam.examName,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        class: exam.class,
        section: student.section,
        classTeacherName,
        totalObtained,
        totalPossible,
        percentage,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}
