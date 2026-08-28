import mongoose, { Schema, Document } from 'mongoose';

export interface ISubjectInfo {
  name: string;
  totalMarks: number;
}

export interface IStudentMarkDetails {
  student: mongoose.Types.ObjectId;
  marks: Array<{
    subject: string;
    obtainedMarks: number;
  }>;
  remarks?: string;
  pdfUrl?: string;
}

export interface IEditHistory {
  editedBy: mongoose.Types.ObjectId;
  editedByName: string;
  editedAt: Date;
  studentId: mongoose.Types.ObjectId;
  changes: Array<{
    subject: string;
    from: number;
    to: number;
  }>;
}

export interface IExam extends Document {
  examName: string;
  classTeacher: mongoose.Types.ObjectId;
  class: string;
  subjects: ISubjectInfo[];
  studentMarks: IStudentMarkDetails[];
  status: 'draft' | 'submitted' | 'locked';
  lastEditedBy?: mongoose.Types.ObjectId;
  lastEditedByName?: string;
  lastEditedAt?: Date;
  editHistory: IEditHistory[];
  examType?: 'final' | 'middle' | 'regular';
}

const ExamSchema: Schema = new Schema(
  {
    examName: { type: String, required: true },
    examType: { type: String, enum: ['final', 'middle', 'regular'], default: 'regular' },
    classTeacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    class: { type: String, required: true },
    subjects: [
      {
        name: { type: String, required: true },
        totalMarks: { type: Number, required: true },
      },
    ],
    studentMarks: [
      {
        student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
        marks: [
          {
            subject: { type: String, required: true },
            obtainedMarks: { type: Number, required: true },
          },
        ],
        remarks: { type: String, default: '' },
        pdfUrl: { type: String, default: '' },
      },
    ],
    // Status lifecycle: draft → submitted → locked
    status: {
      type: String,
      enum: ['draft', 'submitted', 'locked'],
      default: 'draft',
    },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    lastEditedByName: { type: String },
    lastEditedAt: { type: Date },
    // Full edit audit log
    editHistory: [
      {
        editedBy: { type: Schema.Types.ObjectId, ref: 'Teacher' },
        editedByName: { type: String },
        editedAt: { type: Date, default: Date.now },
        studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
        changes: [
          {
            subject: { type: String },
            from: { type: Number },
            to: { type: Number },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

// Avoid duplicate exam names for the same class/teacher combination
ExamSchema.index({ examName: 1, classTeacher: 1 }, { unique: true });

// Speed up class-based queries (most common filter pattern)
ExamSchema.index({ class: 1 });

export const Exam = mongoose.model<IExam>('Exam', ExamSchema);
