import { Schema, model, Document } from 'mongoose';

export interface IVariableExpense extends Document {
  title: string;
  note?: string;
  amount: number;
  date: Date; // date the bill/expense pertains to — distinct from createdAt (when the record was logged)
  paid: boolean;
  paidDate?: Date;
  createdBy?: Schema.Types.ObjectId;
}

const VariableExpenseSchema = new Schema<IVariableExpense>(
  {
    title: { type: String, required: true },
    note: { type: String, default: '' },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    paid: { type: Boolean, default: false },
    paidDate: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Listing and monthly-trend aggregation both order/bucket by `date`; the paid
// flag is filtered on the dashboard summary.
VariableExpenseSchema.index({ date: -1 });
VariableExpenseSchema.index({ paid: 1 });

export const VariableExpense = model<IVariableExpense>('VariableExpense', VariableExpenseSchema);
