import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { isNativeClient, readRefreshToken, sessionDays, sessionSeconds, WEB_SESSION_DAYS } from '../utils/sessionPolicy';
import { User, IUser } from '../models/user.model';
import { RefreshToken } from '../models/refreshToken.model';
import { Teacher } from '../models/teacher.model';
import { Student } from '../models/student.model';
import { PasswordResetOTP } from '../models/passwordResetOTP.model';
import { getEffectivePermissions } from '../services/permissionEngine';
import { ALL_PERMISSIONS } from '../config/permissions';
import { queueTemplateNotification } from '../config/queue';
import { normalizePhone } from '../services/whatsapp.service';
import { verifyAndConsumePasswordChangeOtp } from '../services/passwordChangeOtp.service';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../config/secrets';

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ─── Password Validation ─────────────────────────────────────────────────────
// Rules: 6–32 characters, at least 1 letter + 1 number, blocks obvious passwords.
// Applied in resetPassword and changePassword controllers.
const BLOCKED_PASSWORDS = [
  '123456', '654321', 'password', '111111', '222222', '333333',
  '444444', '555555', '666666', '777777', '888888', '999999',
  'abcdef', 'qwerty', '123123', 'abc123', 'letmein', 'welcome1'
];

function validatePassword(password: string): string | null {
  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  if (password.length > 32) {
    return 'Password must not exceed 32 characters.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number (e.g. school24, harsha6).';
  }
  if (BLOCKED_PASSWORDS.includes(password.toLowerCase())) {
    return 'This password is too common. Please choose a different one.';
  }
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────

const accessTokenSecret = JWT_SECRET;
const refreshTokenSecret = JWT_REFRESH_SECRET;

// Helper to generate access token
const generateAccessToken = (user: IUser): string => {
  return jwt.sign(
    {
      sub: user._id,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username
    },
    accessTokenSecret,
    { expiresIn: '1h' }
  );
};

// Helper to generate refresh token
const generateRefreshToken = (user: IUser, days: number = WEB_SESSION_DAYS): string => {
  return jwt.sign(
    { sub: user._id },
    refreshTokenSecret,
    { expiresIn: sessionSeconds(days) }
  );
};

// 1. LOGIN CONTROLLER
export const login = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('local', { session: false }, async (err: any, user: IUser, info: any) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ success: false, message: info?.message || 'Authentication failed.' });
    }

    try {
      const accessToken = generateAccessToken(user);
      const days = sessionDays(req); // 30 for the mobile app, 7 for browsers
      const refreshToken = generateRefreshToken(user, days);

      // Save refresh token in Redis (with DB fallback)
      const hashedToken = hashToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      const redisClient = require('../config/redis').default;

      let storedInRedis = false;
      if (redisClient && redisClient.status === 'ready') {
        try {
          const ttlSeconds = sessionSeconds(days);
          await redisClient.setex(`session:refresh:${user._id}:${hashedToken}`, ttlSeconds, '1');
          storedInRedis = true;
          console.log(`[Redis] Saved active refresh token for user ${user._id}`);
        } catch (redisErr) {
          console.error('[Redis Refresh Token Save Error]:', redisErr);
        }
      }

      if (!storedInRedis && true) {
        await RefreshToken.create({
          userId: user._id,
          token: hashedToken,
          deviceInfo: req.headers['user-agent'],
          ipAddress: req.ip,
          expiresAt,
          isRevoked: false
        });
      }

      // Set cookie containing the refresh token
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // true in production
        sameSite: 'strict',
        maxAge: sessionSeconds(days) * 1000
      });

      // Update lastLogin in DB if connected
      await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

      // Fetch teacher/student if DB is connected
      let responseId = user._id;
      let assignedClass = undefined;
      let classTeacherOf = undefined;
      let studentName = undefined;
      let admissionNo = undefined;

      let teacherDoc: any = null;

      if (user.role === 'teacher') {
        const teacher = await Teacher.findOne({ userId: user._id });
        if (teacher) {
          teacherDoc = teacher;
          responseId = teacher._id;
          assignedClass = teacher.assignedClass;
          classTeacherOf = teacher.classTeacherOf;
        }
      } else if (user.role === 'parent') {
        const student = await Student.findById(user.studentId);
        if (student) {
          responseId = student._id;
          studentName = `${student.firstName} ${student.lastName}`.trim();
          admissionNo = student.admissionNo;
        }
      }

      const permissions = await getEffectivePermissions(user);

      // Return response
      return res.status(200).json({
        success: true,
        accessToken,
        // The app's WebView can't keep the SameSite=strict cookie, so it stores this itself.
        ...(isNativeClient(req) ? { refreshToken } : {}),
        user: {
          id: responseId,
          role: user.role,
          name: `${user.firstName} ${user.lastName}`.trim(),
          username: user.role === 'teacher' && teacherDoc ? teacherDoc.employeeId : (user.role === 'parent' && admissionNo ? admissionNo : user.username),
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          assignedClass,
          classTeacherOf,
          studentName,
          admissionNo,
          permissions,
          employeeId: user.employeeId,
          mustChangePassword: !!user.mustChangePassword
        }
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  })(req, res, next);
};

