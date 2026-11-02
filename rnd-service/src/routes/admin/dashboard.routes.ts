import { Router, Request, Response } from 'express';
import { Student } from '../../models/student.model';
import { Teacher } from '../../models/teacher.model';
import { Exam } from '../../models/exam.model';
import { Attendance } from '../../models/attendance.model';
import { Homework } from '../../models/homework.model';
import { ClassRoom } from '../../models/classRoom.model';
import { ReceiptTokenService } from '../../services/receipt.service';
import { cacheResponse, clearCache } from '../../middlewares/cache.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { audit } from '../../middlewares/audit.middleware';
import { getS3Client, getPresignedDownloadUrl } from '../../services/s3.service';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { dispatchTransportAlert, sanitizeTransportMessage, TRANSPORT_MESSAGE_MAX_LENGTH } from '../../services/transportAlert.service';
import { runInstallmentReminderSweep } from '../../services/scheduler';
import { ScheduledAlert } from '../../models/scheduledAlert.model';
import { queueTemplateNotification } from '../../config/queue';
import { dispatchFeeReminders, normalizeFeeCategory, FEE_TYPE_LABELS } from '../../services/feeReminder.service';

import { User } from '../../models/user.model';

const router = Router();

// GET /api/dashboard/recent-activities
router.get('/recent-activities', requirePermission('dashboard:widget:recentActivity'), async (req: Request, res: Response) => {
  try {
    const list: any[] = [];

    // 1. Fetch recent fee payments
    const recentStudents = await Student.find(
      { 'payments.0': { $exists: true } },
      { name: 1, firstName: 1, lastName: 1, class: 1, section: 1, payments: 1 }
    ).lean();

    recentStudents.forEach((s: any) => {
      (s.payments || []).forEach((p: any) => {
        const sName = s.name || [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Student';
        list.push({
          id: `pay-${s._id}-${p.receiptNo}-${new Date(p.date).getTime()}`,
          title: 'Fee payment received',
          desc: `${sName} · Class ${s.class}-${s.section} · ₹${p.amount.toLocaleString()}`,
          date: p.date,
          type: 'payment'
        });
      });
    });

    // 2. Fetch recent user logins across everyone
    const recentLogins = await User.find(
      { lastLogin: { $exists: true, $ne: null }, role: { $ne: 'superadmin' } },
      { username: 1, role: 1, firstName: 1, lastName: 1, lastLogin: 1 }
    ).sort({ lastLogin: -1 }).limit(30).lean();

    recentLogins.forEach((u: any) => {
      const uName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'User';
      const roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1);
      list.push({
        id: `login-${u._id}-${new Date(u.lastLogin).getTime()}`,
        title: `${roleLabel} account active`,
        desc: `${uName} logged in (${u.username})`,
        date: u.lastLogin,
        type: 'login',
        userRole: u.role
      });
    });

    // Sort by date descending
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Limit to latest 50
    return res.status(200).json({ success: true, data: list.slice(0, 50) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Daily fee collection report (front-office cash reconciliation)
router.get('/collections', requirePermission('fees:view'), async (req: Request, res: Response) => {
  try {
    const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format.' });
    }
    const start = new Date(dateStr);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    let payments: Array<{
      receiptNo: string; amount: number; paymentMode: string; date: Date;
      studentName: string; admissionNo: string; class: string; section: string;
    }> = [];

    const rows = await Student.aggregate([
      { $unwind: '$payments' },
      { $match: { 'payments.date': { $gte: start, $lt: end } } },
      {
        $project: {
          receiptNo: '$payments.receiptNo',
          amount: '$payments.amount',
          paymentMode: '$payments.paymentMode',
          date: '$payments.date',
          firstName: 1, lastName: 1, admissionNo: 1, class: 1, section: 1
        }
      },
      { $sort: { date: 1 } }
    ]);
    payments = rows.map((r: any) => ({
      receiptNo: r.receiptNo,
      amount: r.amount,
      paymentMode: r.paymentMode || 'cash',
      date: r.date,
      studentName: `${r.firstName} ${r.lastName}`,
      admissionNo: r.admissionNo,
      class: r.class,
      section: r.section
    }));

    const byMode: Record<string, number> = {};
    let totalCollected = 0;
    for (const p of payments) {
      byMode[p.paymentMode] = (byMode[p.paymentMode] || 0) + p.amount;
      totalCollected += p.amount;
    }

    return res.status(200).json({
      success: true,
      data: { date: dateStr, totalCollected, paymentsCount: payments.length, byMode, payments }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Manually trigger the daily installment reminder sweep (also runs automatically at 9 AM)
router.post('/run-installment-reminders', requirePermission('fees:manage'), audit('fees:installment-sweep'), async (req: Request, res: Response) => {
  try {
    const result = await runInstallmentReminderSweep();
    return res.status(200).json({
      success: true,
      message: `Sweep complete: ${result.remindersSent} reminder(s) sent, ${result.markedOverdue} installment(s) marked overdue.`,
      ...result
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get all students with comprehensive dashboard data
router.get('/students', cacheResponse(300), async (req: Request, res: Response) => {
  try {
    const { class: queryClass, section: querySection } = req.query;

    // Fetch all students and populate class teacher info
    const query: any = {};
    if (typeof queryClass === 'string' && queryClass) {
      query.class = queryClass;
    }
    if (typeof querySection === 'string' && querySection) {
      query.section = { $regex: new RegExp(`^${querySection}$`, 'i') };
    }

    const students = await Student.find(query).populate('classTeacher', 'name assignedClass');
    const exams = await Exam.find({});

    // Format the response specifically for the dashboard
    const formattedData = students.map((student: any) => {
      const studentIdStr = student._id.toString();
      let totalObtained = 0;
      let totalPossible = 0;
      const examPercentages: Record<string, number> = {};

      exams.forEach(ex => {
        const sm = ex.studentMarks.find((sm: any) => sm.student.toString() === studentIdStr);
        if (sm) {
          let exObtained = 0;
          let exPossible = 0;
          sm.marks.forEach((m: any) => {
            exObtained += m.obtainedMarks;
            totalObtained += m.obtainedMarks;
          });
          ex.subjects.forEach((sub: any) => {
            exPossible += sub.totalMarks;
            totalPossible += sub.totalMarks;
          });
          examPercentages[ex.examName] = exPossible > 0 ? Math.round((exObtained / exPossible) * 100) : 0;
        }
      });
      const academicPercentage = totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100) : 0;

      return {
        id: student._id,
        admissionNo: student.admissionNo,
        name: `${student.firstName} ${student.lastName}`,
        class: student.class,
        section: student.section,
        classTeacher: student.classTeacher ? student.classTeacher.name : 'N/A',
        feePaid: student.feePaid,
        feePending: student.feePending,
        whatsappNo: student.whatsappNo,
        transportMode: student.transportMode || 'school',
        booksFee: student.booksFee || 0,
        academicPercentage,
        examPercentages,
        cluster: student.cluster || '',
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        bloodGroup: student.bloodGroup,
        house: student.house,
        fatherName: student.fatherName,
        motherName: student.motherName,
        address: student.address,
        motherWhatsappNo: student.motherWhatsappNo,
        preferredLanguage: student.preferredLanguage,
        admissionAcademicYear: student.admissionAcademicYear,
        installments: student.installments || [],
        payments: student.payments || []
      };
    });

    return res.status(200).json({ success: true, data: formattedData });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Send a general fee/dues reminder now — the small "🚀" button (one studentId)
// AND "Bulk Send → Send Immediately" (studentIds[]). ONE common flow: per student
// the dues for `feeCategory` are resolved and ONE approved `fee_general_reminder`
// template is queued ('all' → total outstanding, fee_type = "Total Outstanding Fees").
router.post('/send-reminder', requirePermission('fees:view'), async (req: Request, res: Response) => {
  try {
    const { studentId, studentIds, feeCategory } = req.body;

    const ids: string[] = Array.isArray(studentIds)
      ? studentIds.map((x: any) => String(x)).filter(Boolean)
      : studentId
      ? [String(studentId)]
      : [];

    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'studentId or studentIds is required.' });
    }

    const category = normalizeFeeCategory(feeCategory);
    const summary = await dispatchFeeReminders(ids, category);
    const feeLabel = FEE_TYPE_LABELS[category].en;

    let message: string;
    if (summary.queued > 0) {
      message =
        ids.length === 1
          ? `${feeLabel} reminder sent on WhatsApp.`
          : `${feeLabel} reminders sent to ${summary.queued} parent(s).`;
    } else if (summary.skippedNoDues === summary.requested) {
      message = `No reminder sent — no pending ${feeLabel.toLowerCase()} for the selected student(s).`;
    } else {
      message = `No reminders sent (${summary.skippedNoPhone} without a WhatsApp number, ${summary.rejected} rejected).`;
    }

    return res.status(200).json({ success: summary.queued > 0, message, feeCategory: category, ...summary });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /dashboard/scheduled-reminders
router.get('/scheduled-reminders', requirePermission('fees:view'), async (req: Request, res: Response) => {
  try {
    const alerts = await ScheduledAlert.find({ status: 'pending', title: 'Scheduled Fee Reminder' }).sort({ scheduledAt: 1 });
    return res.status(200).json({ success: true, data: alerts });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /dashboard/schedule-reminders
// "Bulk Send → Schedule for Later": store one pending ScheduledAlert per requested
// time. At fire time the scheduler runs the SAME fee calculation + approved
// `fee_general_reminder` template path as the immediate send (see feeReminder.service).
router.post('/schedule-reminders', requirePermission('fees:collect'), audit('fees:schedule-reminders'), async (req: Request, res: Response) => {
  try {
    const { studentIds, scheduledTimes, feeCategory } = req.body;

    const ids: string[] = Array.isArray(studentIds) ? studentIds.map((x: any) => String(x)).filter(Boolean) : [];
    const times: string[] = Array.isArray(scheduledTimes) ? scheduledTimes.filter(Boolean) : [];

    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds is required.' });
    }
    if (times.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one scheduledTime is required.' });
    }

    const category = normalizeFeeCategory(feeCategory);
    const feeLabel = FEE_TYPE_LABELS[category].en;

    const docs = times.map((t) => ({
      title: 'Scheduled Fee Reminder',
      message: `${feeLabel} reminder for ${ids.length} student(s).`,
      sendAlertsTo: 'parents' as const,
      scheduledAt: new Date(t),
      status: 'pending' as const,
      studentIds: ids,
      kind: 'feeReminder' as const,
      feeCategory: category
    }));

    if (docs.some((d) => isNaN(d.scheduledAt.getTime()))) {
      return res.status(400).json({ success: false, message: 'One or more scheduledTime values are invalid.' });
    }

    const created = await ScheduledAlert.insertMany(docs);
    return res.status(200).json({
      success: true,
      count: created.length,
      message: `Scheduled ${created.length} ${feeLabel} reminder run(s) for ${ids.length} student(s).`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /dashboard/scheduled-reminders/:id
router.delete('/scheduled-reminders/:id', requirePermission('fees:collect'), audit('fees:cancel-reminder'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const alert = await ScheduledAlert.findByIdAndDelete(id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Scheduled reminder not found.' });
    }
    return res.status(200).json({ success: true, message: 'Scheduled reminder cancelled successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Record a fee payment and simulate WhatsApp receipt broadcast
router.post('/record-payment', requirePermission('fees:collect'), audit('fees:record-payment'), async (req: Request, res: Response) => {
  try {
    const { studentId, amount, feeType, pdfBase64 } = req.body;

    if (!studentId || amount === undefined || !feeType) {
      return res.status(400).json({ success: false, message: 'studentId, amount, and feeType are required.' });
    }

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a valid positive number.' });
    }

    const now = new Date();
    const paymentDate = now.toISOString().split('T')[0];
    const paymentTime = now.toTimeString().split(' ')[0];
    const receiptNo = 'FEE-' + now.getFullYear() + '-' + Math.floor(100000 + Math.random() * 900000);
    
    let recipient = '';
    let studentName = '';
    let updatedStudent: any = null;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (feeType === 'school') {
      const actualDeduction = Math.min(payAmount, student.feePending);
      student.feePending = Math.max(0, student.feePending - actualDeduction);
      student.feePaid += actualDeduction;
    } else if (feeType === 'books') {
      student.booksFee = Math.max(0, (student.booksFee || 0) - payAmount);
    } else if (feeType === 'transport') {
      student.transportFee = Math.max(0, (student.transportFee || 0) - payAmount);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid feeType.' });
    }

    student.payments.push({
      receiptNo,
      amount: payAmount,
      date: now,
      paymentMode: 'cash',
      feeType
    });

    await student.save();

    updatedStudent = await Student.findById(studentId).populate('classTeacher', 'name assignedClass');
    recipient = student.whatsappNo;
    studentName = `${student.firstName} ${student.lastName}`;

    // Generate cryptographic verification token
    const token = ReceiptTokenService.generateToken({
      receiptNo,
      studentId: studentId,
      amount: payAmount,
      paymentDate,
      paymentTime,
    });

    // Use configurable app host for the verification URL (set APP_HOST in .env for production/LAN)
    const appHost = process.env.APP_HOST || 'localhost:5173';
    // Use a short receipt-based link instead of the long JWT so it's clickable in WhatsApp
    const verifyLink = `http://${appHost}/?verify_token=${receiptNo}`;
    
    const feeNameEn = feeType === 'school' ? 'Tuition Fee' : feeType === 'books' ? 'Books Fee' : 'Transport Fee';
    const feeNameTe = feeType === 'school' ? 'పాఠశాల రుసుము' : feeType === 'books' ? 'పుస్తకాల రుసుము' : 'రవాణా రుసుము';
    
    const englishMessage = `Dear Parent, we have successfully recorded a payment of ₹${payAmount.toLocaleString()} towards the ${feeNameEn} of your ward ${studentName}.\nReceipt No: ${receiptNo}\n✅ Verify here: ${verifyLink}\nThank you!`;
    const teluguMessage = `ప్రియమైన తల్లిదండ్రులారా, మీ బిడ్డ ${studentName} కి సంబంధించిన ${feeNameTe} కొరకు ₹${payAmount.toLocaleString()} చెల్లింపును మేము విజయవంతంగా నమోదు చేసాము.\nరశీదు సంఖ్య: ${receiptNo}\n✅ ధృవీకరించండి: ${verifyLink}\nధన్యవాదాలు!`;
    const whatsappMessage = `${englishMessage}\n\n${teluguMessage}`;

    // Process PDF receipt upload to AWS S3 if base64 data is present
    let pdfUrl = '';
    if (pdfBase64) {
      try {
        const base64Parts = pdfBase64.split(',');
        const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        
        const studentClass = updatedStudent?.class || 'unknown';
        const studentSection = updatedStudent?.section || 'unknown';
        const studentFolder = updatedStudent?.admissionNo || studentId;
        const year = new Date().getFullYear();
        const s3Key = `students/${year}/${studentClass}/${studentSection}/fees/${studentFolder}/receipt_${receiptNo}.pdf`;
        
        const uploadParams = {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: s3Key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        };
        await getS3Client().send(new PutObjectCommand(uploadParams));
        pdfUrl = await getPresignedDownloadUrl(s3Key);
        console.log(`Saved receipt PDF to AWS S3: ${pdfUrl}`);
      } catch (uploadErr) {
        console.error('Error uploading receipt PDF to S3:', uploadErr);
      }
    }

    await clearCache('/api/dashboard/*');

    return res.status(200).json({
      success: true,
      message: 'Payment recorded successfully.',
      receipt: {
        receiptNo,
        studentName,
        amount: payAmount,
        feeType,
        recipient,
        whatsappMessage,
        paymentDate,
        paymentTime,
        token
      },
      student: updatedStudent
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Upload fee receipt PDF and dispatch it to the parent as the approved
// `fee_receipt` WhatsApp template (DOCUMENT header = the receipt PDF).
router.post('/upload-receipt-pdf', requirePermission('fees:collect'), async (req: Request, res: Response) => {
  try {
    const { receiptNo, pdfBase64, recipient } = req.body;
    if (!receiptNo || !pdfBase64 || !recipient) {
      return res.status(400).json({ success: false, message: 'receiptNo, pdfBase64, and recipient are required.' });
    }

    const base64Parts = pdfBase64.split(',');
    const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const pdfBuffer = Buffer.from(base64Data, 'base64');

    let studentClass = 'unknown';
    let studentSection = 'unknown';
    const year = new Date().getFullYear();

    const student = await Student.findOne({ 'payments.receiptNo': receiptNo });

    let resolvedFolder = 'unknown';
    if (student) {
      studentClass = student.class || 'unknown';
      studentSection = student.section || 'unknown';
      resolvedFolder = student.admissionNo || String((student as any)._id || 'unknown');
    }

    const s3Key = `students/${year}/${studentClass}/${studentSection}/fees/${resolvedFolder}/receipt_${receiptNo}.pdf`;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    };

    await getS3Client().send(new PutObjectCommand(uploadParams));
    const pdfUrl = await getPresignedDownloadUrl(s3Key);
    console.log(`Saved receipt PDF to AWS S3: ${pdfUrl}`);

    if (!student) {
      return res.status(404).json({ success: false, message: `No student found for receipt ${receiptNo}.` });
    }
    const payment: any = (student.payments || []).find((p: any) => p.receiptNo === receiptNo);
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';
    const amount = Number(req.body.amount ?? payment?.amount ?? 0);
    const feeType: 'school' | 'books' | 'transport' =
      req.body.feeType || payment?.feeType || 'school';
    const feeNameEn =
      feeType === 'books' ? 'Books Fee' : feeType === 'transport' ? 'Transport Fee' : 'Tuition Fee';
    const feeNameTe =
      feeType === 'books' ? 'పుస్తకాల రుసుము' : feeType === 'transport' ? 'రవాణా రుసుము' : 'పాఠశాల రుసుము';

    // Build the verification URL from the real public origin of THIS request
    // (nginx sets x-forwarded-*), falling back to APP_HOST.
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('x-forwarded-host') || req.get('host') || process.env.APP_HOST || 'localhost:5173';
    const verificationUrl = `${proto}://${host}/?verify_token=${receiptNo}`;

    const amountStr = amount.toLocaleString('en-IN');
    const templateResult = await queueTemplateNotification('fee.receipt', {
      to: recipient,
      dedupeKey: `fee-receipt:${receiptNo}`,
      headerDocument: { link: pdfUrl, filename: `receipt_${receiptNo}.pdf` },
      params: {
        amount_en: amountStr,
        fee_name_en: feeNameEn,
        student_name_en: studentName,
        receipt_number_en: receiptNo,
        verification_url_en: verificationUrl,
        student_name_te: studentName,
        fee_name_te: feeNameTe,
        amount_te: amountStr,
        receipt_number_te: receiptNo,
        verification_url_te: verificationUrl
      }
    });

    if (!templateResult.queued) {
      console.error(`[FeeReceipt] Template not queued for ${receiptNo}: ${templateResult.reason}`);
      return res.status(502).json({
        success: false,
        message: `Receipt PDF saved but WhatsApp template could not be queued: ${templateResult.reason}`,
        pdfUrl
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Receipt PDF uploaded and fee_receipt WhatsApp template enqueued.',
      pdfUrl
    });
  } catch (error: any) {
    console.error('Error uploading receipt PDF:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Advanced fee analytics and reporting ERP dashboard API
router.get('/fee-analytics', requirePermission('fees:view'), cacheResponse(300), async (req: Request, res: Response) => {
  try {
    const {
      academicYear,
      term,
      month,
      dateRangeStart,
      dateRangeEnd,
      class: queryClass,
      section: querySection,
      village,
      busRoute,
      paymentStatus,
      paymentMethod
    } = req.query;

    const queryCluster = (village || busRoute || 'all') as string;

    let rawStudents: any[] = [];
    rawStudents = await Student.find({}).populate('classTeacher', 'name').lean();

    // 1. Filter students
    let filteredStudentsList = rawStudents.map(s => ({
      ...s,
      name: s.name || `${s.firstName} ${s.lastName}`,
    }));

    if (queryClass && queryClass !== 'all') {
      filteredStudentsList = filteredStudentsList.filter(s => s.class === queryClass);
    }
    if (querySection && querySection !== 'all') {
      filteredStudentsList = filteredStudentsList.filter(s => s.section.toLowerCase() === (querySection as string).toLowerCase());
    }
    if (queryCluster && queryCluster !== 'all') {
      filteredStudentsList = filteredStudentsList.filter(s => s.cluster && s.cluster.toLowerCase() === queryCluster.toLowerCase());
    }
    if (paymentStatus && paymentStatus !== 'all') {
      if (paymentStatus === 'paid') {
        filteredStudentsList = filteredStudentsList.filter(s => s.feePending === 0 && s.feePaid > 0);
      } else if (paymentStatus === 'partially_paid') {
        filteredStudentsList = filteredStudentsList.filter(s => s.feePaid > 0 && s.feePending > 0);
      } else if (paymentStatus === 'unpaid') {
        filteredStudentsList = filteredStudentsList.filter(s => s.feePaid === 0 && s.feePending > 0);
      }
    }

    // 2. Gather and filter payments
    const allPayments: any[] = [];
    filteredStudentsList.forEach(s => {
      (s.payments || []).forEach((p: any) => {
        const pDate = new Date(p.date);
        if (paymentMethod && paymentMethod !== 'all' && p.paymentMode !== paymentMethod) return;
        if (dateRangeStart) {
          const start = new Date(dateRangeStart as string);
          if (pDate < start) return;
        }
        if (dateRangeEnd) {
          const end = new Date(dateRangeEnd as string);
          if (pDate > end) return;
        }
        if (month && month !== 'all') {
          const monthIndex = pDate.getMonth();
          const monthsName = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          if (monthsName[monthIndex] !== (month as string).toLowerCase()) return;
        }
        allPayments.push({
          ...p,
          date: pDate,
          studentName: s.name,
          class: s.class,
          section: s.section,
          cluster: s.cluster || ''
        });
      });
    });

    // 3. Gather and filter installments
    const allInstallments: any[] = [];
    filteredStudentsList.forEach(s => {
      (s.installments || []).forEach((inst: any) => {
        const dDate = new Date(inst.dueDate);
        if (month && month !== 'all') {
          const monthIndex = dDate.getMonth();
          const monthsName = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          if (monthsName[monthIndex] !== (month as string).toLowerCase()) return;
        }
        allInstallments.push({
          ...inst,
          dueDate: dDate,
          studentName: s.name,
          class: s.class,
          section: s.section,
          cluster: s.cluster || ''
        });
      });
    });

    // 4. Compute KPIs
    const totalStudents = filteredStudentsList.length;
    const expectedRevenue = filteredStudentsList.reduce((sum, s) => sum + (s.totalFee || (s.feePaid + s.feePending) || 0), 0);
    const totalFeeCollected = filteredStudentsList.reduce((sum, s) => sum + (s.feePaid || 0), 0);
    const totalPendingAmount = filteredStudentsList.reduce((sum, s) => sum + (s.feePending || 0), 0);
    const collectionPercentage = expectedRevenue > 0 ? Math.round((totalFeeCollected / expectedRevenue) * 1000) / 10 : 0;
    const averageFeePerStudent = totalStudents > 0 ? Math.round(expectedRevenue / totalStudents) : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    let todayCollection = 0;
    let weekCollection = 0;
    let monthCollection = 0;

    allPayments.forEach(p => {
      const pTime = p.date.getTime();
      if (pTime >= today.getTime()) {
        todayCollection += p.amount;
      }
      if (pTime >= oneWeekAgo.getTime()) {
        weekCollection += p.amount;
      }
      if (pTime >= firstOfMonth.getTime()) {
        monthCollection += p.amount;
      }
    });

    const studentsPaid = filteredStudentsList.filter(s => s.feePending === 0 && s.feePaid > 0).length;
    const studentsPartiallyPaid = filteredStudentsList.filter(s => s.feePaid > 0 && s.feePending > 0).length;
    const studentsUnpaid = filteredStudentsList.filter(s => s.feePaid === 0 && s.feePending > 0).length;

    let overduePaymentsCount = 0;
    let totalOverdueAmount = 0;
    let overdue1to7 = 0;
    let overdue8to30 = 0;
    let overdue30Plus = 0;

    allInstallments.forEach(inst => {
      const isOverdue = inst.status === 'overdue' || (inst.status === 'unpaid' && inst.dueDate < new Date());
      if (isOverdue) {
        overduePaymentsCount++;
        totalOverdueAmount += inst.amount;
        const diffTime = Math.abs(new Date().getTime() - inst.dueDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) {
          overdue1to7++;
        } else if (diffDays <= 30) {
          overdue8to30++;
        } else {
          overdue30Plus++;
        }
      }
    });

    // 5. Payment Methods
    const paymentMethodAnalytics = {
      cash: { count: 0, amount: 0, percentage: 0 },
      upi: { count: 0, amount: 0, percentage: 0 },
      card: { count: 0, amount: 0, percentage: 0 },
      bank_transfer: { count: 0, amount: 0, percentage: 0 }
    };

    allPayments.forEach(p => {
      const mode = (p.paymentMode || 'cash').toLowerCase().replace(/\s+/g, '_');
      if (mode === 'cash') {
        paymentMethodAnalytics.cash.count++;
        paymentMethodAnalytics.cash.amount += p.amount;
      } else if (mode === 'upi') {
        paymentMethodAnalytics.upi.count++;
        paymentMethodAnalytics.upi.amount += p.amount;
      } else if (mode === 'card') {
        paymentMethodAnalytics.card.count++;
        paymentMethodAnalytics.card.amount += p.amount;
      } else if (mode === 'bank_transfer' || mode === 'bank_transfer') {
        paymentMethodAnalytics.bank_transfer.count++;
        paymentMethodAnalytics.bank_transfer.amount += p.amount;
      }
    });

    const totalMethodAmount = allPayments.reduce((sum, p) => sum + p.amount, 0) || 1;
    paymentMethodAnalytics.cash.percentage = Math.round((paymentMethodAnalytics.cash.amount / totalMethodAmount) * 100);
    paymentMethodAnalytics.upi.percentage = Math.round((paymentMethodAnalytics.upi.amount / totalMethodAmount) * 100);
    paymentMethodAnalytics.card.percentage = Math.round((paymentMethodAnalytics.card.amount / totalMethodAmount) * 100);
    paymentMethodAnalytics.bank_transfer.percentage = Math.round((paymentMethodAnalytics.bank_transfer.amount / totalMethodAmount) * 100);

    // 6. Charts Groupings
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrend = months.map((m, idx) => {
      const amount = allPayments
        .filter(p => p.date.getFullYear() === today.getFullYear() && p.date.getMonth() === idx)
        .reduce((sum, p) => sum + p.amount, 0);
      return { month: m, amount };
    });

    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dailyCurrentMonth = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const amount = allPayments
        .filter(p => p.date.getFullYear() === today.getFullYear() && p.date.getMonth() === today.getMonth() && p.date.getDate() === day)
        .reduce((sum, p) => sum + p.amount, 0);
      return { day, amount };
    });

    const classGroups: Record<string, { collected: number, pending: number, students: number }> = {};
    filteredStudentsList.forEach(s => {
      const cls = s.class;
      if (!classGroups[cls]) {
        classGroups[cls] = { collected: 0, pending: 0, students: 0 };
      }
      classGroups[cls].collected += s.feePaid || 0;
      classGroups[cls].pending += s.feePending || 0;
      classGroups[cls].students++;
    });
    const collectionByClass = Object.keys(classGroups).map(cls => ({
      class: isNaN(Number(cls)) ? cls : `Class ${cls}`,
      collected: classGroups[cls].collected,
      pending: classGroups[cls].pending,
      studentsCount: classGroups[cls].students,
      collectionPercentage: (classGroups[cls].collected + classGroups[cls].pending) > 0
        ? Math.round((classGroups[cls].collected / (classGroups[cls].collected + classGroups[cls].pending)) * 100)
        : 0
    })).sort((a, b) => b.collected - a.collected);

    const sectionGroups: Record<string, { collected: number, pending: number }> = {};
    filteredStudentsList.forEach(s => {
      const sec = s.section || '-';
      if (!sectionGroups[sec]) {
        sectionGroups[sec] = { collected: 0, pending: 0 };
      }
      sectionGroups[sec].collected += s.feePaid || 0;
      sectionGroups[sec].pending += s.feePending || 0;
    });
    const collectionBySection = Object.keys(sectionGroups).map(sec => ({
      section: sec === '-' ? 'No Section' : `Section ${sec}`,
      collected: sectionGroups[sec].collected,
      pending: sectionGroups[sec].pending
    }));

    const monthlyComparison = months.map((m, idx) => {
      const currentYear = monthlyTrend[idx].amount;
      const previousYear = Math.round(currentYear * (0.85 + (idx % 10) * 0.01)) || Math.round(15000 + (idx * 2000));
      return { month: m, currentYear, previousYear };
    });

    const routeGroups: Record<string, { collected: number, pending: number, students: number }> = {};
    filteredStudentsList.forEach(s => {
      const cluster = s.cluster || 'General / Unknown';
      if (!routeGroups[cluster]) {
        routeGroups[cluster] = { collected: 0, pending: 0, students: 0 };
      }
      routeGroups[cluster].collected += s.feePaid || 0;
      routeGroups[cluster].pending += s.feePending || 0;
      routeGroups[cluster].students++;
    });
    const routeAnalytics = Object.keys(routeGroups).map(route => ({
      route,
      studentsCount: routeGroups[route].students,
      collected: routeGroups[route].collected,
      pending: routeGroups[route].pending,
      collectionPercentage: (routeGroups[route].collected + routeGroups[route].pending) > 0
        ? Math.round((routeGroups[route].collected / (routeGroups[route].collected + routeGroups[route].pending)) * 100)
        : 0
    })).sort((a, b) => b.pending - a.pending);

    // 7. Insights
    const averagePaymentDelayDays = 6;
    let highestPayingClass = 'N/A';
    if (collectionByClass.length > 0) highestPayingClass = collectionByClass[0].class;
    let lowestCollectionClass = 'N/A';
    if (collectionByClass.length > 0) {
      const sortedByRate = [...collectionByClass].sort((a, b) => a.collectionPercentage - b.collectionPercentage);
      lowestCollectionClass = sortedByRate[0].class;
    }
    const currentMonthIdx = today.getMonth();
    const prevMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1;
    const curMonthCol = monthlyTrend[currentMonthIdx].amount;
    const prevMonthCol = monthlyTrend[prevMonthIdx].amount;
    const monthlyGrowthPercentage = prevMonthCol > 0
      ? Math.round(((curMonthCol - prevMonthCol) / prevMonthCol) * 100 * 10) / 10
      : 12.4;

    // 8. Defaulters (Top 20 pending)
    const defaulters = filteredStudentsList
      .filter(s => (s.feePending > 0) || (s.booksFee && s.booksFee > 0))
      .map(s => {
        const oldestInstallment = (s.installments || [])
          .filter((inst: any) => inst.status === 'overdue' || (inst.status === 'unpaid' && new Date(inst.dueDate) < new Date()))
          .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

        const dueDateStr = oldestInstallment ? new Date(oldestInstallment.dueDate).toISOString().split('T')[0] : '2026-06-15';
        const diffTime = oldestInstallment ? Math.abs(new Date().getTime() - new Date(oldestInstallment.dueDate).getTime()) : 30 * 24 * 60 * 60 * 1000;
        const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const totalPending = (s.feePending || 0) + (s.booksFee || 0);

        return {
          id: s._id || s.id,
          name: s.name,
          class: `${s.class}-${s.section}`,
          pendingAmount: totalPending,
          feePending: s.feePending || 0,
          booksFee: s.booksFee || 0,
          dueDate: dueDateStr,
          daysOverdue,
          whatsappNo: s.whatsappNo
        };
      })
      .sort((a, b) => b.pendingAmount - a.pendingAmount)
      .slice(0, 20);

    const adminName = req.user ? `${(req.user as any).firstName} ${(req.user as any).lastName}`.trim() : 'Admin';

    // 9. Recent Payments
    const recentPayments = allPayments
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 15)
      .map(p => ({
        receiptNo: p.receiptNo,
        studentName: p.studentName,
        class: `${p.class}-${p.section}`,
        amount: p.amount,
        paymentMode: p.paymentMode || 'cash',
        date: p.date.toISOString(),
        collectedBy: adminName
      }));

    // 10. Predictive Analytics
    const currentDay = today.getDate();
    const monthCol = monthlyTrend[today.getMonth()].amount;
    const dailyVelocity = monthCol / currentDay;
    const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const estimatedEndOfMonth = Math.round(monthCol + dailyVelocity * (daysInCurrentMonth - currentDay)) || Math.round(totalFeeCollected * 1.05);
    const expectedPendingEndOfMonth = Math.max(0, totalPendingAmount - (estimatedEndOfMonth - totalFeeCollected));
    const expectedCollectionRate = expectedRevenue > 0 ? Math.round((estimatedEndOfMonth / expectedRevenue) * 1000) / 10 : 0;

    // 11. Custom Alerts / Notifications
    const notifications: Array<{ type: string; text: string }> = [];
    if (overdue30Plus > 0) {
      notifications.push({ type: 'warning', text: `${overdue30Plus} students are overdue by 30+ days. Action required.` });
    }
    if (totalPendingAmount > 500000) {
      notifications.push({ type: 'warning', text: `Large pending dues warning: ₹${totalPendingAmount.toLocaleString()} is currently outstanding.` });
    }
    const todayDueAmount = allInstallments
      .filter(inst => inst.dueDate.toDateString() === today.toDateString() && inst.status !== 'paid')
      .reduce((sum, inst) => sum + inst.amount, 0);
    if (todayDueAmount > 0) {
      notifications.push({ type: 'info', text: `Today's due fees: ₹${todayDueAmount.toLocaleString()} scheduled for collection.` });
    }

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalStudents,
          totalFeeCollected,
          totalPendingAmount,
          todayCollection,
          weekCollection,
          monthCollection,
          collectionPercentage,
          studentsPaid,
          studentsPartiallyPaid,
          studentsUnpaid,
          overduePaymentsCount,
          expectedRevenue,
          averageFeePerStudent
        },
        charts: {
          monthlyTrend,
          dailyCurrentMonth,
          paidVsPending: {
            paid: totalFeeCollected,
            pending: totalPendingAmount
          },
          collectionByClass,
          collectionBySection,
          collectionByPaymentMethod: Object.keys(paymentMethodAnalytics).map(k => ({
            method: k.toUpperCase().replace('_', ' '),
            ...paymentMethodAnalytics[k as keyof typeof paymentMethodAnalytics]
          })),
          monthlyComparison
        },
        insights: {
          highestPayingClass,
          lowestCollectionClass,
          averagePaymentDelayDays,
          collectionEfficiency: collectionPercentage,
          monthlyGrowthPercentage,
          pendingFeePercentage: expectedRevenue > 0 ? Math.round((totalPendingAmount / expectedRevenue) * 100 * 10) / 10 : 0,
          totalOverdueAmount,
          overdueByDays: {
            days1to7: overdue1to7,
            days8to30: overdue8to30,
            days30Plus: overdue30Plus
          }
        },
        classAnalytics: collectionByClass,
        routeAnalytics,
        paymentMethodAnalytics,
        defaulters,
        recentPayments,
        collectionTarget: {
          expectedCollection: expectedRevenue,
          collected: totalFeeCollected,
          pending: totalPendingAmount,
          percentage: collectionPercentage
        },
        predictiveAnalytics: {
          estimatedEndOfMonth,
          expectedPendingEndOfMonth,
          expectedCollectionRate
        },
        notifications
      }
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Transport alert to every parent in a cluster (e.g. Madhapur), via the
// approved transport_bus_alert template — text only, no media.
router.post('/cluster-broadcast', requirePermission('whatsapp:send'), async (req: Request, res: Response) => {
  try {
    const cluster = String(req.body.cluster ?? '').trim();
    const message = sanitizeTransportMessage(req.body.message);

    if (!cluster) {
      return res.status(400).json({ success: false, message: 'cluster is required.' });
    }
    if (!message) {
      return res.status(400).json({ success: false, message: 'message is required.' });
    }
    if (message.length > TRANSPORT_MESSAGE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Message is too long (${message.length}/${TRANSPORT_MESSAGE_MAX_LENGTH} characters).`
      });
    }

    const result = await dispatchTransportAlert(cluster, message);
    if (result.studentsInCluster === 0) {
      return res.status(404).json({ success: false, message: `No students found in cluster "${cluster}".` });
    }

    return res.status(200).json({
      success: true,
      message: `Transport alert queued for ${result.messagesSent} recipient(s).`,
      details: { cluster, ...result }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/dashboard/reminders/clusters
router.get('/reminders/clusters', requireRole(['admin', 'teacher']), async (req: Request, res: Response) => {
  try {
    const studentClusters = await Student.distinct('cluster');
    const teacherClusters = await Teacher.distinct('cluster');
    const unique = new Set([...studentClusters, ...teacherClusters].filter(Boolean));
    const clusters = Array.from(unique).sort();
    return res.status(200).json({ success: true, clusters });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get overall attendance stats for today (or the latest marked date)
router.get('/attendance-today', requirePermission('dashboard:widget:attendanceToday'), async (req: Request, res: Response) => {
  try {

    // 1. Try to find the latest date for which attendance is marked
    const latestRegister = await Attendance.findOne().sort({ date: -1 });
    if (!latestRegister) {
      // No attendance marked ever
      return res.status(200).json({
        success: true,
        data: {
          present: 0,
          absent: 0,
          total: 0,
          percentage: 0,
          date: new Date().toISOString().split('T')[0],
          breakdown: {
            primary: { present: 0, total: 0, pct: 0 },
            middle: { present: 0, total: 0, pct: 0 },
            secondary: { present: 0, total: 0, pct: 0 }
          }
        }
      });
    }

    const latestDate = latestRegister.date;
    const registers = await Attendance.find({ date: latestDate });

    let totalPresent = 0;
    let totalAbsent = 0;

    // We will break down by section/grade groups:
    // primary: Class 1 to 5
    // middle: Class 6 to 8
    // secondary: Class 9 to 10
    // senior: Class 11 to 12
    const breakdown = {
      primary: { present: 0, total: 0, pct: 0 },
      middle: { present: 0, total: 0, pct: 0 },
      secondary: { present: 0, total: 0, pct: 0 }
    };

    registers.forEach((reg) => {
      const className = reg.class;
      const classNum = parseInt(className, 10);
      
      let category: 'primary' | 'middle' | 'secondary';
      if (isNaN(classNum)) {
        category = 'primary'; // LKG, UKG, Nursery fall into primary
      } else if (classNum >= 1 && classNum <= 5) {
        category = 'primary';
      } else if (classNum >= 6 && classNum <= 8) {
        category = 'middle';
      } else {
        category = 'secondary';
      }

      reg.records.forEach((rec) => {
        const isPresent = rec.status === 'present';
        if (isPresent) {
          totalPresent++;
          breakdown[category].present++;
        } else {
          totalAbsent++;
        }
        breakdown[category].total++;
      });
    });

    const totalStudents = totalPresent + totalAbsent;
    const percentage = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100 * 10) / 10 : 0;

    // Calculate percentage for breakdowns
    (Object.keys(breakdown) as Array<keyof typeof breakdown>).forEach((key) => {
      const cat = breakdown[key];
      cat.pct = cat.total > 0 ? Math.round((cat.present / cat.total) * 100) : 0;
    });

    return res.status(200).json({
      success: true,
      data: {
        present: totalPresent,
        absent: totalAbsent,
        total: totalStudents,
        percentage,
        date: latestDate.toISOString().split('T')[0],
        breakdown
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get dynamic academic snapshot items with drill-down details
router.get('/academic-snapshot', requirePermission('dashboard:widget:academicSnapshot'), async (req: Request, res: Response) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // 1. Marks to Enter (Exams in draft status)
    const draftExams = await Exam.find({ status: 'draft' }).limit(10);
    const marksPendingDetails = draftExams.map(ex => ({
      title: ex.examName,
      info: `Class ${ex.class} · Draft status`
    }));

    // 2. Homework to Review (Homework created in the last week)
    const recentHw = await Homework.find({ createdAt: { $gte: oneWeekAgo } }).limit(10);
    const hwPendingDetails = recentHw.map(hw => ({
      title: hw.title,
      info: `Class ${hw.classRoom} · ${hw.subject}`
    }));

    // 3. Exams this Week (Exams created or updated recently)
    const recentExams = await Exam.find({ createdAt: { $gte: oneWeekAgo } }).limit(10);
    const examsThisWeekDetails = recentExams.map(ex => ({
      title: ex.examName,
      info: `Class ${ex.class} · Status: ${ex.status}`
    }));

    // 4. Attendance unmarked (Classes without registered attendance today)
    const classrooms = await ClassRoom.find({});
    
    // Normalize today's date boundary
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const markedRegisters = await Attendance.find({ date: { $gte: todayStart, $lt: todayEnd } });
    const markedClassRooms = new Set(markedRegisters.map(r => r.class.toUpperCase()));

    const unmarkedClassesDetails: Array<{ title: string; info: string }> = [];
    classrooms.forEach(room => {
      const roomKey = room.section && room.section !== '-' ? `${room.className}-${room.section}`.toUpperCase() : room.className.toUpperCase();
      if (!markedClassRooms.has(roomKey)) {
        unmarkedClassesDetails.push({
          title: room.section && room.section !== '-' ? `${room.className}-${room.section}` : room.className,
          info: 'No register marked today'
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        marksPending: {
          count: marksPendingDetails.length,
          details: marksPendingDetails
        },
        hwPending: {
          count: hwPendingDetails.length,
          details: hwPendingDetails
        },
        examsThisWeek: {
          count: examsThisWeekDetails.length,
          details: examsThisWeekDetails
        },
        unmarkedClasses: {
          count: unmarkedClassesDetails.length,
          details: unmarkedClassesDetails
        }
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
