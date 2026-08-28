import { Schema, model, Document } from 'mongoose';

export interface IRefreshToken extends Document {
  userId: Schema.Types.ObjectId;
  token: string;
  deviceInfo?: string;
  ipAddress?: string;
  expiresAt: Date;
  isRevoked: boolean;
  
  // Base fields required by the architecture plan
  createdAt: Date;
  updatedAt: Date;
  createdBy?: Schema.Types.ObjectId;
  updatedBy?: Schema.Types.ObjectId;
  isDeleted: boolean;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    token: {
      type: String,
      required: true,
      index: true
    },
    deviceInfo: {
      type: String
    },
    ipAddress: {
      type: String
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // TTL index: documents expire when this date is reached
    },
    isRevoked: {
      type: Boolean,
      default: false,
      required: true
    },
    
    // Audit base fields
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true
    }
  },
  { timestamps: true }
);

// Indexes
RefreshTokenSchema.index({ userId: 1 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
