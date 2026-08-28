import { Schema, model, Document } from 'mongoose';

export interface ISalaryPayment extends Document {
  teacher: Schema.Types.ObjectId;
  month: string; // 'YYYY-MM'
  amount: number; // snapshot of the teacher's salary at the time this was marked paid
  paidDate: Date;
  markedBy?: Schema.Types.ObjectId;
}

const SalaryPaymentSchema = new Schema<ISalaryPayment>(
  {
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    month: { type: String, required: true },
    amount: { type: Number, required: true },
    paidDate: { type: Date, default: Date.now },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// A payment record only exists once a teacher is marked paid for a given month —
// this index both enforces "one record per teacher per month" and serves the
// GET /salaries?month= lookup directly.
SalaryPaymentSchema.index({ teacher: 1, month: 1 }, { unique: true });

export const SalaryPayment = model<ISalaryPayment>('SalaryPayment', SalaryPaymentSchema);
