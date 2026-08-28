import { Schema, model, Document } from 'mongoose';

export interface IFeeStructure extends Document {
  class: string; // e.g. "10"
  totalFee: number;
  booksFee: number;
  installments: {
    installmentNo: number;
    amount: number;
    dueDate: Date;
  }[];
}

const FeeStructureSchema = new Schema<IFeeStructure>(
  {
    class: { type: String, required: true, unique: true, trim: true },
    totalFee: { type: Number, required: true, min: 0 },
    booksFee: { type: Number, default: 0, min: 0 },
    installments: [
      {
        installmentNo: { type: Number, required: true },
        amount: { type: Number, required: true, min: 0 },
        dueDate: { type: Date, required: true }
      }
    ]
  },
  { timestamps: true }
);

export const FeeStructure = model<IFeeStructure>('FeeStructure', FeeStructureSchema);
