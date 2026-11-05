/**
 * Creates a parent login for every student that doesn't have one.
 *   username = admission number, password = primary WhatsApp number
 *   (date of birth also works until the parent sets a password).
 * Safe to re-run: students that already have a login are skipped.
 *
 *   npx ts-node-dev --transpile-only src/scripts/backfill-parent-logins.ts [--dry]
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Student } from '../models/student.model';
import { ensureParentLogin } from '../services/parentAccount.service';
import { User } from '../models/user.model';

dotenv.config();

(async () => {
  const dry = process.argv.includes('--dry');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-erp');
  const students = await Student.find({}).select('admissionNo firstName lastName whatsappNo').sort({ admissionNo: 1 }).lean();
  const haveLogin = new Set((await User.find({ role: 'parent' }).select('studentId').lean()).map(u => String(u.studentId)));
  const todo = students.filter(s => !haveLogin.has(String(s._id)));
  console.log(`${students.length} students, ${students.length - todo.length} already have a parent login, ${todo.length} to create${dry ? ' (dry run)' : ''}.`);
  let created = 0;
  for (const s of todo) {
    if (dry) { console.log(`  would create: ${String(s.admissionNo).toLowerCase()}  ${s.firstName} ${s.lastName || ''}`.trimEnd()); continue; }
    const r = await ensureParentLogin(s as any);
    if (r.created) created++;
    console.log(`  ${r.created ? 'created' : 'exists '}: ${r.username}  ${s.firstName} ${s.lastName || ''}`.trimEnd());
  }
  if (!dry) console.log(`Done. Created ${created} parent logins.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
