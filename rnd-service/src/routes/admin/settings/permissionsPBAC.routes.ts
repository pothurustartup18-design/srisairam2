import { Router, Request, Response } from 'express';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission } from '../../../middlewares/permission.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { getEffectivePermissions } from '../../../services/permissionEngine';
import { getEffectiveRolePermissions } from '../../../services/rolePermissionsCache';
import { PermissionMaster } from '../../../models/permissionMaster.model';
import { PermissionTemplate } from '../../../models/permissionTemplate.model';
import { PermissionAuditLog } from '../../../models/permissionAuditLog.model';
import { UserPermissionOverride } from '../../../models/userPermissionOverride.model';
import { User } from '../../../models/user.model';
import redisClient from '../../../config/redis';

const router = Router();
const guard = [requireRole(['admin']), requirePermission('settings:manage')];

// ─── Permission Catalog (read + light curation; entries themselves are code-derived) ──

router.get('/permissions/catalog', ...guard, async (req: Request, res: Response) => {
  try {
    const entries = await PermissionMaster.find({}).sort({ module: 1, action: 1 }).lean();
    const grouped: Record<string, typeof entries> = {};
    for (const entry of entries) {
      (grouped[entry.module] ||= []).push(entry);
    }
    return res.status(200).json({ success: true, data: { entries, grouped } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/permissions/catalog/:id', ...guard, audit('permission-catalog:update'), async (req: Request, res: Response) => {
  try {
    const { active, displayName, description } = req.body;
    const update: Record<string, any> = {};
    if (active !== undefined) update.active = !!active;
    if (displayName !== undefined) update.displayName = displayName;
    if (description !== undefined) update.description = description;

    const entry = await PermissionMaster.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!entry) return res.status(404).json({ success: false, message: 'Permission not found.' });
    return res.status(200).json({ success: true, data: entry });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Permission Templates ──────────────────────────────────────────────────────

router.get('/permissions/templates', ...guard, async (req: Request, res: Response) => {
  try {
    const templates = await PermissionTemplate.find({}).sort({ name: 1 }).lean();
    return res.status(200).json({ success: true, data: templates });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/permissions/templates', ...guard, audit('permission-template:create'), async (req: Request, res: Response) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'name and permissions[] are required.' });
    }
    const existing = await PermissionTemplate.findOne({ name });
    if (existing) return res.status(400).json({ success: false, message: `A template named "${name}" already exists.` });

    const template = await PermissionTemplate.create({
      name, description: description || '', permissions: [...new Set(permissions)],
      createdBy: (req.user as any)?._id
    });
    return res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/permissions/templates/:id', ...guard, audit('permission-template:update'), async (req: Request, res: Response) => {
  try {
    const { name, description, permissions } = req.body;
    const update: Record<string, any> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) return res.status(400).json({ success: false, message: 'permissions must be an array.' });
      update.permissions = [...new Set(permissions)];
    }

    const template = await PermissionTemplate.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    return res.status(200).json({ success: true, data: template });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/permissions/templates/:id', ...guard, audit('permission-template:delete'), async (req: Request, res: Response) => {
  try {
    const template = await PermissionTemplate.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    return res.status(200).json({ success: true, message: 'Template deleted.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Per-employee effective permissions + overrides ────────────────────────────

router.get('/employees/:id/effective-permissions', ...guard, async (req: Request, res: Response) => {
  try {
    const targetUser = await User.findById(req.params.id).lean();
    if (!targetUser) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const roleDefaults = (await getEffectiveRolePermissions())[targetUser.role] || [];
    const overrides = await UserPermissionOverride.find({ userId: targetUser._id }).lean();
    const effective = await getEffectivePermissions(targetUser as any);

    return res.status(200).json({
      success: true,
      data: {
        roleDefaults,
        overrides: overrides.map((o) => ({ permission: o.permission, allowed: o.allowed })),
        effective,
        usingLegacyPermissionsArray: overrides.length === 0 && Array.isArray(targetUser.permissions)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/employees/:id/permission-overrides', ...guard, audit('permissions:override-update'), async (req: Request, res: Response) => {
  try {
    const { overrides, reason } = req.body;
    if (!Array.isArray(overrides)) {
      return res.status(400).json({ success: false, message: 'overrides must be an array of {permission, allowed}.' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const previousPermissions = await getEffectivePermissions(targetUser as any);

    await UserPermissionOverride.deleteMany({ userId: targetUser._id });
    if (overrides.length > 0) {
      await UserPermissionOverride.insertMany(
        overrides.map((o: any) => ({
          userId: targetUser._id,
          permission: o.permission,
          allowed: !!o.allowed,
          assignedBy: (req.user as any)?._id,
          reason: reason || ''
        }))
      );
    }

    // Once an admin has explicitly saved via the Permission Picker, the override
    // rows above are authoritative from now on — clear the legacy full-replace
    // `permissions` array so it can never be silently fallen back to again. Without
    // this, unchecking everything for an employee whose role has no default
    // permissions (e.g. role 'other') produces an empty override diff, which is
    // indistinguishable from "never customized" — the resolver would then fall
    // through to whatever stale permissions array was set at account creation
    // instead of the explicitly-configured empty set.
    targetUser.permissions = undefined;
    await targetUser.save();

    const newPermissions = await getEffectivePermissions(targetUser as any);
    await PermissionAuditLog.create({
      targetUserId: targetUser._id,
      modifiedBy: (req.user as any)?._id,
      previousPermissions,
      newPermissions,
      reason: reason || ''
    });

    redisClient.del(`user:profile:${targetUser._id}`).catch(() => {});

    return res.status(200).json({ success: true, message: 'Permission overrides saved.', data: { effective: newPermissions } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/employees/:id/permission-overrides', ...guard, audit('permissions:override-reset'), async (req: Request, res: Response) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const previousPermissions = await getEffectivePermissions(targetUser as any);
    await UserPermissionOverride.deleteMany({ userId: targetUser._id });
    // Same as the save path: clear the legacy array so "reset to role default"
    // actually means role default, not whatever was set at account creation.
    targetUser.permissions = undefined;
    await targetUser.save();
    const newPermissions = await getEffectivePermissions(targetUser as any);

    await PermissionAuditLog.create({
      targetUserId: targetUser._id,
      modifiedBy: (req.user as any)?._id,
      previousPermissions,
      newPermissions,
      reason: req.body?.reason || 'Reset to role default'
    });

    redisClient.del(`user:profile:${targetUser._id}`).catch(() => {});

    return res.status(200).json({ success: true, message: 'Permission overrides cleared — employee now uses role defaults.', data: { effective: newPermissions } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Audit trail ────────────────────────────────────────────────────────────────

router.get('/permission-audit-logs', ...guard, async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limit = 25;

    const filter: Record<string, any> = {};
    if (userId) filter.targetUserId = userId;

    const [logs, total] = await Promise.all([
      PermissionAuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('targetUserId', 'firstName lastName username')
        .populate('modifiedBy', 'firstName lastName username')
        .lean(),
      PermissionAuditLog.countDocuments(filter)
    ]);

    return res.status(200).json({ success: true, data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
