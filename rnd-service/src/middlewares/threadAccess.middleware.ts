import { Request, Response, NextFunction } from 'express';
import { Teacher } from '../models/teacher.model';

/**
 * Ownership boundary for the message/attendance routes that take a
 * `:studentId` / `:teacherId` in the path.
 *
 * `requirePermission` already applies this boundary for parents, but these
 * routers are mounted behind `authenticateJWT` alone — so before this, any
 * signed-in parent could read (and post into) another family's thread just by
 * changing the id in the URL, and any teacher could read another teacher's
 * thread with the admin. Admin/superadmin keep unrestricted access.
 */

const forbid = (res: Response, what: string) =>
  res.status(403).json({ success: false, message: `Forbidden: Access Denied. You do not own this ${what}.` });

/** Parents may only address the student record their account is linked to. */
export const requireOwnStudent = (paramName = 'studentId') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    if (user?.role !== 'parent') return next();

    const ownStudentId = user.studentId ? String(user.studentId) : '';
    if (!ownStudentId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Parent user profile is not linked to any student record.'
      });
    }

    const target = req.params[paramName];
    if (target && target !== ownStudentId) return forbid(res, 'student record');
    return next();
  };
};

/** Teachers may only address their own teacher record; parents not at all. */
export const requireOwnTeacher = (paramName = 'teacherId') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    if (user?.role === 'parent') return forbid(res, 'staff conversation');
    if (user?.role !== 'teacher') return next();

    const target = req.params[paramName];
    if (!target) return next();

    const teacher = await Teacher.findOne({ userId: user._id }).select('_id').lean();
    const ownTeacherId = teacher ? String(teacher._id) : (user.teacherId ? String(user.teacherId) : '');
    if (!ownTeacherId || target !== ownTeacherId) return forbid(res, 'staff conversation');
    return next();
  };
};

/** Thread listings expose every conversation in the school — staff/teachers only. */
export const denyParents = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as any;
  if (user?.role === 'parent') {
    return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges.' });
  }
  return next();
};
