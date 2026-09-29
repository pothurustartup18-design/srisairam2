import { Router, Request, Response } from 'express';
import { SchoolProfile } from '../../models/schoolProfile.model';
import { User } from '../../models/user.model';
import { ProfileUpdateOTP } from '../../models/profileUpdateOTP.model';
import { authenticateJWT, requireRole } from '../../middlewares/auth.middleware';
import { queueTemplateNotification } from '../../config/queue';
import crypto from 'crypto';
import { emitToAll } from '../../config/socket';
import { getPresignedDownloadUrl } from '../../services/s3.service';
import { processSignatureImage, uploadPrincipalSignatureToS3, deletePrincipalSignatureFromS3 } from '../../services/signature.service';

const router = Router();

// Helper to get or initialize single SchoolProfile document
async function getOrCreateSchoolProfile() {
  let profile = await SchoolProfile.findOne();
  if (!profile) {
    profile = await SchoolProfile.create({});
  }
  return profile;
}

// ─── GET /api/school-profile (Fetch Current Settings) ─────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  try {
    const profile = await getOrCreateSchoolProfile();
    return res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Error fetching school profile' });
  }
});

// ─── PRINCIPAL SIGNATURE MANAGEMENT ENDPOINTS ──────────────────────────────

// GET /api/school-profile/principal-signature
router.get('/principal-signature', async (_req: Request, res: Response) => {
  try {
    const profile = await getOrCreateSchoolProfile();
    const pInfo = profile.principalInfo || {};

    if (!pInfo.signatureUrl) {
      return res.status(200).json({
        success: true,
        data: {
          principalName: pInfo.name || 'Dr. Principal Name',
          signatureUrl: null,
          signatureUploadedAt: null,
          signatureUpdatedAt: null,
        }
      });
    }

    let presignedUrl = pInfo.signatureUrl;
    if (pInfo.signatureUrl.includes('.amazonaws.com/')) {
      const s3Key = pInfo.signatureUrl.split('.amazonaws.com/')[1];
      if (s3Key) {
        presignedUrl = await getPresignedDownloadUrl(s3Key);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        principalName: pInfo.name || 'Dr. Principal Name',
        signatureUrl: presignedUrl,
        signatureUploadedAt: pInfo.signatureUploadedAt || null,
        signatureUpdatedAt: pInfo.signatureUpdatedAt || null,
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/school-profile/principal-signature
router.post('/principal-signature', authenticateJWT, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { signatureImage, principalName } = req.body;
    if (!signatureImage) {
      return res.status(400).json({ success: false, message: 'signatureImage base64 data is required.' });
    }

    const base64Data = signatureImage.includes(',') ? signatureImage.split(',')[1] : signatureImage;
    const inputBuffer = Buffer.from(base64Data, 'base64');

    const processed = await processSignatureImage(inputBuffer);
    const { url: presignedUrl, s3Key } = await uploadPrincipalSignatureToS3(processed.processedBuffer);

    const s3FullUrl = `https://${process.env.AWS_BUCKET_NAME || 'school-erp'}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${s3Key}`;
    const profile = await getOrCreateSchoolProfile();
    const now = new Date();

    profile.principalInfo = {
      name: principalName || profile.principalInfo?.name || 'Dr. Principal Name',
      signatureUrl: presignedUrl,
      signatureUploadedAt: profile.principalInfo?.signatureUploadedAt || now,
      signatureUpdatedAt: now
    };

    await profile.save();

    const { queueAssetOptimization } = require('../../config/queue');
    await queueAssetOptimization({
      assetType: 'signature',
      s3Key: s3Key,
      modelType: 'schoolProfile',
      modelId: profile._id.toString()
    });

    return res.status(200).json({
      success: true,
      message: "Principal's signature processed and uploaded successfully.",
      data: {
        principalName: profile.principalInfo.name,
        signatureUrl: presignedUrl,
        signatureUploadedAt: profile.principalInfo.signatureUploadedAt,
        signatureUpdatedAt: profile.principalInfo.signatureUpdatedAt
      }
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE /api/school-profile/principal-signature
router.delete('/principal-signature', authenticateJWT, requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    await deletePrincipalSignatureFromS3();

    const profile = await getOrCreateSchoolProfile();
    if (profile.principalInfo) {
      profile.principalInfo.signatureUrl = undefined;
      profile.principalInfo.signatureUploadedAt = undefined;
      profile.principalInfo.signatureUpdatedAt = undefined;
      await profile.save();
    }

    return res.status(200).json({
      success: true,
      message: "Principal signature deleted successfully."
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/school-profile (Update School Profile - Clean Atomic Update) ───
router.put('/', authenticateJWT, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { schoolInfo, contactInfo, address, academicConfig, communicationSettings } = req.body;
    
    const updateData: any = {};
    if (schoolInfo) updateData.schoolInfo = schoolInfo;
    if (contactInfo) updateData.contactInfo = contactInfo;
    if (address) updateData.address = address;
    if (academicConfig) updateData.academicConfig = academicConfig;
    if (communicationSettings) updateData.communicationSettings = communicationSettings;

    const profile = await SchoolProfile.findOneAndUpdate(
      {},
      { $set: updateData },
      { new: true, upsert: true, runValidators: true }
    );

    if (profile?.schoolInfo?.logo && (!profile.schoolInfo.logoOptimizedVersions || profile.schoolInfo.logoOptimizedVersions.size === 0)) {
      const { queueAssetOptimization } = require('../../config/queue');
      await queueAssetOptimization({
        assetType: 'logo',
        s3Key: profile.schoolInfo.logo,
        modelType: 'schoolProfile',
        modelId: profile._id.toString()
      });
    }

    // School branding is rendered by every signed-in client, so this one is
    // legitimately school-wide.
    emitToAll('school_profile_updated', profile);

    return res.status(200).json({
      success: true,
      message: 'School profile updated successfully',
      data: profile
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update school profile' });
  }
});

// ─── PUT /api/school-profile/admin-profile (Update Logged-in Admin) ─────────
router.put('/admin-profile', authenticateJWT, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.id || (req as any).user?._id;
    const { name, email, phone, profilePhoto, newPassword, currentPassword, otpCode } = req.body;

    const user = await User.findById(adminId).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Admin user not found' });
    }

    const initialName = `${user.firstName} ${user.lastName}`.trim();
    const isNameChanged = name && name.trim() !== initialName;
    const isEmailChanged = email && email !== user.email;
    const cleanInputPhone = phone !== undefined ? phone.replace(/\D/g, '') : undefined;
    const cleanDbPhone = user.phone ? user.phone.replace(/\D/g, '') : '';
    const isPhoneChanged = cleanInputPhone !== undefined && cleanInputPhone !== cleanDbPhone;
    const isPasswordChanged = !!newPassword;

    // OTP is only required for phone number or password changes
    const isProfileChanged = isPhoneChanged || isPasswordChanged;

    if (isProfileChanged) {
      if (!otpCode) {
        return res.status(400).json({ success: false, message: 'WhatsApp security OTP is required to save profile changes.' });
      }

      // If phone changed, OTP was sent to new number. Otherwise, it was sent to current number.
      const otpPhone = isPhoneChanged ? phone : user.phone;

      // Hash the incoming code using SHA-256
      const hashedOTP = crypto.createHash('sha256').update(otpCode.trim()).digest('hex');

      // Find validation code document
      const otpDoc = await ProfileUpdateOTP.findOne({
        userId: adminId,
        phone: otpPhone,
        otp: hashedOTP
      });

      if (!otpDoc) {
        return res.status(400).json({ success: false, message: 'Invalid or expired WhatsApp security OTP. Please request a new code.' });
      }

      if (otpDoc.expiresAt < new Date()) {
        await otpDoc.deleteOne().catch(() => {});
        return res.status(400).json({ success: false, message: 'Security OTP has expired. Please request a new code.' });
      }

      // Valid! Delete OTP document so it cannot be used again
      await otpDoc.deleteOne().catch(() => {});
    }

    if (name) {
      const parts = name.trim().split(' ');
      user.firstName = parts[0] || user.firstName;
      user.lastName = parts.slice(1).join(' ') || user.lastName;
    }
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (profilePhoto !== undefined) user.avatar = profilePhoto;

    // Handle Password Change (verifies both currentPassword and OTP)
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change password.' });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Incorrect current password.' });
      }
      user.password = newPassword;
    }

    await user.save();

    // Invalidate Redis session cache for immediate production sync
    try {
      const redisClient = require('../../config/redis').default;
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.del(`user:me:${user._id}`).catch(() => {});
      }
    } catch {
      // Ignored if Redis is offline
    }

    return res.status(200).json({
      success: true,
      message: 'Admin profile updated successfully',
      data: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update admin profile' });
  }
});

// ─── POST /api/school-profile/send-otp (Dispatch Security OTP via WhatsApp) ───
router.post('/send-otp', authenticateJWT, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.id || (req as any).user?._id;
    const { phone } = req.body;

    let targetPhone = phone;
    if (!targetPhone) {
      const user = await User.findById(adminId);
      targetPhone = user?.phone;
    }

    if (!targetPhone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    // Generate secure random 6-digit numeric OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOTP = crypto.createHash('sha256').update(otpCode).digest('hex');

    // Clean up any existing OTPs for this user & phone
    await ProfileUpdateOTP.deleteMany({ userId: adminId, phone: targetPhone });

    // Store in DB
    await ProfileUpdateOTP.create({
      userId: adminId,
      phone: targetPhone,
      otp: hashedOTP,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes validity
    });

    // Print OTP to terminal for development — do NOT send in API response
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] Admin Profile Update OTP for Admin user ${adminId} (${targetPhone}): ${otpCode}\n`);
    }

    // Dispatch via the approved o_auth AUTHENTICATION template
    const result = await queueTemplateNotification('auth.otp', {
      to: targetPhone,
      params: { code: otpCode },
      dedupeKey: `otp:admin-profile-update:${adminId}:${otpCode}`
    });
    if (!result.queued) console.error(`[Admin Profile OTP] Not queued for ${targetPhone}: ${result.reason}`);

    return res.status(200).json({
      success: true,
      message: `WhatsApp OTP ${result.queued ? 'sent' : 'could not be queued'} for ${targetPhone}`,
      sent: result.queued
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to dispatch WhatsApp OTP' });
  }
});

export default router;
