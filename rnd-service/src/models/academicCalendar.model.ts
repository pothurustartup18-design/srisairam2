import { Schema, model, Document, Types } from 'mongoose';

export interface IAcademicCalendar extends Document {
  date: Date;
  endDate?: Date;
  title: string;
  type: 'holiday' | 'vacation' | 'working_day_override';
  category: 'festival' | 'national_holiday' | 'emergency' | 'special_working_day' | 'weekly_off' | 'other';
  isSchoolWide: boolean;
  applicableClasses: string[]; // e.g. ['10', '10-A'] or empty if isSchoolWide=true
  description?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AcademicCalendarSchema = new Schema<IAcademicCalendar>(
  {
    date: { type: Date, required: true, index: true },
    endDate: { type: Date },
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['holiday', 'vacation', 'working_day_override'],
      default: 'holiday',
      required: true
    },
    category: {
      type: String,
      enum: ['festival', 'national_holiday', 'emergency', 'special_working_day', 'weekly_off', 'other'],
      default: 'festival',
      required: true
    },
    isSchoolWide: { type: Boolean, default: true },
    applicableClasses: { type: [String], default: [] },
    description: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  {
    timestamps: true
  }
);

AcademicCalendarSchema.index({ date: 1, endDate: 1 });

export const AcademicCalendar = model<IAcademicCalendar>('AcademicCalendar', AcademicCalendarSchema);
