import mongoose from 'mongoose';
import { ClassRoom } from '../models/classRoom.model';
import { User } from '../models/user.model';
import { Student } from '../models/student.model';
import { seedPermissionCatalog } from '../utils/permissionCatalogSeed';

export const connectDB = async (): Promise<void> => {
  try {
    const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-erp';
    // Redact credentials — connection strings must never appear in logs verbatim
    console.log(`Connecting to MongoDB at: ${connString.replace(/\/\/[^@/]+@/, '//***:***@')}...`);
    await mongoose.connect(connString, {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('MongoDB Connected Successfully.');
    
    // Auto-initialize transportFee for existing database records if missing
    try {
      const migrationRes = await Student.updateMany(
        { transportFee: { $exists: false } },
        [
          {
            $set: {
              transportFee: {
                $cond: {
                  if: { $eq: ['$transportMode', 'school'] },
                  then: 3200,
                  else: 0
                }
              }
            }
          }
        ]
      );
      if (migrationRes.modifiedCount > 0) {
        console.log(`[Migration] Initialized transportFee for ${migrationRes.modifiedCount} existing student records.`);
      }
    } catch (migrationErr) {
      console.error('[Migration] Error migrating transportFee:', migrationErr);
    }
    
    // Auto-seed default classes if collection is empty
    try {
      const count = await ClassRoom.countDocuments();
      if (count === 0) {
        console.log('No classes found in database. Seeding default classes (Nursery to Class 10)...');
        const defaultClasses = [
          { className: 'NURSERY', section: '-' },
          { className: 'LKG', section: '-' },
          { className: 'UKG', section: '-' },
          { className: '1', section: '-' },
          { className: '2', section: '-' },
          { className: '3', section: '-' },
          { className: '4', section: '-' },
          { className: '5', section: '-' },
          { className: '6', section: '-' },
          { className: '7', section: '-' },
          { className: '8', section: '-' },
          { className: '9', section: '-' },
          { className: '10', section: '-' },
        ];
        await ClassRoom.insertMany(defaultClasses);
        console.log('Default classes seeded successfully.');
      }
    } catch (seedErr) {
      console.error('Error auto-seeding default classes:', seedErr);
    }

    // Auto-seed default superadmin user if not exists
    try {
      const superAdminExists = await User.findOne({ role: 'superadmin' });
      if (!superAdminExists) {
        console.log('No superadmin user found in database. Auto-seeding default superadmin user...');
        await User.create({
          username: 'superadmin',
          password: '123',
          email: 'superadmin@schoolhub.edu',
          role: 'superadmin',
          firstName: 'Super',
          lastName: 'Admin',
          phone: '+919999999990',
          isActive: true
        });
        console.log('Default superadmin user seeded successfully.');
      }
    } catch (seedErr) {
      console.error('Error auto-seeding default superadmin user:', seedErr);
    }

    // Keep the PBAC permission catalog in sync with config/permissions.ts. Runs
    // unconditionally every boot (insert-only per key, not a `count === 0` guard —
    // see the comment in permissionCatalogSeed.ts for why) so a newly added
    // permission string always appears without a manual migration step.
    try {
      await seedPermissionCatalog();
    } catch (seedErr) {
      console.error('Error seeding permission catalog:', seedErr);
    }
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
};
