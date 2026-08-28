import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  userId?: string;
  username?: string;
  role?: string;
  action: string;
  method: string;
  path: string;
  entityId?: string;
  statusCode: number;
  ip?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: String },
    username: { type: String },
    role: { type: String },
    action: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    entityId: { type: String },
    statusCode: { type: Number, required: true },
    ip: { type: String }
  },
  { timestamps: true }
);

// Auto-delete audit entries after 180 days so the collection cannot grow unbounded
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
