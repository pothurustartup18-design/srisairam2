import jwt from 'jsonwebtoken';
import { Student } from '../models/student.model';
import { Teacher } from '../models/teacher.model';
import { JWT_SECRET } from '../config/secrets';

const SECRET_KEY = JWT_SECRET;

export interface ReceiptTokenPayload {
  receiptNo: string;
  studentId: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  paymentTime: string; // HH:MM:SS
  issuedAt: number;
}

// ─── Receipt Token Service ───────────────────────────────────────────────────
export class ReceiptTokenService {
  /**
   * Signs receipt payload securely using server secret
   */
  static generateToken(payload: Omit<ReceiptTokenPayload, 'issuedAt'>): string {
    const fullPayload: ReceiptTokenPayload = {
      ...payload,
      issuedAt: Date.now(),
    };
    return jwt.sign(fullPayload, SECRET_KEY);
  }

  /**
   * Cryptographically verifies token signature and returns decoded payload
   */
  static verifyToken(token: string): ReceiptTokenPayload | null {
    try {
      const decoded = jwt.verify(token, SECRET_KEY) as ReceiptTokenPayload;
      if (decoded && decoded.receiptNo && decoded.studentId && decoded.amount !== undefined) {
        return decoded;
      }
      return null;
    } catch (err) {
      return null;
    }
  }
}

// ─── Receipt Verification Service ─────────────────────────────────────────────
export class ReceiptVerificationService {
  /**
   * Main verification entrypoint to compare payload parameters directly against database values
   */
  static async verifyReceipt(token: string) {
    // 1. First try JWT decode (for QR code / old format)
    const payload = ReceiptTokenService.verifyToken(token);
    
    let receiptNo: string;
    let studentId: string | null = null;
    let amount: number | null = null;
    let paymentDate: string | null = null;
    let paymentTime: string | null = null;

    if (payload) {
      // Full JWT — extract all payload fields
      receiptNo = payload.receiptNo;
      studentId = payload.studentId;
      amount = payload.amount;
      paymentDate = payload.paymentDate;
      paymentTime = payload.paymentTime;
    } else if (token.startsWith('FEE-') || /^[A-Z]+-\d{4}-\d+$/.test(token)) {
      // Short receipt code passed directly (from WhatsApp link)
      receiptNo = token;
    } else {
      return {
        status: 'INVALID',
        reason: 'Receipt has been modified or signature is invalid.',
      };
    }

    // 2. Fetch record from database
    let studentRecord: any = null;
    let paymentRecord: any = null;

    if (!studentId) {
      // Short code: scan all students for matching receipt
      const studentWithReceipt = await Student.findOne({ 'payments.receiptNo': receiptNo });
      if (studentWithReceipt) {
        studentRecord = studentWithReceipt;
        paymentRecord = studentWithReceipt.payments.find((p: any) => p.receiptNo === receiptNo);
      }
    } else {
      const student = await Student.findById(studentId);
      if (student) {
        studentRecord = student;
        paymentRecord = student.payments.find((p: any) => p.receiptNo === receiptNo);
      }
    }

    if (!studentRecord) {
      return {
        status: 'INVALID',
        reason: 'Receipt not found. Student record does not exist in ERP.',
      };
    }

    if (!paymentRecord) {
      return {
        status: 'INVALID',
        reason: 'Receipt cancelled or not found in payment history logs.',
      };
    }

    // 3. Only verify amount/date if full JWT payload was provided (not short code)
    if (amount !== null && paymentRecord.amount !== amount) {
      return {
        status: 'INVALID',
        reason: 'Receipt information does not match database records.',
      };
    }

    if (paymentDate !== null) {
      const dbDateStr = new Date(paymentRecord.date).toISOString().split('T')[0];
      if (dbDateStr !== paymentDate) {
        return {
          status: 'INVALID',
          reason: 'Receipt information does not match database records.',
        };
      }
    }

    // Successful match — fetch teacher name
    let teacherName = 'N/A';
    const teacher = await Teacher.findById(studentRecord.classTeacher);
    teacherName = teacher ? teacher.name : 'N/A';

    const resolvedPaymentDate = paymentDate || new Date(paymentRecord.date).toISOString().split('T')[0];
    const resolvedPaymentTime = paymentTime || new Date(paymentRecord.date).toTimeString().split(' ')[0];

    return {
      status: 'VERIFIED',
      receipt: {
        receiptNo,
        studentId: studentRecord._id || studentId,
        studentName: `${studentRecord.firstName} ${studentRecord.lastName}`,
        class: studentRecord.class,
        section: studentRecord.section,
        classTeacherName: teacherName,
        amountPaid: paymentRecord.amount,
        paymentDate: resolvedPaymentDate,
        paymentTime: resolvedPaymentTime,
        paymentMode: paymentRecord.paymentMode || 'cash',
        whatsappNo: studentRecord.whatsappNo,
        verifiedAt: new Date().toISOString()
      }
    };
  }
}
