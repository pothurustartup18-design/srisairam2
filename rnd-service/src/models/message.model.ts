import { Schema, model, Document } from 'mongoose';

export interface IMessage extends Document {
  studentId?: Schema.Types.ObjectId;
  teacherId?: Schema.Types.ObjectId;
  sender: 'admin' | 'teacher' | 'parent';
  recipient?: 'admin' | 'teacher' | 'parent';
  senderName: string;
  text: string;
  read: boolean;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: false },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: false },
    sender: { type: String, enum: ['admin', 'teacher', 'parent'], required: true },
    recipient: { type: String, enum: ['admin', 'teacher', 'parent'], required: false },
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// GET /api/messages/threads runs `distinct`, a `findOne().sort({createdAt:-1})` and a
// `countDocuments` per thread. Without these the collection had no index at all, so every
// one of those was a full collection scan plus an in-memory sort (which hard-fails once a
// thread's messages exceed MongoDB's 32MB sort limit). The compound (id, createdAt) pairs
// let the newest-message lookup be served directly from the index.
MessageSchema.index({ studentId: 1, createdAt: -1 });
MessageSchema.index({ teacherId: 1, createdAt: -1 });

export const Message = model<IMessage>('Message', MessageSchema);

