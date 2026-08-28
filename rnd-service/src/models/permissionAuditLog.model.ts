import { Schema, model, Document } from 'mongoose';

// Records every permission-override change (who changed whom, before/after, why).
// Deliberately a separate collection from the generic `AuditLog` (used by the
// unrelated `audit()` request-logging middleware) since this needs structured
// before/after snapshots rather than a free-form action string, and warrants a
// longer retention than the generic 180-day request log.
export interface IPermissionAuditLog extends Document {
  targetUserId: Schema.Types.ObjectId;
  modifiedBy?: Schema.Types.ObjectId;
  previousPermissions: string[];
  newPermissions: string[];
  reason?: string;
  createdAt: Date;
}

const PermissionAuditLogSchema = new Schema<IPermissionAuditLog>(
  {
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    modifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    previousPermissions: [{ type: String }],
    newPermissions: [{ type: String }],
    reason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }
);

PermissionAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
// Longer retention than the generic AuditLog — permission-change history has compliance value.
PermissionAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 365 * 24 * 60 * 60 });

export const PermissionAuditLog = model<IPermissionAuditLog>('PermissionAuditLog', PermissionAuditLogSchema);
