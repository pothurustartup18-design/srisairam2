import { Schema, model, Document } from 'mongoose';

export interface ISequenceCounter extends Document {
  name: string;
  sequenceValue: number;
}

const SequenceCounterSchema = new Schema<ISequenceCounter>(
  {
    name: { type: String, required: true, unique: true },
    sequenceValue: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

export const SequenceCounter = model<ISequenceCounter>('SequenceCounter', SequenceCounterSchema);
