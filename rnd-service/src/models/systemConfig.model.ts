import { Schema, model, Document } from 'mongoose';

export interface ISystemConfig extends Document {
  key: string;
  value: any;
}

const SystemConfigSchema = new Schema<ISystemConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    value: {
      type: Schema.Types.Mixed,
      required: true
    }
  },
  { timestamps: true }
);

export const SystemConfig = model<ISystemConfig>('SystemConfig', SystemConfigSchema);
