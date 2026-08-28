import mongoose, { Schema, Document } from 'mongoose';

export interface IPhoneVerification extends Document {
  phone: string;
  otp: string;
  verified: boolean;
  expiresAt: Date;
}

const PhoneVerificationSchema: Schema = new Schema({
  phone: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  verified: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true }
});

// Add TTL index to automatically delete expired verification docs
PhoneVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PhoneVerification = mongoose.model<IPhoneVerification>('PhoneVerification', PhoneVerificationSchema);
