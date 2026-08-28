import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedbackMessage {
  sender: 'parent' | 'admin';
  text: string;
  createdAt: Date;
}

export interface IFeedback extends Document {
  student: mongoose.Types.ObjectId;
  studentName: string;
  admissionNo: string;
  subject: string;
  messages: IFeedbackMessage[];
  createdAt: Date;
}

const FeedbackSchema: Schema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName: { type: String, required: true },
  admissionNo: { type: String, required: true },
  subject: { type: String, required: true },
  messages: [
    {
      sender: { type: String, enum: ['parent', 'admin'], required: true },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// Speed up parent dashboard feed queries for linked students
FeedbackSchema.index({ student: 1, createdAt: -1 });

export const Feedback = mongoose.model<IFeedback>('Feedback', FeedbackSchema);
