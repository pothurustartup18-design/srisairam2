import { Schema, model, Document } from 'mongoose';

// DB-backed catalog of every permission the app knows about — replaces the
// hand-maintained, drift-prone checkbox list that used to live directly in the
// AdminSettings frontend. Populated by `utils/permissionCatalogSeed.ts` from the
// existing `config/permissions.ts` vocabulary; admins may only curate `active`/
// display text here, never invent new enforcement-less permission strings.
export interface IPermissionMaster extends Document {
  key: string; // e.g. 'students:read', 'dashboard:widget:feesCollected'
  module: string;
  action: string;
  category: 'action' | 'widget';
  displayName: string;
  description?: string;
  active: boolean;
}

const PermissionMasterSchema = new Schema<IPermissionMaster>(
  {
    key: { type: String, required: true, unique: true },
    module: { type: String, required: true },
    action: { type: String, required: true },
    category: { type: String, enum: ['action', 'widget'], default: 'action' },
    displayName: { type: String, required: true },
    description: { type: String, default: '' },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

PermissionMasterSchema.index({ module: 1, action: 1 });

export const PermissionMaster = model<IPermissionMaster>('PermissionMaster', PermissionMasterSchema);
