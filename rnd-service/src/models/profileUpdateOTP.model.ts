import { Schema, model, Document } from 'mongoose';

export interface IProfileUpdateOTP extends Document {
  userId: Schema.Types.ObjectId;
  phone: string;
  otp: string; // SHA-256 hashed OTP
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileUpdateOTPSchema = new Schema<IProfileUpdateOTP>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    otp: {
      type: String,
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // TTL index: document will auto-delete when expiresAt is reached
    }
  },
  { timestamps: true }
);

export const ProfileUpdateOTP = model<IProfileUpdateOTP>('ProfileUpdateOTP', ProfileUpdateOTPSchema);
