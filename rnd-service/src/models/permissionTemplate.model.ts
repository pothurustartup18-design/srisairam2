import { Schema, model, Document } from 'mongoose';

// Reusable named permission sets ("Fee Operator", "Read Only Partner", ...) an
// admin can apply when assigning a custom employee's overrides, instead of
// ticking the same combination of checkboxes every time. `permissions` is
// embedded rather than a separate join collection — idiomatic Mongoose, and
// matches the existing `RolePermission.permissions` pattern already in this codebase.
export interface IPermissionTemplate extends Document {
  name: string;
  description?: string;
  permissions: string[];
  createdBy?: Schema.Types.ObjectId;
}

const PermissionTemplateSchema = new Schema<IPermissionTemplate>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    permissions: [{ type: String, required: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

export const PermissionTemplate = model<IPermissionTemplate>('PermissionTemplate', PermissionTemplateSchema);
