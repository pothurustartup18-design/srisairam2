import { Router, Request, Response } from 'express';
import { Student } from '../../models/student.model';

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

export default router;
