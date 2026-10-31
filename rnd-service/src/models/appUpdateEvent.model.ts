import { Schema, model, Document } from 'mongoose';

/**
 * Update-lifecycle telemetry reported by installed apps. Deliberately holds no
 * personal data: `installId` is a random UUID generated on the device, not tied
 * to a user account. Rows expire after 90 days.
 */
export const UPDATE_EVENT_STAGES = [
  'check',
  'download_started',
  'download_failed',
  'verify_failed',
  'ready',
  'activated',
  'rollback',
  'apk_install_launched',
  'apk_installed',
  'apk_cancelled',
  'failed'
] as const;
export type UpdateEventStage = (typeof UPDATE_EVENT_STAGES)[number];

export interface IAppUpdateEvent extends Document {
  installId: string;
  kind: 'native' | 'web';
  stage: UpdateEventStage;
  releaseId?: string;
  channel?: string;
  versionCode?: number;
  bundleId?: string;
  error?: string;
  createdAt: Date;
}

const AppUpdateEventSchema = new Schema<IAppUpdateEvent>(
  {
    installId: { type: String, required: true },
    kind: { type: String, enum: ['native', 'web'], required: true },
    stage: { type: String, enum: UPDATE_EVENT_STAGES, required: true },
    releaseId: { type: String },
    channel: { type: String },
    versionCode: { type: Number },
    bundleId: { type: String },
    error: { type: String, maxlength: 500 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AppUpdateEventSchema.index({ releaseId: 1, stage: 1 });
AppUpdateEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AppUpdateEvent = model<IAppUpdateEvent>('AppUpdateEvent', AppUpdateEventSchema);
