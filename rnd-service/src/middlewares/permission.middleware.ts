import { Request, Response, NextFunction } from 'express';
import { Feedback } from '../models/feedback.model';
import { getEffectivePermissions } from '../services/permissionEngine';

// Re-exported so every existing `import { getEffectiveRolePermissions, invalidateRolePermissionCache }
// from '../middlewares/permission.middleware'` call site (auth.controller.ts, roles.routes.ts)
// keeps working unchanged. The actual implementation moved to services/rolePermissionsCache.ts
// to break a circular dependency with services/permissionEngine.ts, which this file now uses
// for per-user resolution.
export { getEffectiveRolePermissions, invalidateRolePermissionCache } from '../services/rolePermissionsCache';

export const requirePermission = (requiredPermission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized. Login required.' });
      }

      const user = req.user as any;

      // 1. Check if the user has custom override permissions assigned directly to them,
      //    otherwise fall back to default role-based permissions
      if (user.role === 'superadmin') {
        return next();
      }

      const permissions = await getEffectivePermissions(user);

      if (!permissions.includes(requiredPermission)) {
        return res.status(403).json({
          success: false,
          message: `Forbidden: Insufficient privileges. Required permission: ${requiredPermission}`
        });
      }

      // 2. Data Boundary / Ownership check for Parent role
      if (user.role === 'parent') {
        const parentStudentId = user.studentId ? user.studentId.toString() : '';

        if (!parentStudentId) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: Parent user profile is not linked to any student record.'
          });
        }

        // a) Check studentId in route parameters
        if (req.params.studentId && req.params.studentId !== parentStudentId) {
          return res.status(403).json({
            success: false,
            message: `Forbidden: Access Denied. You do not own this student record.`
          });
        }

        // b) Check studentId in request body (e.g. creating feedback)
        if (req.body.studentId && req.body.studentId !== parentStudentId) {
          return res.status(403).json({
            success: false,
            message: `Forbidden: Access Denied. You do not own this student record.`
          });
        }

        // c) Check studentId in query parameters
        if (req.query.studentId && String(req.query.studentId) !== parentStudentId) {
          return res.status(403).json({
            success: false,
            message: `Forbidden: Access Denied. You do not own this student record.`
          });
        }

        // d) Thread-level ownership boundary check for replying to feedback
        if (req.params.feedbackId) {
          const feedbackId = req.params.feedbackId;
          
          const feedback = await Feedback.findById(feedbackId);
          if (feedback && feedback.student.toString() !== parentStudentId) {
            return res.status(403).json({
              success: false,
              message: 'Forbidden: Access Denied. You do not own this feedback conversation.'
            });
          }
        }
      }

      return next();
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };
};
