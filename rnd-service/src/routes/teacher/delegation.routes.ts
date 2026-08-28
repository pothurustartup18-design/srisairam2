import { Router, Request, Response } from 'express';
import { PermissionDelegation } from '../../models/permissionDelegation.model';
import { Teacher } from '../../models/teacher.model';
import { requireRole } from '../../middlewares/auth.middleware';

const router = Router();

// Helper to resolve teacher ID from req.user
const getTeacherId = async (req: Request): Promise<string | null> => {
  const user = req.user as any;
  if (!user) return null;

  const teacher = await Teacher.findOne({ userId: user._id });
  return teacher ? teacher._id.toString() : null;
};

// GET /api/delegations
// Get all delegations sent (created) by this teacher, or received (assigned) by this teacher.
router.get('/', requireRole(['teacher']), async (req: Request, res: Response) => {
  try {
    const teacherId = await getTeacherId(req);
    if (!teacherId) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
    }

    // DB Mode: filter where expiresAt is in the future
    const sent = await PermissionDelegation.find({ 
      fromTeacher: teacherId, 
      expiresAt: { $gt: new Date() } 
    })
      .populate('fromTeacher', 'name assignedClass')
      .populate('toTeacher', 'name assignedClass')
      .lean();

    const received = await PermissionDelegation.find({ 
      toTeacher: teacherId, 
      expiresAt: { $gt: new Date() } 
    })
      .populate('fromTeacher', 'name assignedClass')
      .populate('toTeacher', 'name assignedClass')
      .lean();

    return res.status(200).json({
      success: true,
      data: { sent, received }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/delegations
// Create a new delegation
router.post('/', requireRole(['teacher']), async (req: Request, res: Response) => {
  try {
    const teacherId = await getTeacherId(req);
    if (!teacherId) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
    }

    const { toTeacherId, feature, durationHours } = req.body;
    if (!toTeacherId || !feature) {
      return res.status(400).json({ success: false, message: 'toTeacherId and feature are required.' });
    }

    const hours = Number(durationHours) || 24;
    if (![24, 48, 72].includes(hours)) {
      return res.status(400).json({ success: false, message: 'Invalid duration. Allowed values: 24, 48, 72.' });
    }

    if (teacherId === toTeacherId) {
      return res.status(400).json({ success: false, message: 'Cannot delegate permissions to yourself.' });
    }

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Check if target teacher exists

    // DB Mode
    const targetExists = await Teacher.findById(toTeacherId);
    if (!targetExists) {
      return res.status(404).json({ success: false, message: 'Target colleague not found.' });
    }

    const existing = await PermissionDelegation.findOne({
      fromTeacher: teacherId,
      toTeacher: toTeacherId,
      feature,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This permission is already transferred to this colleague.' });
    }

    const newDel = new PermissionDelegation({
      fromTeacher: teacherId,
      toTeacher: toTeacherId,
      feature,
      isActive: true,
      expiresAt
    });
    await newDel.save();

    return res.status(201).json({ success: true, message: 'Permission transferred successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/delegations/:id
// Revoke a delegation
router.delete('/:id', requireRole(['teacher']), async (req: Request, res: Response) => {
  try {
    const teacherId = await getTeacherId(req);
    if (!teacherId) {
      return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
    }

    const delegationId = req.params.id;

    // DB Mode
    const del = await PermissionDelegation.findOneAndDelete({
      _id: delegationId,
      fromTeacher: teacherId
    });
    if (!del) {
      return res.status(404).json({ success: false, message: 'Delegation record not found or unauthorized.' });
    }

    return res.status(200).json({ success: true, message: 'Permission transfer revoked successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
