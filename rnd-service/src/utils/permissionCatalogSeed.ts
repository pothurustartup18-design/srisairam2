import { PermissionMaster } from '../models/permissionMaster.model';
import { PERMISSION_CATALOG } from '../config/permissionCatalog';

// Keeps PermissionMaster in sync with the code-derived catalog on every boot.
// Deliberately insert-only ($setOnInsert): an admin's manual `active`/displayName
// curation (via PATCH /settings/permissions/catalog/:id) must survive a restart,
// while a permission string newly added to config/permissions.ts still appears
// automatically next boot with no manual migration step. Do NOT change this to the
// `count === 0` guard pattern used by the classes/superadmin seeds elsewhere in
// db.ts — those seed a fixed one-time default; this one stays in sync with code
// over the life of the app.
export async function seedPermissionCatalog(): Promise<void> {
  let upserted = 0;
  for (const entry of PERMISSION_CATALOG) {
    const result = await PermissionMaster.updateOne(
      { key: entry.key },
      {
        $setOnInsert: {
          key: entry.key,
          module: entry.module,
          action: entry.action,
          category: entry.category,
          displayName: entry.displayName,
          description: entry.description || '',
          active: true
        }
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) upserted++;
  }
  if (upserted > 0) {
    console.log(`[Migration] Permission catalog: added ${upserted} new permission(s).`);
  }
}
