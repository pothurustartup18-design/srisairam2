import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  email?: string;
  password?: string;
  role: 'admin' | 'teacher' | 'parent' | 'superadmin' | 'other';
  studentId?: Schema.Types.ObjectId;
  firstName: string;
  lastName: string;
  phone: string;
  avatar?: string;
  isActive: boolean;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  passwordChangedAt?: Date;
  mustChangePassword?: boolean;
  
  // Base fields required by the architecture plan
  // Custom additions for employee/staff architecture
  employeeId?: string;
  permissions?: string[];
  
  createdBy?: Schema.Types.ObjectId;
  updatedBy?: Schema.Types.ObjectId;
  isDeleted: boolean;
  
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'teacher', 'parent', 'other', 'superadmin']
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student'
    },
    firstName: {
      type: String,
      required: true
    },
    lastName: {
      type: String,
      required: false
    },
    phone: {
      type: String,
      required: true
    },
    avatar: {
      type: String
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLogin: {
      type: Date
    },
    loginAttempts: {
      type: Number,
      default: 0,
      required: true
    },
    lockUntil: {
      type: Date
    },
    passwordChangedAt: {
      type: Date
    },
    mustChangePassword: {
      type: Boolean,
      default: false
    },
    
    // Custom Employee specific settings
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    permissions: {
      type: [String],
      default: undefined
    },
    
    // Audit base fields
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true
    }
  },
  { timestamps: true }
);

// Indexes
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ phone: 1 });

// Pre-save hashing middleware
UserSchema.pre('save', async function (next) {
  const user = this as IUser;

  // Only hash password if it has been modified (or is new)
  if (!user.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(user.password || '', salt);
    
    if (!user.isNew) {
      user.passwordChangedAt = new Date();
    }
    
    next();
  } catch (err: any) {
    next(err);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  // Since password field has select: false, we make sure it exists or retrieve it when needed
  return bcrypt.compare(candidatePassword, this.password || '');
};

export const User = model<IUser>('User', UserSchema);
