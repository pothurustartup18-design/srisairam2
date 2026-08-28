import { Schema, model, Document } from 'mongoose';

export interface IEvent extends Document {
  title: string;
  description: string;
  date: Date;
  media: string[];
  type?: 'event' | 'notice';
  sendAlertsTo?: 'none' | 'parents' | 'teachers' | 'both';
}

const EventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true },
    description: { type: String },
    date: { type: Date, required: true },
    media: [{ type: String }],
    type: { type: String, enum: ['event', 'notice'], default: 'event' },
    sendAlertsTo: { type: String, enum: ['none', 'parents', 'teachers', 'both'], default: 'none' },
  },
  { timestamps: true }
);

export const Event = model<IEvent>('Event', EventSchema);