// 2. REFRESH TOKEN CONTROLLER
export const refresh = async (req: Request, res: Response) => {
  try {
    const refreshToken = readRefreshToken(req);

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token not found.' });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, refreshTokenSecret);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
    }

    const hashedToken = hashToken(refreshToken);
    const redisClient = require('../config/redis').default;
    let tokenExists = false;

    if (redisClient && redisClient.status === 'ready') {
      try {
        const exists = await redisClient.exists(`session:refresh:${decoded.sub}:${hashedToken}`);
        tokenExists = (exists === 1);
      } catch (redisErr) {
        console.error('[Redis Refresh Token Check Error]:', redisErr);
      }
    }

    let mongoTokenDoc = null;
    if (!tokenExists && true) {
      // Fallback: check MongoDB for active session
      mongoTokenDoc = await RefreshToken.findOne({ userId: decoded.sub, token: hashedToken, isRevoked: false });
      if (mongoTokenDoc) {
        if (mongoTokenDoc.expiresAt < new Date()) {
          await mongoTokenDoc.deleteOne();
          return res.status(401).json({ success: false, message: 'Refresh token has expired.' });
        }
        tokenExists = true;
      }
    }

    if (!tokenExists) {
      return res.status(401).json({ success: false, message: 'Refresh token is invalid, expired, or revoked.' });
    }

    // Get user details
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User is inactive or not found.' });
    }

    // Rotate tokens (generate new ones)
    const newAccessToken = generateAccessToken(user);
    const days = sessionDays(req);
    const newRefreshToken = generateRefreshToken(user, days);

    // Delete old token
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`session:refresh:${decoded.sub}:${hashedToken}`).catch(() => {});
    }
    if (mongoTokenDoc) {
      await mongoTokenDoc.deleteOne().catch(() => {});
    } else {
      await RefreshToken.deleteOne({ userId: decoded.sub, token: hashedToken }).catch(() => {});
    }

    // Save new token
    const newHashedToken = hashToken(newRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    let storedInRedis = false;
    if (redisClient && redisClient.status === 'ready') {
      try {
        const ttlSeconds = sessionSeconds(days);
        await redisClient.setex(`session:refresh:${user._id}:${newHashedToken}`, ttlSeconds, '1');
        storedInRedis = true;
      } catch (redisErr) {
        console.error('[Redis Refresh Token Rotate Save Error]:', redisErr);
      }
    }

    if (!storedInRedis && true) {
      await RefreshToken.create({
        userId: user._id,
        token: newHashedToken,
        deviceInfo: req.headers['user-agent'],
        ipAddress: req.ip,
        expiresAt,
        isRevoked: false
      });
    }

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: sessionSeconds(days) * 1000
    });

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      ...(isNativeClient(req) ? { refreshToken: newRefreshToken } : {})
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 3. LOGOUT CONTROLLER
export const logout = async (req: Request, res: Response) => {
  try {
    const refreshToken = readRefreshToken(req);

    if (refreshToken) {
      try {
        const decoded: any = jwt.verify(refreshToken, refreshTokenSecret);
        const hashedToken = hashToken(refreshToken);
        
        const redisClient = require('../config/redis').default;
        if (redisClient && redisClient.status === 'ready') {
          await redisClient.del(`session:refresh:${decoded.sub}:${hashedToken}`).catch(() => {});
          await redisClient.del(`user:me:${decoded.sub}`).catch(() => {}); // Clear /me cache on logout
        }
        
        // Always clear MongoDB fallback
        await RefreshToken.deleteMany({ userId: decoded.sub, token: hashedToken }).catch(() => {});
      } catch (err) {
        // Token was malformed, ignore and clean cookie
      }
    }

    // Clear HTTP cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    return res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 4. ME / SESSION PROFILE CONTROLLER
export const me = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  const user = req.user as any;
  // Query fresh user from MongoDB to guarantee instant cross-browser sync
  const freshUser = await User.findById(user._id) || user;
  const userObj = freshUser.toObject ? freshUser.toObject() : { ...freshUser };

  if (user.role === 'teacher') {
    const teacher = await Teacher.findOne({ userId: user._id });
    if (teacher) {
      userObj._id = teacher._id; // Map User ID to Teacher ID for frontend Context user
      userObj.assignedClass = teacher.assignedClass;
      userObj.classTeacherOf = teacher.classTeacherOf;
      userObj.employeeId = teacher.employeeId;
      userObj.username = teacher.employeeId;
    }
  } else if (user.role === 'parent') {
    const student = await Student.findById(user.studentId);
    if (student) {
      userObj._id = student._id; // Map User ID to Student ID for frontend Context user
      userObj.lastName = `${student.firstName} ${student.lastName}`.trim();
      userObj.username = student.admissionNo;
    }
  }

  userObj.permissions = await getEffectivePermissions(freshUser);

  const responseBody = {
    success: true,
    user: userObj
  };

  return res.status(200).json(responseBody);
};

// Helper to find user by identifier (Username, Employee ID, or Phone) scoped by portal role
const findUserByIdentifier = async (identifier: string, portalRole?: string): Promise<IUser | null> => {
  const rawId = identifier.trim();
  if (!rawId) return null;
  const lowerId = rawId.toLowerCase();
  const upperId = rawId.toUpperCase();
  const cleanDigits = rawId.replace(/\D/g, '');

  let roleFilter: any = {};
  if (portalRole === 'admin') {
    roleFilter = { role: { $in: ['admin', 'superadmin'] } };
  } else if (portalRole === 'employee' || portalRole === 'teacher') {
    roleFilter = { role: { $in: ['teacher', 'other'] } };
  }

  const conditions: any[] = [
    { username: lowerId },
    { employeeId: upperId }
  ];
  if (cleanDigits.length >= 7) {
    const last10 = cleanDigits.slice(-10);
    conditions.push({ phone: cleanDigits });
    conditions.push({ phone: `+${cleanDigits}` });
    conditions.push({ phone: { $regex: `${last10}$` } });
  }

  let user = await User.findOne({
    ...roleFilter,
    $or: conditions
  }) as IUser | null;

  if (!user && (portalRole === 'employee' || portalRole === 'teacher' || !portalRole)) {
    const teacher = await Teacher.findOne({
      $or: [
        { employeeId: { $regex: new RegExp(`^${rawId}$`, 'i') } },
        ...(cleanDigits.length >= 7 ? [{ phone: cleanDigits }] : [])
      ]
    });
    if (teacher && teacher.userId) {
      user = await User.findOne({ _id: teacher.userId, ...roleFilter }) as IUser | null;
    }
  }

  return user;
};

// 5. FORGOT PASSWORD CONTROLLER
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { identifier, phone, role } = req.body;
    const searchId = identifier || phone;
    if (!searchId || typeof searchId !== 'string' || !searchId.trim()) {
      return res.status(400).json({
        success: false,
        message: role === 'admin'
          ? 'Username or Admin ID is required.'
          : role === 'employee'
            ? 'Employee ID is required.'
            : 'Username, Employee ID, or WhatsApp number is required.'
      });
    }

    const user = await findUserByIdentifier(searchId, role);
    if (!user) {
      const roleLabel = role === 'admin' ? 'Admin account' : role === 'employee' ? 'Employee account' : 'Account';
      return res.status(404).json({ success: false, message: `${roleLabel} not found with the provided details.` });
    }

    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact administrator.' });
    }

    if (!user.phone) {
      return res.status(400).json({ success: false, message: 'No registered WhatsApp number found for this account.' });
    }

    const phoneResult = normalizePhone(user.phone);
    if (!phoneResult.ok || !phoneResult.e164) {
      return res.status(400).json({ success: false, message: `Invalid phone format on account: ${phoneResult.reason || 'unrecognized format'}.` });
    }

    // Generate secure 6-digit numeric OTP AFTER confirming user exists
    const otp = String(parseInt(crypto.randomBytes(3).toString('hex'), 16) % 900000 + 100000);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Never log the OTP outside development: in production this lands in the PM2
    // log on the VM, where anyone with log access could complete a password reset
    // for any account.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] Generated OTP for user ${user.username} (${user.phone}): ${otp}\n`);
    }

    const hashedOTP = hashToken(otp);

    // Save/create OTP in database
    await PasswordResetOTP.deleteMany({ userId: user._id });
    await PasswordResetOTP.create({
      userId: user._id,
      phone: user.phone.replace(/\D/g, ''),
      otp: hashedOTP,
      expiresAt
    });

    // Send OTP via the approved o_auth AUTHENTICATION template (queued through the
    // same infrastructure as every other proactive WhatsApp notification).
    let sent = false;
    try {
      const result = await queueTemplateNotification('auth.otp', {
        to: phoneResult.e164,
        params: { code: otp },
        dedupeKey: `otp:forgot-password:${user._id}:${otp}`
      });
      sent = result.queued;
      if (!sent) console.error(`[WhatsApp OTP Dispatch] Not queued for ${phoneResult.e164}: ${result.reason}`);
    } catch (waErr: any) {
      console.error('[WhatsApp OTP Send Error]:', waErr.message);
    }

    const digitsOnly = user.phone.replace(/\D/g, '');
    const maskedPhone = digitsOnly.length >= 4 ? `••••••${digitsOnly.slice(-4)}` : '••••••';

    return res.status(200).json({
      success: true,
      message: `A 6-digit One-Time Password (OTP) has been sent to your registered WhatsApp number ending in ${digitsOnly.slice(-4)}.`,
      maskedPhone
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 6. RESET PASSWORD CONTROLLER
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { identifier, phone, role, otp, password } = req.body;
    const searchId = identifier || phone;
    if (!searchId || !otp || !password) {
      return res.status(400).json({ success: false, message: 'Account details, OTP, and new password are required.' });
    }

    const pwError = validatePassword(password);
    if (pwError) {
      return res.status(400).json({ success: false, message: pwError });
    }

    const user = await findUserByIdentifier(searchId, role);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    const hashedOTP = hashToken(otp);
    const savedOTP = await PasswordResetOTP.findOne({
      userId: user._id,
      otp: hashedOTP
    });

    if (!savedOTP) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }

    if (savedOTP.expiresAt < new Date()) {
      await savedOTP.deleteOne();
      return res.status(400).json({ success: false, message: 'This OTP has expired.' });
    }

    // Update password (triggers mongoose pre-save hook for hashing)
    user.password = password;
    await user.save();

    // Invalidate Redis profile cache
    const redisClient = require('../config/redis').default;
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${user._id}`).catch(() => {});
    }

    // Delete OTP
    await savedOTP.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in.'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 7. CHANGE PASSWORD CONTROLLER (Authenticated)
// Current-password flow for every role. Parents changing their password from the
// profile page must additionally present the WhatsApp OTP issued by
// POST /api/parent/profile/send-password-otp. The forced first-login change
// (mustChangePassword) stays current-password-only: that page has no OTP step.
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword, otpCode } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }

    const pwError = validatePassword(newPassword);
    if (pwError) {
      return res.status(400).json({ success: false, message: pwError });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const user = req.user as any;

    // Retrieve user with password field selected
    const dbUser = await User.findById(user._id).select('+password');
    if (!dbUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await dbUser.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password.' });
    }

    if (dbUser.role === 'parent' && !dbUser.mustChangePassword) {
      if (!otpCode) {
        return res.status(400).json({ success: false, message: 'WhatsApp security OTP is required to change your password.' });
      }
      const otp = await verifyAndConsumePasswordChangeOtp(dbUser._id as any, otpCode);
      if (!otp.ok) {
        const message = otp.reason === 'locked'
          ? 'Too many incorrect OTP attempts. Please request a new code.'
          : 'Invalid or expired WhatsApp security OTP. Please request a new code.';
        return res.status(400).json({ success: false, message });
      }
    }

    dbUser.password = newPassword;
    dbUser.mustChangePassword = false;
    await dbUser.save();

    // Invalidate profile cache
    const redisClient = require('../config/redis').default;
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(`user:profile:${dbUser._id}`).catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

