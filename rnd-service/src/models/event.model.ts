import { Schema, model, Document } from 'mongoose';
import { WhatsAppMediaType } from '../services/s3.service';

/**
 * Durable attachment metadata for an Event Announcement.
 * We persist the S3 object KEY (permanent) — never a presigned URL (7-day). Fresh
 * presigned URLs are minted on demand when a parent opens the permanent public
 * gallery link GET /api/events/:eventId/media.
 */
export interface IEventAttachment {
  s3Key: string;
  filename: string;
  contentType?: string;
  size?: number;
  mediaType: WhatsAppMediaType;
}

export interface IEvent extends Document {
  title: string;
  description: string;
  date: Date;
  /** Legacy: presigned S3 URLs used by the ERP events list rendering. Unchanged. */
  media: string[];
  /** Durable attachment metadata — source of truth for the public gallery link. */
  mediaAttachments: IEventAttachment[];
  type?: 'event' | 'notice';
  sendAlertsTo?: 'none' | 'parents' | 'teachers' | 'both';
}

const EventAttachmentSchema = new Schema<IEventAttachment>(
  {
    s3Key: { type: String, required: true },
    filename: { type: String, required: true },
    contentType: { type: String },
    size: { type: Number },
    mediaType: { type: String, enum: ['image', 'video', 'audio', 'document'], default: 'document' }
  },
  { _id: true }
);

const EventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true },
    description: { type: String },
    date: { type: Date, required: true },
    media: [{ type: String }],
    mediaAttachments: { type: [EventAttachmentSchema], default: [] },
    type: { type: String, enum: ['event', 'notice'], default: 'event' },
    sendAlertsTo: { type: String, enum: ['none', 'parents', 'teachers', 'both'], default: 'none' },
  },
  { timestamps: true }
);

export const Event = model<IEvent>('Event', EventSchema);
