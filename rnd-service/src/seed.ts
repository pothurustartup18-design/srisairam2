import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/user.model';
import { Teacher } from './models/teacher.model';
import { Student } from './models/student.model';
import { Leave } from './models/leave.model';
import { Event } from './models/event.model';
import { RefreshToken } from './models/refreshToken.model';
import { NotificationLog } from './models/notificationLog.model';
import { WhatsAppMessage } from './models/whatsappMessage.model';
import { Exam } from './models/exam.model';
import { Attendance } from './models/attendance.model';
import { ClassRoom } from './models/classRoom.model';
import { SequenceCounter } from './models/sequenceCounter.model';
import { getNextEmployeeId, getNextAdmissionNumber } from './utils/sequence';

dotenv.config();

export const seedDatabase = async (shouldCloseConnection: boolean = true) => {
  try {
    const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-erp';
    console.log("Connecting to database: " + connString);
    if (shouldCloseConnection) {
      await mongoose.connect(connString);
    }

    console.log('Clearing existing data (including sequence counters)...');
    await User.deleteMany({});
    await RefreshToken.deleteMany({});
    await Teacher.deleteMany({});
    await Student.deleteMany({});
    await Event.deleteMany({});
    await NotificationLog.deleteMany({});
    await WhatsAppMessage.deleteMany({});
    await Exam.deleteMany({});
    await Attendance.deleteMany({});
    await ClassRoom.deleteMany({});
    await Leave.deleteMany({});
    await SequenceCounter.deleteMany({});

    console.log('Seeding default classes...');
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
      { className: '8', section: 'A' },
      { className: '9', section: 'A' },
      { className: '9', section: 'B' },
      { className: '10', section: 'A' },
      { className: '10', section: 'B' },
      { className: '10', section: 'C' }
    ];
    await ClassRoom.create(defaultClasses);

    console.log('Seeding admin user...');
    const adminUser = await User.create({
      username: 'admin1',
      password: '123',
      email: 'pothurujaswanth@gmail.com',
      role: 'admin',
      firstName: 'Jaswanth',
      lastName: 'Pothuru',
      phone: '+919999999999',
      isActive: true
    });

    console.log('Seeding superadmin user...');
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

    console.log('Seeding teacher users and profiles...');
    const teachersData = [
      { className: "10", section: "A", teacherId: "mock-t1", teacherName: "Alice Smith", phone: "+919876543220", email: "alice@schoolhub.com", cluster: "Madhapur" },
      { className: "10", section: "B", teacherId: "mock-t2", teacherName: "Bob Jones", phone: "+919876543221", email: "bob@schoolhub.com", cluster: "Kondapur" },
      { className: "10", section: "C", teacherId: "mock-t3", teacherName: "Charlie Brown", phone: "+919876543222", email: "charlie@schoolhub.com", cluster: "Madhapur" },
      { className: "9", section: "A", teacherId: "mock-t4", teacherName: "David Miller", phone: "+919876543223", email: "david@schoolhub.com", cluster: "Gachibowli" },
      { className: "9", section: "B", teacherId: "mock-t5", teacherName: "Emma Davis", phone: "+919876543224", email: "emma@schoolhub.com", cluster: "Gachibowli" },
      { className: "8", section: "A", teacherId: "mock-t6", teacherName: "Frank Wilson", phone: "+919876543225", email: "frank@schoolhub.com", cluster: "Kondapur" }
    ];
    
    const teacherIdMap: Record<string, any> = {};

    let loginOffsetMinutes = 2;
    for (const t of teachersData) {
      const username = t.teacherName.toLowerCase().replace(/\s+/g, '');
      const loginDate = new Date();
      loginDate.setMinutes(loginDate.getMinutes() - loginOffsetMinutes);
      loginOffsetMinutes = loginOffsetMinutes * 5 + 3;

      const user = await User.create({
        username,
        password: '123',
        email: t.email,
        role: 'teacher',
        firstName: t.teacherName.split(' ')[0],
        lastName: t.teacherName.split(' ')[1] || '',
        phone: t.phone,
        isActive: true,
        lastLogin: loginDate,
        createdBy: adminUser._id
      });

      // Get next employee ID from sequence counter dynamically
      const empId = await getNextEmployeeId();

      const teacher = await Teacher.create({
        userId: user._id,
        employeeId: empId,
        name: t.teacherName,
        gender: 'male',
        dob: new Date('1990-01-01'),
        phone: t.phone,
        email: t.email,
        assignedClass: t.className + '-' + t.section,
        status: 'active',
        cluster: t.cluster
      });
      teacherIdMap[t.teacherId] = teacher._id;
    }

    console.log('Seeding pending leave request...');
    const teacherKeys = Object.keys(teacherIdMap);
    if (teacherKeys.length > 0) {
      const firstTeacherId = teacherIdMap[teacherKeys[0]];
      const firstTeacherObj = await Teacher.findById(firstTeacherId);
      if (firstTeacherObj) {
        const leaveFrom = new Date();
        const leaveTo = new Date(leaveFrom.getTime() + 24 * 60 * 60 * 1000);
        await Leave.create({
          teacher: firstTeacherObj._id,
          teacherName: firstTeacherObj.name,
          description: 'Medical Leave: Suffering from viral fever. Need rest for two days.',
          fromDate: leaveFrom,
          toDate: leaveTo,
          status: 'pending',
          messages: [],
        });
      }
    }

    console.log('Generating student profiles and parent logins...');
    const classesToSeed = [
      { classVal: '10', sectionVal: 'A', teacherKey: 'mock-t1' },
      { classVal: '10', sectionVal: 'B', teacherKey: 'mock-t2' },
      { classVal: '9', sectionVal: 'A', teacherKey: 'mock-t4' },
      { classVal: '8', sectionVal: 'A', teacherKey: 'mock-t6' }
    ];

    const firstNames = ['Aarav', 'Ananya', 'Aditya', 'Diya', 'Kabir', 'Saanvi', 'Rohan', 'Neha', 'Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Riya', 'Arjun', 'Isha', 'Karan', 'Tanvi', 'Yash', 'Meera', 'Rudra', 'Kavya', 'Reyansh', 'Zara', 'Aaryan', 'Avani', 'Vihaan', 'Saisha', 'Krishna', 'Prisha'];
    const lastNames = ['Goud', 'Sen', 'Sinha', 'Prasad', 'Shah', 'Sharma', 'Patel', 'Verma', 'Gupta', 'Reddy', 'Rao', 'Nair', 'Mehta', 'Joshi', 'Chawla', 'Bose', 'Dutta', 'Pillai', 'Deshmukh', 'Kulkarni'];
    const clusters = ['Madhapur', 'Kondapur', 'Gachibowli', 'Miyapur', 'Hitech City'];
    const languages = ['en', 'hi', 'te'];

    let studentIndex = 1;
    for (const targetClass of classesToSeed) {
      const teacherObjectId = teacherIdMap[targetClass.teacherKey];
      for (let i = 1; i <= 30; i++) {
        // Generate name
        const firstName = firstNames[(studentIndex + i) % firstNames.length];
        const lastName = lastNames[(studentIndex + i * 2) % lastNames.length];
        const cluster = clusters[(studentIndex + i) % clusters.length];
        const preferredLanguage = languages[(studentIndex + i) % languages.length];
        
        // Auto-generate admission number from sequence
        const admissionNo = await getNextAdmissionNumber(2026);
        
        // Fee details
        const totalFee = 20000;
        const feePaid = Math.floor(Math.random() * 15000) + 5000; // between 5k and 20k
        const feePending = totalFee - feePaid;
        const booksFee = Math.floor(Math.random() * 2000) + 1000; // between 1k and 3k
        
        const whatsappNo = `+91987654${String(studentIndex).padStart(4, '0')}`;
        const motherWhatsappNo = `+91876543${String(studentIndex).padStart(4, '0')}`;

        const classNum = parseInt(targetClass.classVal, 10) || 10;
        const birthYear = 2026 - (5 + classNum); // e.g. class 10 -> 2011, class 9 -> 2012, class 8 -> 2013
        const birthMonth = (studentIndex % 12) + 1;
        const birthDay = (studentIndex % 28) + 1;
        const dateOfBirth = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));

        const pad = (n: number) => String(n).padStart(2, '0');
        const dobString = `${pad(birthDay)}${pad(birthMonth)}${birthYear}`;

        const student = await Student.create({
          admissionNo,
          admissionAcademicYear: '2026',
          firstName,
          lastName,
          class: targetClass.classVal,
          section: targetClass.sectionVal,
          classTeacher: teacherObjectId,
          rollNumber: i,
          status: 'active',
          whatsappNo,
          motherWhatsappNo,
          totalFee,
          feePaid,
          feePending,
          transportMode: i % 2 === 0 ? 'school' : 'private',
          booksFee,
          transportFee: i % 2 === 0 ? 3200 : 0,
          preferredLanguage,
          cluster,
          dateOfBirth,
          installments: [
            { installmentNo: 1, amount: Math.floor(totalFee / 2), dueDate: new Date('2026-04-30'), status: feePaid >= totalFee / 2 ? 'paid' : 'unpaid' },
            { installmentNo: 2, amount: Math.ceil(totalFee / 2), dueDate: new Date('2026-10-31'), status: feePaid >= totalFee ? 'paid' : 'unpaid' }
          ],
          payments: feePaid > 0 ? [
            { receiptNo: 'REC-' + admissionNo.replace('ADM-', '') + '-1', amount: feePaid, date: new Date('2026-05-15'), paymentMode: 'upi' }
          ] : []
        });

        // Create Parent login user
        await User.create({
          username: admissionNo.toLowerCase(),
          password: dobString,
          email: admissionNo.toLowerCase() + '@schoolhub.com',
          role: 'parent',
          studentId: student._id,
          firstName: 'Parent of',
          lastName: student.firstName + ' ' + student.lastName,
          phone: student.whatsappNo,
          isActive: true
        });

        studentIndex++;
      }
    }

    console.log('Seeding default school communications...');
    await Event.deleteMany({});
    await Event.create([
      {
        title: 'Annual Sports Day',
        description: 'Main ground · 8:00 AM',
        date: new Date('2026-02-14'),
        media: ['https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=800&q=80'],
        type: 'event'
      },
      {
        title: 'Science Lab Inspection',
        description: 'Classes 8-10 logs ready',
        date: new Date('2026-02-12'),
        media: [],
        type: 'notice'
      },
      {
        title: 'Holiday Announcement',
        description: 'Maha Shivratri festival',
        date: new Date('2026-02-15'),
        media: [],
        type: 'notice'
      }
    ]);

    console.log(`Database successfully seeded with ${studentIndex - 1} students and ${teachersData.length} teachers!`);
    if (shouldCloseConnection) {
      await mongoose.disconnect();
    }
  } catch (error) {
    console.error('Error seeding database:', error);
    if (shouldCloseConnection) {
      process.exit(1);
    }
    throw error;
  }
};

// Check if file is run directly
if (require.main === module || (process.argv[1] && (process.argv[1].includes('seed.ts') || process.argv[1].includes('seed.js')))) {
  seedDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}
