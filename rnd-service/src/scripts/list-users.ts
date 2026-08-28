import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/user.model';
import { Teacher } from '../models/teacher.model';
import { Student } from '../models/student.model';

dotenv.config();

const listUsers = async () => {
  try {
    const connString = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-erp';
    console.log("Connecting to database: " + connString);
    await mongoose.connect(connString);

    const users = await User.find({});
    console.log(`\n--- ALL USERS IN DB (Total: ${users.length}) ---`);
    users.forEach(u => {
      console.log(`- ID: ${u._id} | Username: ${u.username} | Role: ${u.role} | Active: ${u.isActive}`);
    });

    const teachers = await Teacher.find({});
    console.log(`\n--- ALL TEACHERS IN DB (Total: ${teachers.length}) ---`);
    teachers.forEach(t => {
      console.log(`- ID: ${t._id} | Name: ${t.name} | EmpID: ${t.employeeId}`);
    });

    const students = await Student.find({});
    console.log(`\n--- ALL STUDENTS IN DB (Total: ${students.length}) ---`);
    students.forEach(s => {
      console.log(`- ID: ${s._id} | Name: ${s.firstName} ${s.lastName} | AdmNo: ${s.admissionNo}`);
    });

    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

listUsers();
