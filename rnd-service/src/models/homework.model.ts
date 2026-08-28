import { Schema, model, Document, Types } from 'mongoose';

export interface IHomeworkAck {
  student: Types.ObjectId;
  studentName: string;
  at: Date;
}

export interface IHomework extends Document {
  classRoom: string; // e.g. "10-A"
  subject: string;
  title: string;
  description?: string;
  dueDate: Date;
  attachments: string[];
  createdBy?: Types.ObjectId;
  createdByName: string;
  acknowledgements: IHomeworkAck[];
}

const HomeworkSchema = new Schema<IHomework>(
  {
    classRoom: { type: String, required: true, uppercase: true, trim: true },
    subject: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, required: true },
    attachments: [{ type: String }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    createdByName: { type: String, required: true },
    acknowledgements: [
      {
        student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
        studentName: { type: String, required: true },
        at: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

// Most common query: homework feed for a class room
HomeworkSchema.index({ classRoom: 1, dueDate: -1 });

export const Homework = model<IHomework>('Homework', HomeworkSchema);
