import { Schema, model, Document } from 'mongoose';
export interface ISchoolProfile extends Document {
  schoolInfo: {
    schoolName: string;
    schoolCode: string;
    logo?: string;
    logoOptimizedVersions?: Map<string, any>;
  };
  contactInfo: {
    email: string;
    phone: string;
    website?: string;
  };
  address: {
    addressLine: string;
    city: string;
    state: string;
    pincode: string;
  };
  academicConfig: {
    currentAcademicYear: string;
    startTime: string;
    endTime: string;
  };
  communicationSettings: {
    whatsappEnabled: boolean;
    emailEnabled: boolean;
  };
  principalInfo?: {
    name?: string;
    signatureUrl?: string;
    signatureUploadedAt?: Date;
    signatureUpdatedAt?: Date;
    signatureOptimizedVersions?: Map<string, any>;
  };
}

const SchoolProfileSchema = new Schema<ISchoolProfile>(
  {
    schoolInfo: {
      schoolName: { type: String, default: 'RND School' },
      schoolCode: { type: String, default: 'SCH-001' },
      logo: { type: String, default: '' },
      logoOptimizedVersions: { type: Map, of: Object }
    },
    contactInfo: {
      email: { type: String, default: 'admin@schoolhub.edu' },
      phone: { type: String, default: '+91 9392646349' },
      website: { type: String, default: 'https://schoolhub.edu' }
    },
    address: {
      addressLine: { type: String, default: '123 Education Campus Road' },
      city: { type: String, default: 'Hyderabad' },
      state: { type: String, default: 'Telangana' },
      pincode: { type: String, default: '500001' }
    },
    academicConfig: {
      currentAcademicYear: { type: String, default: '2026-27' },
      startTime: { type: String, default: '08:30' },
      endTime: { type: String, default: '15:30' }
    },
    communicationSettings: {
      whatsappEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true }
    },
    principalInfo: {
      name: { type: String, default: 'Dr. Principal Name' },
      signatureUrl: { type: String, default: null },
      signatureUploadedAt: { type: Date, default: null },
      signatureUpdatedAt: { type: Date, default: null },
      signatureOptimizedVersions: { type: Map, of: Object }
    }
  },
  { timestamps: true }
);

export const SchoolProfile = model<ISchoolProfile>('SchoolProfile', SchoolProfileSchema);
