// ─── Domain Models ─────────────────────────────────────────────────────────

export interface ClassData {
  _id: string;
  className: string;
  section: string;
}

export interface StudentData {
  _id?: string;
  id: string;
  admissionNo: string;
  admissionAcademicYear?: string;
  firstName?: string;
  lastName?: string;
  name: string;
  class: string;
  section: string;
  classTeacher: any;
  classTeacherPhone?: string;
  classTeacherEmail?: string;
  rollNumber?: number;
  status?: 'active' | 'inactive';
  whatsappNo: string;
  motherWhatsappNo?: string;
  totalFee?: number;
  feePaid: number;
  feePending: number;
  installments?: {
    installmentNo: number;
    amount: number;
    dueDate: string;
    status: 'paid' | 'unpaid' | 'overdue';
  }[];
  payments?: {
    receiptNo: string;
    amount: number;
    date: string;
    paymentMode: 'cash' | 'upi' | 'card' | 'bank_transfer';
  }[];
  transportMode?: 'school' | 'private';
  booksFee?: number;
  transportFee?: number;
  preferredLanguage?: 'en' | 'te' | 'hi';
  academicPercentage?: number;
  examPercentages?: Record<string, number>;
  cluster?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  bloodGroup?: string;
  house?: string;
  fatherName?: string;
  motherName?: string;
  address?: string;
}

export interface TeacherData {
  _id: string;
  employeeId?: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  dob: string;
  phone?: string;
  email?: string;
  address?: string;
  assignedClass: string;
  subjects: string[];
  teachingClasses: string[];
  classTeacherOf?: string | null;
  status?: 'active' | 'inactive';
  cluster?: string;
  salary?: number;
}

export interface EventData {
  _id: string;
  title: string;
  description: string;
  date: string;
  media: string[];
  type?: 'event' | 'notice';
  sendAlertsTo?: 'none' | 'parents' | 'teachers' | 'both';
}

// ─── Auth / User ────────────────────────────────────────────────────────────

export interface UserProfile {
  role: 'admin' | 'teacher' | 'parent' | 'other' | 'superadmin';
  name: string;
  username?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  teacherId?: string;
  assignedClass?: string;
  classTeacherOf?: string | null;
  studentId?: string;
  studentName?: string;
  admissionNo?: string;
  permissions?: string[];
  employeeId?: string;
  mustChangePassword?: boolean;
}

// ─── Leave ──────────────────────────────────────────────────────────────────

export interface LeaveMessage {
  sender: 'admin' | 'teacher';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface LeaveData {
  _id: string;
  teacher: string;
  teacherName: string;
  description: string;
  fromDate: string;
  toDate: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  messages?: LeaveMessage[];
}

// ─── Feedback ───────────────────────────────────────────────────────────────

export interface FeedbackMessage {
  sender: 'admin' | 'parent';
  text: string;
  createdAt: string;
}

export interface FeedbackData {
  _id: string;
  student: string;
  studentName: string;
  admissionNo: string;
  subject: string;
  messages: FeedbackMessage[];
  createdAt: string;
}

// ─── Marks / Exams ──────────────────────────────────────────────────────────

export interface ExamSubject {
  name: string;
  totalMarks: number;
}

export interface ExamStudentMarkRecord {
  subject: string;
  obtainedMarks: number;
}

export interface ExamStudentEntry {
  student: string | { _id: string };
  marks: ExamStudentMarkRecord[];
  remarks?: string;
  pdfUrl?: string;
}

export interface ExamEditChange {
  subject: string;
  from: number;
  to: number;
}

export interface ExamEditHistory {
  editedBy?: string;
  editedByName: string;
  editedAt: string;
  studentId: string;
  changes: ExamEditChange[];
}

export interface ExamData {
  _id: string;
  examName: string;
  examType?: 'final' | 'middle' | 'regular';
  classTeacher: string | { _id: string; name: string };
  class: string;
  subjects: ExamSubject[];
  studentMarks: ExamStudentEntry[];
  // Status lifecycle
  status?: 'draft' | 'submitted' | 'locked';
  // Audit trail
  lastEditedBy?: string;
  lastEditedByName?: string;
  lastEditedAt?: string;
  editHistory?: ExamEditHistory[];
}

export interface StudentExamResult {
  _id: string;
  examName: string;
  class: string;
  subjects: ExamSubject[];
  marks: ExamStudentMarkRecord[];
  totalObtained: number;
  totalPossible: number;
  percentage: number;
  pdfUrl?: string;
}

// ─── Report Card ViewModel ────────────────────────────────────────────────────
// Assembled entirely server-side by GET /api/report-card/:examId — every
// image below arrives already inlined as a base64 data URI, so the PDF
// generator never fetches S3 directly (that's what caused signatures to go
// missing before this rewrite).

export interface ReportCardSubjectRow {
  subject: string;
  totalMarks: number;
  obtainedMarks: number | null;
  percentage: number | null;
  grade: string;
  gradePoint: string;
  remarks: string;
}

export interface ReportCardAttendanceSummary {
  status: 'ok' | 'no-data';
  workingDays: number;
  presentDays: number;
  percentage: number | null;
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
  attendance: ReportCardAttendanceSummary;
  teacherRemarks: string;
  // Heuristic, not a dedicated Promotion-rules DB module — see reportCard.service.ts
  promotion: { status: 'promoted' | 'retained' | 'unknown'; nextClass: string | null };
  documentId: string;
  verificationUrl: string;
  /**
   * Prior exams in the same academic year, sent by the backend for 'final' exams
   * only (reportCard.service.ts `OtherExamPerformance`). Drives the cumulative page.
   */
  otherExams?: {
    examName: string;
    overallPercentage: number;
    overallGrade: string;
    result: 'PASS' | 'FAIL' | 'ABSENT';
  }[];
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
    subjects: ExamSubject[];
    gradeBands: { min: number; grade: string; gradePoint: string; remarks: string }[];
  };
  classTeacher: { name: string; signatureDataUri: string | null };
  generatedAt: string;
  students: StudentReportEntry[];
}

// ─── Attendance ──────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  student: string;
  status: 'present' | 'absent';
}

export interface AttendanceEntry {
  _id: string;
  date: string;
  classTeacher: string;
  class: string;
  records: AttendanceRecord[];
}

// ─── Homework ───────────────────────────────────────────────────────────────

export interface HomeworkAck {
  student: string;
  studentName: string;
  at: string;
}

export interface HomeworkData {
  _id: string;
  classRoom: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  attachments: string[];
  createdBy?: string;
  createdByName: string;
  acknowledgements: HomeworkAck[];
  createdAt?: string;
}

// ─── Fee Structures ───────────────────────────────────────────────────────────

export interface FeeInstallmentPlan {
  installmentNo: number;
  amount: number;
  dueDate: string;
}

export interface FeeStructureData {
  _id?: string;
  class: string;
  totalFee: number;
  booksFee: number;
  installments: FeeInstallmentPlan[];
}

// ─── Toast ───────────────────────────────────────────────────────────────────

export interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}
