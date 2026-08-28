import { Schema, model, Document } from 'mongoose';

export interface IClassRoom extends Document {
  className: string;
  section: string;
}

const ClassRoomSchema = new Schema<IClassRoom>(
  {
    className: { type: String, required: true, uppercase: true, trim: true },
    section: { type: String, required: true, uppercase: true, trim: true }
  },
  { timestamps: true }
);

// Ensure uniqueness of class + section
ClassRoomSchema.index({ className: 1, section: 1 }, { unique: true });

export const ClassRoom = model<IClassRoom>('ClassRoom', ClassRoomSchema);
