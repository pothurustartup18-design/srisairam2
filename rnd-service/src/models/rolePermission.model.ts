import { Schema, model, Document } from 'mongoose';

// DB-backed override of the default role permissions in config/permissions.ts.
// When a document exists for a role, it fully replaces that role's default list.
export interface IRolePermission extends Document {
  role: 'admin' | 'teacher' | 'parent';
  permissions: string[];
}

const RolePermissionSchema = new Schema<IRolePermission>(
  {
    role: { type: String, enum: ['admin', 'teacher', 'parent'], required: true, unique: true },
    permissions: [{ type: String, required: true }]
  },
  { timestamps: true }
);

export const RolePermission = model<IRolePermission>('RolePermission', RolePermissionSchema);
