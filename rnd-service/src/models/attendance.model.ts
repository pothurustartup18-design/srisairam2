import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceRecord {
  student: mongoose.Types.ObjectId;
  status: 'present' | 'absent';
  morningStatus?: 'present' | 'absent';
  afternoonStatus?: 'present' | 'absent';
}

export interface IAttendance extends Document {
  date: Date;
  classTeacher: mongoose.Types.ObjectId;
  class: string;
  records: IAttendanceRecord[];
  lastEditedBy?: mongoose.Types.ObjectId;
  lastEditedAt?: Date;
}

const AttendanceSchema: Schema = new Schema({
  date: { type: Date, required: true },
  classTeacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  class: { type: String, required: true },
  records: [
    {
      student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
      status: { type: String, enum: ['present', 'absent'], required: true },
      morningStatus: { type: String, enum: ['present', 'absent'] },
      afternoonStatus: { type: String, enum: ['present', 'absent'] },
    },
  ],
  lastEditedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastEditedAt: { type: Date },
});

// Avoid duplicate registers for same class teacher on the same date
AttendanceSchema.index({ date: 1, classTeacher: 1 }, { unique: true });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema);
