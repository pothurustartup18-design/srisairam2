import { Schema, model, Document } from 'mongoose';

/**
 * Full lifecycle record for every outgoing WhatsApp message.
 * Status flow: queued -> sending -> sent -> delivered -> read
 * Terminal failure at any point: failed (with Meta error details).
 *
 * Statuses only ever move FORWARD (see STATUS_RANK) which makes webhook
 * processing naturally idempotent — replayed/duplicated webhooks cannot
 * regress a message from 'read' back to 'delivered'.
 */

export type WhatsAppMessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export const STATUS_RANK: Record<Exclude<WhatsAppMessageStatus, 'failed'>, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4
};

/** True when a message may transition from `from` to `to` (forward-only). */
export function statusTransitionAllowed(from: WhatsAppMessageStatus, to: WhatsAppMessageStatus): boolean {
  if (from === to) return false;
  if (to === 'failed') return from !== 'delivered' && from !== 'read'; // a delivered/read message cannot "fail" later
  if (from === 'failed') return false; // failed is terminal
  return STATUS_RANK[to] > STATUS_RANK[from];
}

export interface IWhatsAppMessage extends Document {
  schoolId: string;
  to: string; // normalized E.164 digits (no '+')
  messageType: 'text' | 'template' | 'image' | 'document' | 'video' | 'audio' | 'sticker' | 'interactive' | 'other';
  bodyPreview: string; // first 500 chars — full message bodies are not needed for ops
  templateName?: string;
  wamid?: string; // Meta message id, set once accepted
  status: WhatsAppMessageStatus;
  statusHistory: Array<{ status: WhatsAppMessageStatus; at: Date; source: 'api' | 'webhook' | 'system' }>;
  attempts: number;
  dedupeKey?: string; // caller-provided idempotency key
  contentHash: string; // sha256(to|type|payload) for accidental double-send suppression
  error?: {
    code?: number;
    subcode?: number;
    httpStatus?: number;
    title?: string;
    message?: string;
    retryable?: boolean;
  };
  conversationId?: string;
  pricingCategory?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppMessageSchema = new Schema<IWhatsAppMessage>(
  {
    schoolId: { type: String, required: true, default: 'default', index: true },
    to: { type: String, required: true, index: true },
    messageType: {
      type: String,
      enum: ['text', 'template', 'image', 'document', 'video', 'audio', 'sticker', 'interactive', 'other'],
      required: true
    },
    bodyPreview: { type: String, default: '' },
    templateName: { type: String },
    wamid: { type: String, index: true, sparse: true },
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'delivered', 'read', 'failed'],
      required: true,
      default: 'queued',
      index: true
    },
    statusHistory: [
      {
        _id: false,
        status: { type: String, required: true },
        at: { type: Date, required: true },
        source: { type: String, enum: ['api', 'webhook', 'system'], required: true }
      }
    ],
    attempts: { type: Number, default: 0 },
    dedupeKey: { type: String, unique: true, sparse: true },
    contentHash: { type: String, required: true },
    error: {
      code: Number,
      subcode: Number,
      httpStatus: Number,
      title: String,
      message: String,
      retryable: Boolean
    },
    conversationId: { type: String },
    pricingCategory: { type: String }
  },
  { timestamps: true }
);

// Fast duplicate-window lookups: same content to same recipient recently
WhatsAppMessageSchema.index({ contentHash: 1, createdAt: -1 });
// Ops queries: recent messages per school
WhatsAppMessageSchema.index({ schoolId: 1, createdAt: -1 });

export const WhatsAppMessage = model<IWhatsAppMessage>('WhatsAppMessage', WhatsAppMessageSchema);
