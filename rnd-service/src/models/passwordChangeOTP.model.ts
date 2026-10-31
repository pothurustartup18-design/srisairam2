import { Schema, model, Document, Types } from 'mongoose';

export const PASSWORD_CHANGE_PURPOSE = 'parent-password-change';

export interface IPasswordChangeOTP extends Document {
  userId: Types.ObjectId;
  purpose: string;
  phone: string;
  otpHash: string; // HMAC-SHA256 of the code; the plain code is never stored
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

const PasswordChangeOTPSchema = new Schema<IPasswordChangeOTP>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, required: true, default: PASSWORD_CHANGE_PURPOSE },
    phone: { type: String, required: true, trim: true },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } } // TTL: auto-removed once expired
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One live code per user per purpose; issuing a new one replaces the old one.
PasswordChangeOTPSchema.index({ userId: 1, purpose: 1 }, { unique: true });

export const PasswordChangeOTP = model<IPasswordChangeOTP>('PasswordChangeOTP', PasswordChangeOTPSchema);
