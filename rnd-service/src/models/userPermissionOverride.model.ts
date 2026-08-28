import { Schema, model, Document } from 'mongoose';

// Additive/subtractive per-user override on top of that user's role defaults —
// `allowed: true` grants a permission the role wouldn't otherwise have,
// `allowed: false` revokes one the role would otherwise grant. This is the
// upgrade over the legacy `User.permissions` array (which fully replaces role
// defaults instead of layering on top of them); see `services/permissionEngine.ts`
// for the resolution order between the two.
export interface IUserPermissionOverride extends Document {
  userId: Schema.Types.ObjectId;
  permission: string;
  allowed: boolean;
  assignedBy?: Schema.Types.ObjectId;
  reason?: string;
}

const UserPermissionOverrideSchema = new Schema<IUserPermissionOverride>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    permission: { type: String, required: true },
    allowed: { type: Boolean, required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, default: '' }
  },
  { timestamps: true }
);

// One row per (user, permission) — upserts replace rather than duplicate, and this
// also serves the "all overrides for this user" lookup the engine does per request.
UserPermissionOverrideSchema.index({ userId: 1, permission: 1 }, { unique: true });

export const UserPermissionOverride = model<IUserPermissionOverride>('UserPermissionOverride', UserPermissionOverrideSchema);
