import { Schema, model, Document } from 'mongoose';
import { DocumentSchema, OptimizedVersionSchema } from './shared/documentSchema';

export interface ITeacher extends Document {
  userId?: Schema.Types.ObjectId;
  employeeId?: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  dob: Date;
  phone?: string;
  email?: string;
  address?: string;
  assignedClass: string; // e.g. "10-A, 10-B" (comma-separated sync for backward compatibility)
  subjects: string[];
  teachingClasses: string[];
  classTeacherOf?: string | null;
  status: 'active' | 'inactive';
  cluster?: string;
  salary?: number;
  documents: {
    _id?: any;
    docType: string;
    filename: string;
    s3Key: string;
    uploadedAt: Date;
    optimizedVersions?: Map<string, any>;
  }[];
  signatureUrl?: string;
  signatureUploadedAt?: Date;
  signatureUpdatedAt?: Date;
  signatureOptimizedVersions?: Map<string, any>;
}

const TeacherSchema = new Schema<ITeacher>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    employeeId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    dob: { type: Date, required: true },
    phone: { type: String },
    email: { type: String },
    address: { type: String, default: '' },
    assignedClass: { type: String, required: true },
    subjects: [{ type: String, trim: true }],
    teachingClasses: [{ type: String, trim: true }],
    classTeacherOf: { type: String, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    cluster: { type: String, default: '' },
    salary: { type: Number, default: 0 },
    signatureUrl: { type: String, default: null },
    signatureUploadedAt: { type: Date, default: null },
    signatureUpdatedAt: { type: Date, default: null },
    signatureOptimizedVersions: {
      type: Map,
      of: OptimizedVersionSchema,
    },
    documents: [DocumentSchema]
  },
  { timestamps: true }
);

export const Teacher = model<ITeacher>('Teacher', TeacherSchema);

