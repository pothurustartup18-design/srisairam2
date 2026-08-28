import mongoose, { Schema, Document } from 'mongoose';

export interface ILeaveMessage {
  sender: 'teacher' | 'admin';
  senderName: string;
  text: string;
  createdAt: Date;
}

export interface ILeave extends Document {
  teacher: mongoose.Types.ObjectId;
  teacherName: string;
  description: string;
  fromDate: Date;
  toDate: Date;
  status: 'pending' | 'approved' | 'rejected';
  messages: ILeaveMessage[];
  createdAt: Date;
}

const LeaveSchema: Schema = new Schema({
  teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  teacherName: { type: String, required: true },
  description: { type: String, required: true },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  messages: [
    {
      sender: { type: String, enum: ['teacher', 'admin'], required: true },
      senderName: { type: String, required: true },
      text: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// Speed up teacher leave history and admin dashboard status filter queries
LeaveSchema.index({ teacher: 1, createdAt: -1 });
LeaveSchema.index({ status: 1 });

export const Leave = mongoose.model<ILeave>('Leave', LeaveSchema);
