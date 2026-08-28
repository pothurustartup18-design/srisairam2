import { ROLE_PERMISSIONS } from '../config/permissions';
import { RolePermission } from '../models/rolePermission.model';

// DB-backed role permissions with a short in-memory cache. A RolePermission
// document fully replaces that role's default list; roles without an override
// keep the defaults from config/permissions.ts.
//
// Extracted out of permission.middleware.ts so services/permissionEngine.ts can
// depend on it without a circular import (permission.middleware.ts also depends
// on permissionEngine.ts for per-user resolution).
const CACHE_TTL_MS = 60 * 1000;
let cachedPermissions: Record<string, string[]> | null = null;
let cachedAt = 0;

export const invalidateRolePermissionCache = () => {
  cachedPermissions = null;
};

export async function getEffectiveRolePermissions(): Promise<Record<string, string[]>> {
  if (cachedPermissions && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPermissions;
  }
  try {
    const overrides = await RolePermission.find({}).lean();
    const merged: Record<string, string[]> = { ...ROLE_PERMISSIONS };
    for (const override of overrides) {
      merged[override.role] = override.permissions;
    }
    cachedPermissions = merged;
    cachedAt = Date.now();
    return merged;
  } catch (err) {
    console.error('[Permissions] Failed to load role overrides, using defaults:', err);
    return ROLE_PERMISSIONS;
  }
}
