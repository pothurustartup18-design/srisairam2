import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getNextEmployeeId } from '../../../utils/sequence';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission } from '../../../middlewares/permission.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { Student } from '../../../models/student.model';
import { User } from '../../../models/user.model';
import { Teacher } from '../../../models/teacher.model';
import { PhoneVerification } from '../../../models/phoneVerification.model';
import { clearCache } from '../../../middlewares/cache.middleware';
import redisClient from '../../../config/redis';
import { getEffectivePermissions } from '../../../services/permissionEngine';
import { sendTemplateNotificationSync } from '../../../config/queue';
import { retryDbWrite } from '../../../utils/retry';
import { isDuplicateKeyError, duplicateKeyField } from '../../../utils/mongoErrors';

const router = Router();

router.post('/create-admin', requireRole(['admin']), requirePermission('settings:manage'), audit('settings:create-admin'), async (req: Request, res: Response) => {
  try {
    const { 
      currentAdminPassword, 
      newAdminEmail, 
      newAdminFirstName, 
      newAdminLastName, 
      newAdminPhone,
      employeeId,
      role, 
      permissions 
    } = req.body;

    if (!currentAdminPassword || !newAdminFirstName || !newAdminLastName || !newAdminPhone) {
      return res.status(400).json({ success: false, message: 'First name, last name, phone, and authorizer password are required.' });
    }

    const selectedRole = role || 'teacher';

    // 1. Verify password of current logged-in admin
    const currentAdminId = (req.user as any)?._id;

    // DB mode validation
    const currentAdmin = await User.findById(currentAdminId).select('+password');
    if (!currentAdmin) {
      if (currentAdminId) {
        return res.status(404).json({ success: false, message: 'Current admin profile not found.' });
      }
    } else {
      const isPasswordValid = await currentAdmin.comparePassword(currentAdminPassword);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Incorrect current admin password.' });
      }
    }

    // Verify phone number was verified via WhatsApp OTP
    const cleanPhone = newAdminPhone.trim().replace(/\D/g, '');
    const verification = await PhoneVerification.findOne({ phone: cleanPhone, verified: true });
    if (!verification) {
      return res.status(400).json({ success: false, message: 'Phone number has not been verified. Please send and confirm OTP first.' });
    }

    // Phone numbers and email addresses are intentionally not required to be
    // unique across employees — a school may have several admin/teacher
    // accounts sharing one front-desk/notification phone number or a shared
    // contact email. Each account is still distinguished by its own unique
    // employeeId/username.

    // 2. Resolve/Auto-generate unique employeeId
    let finalEmpId = employeeId ? employeeId.trim().toUpperCase() : undefined;
    if (finalEmpId) {
      const existingUserByEmpId = await User.findOne({ employeeId: finalEmpId });
      if (existingUserByEmpId) {
        return res.status(400).json({ success: false, message: `Employee ID ${finalEmpId} is already in use.` });
      }
    } else {
      finalEmpId = await getNextEmployeeId();
    }

    // 3. Auto-generate secure temp password and username based on Employee ID
    const generatedPassword = crypto.randomBytes(4).toString('hex'); // 8 characters
    const normalizedUsername = (finalEmpId as string).toLowerCase();
    const fullName = `${newAdminFirstName.trim()} ${newAdminLastName.trim()}`.trim();

    // 4. Reservation phase. The findOne checks above are a fast, friendly
    //    pre-check but are NOT atomic — two concurrent requests can both pass
    //    them before either writes anything. The real guard is the unique
    //    index on User.username / User.email / User.employeeId, so the actual
    //    creation happens HERE, now, atomically — but with `isActive: false`
    //    (the same flag the login gate in config/passport.ts already checks),
    //    so nothing usable exists yet. This closes the race deterministically:
    //    a losing concurrent request fails right here on a duplicate-key
    //    error, BEFORE any WhatsApp message is ever sent for it.
    let newUser;
    try {
      newUser = await User.create({
        username: normalizedUsername,
        email: newAdminEmail ? newAdminEmail.trim().toLowerCase() : undefined,
        password: generatedPassword,
        role: selectedRole,
        firstName: newAdminFirstName.trim(),
        lastName: newAdminLastName.trim(),
        phone: newAdminPhone.trim(),
        isActive: false, // reservation only — flipped true after WhatsApp succeeds
        mustChangePassword: true,
        employeeId: finalEmpId,
        permissions: permissions || undefined,
        createdBy: currentAdminId
      });
    } catch (err: any) {
      if (isDuplicateKeyError(err)) {
        const field = duplicateKeyField(err);
        return res.status(400).json({
          success: false,
          message:
            field === 'email'
              ? 'Email address is already in use.'
              : field === 'employeeId'
                ? `Employee ID ${finalEmpId} is already in use.`
                : `Username ${normalizedUsername} is already in use.`
        });
      }
      throw err;
    }

    // 5. Send phase — synchronous, bypasses BullMQ/Redis, waits for the real
    //    Graph API result (including whatsapp.service's own in-process retry
    //    for transient errors). requireLiveSend guards against a misconfigured
    //    production deploy silently running in WhatsApp "simulation mode".
    const sendResult = await sendTemplateNotificationSync(
      'staff.credentials_new',
      {
        to: newAdminPhone,
        params: {
          name_en: fullName,
          employee_id_en: finalEmpId as string,
          temporary_pwd_en: generatedPassword,
          name_te: fullName,
          employee_id_te: finalEmpId as string,
          temporary_pwd_te: generatedPassword
        },
        dedupeKey: `staff-credentials-new:${finalEmpId}`
      },
      { requireLiveSend: true }
    );

    if (!sendResult.success) {
      console.error(`[WhatsApp] staff_credentials_new not accepted by Meta for ${newAdminPhone}: ${sendResult.reason}`);
      // Compensate: the reservation was never activated/usable, so removing it
      // leaves the system exactly as if this request had never happened.
      await User.deleteOne({ _id: newUser._id }).catch(() => {});
      return res.status(502).json({
        success: false,
        userCreated: false,
        whatsappSent: false,
        message: 'WhatsApp message could not be sent. User was not created.'
      });
    }

    // 6. Activation phase. WhatsApp has already, irreversibly, delivered the
    //    credentials. This write now MUST succeed for the account to become
    //    usable. A transient Mongo blip is retried a few times (safe — setting
    //    isActive true is idempotent). If it still fails, we do not pretend to
    //    roll anything back (the message is already out) — we surface the
    //    ambiguous state honestly instead of silently leaving a stuck account.
    try {
      await retryDbWrite(async () => {
        newUser.isActive = true;
        await newUser.save();
      });
    } catch (err: any) {
      console.error(
        `[CRITICAL][WhatsApp/DB mismatch] staff_credentials_new was accepted by Meta for ${fullName} (${newAdminPhone}, ` +
          `employeeId ${finalEmpId}, userId ${newUser._id}) but activating the account failed after retries: ${err.message}. ` +
          `The credential message was already delivered — do NOT retry this request. This account needs manual investigation.`
      );
      return res.status(502).json({
        success: false,
        userCreated: 'unknown',
        whatsappSent: true,
        message: 'Credentials were sent via WhatsApp, but the account could not be finalized. Do not retry — contact a system administrator.'
      });
    }

    // Invalidate Redis profile cache
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${newUser._id}`).catch(() => {});
    }

    // 7. If role is 'teacher', seed matching Teacher profile for dashboard compatibility
    if (selectedRole === 'teacher') {
      try {
        const nextEmpId = finalEmpId || `EMP-${Math.floor(100 + Math.random() * 900)}`;
        await Teacher.create({
          userId: newUser._id,
          employeeId: nextEmpId,
          name: `${newUser.firstName} ${newUser.lastName}`.trim(),
          phone: newUser.phone,
          email: newUser.email || '',
          assignedClass: '10-A', // Boilerplate default
          subjects: [],
          teachingClasses: [],
          status: 'active'
        });
      } catch (err: any) {
        console.error('[Employee Registration Seeding Teacher Error]:', err.message);
      }
    }

    // Credentials are delivered via WhatsApp only — do not log plaintext passwords to console in production

    // Clean up the verified OTP document only after the account is fully created
    await PhoneVerification.deleteOne({ phone: cleanPhone });

    return res.status(201).json({
      success: true,
      userCreated: true,
      whatsappSent: true,
      message: `Employee account for ${newUser.firstName} ${newUser.lastName} (${newUser.employeeId || newUser.username}) created successfully. Credentials were sent to the registered WhatsApp number.`,
      credentials: {
        username: newUser.employeeId || newUser.username
      }
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/employees', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {

    const employees = await User.find({
      role: { $in: ['other', 'admin'] },
      _id: { $ne: (req.user as any)?._id }
    })
      .select('username email firstName lastName phone role permissions employeeId isActive')
      .lean();

    const withEffectivePermissions = await Promise.all(
      employees.map(async (emp) => ({
        ...emp,
        effectivePermissions: await getEffectivePermissions(emp as any)
      }))
    );

    return res.status(200).json({ success: true, data: withEffectivePermissions });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/employees/:id/permissions', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { permissions } = req.body;
    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'Permissions array is required.' });
    }

    const user = await User.findOne({ _id: req.params.id, role: 'other' });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Custom employee user not found.' });
    }

    user.permissions = permissions;
    await user.save();

    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${user._id}`).catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'Permissions updated successfully.', data: user });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/employees/:id/employee-id', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.body;
    if (!employeeId || typeof employeeId !== 'string' || employeeId.trim() === '') {
      return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }

    const newEmpId = employeeId.trim().toUpperCase();

    const user = await User.findOne({ _id: req.params.id, role: 'other' });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Custom employee user not found.' });
    }

    // Check if employeeId is unique
    const existing = await User.findOne({ employeeId: newEmpId, _id: { $ne: user._id } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Employee ID is already in use.' });
    }

    user.employeeId = newEmpId;
    user.username = newEmpId.toLowerCase(); // keep username synced
    await user.save();

    // Sync with Teacher profile if it exists
    await Teacher.findOneAndUpdate({ userId: user._id }, { $set: { employeeId: newEmpId } });

    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${user._id}`).catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'Employee ID updated successfully.', data: user });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/employees/:id', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, phone, role, permissions, employeeId } = req.body;
    if (!firstName || !lastName || !phone || !role) {
      return res.status(400).json({ success: false, message: 'First name, last name, phone, and role are required.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Employee user not found.' });
    }

    // Email is a shared contact field, not a unique login identifier — no
    // uniqueness check. employeeId (and therefore username) still must be unique.
    if (employeeId) {
      const cleanId = employeeId.trim().toUpperCase();
      const existingEmpId = await User.findOne({ employeeId: cleanId, _id: { $ne: user._id } });
      if (existingEmpId) return res.status(400).json({ success: false, message: 'Employee ID is already in use.' });
      user.employeeId = cleanId;
      user.username = cleanId.toLowerCase();
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.email = email ? email.trim().toLowerCase() : undefined;
    user.phone = phone.trim();
    user.role = role;
    if (permissions) user.permissions = permissions;
    await user.save();

    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${user._id}`).catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'Employee details updated successfully.', data: user });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/employees/:id', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Employee user not found.' });
    }

    // Delete matching Teacher if exists
    const teacher = await Teacher.findOne({ userId: user._id });
    if (teacher) {
      // De-associate matching students
      await Student.updateMany({ classTeacher: teacher._id }, { $unset: { classTeacher: "" } });
      await Teacher.deleteOne({ _id: teacher._id });
    }

    // Delete user
    await User.deleteOne({ _id: user._id });

    // Clear dashboard cache
    await clearCache('/api/dashboard/*');

    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${user._id}`).catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'Employee deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/employees/:id/toggle-lock', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { status } = req.body; // 'active' | 'inactive'
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Employee user not found.' });
    }

    user.isActive = (status === 'active');
    await user.save();

    // Also sync status on Teacher if exists
    await Teacher.findOneAndUpdate({ userId: user._id }, { $set: { status } });

    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${user._id}`).catch(() => {});
    }

    return res.status(200).json({ success: true, message: `Employee login access updated to ${status} successfully.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
