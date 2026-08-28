import { getEffectiveRolePermissions } from './rolePermissionsCache';
import { UserPermissionOverride } from '../models/userPermissionOverride.model';
import { DASHBOARD_WIDGET_PERMISSIONS } from '../config/permissions';

interface EffectivePermissionsUser {
  _id: any;
  role: string;
  permissions?: string[] | null;
}

/**
 * Single source of truth for "what can this user do" — replaces three previously
 * independent copies of the same resolution logic (requirePermission middleware,
 * auth.controller's login() and me()). Resolution order, preserved exactly for
 * backward compatibility:
 *
 *   1. Per-user overrides (UserPermissionOverride rows) — role defaults with
 *      explicit add/remove overrides layered on top. This is the new PBAC model.
 *   2. Legacy `user.permissions` array, if set — used AS-IS, full replace, byte-for-byte
 *      identical to the original behavior. Nothing is migrated onto (1) automatically;
 *      a user only moves onto the override model once someone explicitly saves an
 *      override for them via the new Permission Picker.
 *   3. Plain role defaults (config/permissions.ts, merged with any RolePermission
 *      DB override) — unchanged from today.
 *
 * Superadmin's full-bypass and the parent resource-ownership check remain entirely
 * inside requirePermission() and are NOT part of this function.
 */
export async function getEffectivePermissions(user: EffectivePermissionsUser): Promise<string[]> {
  const overrides = await UserPermissionOverride.find({ userId: user._id }).lean();

  if (overrides.length > 0) {
    const roleDefaults = (await getEffectiveRolePermissions())[user.role] || [];
    const result = new Set(roleDefaults);
    for (const o of overrides) {
      if (o.allowed) result.add(o.permission);
      else result.delete(o.permission);
    }
    return Array.from(result);
  }

  if (Array.isArray(user.permissions)) {
    return grandfatherDashboardWidgets(user.permissions);
  }

  return (await getEffectiveRolePermissions())[user.role] || [];
}

// A legacy custom-employee `permissions` array predates the dashboard:widget:* keys
// introduced with this feature. Without this, upgrading would silently hide every
// dashboard widget from any existing employee who currently has dashboard:view.
// Only applies when the array has dashboard:view but literally zero widget keys —
// once an admin explicitly sets even one via the new picker, this no longer fires.
function grandfatherDashboardWidgets(permissions: string[]): string[] {
  const hasDashboardAccess = permissions.includes('dashboard:view');
  const hasAnyWidgetKey = permissions.some((p) => DASHBOARD_WIDGET_PERMISSIONS.includes(p));
  if (hasDashboardAccess && !hasAnyWidgetKey) {
    return Array.from(new Set([...permissions, ...DASHBOARD_WIDGET_PERMISSIONS]));
  }
  return permissions;
}
