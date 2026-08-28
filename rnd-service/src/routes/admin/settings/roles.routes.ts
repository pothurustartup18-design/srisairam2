import { Router, Request, Response } from 'express';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission, invalidateRolePermissionCache, getEffectiveRolePermissions } from '../../../middlewares/permission.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { ROLE_PERMISSIONS, ALL_PERMISSIONS, PROTECTED_ADMIN_PERMISSIONS } from '../../../config/permissions';
import { RolePermission } from '../../../models/rolePermission.model';
import { User } from '../../../models/user.model';
import { Teacher } from '../../../models/teacher.model';
import redisClient from '../../../config/redis';

const router = Router();

router.get('/roles', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const effective = await getEffectiveRolePermissions();
    return res.status(200).json({
      success: true,
      data: {
        roles: effective,
        defaults: ROLE_PERMISSIONS,
        allPermissions: ALL_PERMISSIONS,
        protectedAdminPermissions: PROTECTED_ADMIN_PERMISSIONS
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/roles', requireRole(['admin']), requirePermission('settings:manage'), audit('roles:update'), async (req: Request, res: Response) => {
  try {
    const { role, permissions } = req.body;

    if (!['admin', 'teacher', 'parent'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be one of: admin, teacher, parent.' });
    }
    if (!Array.isArray(permissions) || permissions.some(p => typeof p !== 'string')) {
      return res.status(400).json({ success: false, message: 'permissions must be an array of strings.' });
    }

    // Lockout safety: the admin role always keeps its critical permissions
    let finalPermissions = [...new Set(permissions)];
    if (role === 'admin') {
      finalPermissions = [...new Set([...finalPermissions, ...PROTECTED_ADMIN_PERMISSIONS])];
    }

    await RolePermission.findOneAndUpdate(
      { role },
      { role, permissions: finalPermissions },
      { upsert: true, new: true }
    );
    invalidateRolePermissionCache();

    return res.status(200).json({
      success: true,
      message: `Permissions for role "${role}" updated (${finalPermissions.length} permission(s)).`,
      data: { role, permissions: finalPermissions }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/roles/:role', requireRole(['admin']), requirePermission('settings:manage'), audit('roles:reset'), async (req: Request, res: Response) => {
  try {
    const { role } = req.params;
    if (!['admin', 'teacher', 'parent'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be one of: admin, teacher, parent.' });
    }
    await RolePermission.findOneAndDelete({ role });
    invalidateRolePermissionCache();
    return res.status(200).json({ success: true, message: `Role "${role}" reset to default permissions.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/teachers-access', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {

    const teachers = await Teacher.find({});
    const teacherDataList = [];

    for (const teacher of teachers) {
      let isUserActive = true;
      if (teacher.userId) {
        const user = await User.findById(teacher.userId);
        if (user) {
          isUserActive = user.isActive;
        }
      }
      teacherDataList.push({
        _id: teacher._id,
        employeeId: teacher.employeeId,
        name: teacher.name,
        assignedClass: teacher.assignedClass,
        status: teacher.status,
        isActiveUser: isUserActive
      });
    }

    return res.status(200).json({
      success: true,
      data: teacherDataList
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/teachers-access/toggle', requireRole(['admin']), requirePermission('settings:manage'), audit('settings:teacher-access-toggle'), async (req: Request, res: Response) => {
  try {
    const { teacherId, status } = req.body; // status: 'active' | 'inactive'
    if (!teacherId || !status) {
      return res.status(400).json({ success: false, message: 'teacherId and status are required.' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    teacher.status = status;
    await teacher.save();

    if (teacher.userId) {
      const user = await User.findById(teacher.userId);
      if (user) {
        user.isActive = (status === 'active');
        await user.save();
        
        // Invalidate cached user profile for JWT middleware
        redisClient.del(`user:profile:${user._id}`).catch(() => {});
      }
    }

    return res.status(200).json({
      success: true,
      message: `Teacher ${teacher.name} login status updated to ${status} successfully.`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
