import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission } from '../../../middlewares/permission.middleware';
import { User } from '../../../models/user.model';
import { PhoneVerification } from '../../../models/phoneVerification.model';
import { normalizePhone } from '../../../services/whatsapp.service';
import { queueTemplateNotification } from '../../../config/queue';

// Helper: SHA-256 hash (same pattern used in auth.controller.ts)
const hashOTP = (otp: string): string =>
  crypto.createHash('sha256').update(otp).digest('hex');

const router = Router();

router.post('/verify-phone/send', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (!cleanPhone) {
      return res.status(400).json({ success: false, message: 'Phone number is invalid.' });
    }

    // Verify phone uniqueness across all users
    const phoneResult = normalizePhone(cleanPhone);
    const queryPhone = phoneResult.ok && phoneResult.e164 ? phoneResult.e164 : cleanPhone;
    const queryConditions: any[] = [
      { phone: cleanPhone },
      { phone: queryPhone }
    ];
    if (cleanPhone.length >= 10) {
      const tenDigits = cleanPhone.slice(-10);
      queryConditions.push({ phone: new RegExp(tenDigits + '$') });
    }
    const existingUser = await User.findOne({ $or: queryConditions });
    if (existingUser) {
      return res.status(400).json({ success: false, message: `Phone number ${phone} is already registered to another user.` });
    }

    // Use cryptographically secure random bytes for OTP generation
    const otp = String(parseInt(crypto.randomBytes(3).toString('hex'), 16) % 900000 + 100000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Print OTP to terminal for development — do NOT send in API response
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] Phone Verification OTP for ${cleanPhone}: ${otp}\n`);
    }

    if (!phoneResult.ok || !phoneResult.e164) {
      return res.status(400).json({ success: false, message: `Invalid phone format: ${phoneResult.reason || 'unrecognized format'}.` });
    }

    // Hash OTP before saving — plain text OTPs must never be stored in DB
    const hashedOTP = hashOTP(otp);

    // Update or insert OTP
    await PhoneVerification.deleteOne({ phone: cleanPhone });
    await PhoneVerification.create({
      phone: cleanPhone,
      otp: hashedOTP,
      verified: false,
      expiresAt
    });

    // Send via the approved o_auth AUTHENTICATION template
    try {
      const result = await queueTemplateNotification('auth.otp', {
        to: phoneResult.e164,
        params: { code: otp },
        dedupeKey: `otp:phone-verify:${cleanPhone}:${otp}`
      });
      if (!result.queued) console.error(`[Phone Verification WhatsApp] Not queued: ${result.reason}`);
    } catch (err: any) {
      console.error('[Phone Verification WhatsApp Error]:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Verification OTP has been sent via WhatsApp.'
      // otpCode intentionally omitted — OTP is in terminal log + WhatsApp only
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/verify-phone/confirm', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP code are required.' });
    }

    const cleanPhone = phone.trim().replace(/\D/g, '');
    const verification = await PhoneVerification.findOne({ phone: cleanPhone });

    if (!verification) {
      return res.status(400).json({ success: false, message: 'Verification session expired or not found.' });
    }

    if (verification.expiresAt < new Date()) {
      await PhoneVerification.deleteOne({ phone: cleanPhone });
      return res.status(400).json({ success: false, message: 'Verification code has expired.' });
    }

    // Hash incoming OTP and compare against the stored hash
    if (verification.otp !== hashOTP(otp.trim())) {
      return res.status(400).json({ success: false, message: 'Incorrect verification code.' });
    }

    verification.verified = true;
    await verification.save();

    return res.status(200).json({ success: true, message: 'Phone number verified successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
