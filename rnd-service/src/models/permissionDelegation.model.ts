import { Schema, model, Document } from 'mongoose';

export interface IPermissionDelegation extends Document {
  fromTeacher: Schema.Types.ObjectId;
  toTeacher: Schema.Types.ObjectId;
  feature: 'students' | 'attendance' | 'marks' | 'analytics' | 'homework' | 'notices' | 'fees';
  isActive: boolean;
  expiresAt: Date;
}

const PermissionDelegationSchema = new Schema<IPermissionDelegation>(
  {
    fromTeacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    toTeacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    feature: {
      type: String,
      enum: ['students', 'attendance', 'marks', 'analytics', 'homework', 'notices', 'fees'],
      required: true
    },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// `verifyDelegation()` runs on the hot path of every teacher marks/attendance/homework
// request, so an unindexed collection meant a full scan per request. The first index also
// covers the `find({ fromTeacher, expiresAt })` "sent" listing via its fromTeacher prefix;
// the second covers the matching "received" listing.
PermissionDelegationSchema.index({ fromTeacher: 1, toTeacher: 1, feature: 1, isActive: 1 });
PermissionDelegationSchema.index({ toTeacher: 1, expiresAt: 1 });

export const PermissionDelegation = model<IPermissionDelegation>('PermissionDelegation', PermissionDelegationSchema);
