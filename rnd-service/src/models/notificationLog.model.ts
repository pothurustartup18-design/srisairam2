import { Schema, model, Document } from 'mongoose';

export interface INotificationLog extends Document {
  phone: string;
  message: string;
  status: 'sent' | 'failed';
  sentAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    phone: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    sentAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const NotificationLog = model<INotificationLog>('NotificationLog', NotificationLogSchema);
