import { Schema } from 'mongoose';

// Shared by any model that stores S3-backed optimized image variants
// (student/teacher documents, teacher signatures, school logo, ...).
export const OptimizedVersionSchema = new Schema(
  {
    s3Key: { type: String, required: true },
    width: Number,
    height: Number,
    size: Number,
    format: String,
    optimizedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Shared S3 document sub-schema, embedded as `documents: [DocumentSchema]`
// on both the Student and Teacher models.
export const DocumentSchema = new Schema({
  docType: { type: String, required: true },
  filename: { type: String, required: true },
  s3Key: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  optimizedVersions: {
    type: Map,
    of: OptimizedVersionSchema,
  },
});
