import { Schema, model, Document } from 'mongoose';

export interface IScheduledAlert extends Document {
  title: string;
  message: string;
  sendAlertsTo: 'parents' | 'teachers' | 'both';
  scheduledAt: Date;
  status: 'pending' | 'sent';
  mediaUrl?: string;
  mediaUrls?: string[];
  eventId?: string;
  // Optional audience filters (empty = everyone in the audience)
  classes?: string[];
  sections?: string[];
  studentIds?: string[];
  /**
   * When set, the scheduler delivers this alert as an approved Meta template
   * (announcement.broadcast / event.announcement) via queueTemplateNotification
   * instead of a free-form message. `message` is kept for the ERP UI / history.
   */
  templateKey?: string;
  templateParams?: Record<string, string>;
}

const ScheduledAlertSchema = new Schema<IScheduledAlert>(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    sendAlertsTo: { type: String, enum: ['parents', 'teachers', 'both'], required: true },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'sent'], default: 'pending' },
    mediaUrl: { type: String },
    mediaUrls: [{ type: String }],
    eventId: { type: String },
    classes: [{ type: String }],
    sections: [{ type: String }],
    studentIds: [{ type: String }],
    templateKey: { type: String },
    templateParams: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

// The scheduler polls `findOneAndUpdate({ status, scheduledAt: { $lte: now } })` in a loop
// on every PM2 cluster instance, so this was a repeated full scan. eventId serves the
// `deleteMany({ eventId })` cascade when an event is deleted.
ScheduledAlertSchema.index({ status: 1, scheduledAt: 1 });
ScheduledAlertSchema.index({ eventId: 1 });

export const ScheduledAlert = model<IScheduledAlert>('ScheduledAlert', ScheduledAlertSchema);
