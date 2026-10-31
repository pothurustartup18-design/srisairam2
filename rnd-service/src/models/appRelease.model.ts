import { Schema, model, Document } from 'mongoose';

/**
 * One published (or draft) Android app release — either a native APK or a
 * live web bundle. The `manifest` string is produced and signed by the CI
 * release pipeline; the server never holds the signing key, it only verifies
 * the signature on registration and serves the manifest verbatim so clients
 * can verify it themselves. The indexed fields below are copies of manifest
 * values used for querying.
 */
export type ReleaseKind = 'native' | 'web';
export type ReleaseChannel = 'staging' | 'production';
export type ReleaseStatus = 'draft' | 'published' | 'paused' | 'revoked';

export interface IAppRelease extends Document {
  releaseId: string;
  kind: ReleaseKind;
  channel: ReleaseChannel;
  packageId: string;
  status: ReleaseStatus;
  rolloutPercent: number;
  promotedAt?: Date;
  manifest: string;
  signature: string;
  keyId: string;
  artifactKey: string;
  versionCode?: number;
  minimumSupportedVersionCode?: number;
  compatibleNativeMin?: number;
  compatibleNativeMax?: number;
  registeredBy: string;
  statusHistory: { status: ReleaseStatus; rolloutPercent: number; by: string; at: Date }[];
}

const AppReleaseSchema = new Schema<IAppRelease>(
  {
    releaseId: { type: String, required: true, unique: true, trim: true },
    kind: { type: String, enum: ['native', 'web'], required: true },
    channel: { type: String, enum: ['staging', 'production'], required: true },
    packageId: { type: String, required: true },
    status: { type: String, enum: ['draft', 'published', 'paused', 'revoked'], default: 'draft' },
    rolloutPercent: { type: Number, min: 0, max: 100, default: 0 },
    promotedAt: { type: Date },
    manifest: { type: String, required: true },
    signature: { type: String, required: true },
    keyId: { type: String, required: true },
    artifactKey: { type: String, required: true },
    versionCode: { type: Number },
    minimumSupportedVersionCode: { type: Number },
    compatibleNativeMin: { type: Number },
    compatibleNativeMax: { type: Number },
    registeredBy: { type: String, required: true },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: ['draft', 'published', 'paused', 'revoked'] },
        rolloutPercent: Number,
        by: String,
        at: Date
      }
    ]
  },
  { timestamps: true }
);

AppReleaseSchema.index({ kind: 1, channel: 1, status: 1, versionCode: -1 });
AppReleaseSchema.index({ kind: 1, channel: 1, status: 1, promotedAt: -1 });

export const AppRelease = model<IAppRelease>('AppRelease', AppReleaseSchema);
