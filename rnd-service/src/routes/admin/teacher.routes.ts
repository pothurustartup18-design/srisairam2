import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requirePermission } from '../../middlewares/permission.middleware';
import { audit } from '../../middlewares/audit.middleware';
import { ServiceError } from '../../utils/responseHelpers';
import { ProfileUpdateOTP } from '../../models/profileUpdateOTP.model';
import { queueTemplateNotification } from '../../config/queue';
import {
  createTeacher,
  previewNextEmployeeId,
  listTeachers,
  getTeacherStudents,
  updateTeacher,
  deleteTeacher,
  resetTeacherPassword,
  addTeacherDocument,
  listTeacherDocuments,
  deleteTeacherDocument,
  getTeacherSignature,
  uploadTeacherSignature,
  deleteTeacherSignature,
  getClassTeacherSignature,
  resolveTeacherFromReqUser,
  getMyTeacherProfile,
  updateMyTeacherProfile,
} from '../../services/teacher.service';

const router = Router();

// CRUD/document endpoints use `error` for the failure-message field; signature
// endpoints use `message` (and POST /signature falls back to 400, not 500) —
// both match the exact shapes the original single-file routes returned.
function handleErrorField(res: Response, error: any) {
  if (error instanceof ServiceError) {
    return res.status(error.status).json({ success: false, message: error.message, ...(error.details || {}) });
  }
  return res.status(500).json({ success: false, error: error.message });
}

