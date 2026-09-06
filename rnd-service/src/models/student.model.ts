import { Schema, model, Document, Types } from 'mongoose';
import { DocumentSchema } from './shared/documentSchema';

export interface IStudent extends Document {
  admissionNo: string;
  admissionAcademicYear: string;
  firstName: string;
  lastName: string;
  class: string;
  section: string;
  classTeacher: Types.ObjectId;
  rollNumber?: number;
  status: 'active' | 'inactive';
  whatsappNo: string;
  motherWhatsappNo?: string;
  totalFee: number;
  feePaid: number;
  feePending: number;
  installments: {
    installmentNo: number;
    amount: number;
    dueDate: Date;
    status: 'paid' | 'unpaid' | 'overdue';
    reminderSentAt?: Date;
  }[];
  payments: {
    receiptNo: string;
    amount: number;
    date: Date;
    paymentMode: 'cash' | 'upi' | 'card' | 'bank_transfer';
    /** Which fee bucket this payment settled — used to fill the fee_receipt WhatsApp template. */
    feeType?: 'school' | 'books' | 'transport';
  }[];
  documents: {
    _id?: Types.ObjectId;
    docType: string;
    filename: string;
    s3Key: string;
    uploadedAt: Date;
    optimizedVersions?: Map<string, any>;
  }[];
  transportMode: 'school' | 'private';
  booksFee: number;
  transportFee: number;
  preferredLanguage: 'en' | 'te' | 'hi';
  cluster?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  bloodGroup?: string;
  house?: string;
  fatherName?: string;
  motherName?: string;
  address?: string;
}

const InstallmentSchema = new Schema({
  installmentNo: { type: Number, required: true },
  amount: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['paid', 'unpaid', 'overdue'], default: 'unpaid' },
  reminderSentAt: { type: Date }
});

const PaymentSchema = new Schema({
  receiptNo: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  paymentMode: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer'], required: true },
  feeType: { type: String, enum: ['school', 'books', 'transport'] }
});

const StudentSchema = new Schema<IStudent>(
  {
    admissionNo: { type: String, required: true, unique: true },
    admissionAcademicYear: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: false },
    class: { type: String, required: true },
    section: { type: String, required: true },
    classTeacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    rollNumber: { type: Number },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    whatsappNo: { type: String, required: true },
    motherWhatsappNo: { type: String },
    totalFee: { type: Number, default: 0 },
    feePaid: { type: Number, default: 0 },
    feePending: { type: Number, default: 0 },
    transportMode: { type: String, enum: ['school', 'private'], default: 'school' },
    booksFee: { type: Number, default: 0 },
    transportFee: { type: Number, default: 0 },
    preferredLanguage: { type: String, enum: ['en', 'te', 'hi'], default: 'en' },
    cluster: { type: String, default: '' },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    bloodGroup: { type: String, default: '' },
    house: { type: String, default: '' },
    fatherName: { type: String, default: '' },
    motherName: { type: String, default: '' },
    address: { type: String, default: '' },
    installments: [InstallmentSchema],
    payments: [PaymentSchema],
    documents: [DocumentSchema]
  },
  { timestamps: true }
);

// Speed up class-section roster queries (most frequent query pattern)
StudentSchema.index({ class: 1, section: 1 });

export const Student = model<IStudent>('Student', StudentSchema);
