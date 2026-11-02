import { clearCache } from '../../middlewares/cache.middleware';
import { Router, Request, Response } from 'express';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Exam } from '../../models/exam.model';
import { Teacher } from '../../models/teacher.model';
import { Student } from '../../models/student.model';
import { SystemConfig } from '../../models/systemConfig.model';
import { requirePermission } from '../../middlewares/permission.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { PermissionDelegation } from '../../models/permissionDelegation.model';
import { audit } from '../../middlewares/audit.middleware';
import { getS3Client, getPresignedDownloadUrl, PRESIGN_EXPIRY_2_HOURS } from '../../services/s3.service';
import { getGradeBands, gradeFor } from '../../services/grading.service';
import { queueTemplateNotification } from '../../config/queue';

const router = Router();

// ─── Helper: resolve teacher profile for request user ────────────────────────
const resolveTeacher = async (userId: string) => {
  return Teacher.findOne({ userId });
};

const verifyDelegation = async (fromTeacherId: string, toTeacherId: string, feature: string): Promise<boolean> => {
  const delegation = await PermissionDelegation.findOne({
    fromTeacher: fromTeacherId,
    toTeacher: toTeacherId,
    feature,
    isActive: true
  });
  return !!delegation;
};

router.post('/', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { examName, examType, classTeacherId, class: className, subjects, studentMarks } = req.body;

    if (!examName || !classTeacherId || !className || !subjects || !studentMarks) {
      return res.status(400).json({
        success: false,
        message: 'examName, classTeacherId, class, subjects, and studentMarks arrays are required.',
      });
    }

    // Enforce class marks entry lockdown settings
    const classPrefix = className.split('-')[0].trim();
    const config = await SystemConfig.findOne({ key: 'marksUpdateEnabledClasses' });
    const enabledClasses = config ? config.value : ['10', '9', '8'];
    const normalizedEnabled = enabledClasses.map((c: string) => c.split('-')[0].trim());
    if (!normalizedEnabled.includes(classPrefix)) {
      return res.status(403).json({
        success: false,
        message: `Marks entry/update is currently locked by the administrator for Class ${className}.`
      });
    }

    // Server-side validation of subjects
    if (!Array.isArray(subjects) || subjects.length === 0 || subjects.some((s: any) => !s.name || Number(s.totalMarks) <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subjects. Each subject must have a name and total marks > 0.',
      });
    }

    // Validate student marks bounds
    if (!Array.isArray(studentMarks)) {
      return res.status(400).json({ success: false, message: 'studentMarks must be an array.' });
    }
    for (const sm of studentMarks) {
      if (!sm.studentId || !Array.isArray(sm.marks)) {
        return res.status(400).json({ success: false, message: 'Each student entry must have studentId and marks array.' });
      }
      for (const m of sm.marks) {
        const sub = subjects.find((s: any) => s.name === m.subject);
        if (!sub) {
          return res.status(400).json({ success: false, message: `Subject "${m.subject}" not in subjects list.` });
        }
        const obtained = Number(m.obtainedMarks);
        const total = Number(sub.totalMarks);
        if (isNaN(obtained) || obtained < 0 || obtained > total) {
          return res.status(400).json({
            success: false,
            message: `Marks for "${m.subject}" must be between 0 and ${total}.`,
          });
        }
      }
    }

    const userRole = (req.user as any)?.role;
    const userId = (req.user as any)?._id;
    let finalClassTeacherId = classTeacherId;
    let editorName = 'Unknown';

    // ── DB Connected ──
    if (userRole === 'teacher') {
      const teacherProfile = await resolveTeacher(userId);
      if (!teacherProfile) {
        return res.status(403).json({ success: false, message: 'Forbidden: Teacher profile not found.' });
      }
      const classes = teacherProfile.assignedClass.split(',').map((s: string) => s.trim().toUpperCase());
      const isAssignedDirectly = classes.includes(className.trim().toUpperCase());
      const isDelegated = await verifyDelegation(classTeacherId, teacherProfile._id.toString(), 'marks');

      if (!isAssignedDirectly && !isDelegated) {
        return res.status(403).json({ success: false, message: `Forbidden: Not assigned to Class ${className} and no delegated permission.` });
      }
      finalClassTeacherId = isAssignedDirectly ? teacherProfile._id.toString() : classTeacherId;
      editorName = teacherProfile.name;
    } else if (userRole === 'admin') {
      const matchedTeacher = await Teacher.findOne({
        assignedClass: { $regex: new RegExp(`\\b${className.trim()}\\b`, 'i') },
      });
      if (matchedTeacher) {
        finalClassTeacherId = matchedTeacher._id.toString();
        editorName = matchedTeacher.name;
      }
    }

    // Check if already exists and is locked
    const existingExam = await Exam.findOne({ examName, classTeacher: finalClassTeacherId });
    if (existingExam && existingExam.status === 'locked') {
      return res.status(403).json({ success: false, message: 'This exam is locked. Ask admin to unlock it before editing.' });
    }

    const formattedSubjects = subjects.map((s: any) => ({ name: s.name, totalMarks: Number(s.totalMarks) }));
    const formattedStudentMarks = studentMarks.map((sm: any) => ({
      student: sm.studentId,
      marks: sm.marks.map((m: any) => ({ subject: m.subject, obtainedMarks: Number(m.obtainedMarks) })),
      remarks: sm.remarks || '',
    }));

    // Determine status: empty studentMarks = draft template, otherwise submitted
    const newStatus = formattedStudentMarks.length > 0 ? 'submitted' : 'draft';

    const filter = { examName, classTeacher: finalClassTeacherId };
    const update: any = {
      class: className,
      examType: examType || 'regular',
      subjects: formattedSubjects,
      studentMarks: formattedStudentMarks,
      status: newStatus,
      lastEditedByName: editorName,
      lastEditedAt: new Date(),
    };

    // Set lastEditedBy ref if we can resolve the teacher ObjectId
    const teacherDoc = await Teacher.findById(finalClassTeacherId);
    if (teacherDoc) update.lastEditedBy = teacherDoc._id;

    await Exam.findOneAndUpdate(filter, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true });

    return res.status(201).json({ success: true, message: 'Exam marks sheet saved successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PATCH /:examId/student — Partial update for a single student's marks ─────
router.patch('/:examId/student', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;
    const { studentId, marks, remarks } = req.body;

    if (!studentId || !Array.isArray(marks)) {
      return res.status(400).json({ success: false, message: 'studentId and marks array are required.' });
    }

    // ── DB Connected ──
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    if (exam.status === 'locked') {
      return res.status(403).json({ success: false, message: 'This exam is locked. Ask admin to unlock it before editing.' });
    }

    // Validate marks against subject bounds
    for (const m of marks) {
      const sub = exam.subjects.find((s) => s.name === m.subject);
      if (!sub) return res.status(400).json({ success: false, message: `Subject "${m.subject}" not found in exam.` });
      const obtained = Number(m.obtainedMarks);
      if (isNaN(obtained) || obtained < 0 || obtained > sub.totalMarks) {
        return res.status(400).json({
          success: false,
          message: `Marks for "${m.subject}" must be between 0 and ${sub.totalMarks}.`,
        });
      }
    }

    // Resolve editor info
    const userId = (req.user as any)?._id;
    const userRole = (req.user as any)?.role;
    let editorId = null;
    let editorName = 'Unknown';

    if (userRole === 'teacher') {
      const teacherProfile = await resolveTeacher(userId);
      if (teacherProfile) {
        editorId = teacherProfile._id;
        editorName = teacherProfile.name;
      }
    }

    // Build audit diff
    const smRecord = exam.studentMarks.find((sm) => sm.student.toString() === studentId);
    const changes: Array<{ subject: string; from: number; to: number }> = [];

    marks.forEach((newMark: { subject: string; obtainedMarks: number }) => {
      const oldMark = smRecord?.marks.find((m) => m.subject === newMark.subject);
      const oldVal = oldMark ? oldMark.obtainedMarks : 0;
      const newVal = Number(newMark.obtainedMarks);
      if (oldVal !== newVal) {
        changes.push({ subject: newMark.subject, from: oldVal, to: newVal });
      }
    });

    // Update the specific student entry
    const smIndex = exam.studentMarks.findIndex((sm) => sm.student.toString() === studentId);
    if (smIndex === -1) {
      return res.status(404).json({ success: false, message: 'Student not found in this exam record.' });
    }

    exam.studentMarks[smIndex].marks = marks.map((m: any) => ({
      subject: m.subject,
      obtainedMarks: Number(m.obtainedMarks),
    }));
    if (remarks !== undefined) exam.studentMarks[smIndex].remarks = remarks;

    // Update audit fields
    exam.lastEditedByName = editorName;
    exam.lastEditedAt = new Date();
    if (editorId) exam.lastEditedBy = editorId;

    // Append edit history entry only if something changed
    if (changes.length > 0) {
      exam.editHistory.push({
        editedBy: editorId,
        editedByName: editorName,
        editedAt: new Date(),
        studentId,
        changes,
      } as any);
    }

    await exam.save();
    clearCache('/api/dashboard/students*').catch(() => {});

    return res.status(200).json({ success: true, message: 'Student marks updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /:examId/analytics — Class stats, grades and ranks for an exam ──────
router.get('/:examId/analytics', requirePermission('results:view'), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;
    const bands = await getGradeBands();

    let exam: any;
    let studentNameOf: (sm: any) => string;

    exam = await Exam.findById(examId).populate('studentMarks.student', 'firstName lastName admissionNo');
    studentNameOf = (sm: any) => sm.student && sm.student.firstName
      ? `${sm.student.firstName} ${sm.student.lastName}`
      : 'Unknown Student';

    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const totalPossible = exam.subjects.reduce((acc: number, s: any) => acc + s.totalMarks, 0);

    // Per-subject class statistics
    const subjectStats = exam.subjects.map((sub: any) => {
      const scores: number[] = [];
      exam.studentMarks.forEach((sm: any) => {
        const mark = sm.marks.find((m: any) => m.subject === sub.name);
        if (mark) scores.push(mark.obtainedMarks);
      });
      return {
        subject: sub.name,
        totalMarks: sub.totalMarks,
        average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
        highest: scores.length ? Math.max(...scores) : 0,
        lowest: scores.length ? Math.min(...scores) : 0
      };
    });

    // Per-student totals, grades and dense ranks
    const studentRows = exam.studentMarks.map((sm: any) => {
      const total = sm.marks.reduce((acc: number, m: any) => acc + m.obtainedMarks, 0);
      const percentage = totalPossible > 0 ? Math.round((total / totalPossible) * 100) : 0;
      return {
        studentId: String(sm.student?._id || sm.student),
        name: studentNameOf(sm),
        total,
        totalPossible,
        percentage,
        grade: gradeFor(percentage, bands).grade
      };
    }).sort((a: any, b: any) => b.total - a.total);

    let rank = 0;
    let prevTotal: number | null = null;
    studentRows.forEach((row: any, i: number) => {
      if (row.total !== prevTotal) {
        rank = i + 1;
        prevTotal = row.total;
      }
      row.rank = rank;
    });

    const classAverage = studentRows.length
      ? Math.round(studentRows.reduce((a: number, r: any) => a + r.percentage, 0) / studentRows.length)
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        examName: exam.examName,
        class: exam.class,
        studentsCount: studentRows.length,
        classAverage,
        gradeBands: bands,
        subjectStats,
        students: studentRows
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /:examId/history — Admin: full marks edit audit trail ───────────────
router.get('/:examId/history', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findById(examId)
      .populate('editHistory.editedBy', 'name')
      .populate('editHistory.studentId', 'firstName lastName admissionNo')
      .select('examName class editHistory');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    const history = [...exam.editHistory].sort(
      (a: any, b: any) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime()
    );

    return res.status(200).json({
      success: true,
      data: { examName: exam.examName, class: exam.class, editHistory: history }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /:examId — Admin: permanently delete an exam marks sheet ─────────
router.delete('/:examId', requireRole(['admin']), audit('exam:delete'), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findByIdAndDelete(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    return res.status(200).json({ success: true, message: `Exam "${exam.examName}" deleted successfully.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PATCH /:examId/status — Admin: lock or unlock an exam ───────────────────
router.patch('/:examId/status', requireRole(['admin']), audit('exam:status-change'), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;
    const { status } = req.body;

    if (!['draft', 'submitted', 'locked'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be one of: draft, submitted, locked.' });
    }

    const exam = await Exam.findByIdAndUpdate(examId, { $set: { status } }, { new: true });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    return res.status(200).json({ success: true, message: `Exam status updated to "${status}".`, data: exam });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /all — List all exams (Admin) ───────────────────────────────────────
router.get('/all', requirePermission('results:view'), async (req: Request, res: Response) => {
  try {
    const records = await Exam.find({}).populate('classTeacher');
    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /history — List teacher's own exams ─────────────────────────────────
router.get('/history', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.query;
    if (!teacherId) return res.status(400).json({ success: false, message: 'teacherId is required.' });

    const records = await Exam.find({ classTeacher: teacherId }).populate('classTeacher');
    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /details/:examId — Full exam details ─────────────────────────────────
router.get('/details/:examId', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;

    const record = await Exam.findById(examId)
      .populate('studentMarks.student', 'firstName lastName admissionNo')
      .populate('classTeacher', 'name')
      .populate('editHistory.editedBy', 'name');
    if (!record) {
      return res.status(404).json({ success: false, message: 'Exam register not found.' });
    }

    // Convert to plain object to attach dynamic presigned URLs
    const recordObj = record.toObject();
    if (recordObj.studentMarks) {
      for (const sm of recordObj.studentMarks) {
        if (sm.pdfUrl && sm.pdfUrl.includes('.amazonaws.com/')) {
          try {
            // Extract the S3 key from the stored URL
            const s3Key = sm.pdfUrl.split('.amazonaws.com/')[1];
            if (s3Key) {
              sm.pdfUrl = await getPresignedDownloadUrl(s3Key, PRESIGN_EXPIRY_2_HOURS);
            }
          } catch (err) {
            console.error('Failed to generate presigned URL for details:', err);
          }
        }
      }
    }

    return res.status(200).json({ success: true, data: recordObj });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Upload base64 PDF and write to AWS S3 bucket
router.post('/upload-pdf', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { studentId, examId, pdfBase64, filename } = req.body;
    if (!studentId || !examId || !pdfBase64) {
      return res.status(400).json({ success: false, message: 'studentId, examId, and pdfBase64 are required.' });
    }

    // Clean base64 string (split by comma to remove any data URI scheme prefix)
    const base64Parts = pdfBase64.split(',');
    const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const pdfBuffer = Buffer.from(base64Data, 'base64');

    let studentClass = 'unknown';
    let studentSection = 'unknown';
    let studentFolder = studentId;
    const year = new Date().getFullYear();

    if (studentId && studentId !== 'bulk') {
      let student = null;
      student = await Student.findById(studentId);
      if (student) {
        studentClass = student.class || 'unknown';
        studentSection = student.section || 'unknown';
        studentFolder = student.admissionNo || studentId;
      }
    } else if (examId) {
      let exam = null;
      exam = await Exam.findById(examId);
      if (exam) {
        studentClass = exam.class || 'unknown';
        if (exam.studentMarks && exam.studentMarks.length > 0) {
          const firstStudentId = exam.studentMarks[0].student;
          let firstStudent = null;
          firstStudent = await Student.findById(firstStudentId);
          if (firstStudent) {
            studentSection = firstStudent.section || 'unknown';
          }
        }
      }
    }

    const fileBasename = filename ? filename : `report_${studentId}_${examId}.pdf`;
    const s3Key = `students/${year}/${studentClass}/${studentSection}/reports/${studentFolder}/${fileBasename}`;

    // Upload to AWS S3
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    };

    await getS3Client().send(new PutObjectCommand(uploadParams));

    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${s3Key}`;
    console.log(`Saved report card to AWS S3: ${fileUrl}`);

    // Update database record if not a bulk upload
    if (studentId && studentId !== 'bulk') {
      await Exam.updateOne(
        { _id: examId, 'studentMarks.student': studentId },
        { $set: { 'studentMarks.$.pdfUrl': fileUrl } }
      );
    }

    // Generate a secure presigned URL for frontend preview
    const presignedUrl = await getPresignedDownloadUrl(s3Key, PRESIGN_EXPIRY_2_HOURS);

    return res.status(200).json({
      success: true,
      message: 'PDF uploaded and saved to AWS S3 successfully.',
      pdfUrl: presignedUrl
    });
  } catch (error: any) {
    console.error('Error uploading PDF to S3:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Send the generated report card to the parent as the approved
// `report_card_notice` WhatsApp template (DOCUMENT header = the report-card PDF).
// The frontend uploads the PDF first (POST /upload-pdf, which stores
// studentMarks.pdfUrl), then calls this to dispatch it.
router.post('/:examId/report-card/:studentId/whatsapp', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { examId, studentId } = req.params;

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam record not found.' });
    }
    const smRecord = (exam.studentMarks || []).find((sm: any) => String(sm.student) === String(studentId));
    if (!smRecord || !smRecord.pdfUrl) {
      return res.status(400).json({
        success: false,
        message: 'Report card PDF not generated yet for this student. Generate/upload it first.'
      });
    }

    if (!String(smRecord.pdfUrl).includes('.amazonaws.com/')) {
      return res.status(400).json({ success: false, message: 'Stored report-card PDF URL is not an S3 URL.' });
    }
    const s3Key = String(smRecord.pdfUrl).split('.amazonaws.com/')[1];
    if (!s3Key) {
      return res.status(400).json({ success: false, message: 'Could not parse the report-card S3 key.' });
    }
    const presignedUrl = await getPresignedDownloadUrl(s3Key, PRESIGN_EXPIRY_2_HOURS);

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    const whatsappNo = (student as any).whatsappNo;
    if (!whatsappNo) {
      return res.status(400).json({ success: false, message: 'Student has no WhatsApp number on file.' });
    }
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';
    const admissionNo = (student as any).admissionNo || String((student as any)._id);

    const result = await queueTemplateNotification('report.card', {
      to: whatsappNo,
      // Unique per click: every press of the WhatsApp button must send, even for unchanged marks.
      dedupeKey: `report-card:${examId}:${studentId}:${Date.now()}`,
      headerDocument: { link: presignedUrl, filename: `report_card_${admissionNo}.pdf` },
      params: { student_name_en: studentName, student_name_te: studentName }
    });

    if (!result.queued) {
      return res.status(502).json({
        success: false,
        message: `report_card_notice template could not be queued: ${result.reason}`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'report_card_notice WhatsApp template enqueued.'
    });
  } catch (error: any) {
    console.error('[ReportCard WhatsApp] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});


// Batch dispatch report cards to an entire class via WhatsApp
router.post('/:examId/report-cards/class/whatsapp', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;
    const { studentIds } = req.body || {};

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam record not found.' });
    }

    const studentMarksList = exam.studentMarks || [];
    if (studentMarksList.length === 0) {
      return res.status(400).json({ success: false, message: 'No student marks found for this exam.' });
    }

    const targetMarks = Array.isArray(studentIds) && studentIds.length > 0
      ? studentMarksList.filter((sm: any) => studentIds.includes(String(sm.student)))
      : studentMarksList;

    const allStudentIds = targetMarks.map((sm: any) => sm.student);
    const students = await Student.find({ _id: { $in: allStudentIds } }).lean();
    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));

    let sentCount = 0;
    const skippedNoPdf: string[] = [];
    const skippedNoWhatsapp: string[] = [];
    const failedToQueue: string[] = [];

    for (const sm of targetMarks) {
      const studentIdStr = String(sm.student);
      const student = studentMap.get(studentIdStr);
      const studentName = student
        ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || (student as any).name || 'Student'
        : 'Student';

      if (!sm.pdfUrl || !String(sm.pdfUrl).includes('.amazonaws.com/')) {
        skippedNoPdf.push(studentName);
        continue;
      }

      const whatsappNo = student ? (student as any).whatsappNo : null;
      if (!whatsappNo) {
        skippedNoWhatsapp.push(studentName);
        continue;
      }

      try {
        const s3Key = String(sm.pdfUrl).split('.amazonaws.com/')[1];
        if (!s3Key) {
          skippedNoPdf.push(studentName);
          continue;
        }
        const presignedUrl = await getPresignedDownloadUrl(s3Key, PRESIGN_EXPIRY_2_HOURS);
        const admissionNo = student ? (student as any).admissionNo || studentIdStr : studentIdStr;

        const result = await queueTemplateNotification('report.card', {
          to: whatsappNo,
          dedupeKey: `report-card:${examId}:${studentIdStr}:${Date.now()}`,
          headerDocument: { link: presignedUrl, filename: `report_card_${admissionNo}.pdf` },
          params: { student_name_en: studentName, student_name_te: studentName }
        });

        if (result.queued) {
          sentCount++;
        } else {
          failedToQueue.push(`${studentName} (${result.reason || 'Failed'})`);
        }
      } catch (err: any) {
        failedToQueue.push(`${studentName} (${err.message})`);
      }
    }

    return res.status(200).json({
      success: true,
      total: targetMarks.length,
      sentCount,
      skippedNoPdf,
      skippedNoWhatsapp,
      failedToQueue,
      message: `Enqueued WhatsApp report cards for ${sentCount} of ${targetMarks.length} students.`
    });
  } catch (error: any) {
    console.error('[Batch ReportCard WhatsApp] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Proxy S3 download with Content-Disposition attachment to trigger local browser download dialog
router.get('/download-pdf', requirePermission('marks:entry'), async (req: Request, res: Response) => {
  try {
    const { key, filename } = req.query;
    if (!key) {
      return res.status(400).json({ success: false, message: 'key is required.' });
    }

    const s3Key = String(key);
    const downloadName = filename ? String(filename) : 'report.pdf';

    const response = await getS3Client().send(new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
    }));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);

    const stream = response.Body as any;
    stream.pipe(res);
  } catch (error: any) {
    console.error('Failed to proxy download from S3:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