function handleMessageField(res: Response, error: any, fallbackStatus = 500) {
  if (error instanceof ServiceError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return res.status(fallbackStatus).json({ success: false, message: error.message });
}

// Create new teacher
router.post('/', requirePermission('teachers:create'), async (req: Request, res: Response) => {
  try {
    const { teacher, credentials } = await createTeacher(req.body);
    return res.status(201).json({
      success: true,
      userCreated: true,
      whatsappSent: true,
      message: 'Account created successfully. Credentials were sent to the registered WhatsApp number.',
      data: teacher,
      credentials
    });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// Get the next available employee ID
router.get('/next-employee-id', requirePermission('teachers:read'), async (req: Request, res: Response) => {
  try {
    const nextEmployeeId = await previewNextEmployeeId();
    return res.status(200).json({ success: true, nextEmployeeId });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// List all teachers
router.get('/', requirePermission('teachers:read'), async (req: Request, res: Response) => {
  try {
    const teachers = await listTeachers();
    return res.status(200).json({ success: true, data: teachers });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// View assigned class and respective students for a teacher
router.get('/:id/students', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const data = await getTeacherStudents(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// ─── Self-service: logged-in teacher's own profile ─────────────────────────
// Placed before the generic `/:id` routes below so Express doesn't treat
// "me" as an :id parameter and shadow these with the admin-only handlers.

// GET /api/teachers/me — fetch the logged-in teacher's own editable fields
router.get('/me', async (req: Request, res: Response) => {
  try {
    if ((req.user as any)?.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers can access their own profile via this endpoint.' });
    }
    const data = await getMyTeacherProfile(req.user);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleMessageField(res, error);
  }
});

// PUT /api/teachers/me — update only phone/email/cluster/address (self-service)
router.put('/me', async (req: Request, res: Response) => {
  try {
    if ((req.user as any)?.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers can update their own profile via this endpoint.' });
    }
    const data = await updateMyTeacherProfile(req.user, req.body);
    return res.status(200).json({ success: true, message: 'Profile updated successfully.', data });
  } catch (error: any) {
    return handleMessageField(res, error);
  }
});

// POST /api/teachers/me/send-password-otp — WhatsApp OTP required before a
// teacher can change their own password (mirrors school-profile's admin OTP
// flow, but scoped to the teacher's own registered phone).
router.post('/me/send-password-otp', async (req: Request, res: Response) => {
  try {
    const reqUser = req.user as any;
    if (reqUser?.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers can request this OTP.' });
    }
    const teacher = await resolveTeacherFromReqUser(reqUser);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
    }
    const targetPhone = teacher.phone || reqUser.phone;
    if (!targetPhone) {
      return res.status(400).json({ success: false, message: 'No registered phone number found for this account.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOTP = crypto.createHash('sha256').update(otpCode).digest('hex');

    const userId = reqUser._id || reqUser.id;
    await ProfileUpdateOTP.deleteMany({ userId, phone: targetPhone });
    await ProfileUpdateOTP.create({
      userId,
      phone: targetPhone,
      otp: hashedOTP,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // Print OTP to terminal for development — do NOT send in API response
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] Password Change OTP for Teacher user ${userId} (${targetPhone}): ${otpCode}\n`);
    }

    const result = await queueTemplateNotification('auth.otp', {
      to: targetPhone,
      params: { code: otpCode },
      dedupeKey: `otp:teacher-password-change:${userId}:${otpCode}`
    });
    if (!result.queued) console.error(`[Teacher Password OTP] Not queued for ${targetPhone}: ${result.reason}`);

    return res.status(200).json({
      success: true,
      message: `WhatsApp OTP ${result.queued ? 'sent' : 'could not be queued'} for ${targetPhone}`,
      sent: result.queued,
    });
  } catch (error: any) {
    return handleMessageField(res, error);
  }
});

// Update teacher profile
router.put('/:id', requirePermission('teachers:create'), async (req: Request, res: Response) => {
  try {
    const teacher = await updateTeacher(req.params.id, req.body);
    return res.status(200).json({ success: true, data: teacher });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// Delete a teacher
router.delete('/:id', requirePermission('teachers:delete'), async (req: Request, res: Response) => {
  try {
    await deleteTeacher(req.params.id, req.body.password, (req.user as any)?._id);
    return res.status(200).json({ success: true, message: 'Teacher successfully deleted.' });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// Reset Teacher Password (Admin Action)
router.post('/:id/reset-password', requirePermission('teachers:create'), async (req: Request, res: Response) => {
  try {
    const { passwordChanged, whatsappSent } = await resetTeacherPassword(req.params.id);
    return res.status(200).json({
      success: true,
      passwordChanged,
      whatsappSent,
      message: 'Password reset successfully and new credentials were sent via WhatsApp.'
    });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// ─── Teacher Documents Vault (degree certs, joining letters, photos, signatures …) ───

// Upload a document for a teacher (stored in S3 under the teacher's folder)
router.post('/:id/documents', requirePermission('teachers:create'), audit('teacher:document-upload'), async (req: Request, res: Response) => {
  try {
    const { docType, filename, base64 } = req.body;
    const data = await addTeacherDocument(req.params.id, docType, filename, base64);
    return res.status(201).json({ success: true, data, message: 'Document uploaded successfully.' });
  } catch (error: any) {
    console.error('[Teacher Documents] Upload failed:', error);
    return handleErrorField(res, error);
  }
});

// List a teacher's documents with presigned download URLs
router.get('/:id/documents', requirePermission('teachers:read'), async (req: Request, res: Response) => {
  try {
    const documents = await listTeacherDocuments(req.params.id);
    return res.status(200).json({ success: true, data: documents });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// Delete a teacher document (removes metadata and the S3 object)
router.delete('/:id/documents/:docId', requirePermission('teachers:create'), audit('teacher:document-delete'), async (req: Request, res: Response) => {
  try {
    await deleteTeacherDocument(req.params.id, req.params.docId);
    return res.status(200).json({ success: true, message: 'Document deleted successfully.' });
  } catch (error: any) {
    return handleErrorField(res, error);
  }
});

// ─── TEACHER SIGNATURE MANAGEMENT ENDPOINTS ───────────────────────────────

// GET /api/teachers/signature - Fetch logged in teacher's signature
router.get('/signature', async (req: Request, res: Response) => {
  try {
    const result = await getTeacherSignature((req as any).user);
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    return handleMessageField(res, error);
  }
});

// POST /api/teachers/signature - Process & upload teacher signature
router.post('/signature', async (req: Request, res: Response) => {
  try {
    const data = await uploadTeacherSignature((req as any).user, req.body.signatureImage);
    return res.status(200).json({ success: true, message: 'Signature processed and saved successfully.', data });
  } catch (error: any) {
    return handleMessageField(res, error, 400);
  }
});

// DELETE /api/teachers/signature - Delete teacher signature
router.delete('/signature', async (req: Request, res: Response) => {
  try {
    await deleteTeacherSignature((req as any).user);
    return res.status(200).json({ success: true, message: 'Signature deleted successfully.' });
  } catch (error: any) {
    return handleMessageField(res, error);
  }
});

// GET /api/teachers/class-teacher/:className/signature - Fetch signature for class teacher
router.get('/class-teacher/:className/signature', async (req: Request, res: Response) => {
  try {
    const data = await getClassTeacherSignature(req.params.className);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleMessageField(res, error);
  }
});

export default router;
