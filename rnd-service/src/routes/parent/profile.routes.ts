import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Student } from '../../models/student.model';
import { User } from '../../models/user.model';
import { queueTemplateNotification } from '../../config/queue';
import { normalizePhone } from '../../services/whatsapp.service';
import { issuePasswordChangeOtp, discardPasswordChangeOtp } from '../../services/passwordChangeOtp.service';

const router = Router();

// ─── Self-service: logged-in parent's own WhatsApp contact numbers ─────────
// Scoped entirely by req.user.studentId — there is no :id param, so a parent
// can only ever read/update their own linked student record.

// GET /api/parent/profile — fetch the parent's own editable fields
router.get('/', async (req: Request, res: Response) => {
  try {
    const reqUser = req.user as any;
    if (reqUser?.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'Only parents can access this endpoint.' });
    }
    if (!reqUser.studentId) {
      return res.status(404).json({ success: false, message: 'No student record linked to this account.' });
    }
    const student = await Student.findById(reqUser.studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }
    return res.status(200).json({
      success: true,
      data: {
        whatsappNo: student.whatsappNo || '',
        motherWhatsappNo: student.motherWhatsappNo || '',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/parent/profile — update only whatsappNo / motherWhatsappNo
router.put('/', async (req: Request, res: Response) => {
  try {
    const reqUser = req.user as any;
    if (reqUser?.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'Only parents can update this endpoint.' });
    }
    if (!reqUser.studentId) {
      return res.status(404).json({ success: false, message: 'No student record linked to this account.' });
    }

    const { whatsappNo, motherWhatsappNo } = req.body;
    const update: Record<string, any> = {};
    if (whatsappNo !== undefined) {
      if (!String(whatsappNo).trim()) {
        return res.status(400).json({ success: false, message: 'WhatsApp number cannot be empty.' });
      }
      update.whatsappNo = whatsappNo;
    }
    if (motherWhatsappNo !== undefined) update.motherWhatsappNo = motherWhatsappNo;

    const student = await Student.findByIdAndUpdate(reqUser.studentId, { $set: update }, { new: true, runValidators: true });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp numbers updated successfully.',
      data: {
        whatsappNo: student.whatsappNo || '',
        motherWhatsappNo: student.motherWhatsappNo || '',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Password-change OTP ──────────────────────────────────────────────────
// POST /api/parent/profile/send-password-otp — WhatsApp a one-time code to the
// parent's registered number. POST /api/auth/change-password verifies and
// consumes it. The code is never returned in the response or written to logs.
const sendOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Per account, not per IP: one parent behind a shared school/mobile NAT must not be throttled by others.
  keyGenerator: (req: Request) => String((req.user as any)?._id ?? 'anon'),
  validate: false,
  message: { success: false, message: 'Too many OTP requests. Please try again later.' }
});

router.post('/send-password-otp', sendOtpLimiter, async (req: Request, res: Response) => {
  try {
    const reqUser = req.user as any;
    if (reqUser?.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'Only parents can request this OTP.' });
    }
    const user = await User.findById(reqUser._id).select('phone isActive');
    if (!user || user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Account is not active.' });
    }
    const phoneResult = user.phone ? normalizePhone(user.phone) : null;
    if (!phoneResult || !phoneResult.ok || !phoneResult.e164) {
      return res.status(400).json({ success: false, message: 'No valid registered WhatsApp number found for this account.' });
    }

    const issued = await issuePasswordChangeOtp(user._id as any, phoneResult.e164);
    if (!issued.ok) {
      res.setHeader('Retry-After', String(issued.retryAfterSeconds));
      return res.status(429).json({ success: false, message: `Please wait ${issued.retryAfterSeconds}s before requesting another OTP.` });
    }

    let queued = false;
    try {
      const result = await queueTemplateNotification('auth.otp', {
        to: phoneResult.e164,
        params: { code: issued.code },
        dedupeKey: `otp:parent-password-change:${issued.id}`
      });
      queued = result.queued;
      if (!queued) console.error(`[Parent Password OTP] Not queued for user ${user._id}: ${result.reason}`);
    } catch (waErr: any) {
      console.error('[Parent Password OTP] WhatsApp dispatch error:', waErr.message);
    }
    if (!queued) {
      await discardPasswordChangeOtp(issued.id);
      return res.status(503).json({ success: false, message: 'Could not send the WhatsApp OTP right now. Please try again.' });
    }

    const digits = user.phone!.replace(/D/g, '');
    return res.status(200).json({
      success: true,
      message: `A 6-digit OTP has been sent to your WhatsApp number ending in ${digits.slice(-4)}.`,
      maskedPhone: `••••••${digits.slice(-4)}`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to send OTP.' });
  }
});

export default router;
