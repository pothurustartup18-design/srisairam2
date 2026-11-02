import { Router, Request, Response } from 'express';
import { Attendance } from '../../models/attendance.model';
import { Teacher } from '../../models/teacher.model';
import { requirePermission } from '../../middlewares/permission.middleware';
import { Student } from '../../models/student.model';
import { PermissionDelegation } from '../../models/permissionDelegation.model';
import { queueTemplateNotification } from '../../config/queue';
import { SystemConfig } from '../../models/systemConfig.model';
import { clearCache } from '../../middlewares/cache.middleware';
import { requireOwnStudent } from '../../middlewares/threadAccess.middleware';
import { filterWorkingAttendanceRegisters } from '../../services/calendar.service';

const router = Router();

// Tally present/absent counts per student across a set of attendance registers
const tallyAttendance = (registers: Array<{ records: Array<{ student: any; status: string; morningStatus?: string; afternoonStatus?: string }> }>) => {
  const counts: Record<string, { total: number; present: number }> = {};
  registers.forEach((reg) => {
    reg.records.forEach((r) => {
      const sId = String(r.student);
      if (!counts[sId]) counts[sId] = { total: 0, present: 0 };
      if (r.morningStatus || r.afternoonStatus) {
        counts[sId].total += 1;
        let dayPresent = 0;
        if (r.morningStatus === 'present') dayPresent += 0.5;
        if (r.afternoonStatus === 'present') dayPresent += 0.5;
        counts[sId].present += dayPresent;
      } else {
        counts[sId].total++;
        if (r.status === 'present') counts[sId].present++;
      }
    });
  });
  return counts;
};

// Resolve display info for a set of student ids
const resolveStudentInfo = async (studentIds: string[]): Promise<Record<string, { name: string; admissionNo: string; cluster?: string }>> => {
  const info: Record<string, { name: string; admissionNo: string; cluster?: string }> = {};
  const students = await Student.find({ _id: { $in: studentIds } }, { firstName: 1, lastName: 1, admissionNo: 1, cluster: 1 }).lean();
  for (const sId of studentIds) {
    const s = students.find(st => String(st._id) === sId);
    info[sId] = s
      ? { name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, cluster: s.cluster || '' }
      : { name: 'Unknown Student', admissionNo: '', cluster: '' };
  }
  return info;
};

// Helper to verify delegation status
const verifyDelegation = async (fromTeacherId: string, toTeacherId: string, feature: string): Promise<boolean> => {
  const delegation = await PermissionDelegation.findOne({
    fromTeacher: fromTeacherId,
    toTeacher: toTeacherId,
    feature,
    isActive: true
  });
  return !!delegation;
};

// Save or Update Attendance register
router.post('/', requirePermission('attendance:mark'), async (req: Request, res: Response) => {
  try {
    const { date, classTeacherId, class: className, records } = req.body;

    if (!date || !classTeacherId || !className || !records || !Array.isArray(records)) {
      return res.status(400).json({
        success: false,
        message: 'date, classTeacherId, class, and records array are required.',
      });
    }

    const dateStr = new Date(date).toISOString().split('T')[0];
    const parsedDate = new Date(dateStr);

    const userRole = (req.user as any)?.role;
    const userId = (req.user as any)?._id;

    // Enforce date lockout (same-day edits only for teachers, admins can edit past registers)
    const todayStr = new Date().toISOString().split('T')[0];
    if (userRole === 'teacher' && dateStr !== todayStr) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Attendance registers can only be marked or edited for today by teachers.',
      });
    }

    // Enforce class teacher and admin restrictions
    if (userRole === 'teacher') {

      // 2. Validate linked Teacher profile matches
      let teacher: any = null;
      teacher = await Teacher.findOne({ userId });

      if (!teacher) {
        return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
      }

      const isDelegated = await verifyDelegation(classTeacherId, teacher._id.toString(), 'attendance');
      if (teacher._id.toString() !== classTeacherId && !isDelegated) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You can only submit attendance registers for your assigned class or delegated classes.',
        });
      }

      if (teacher._id.toString() === classTeacherId) {
        // Validate teacher is assigned to this class room
        const assignedRooms = teacher.assignedClass.split(',').map((c: string) => c.trim());
        if (!assignedRooms.includes(className)) {
          return res.status(403).json({
            success: false,
            message: `Forbidden: You are not assigned as the class teacher for ${className}.`,
          });
        }
      }
    } else if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only assigned class teachers and admins can mark attendance.',
      });
    }

    const recordsToSave = records.map((r: any) => ({
      student: r.studentId,
      status: r.status,
      morningStatus: r.morningStatus,
      afternoonStatus: r.afternoonStatus,
    }));

    const filter = { date: parsedDate, classTeacher: classTeacherId };
    const update = {
      class: className,
      records: recordsToSave,
      lastEditedBy: userId,
      lastEditedAt: new Date()
    };

    // Fetch previous attendance state before we overwrite it
    let previousRecord: any = null;
    previousRecord = await Attendance.findOne({ date: parsedDate, classTeacher: classTeacherId });
    
    await Attendance.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    try {
      await clearCache('/api/dashboard/*');
    } catch (cacheErr) {
      console.error('Failed to clear dashboard cache:', cacheErr);
    }

    // Return immediate success to client for snappy (< 100ms) UI response
    res.status(201).json({
      success: true,
      message: 'Attendance register saved successfully.',
    });

    // Send WhatsApp alerts asynchronously in the background (does not block client)
    if (req.body.sendAlerts) {
      (async () => {
        try {
          const absentRecords = records.filter((r: any) =>
            r.status === 'absent' || r.morningStatus === 'absent' || r.afternoonStatus === 'absent'
          );
          if (absentRecords.length === 0) return;

          const config = await SystemConfig.findOne({ key: 'attendanceMode' });
          const isHalfDay = config ? config.value === 'half-day' : false;

          // Batch query ONLY absent students in ONE single query
          const absentIds = absentRecords.map((r: any) => r.studentId);
          const absentStudents = await Student.find({ _id: { $in: absentIds } }).lean();
          const studentMap = new Map(absentStudents.map((s: any) => [String(s._id), s]));

          for (const rec of absentRecords) {
            const student: any = studentMap.get(String(rec.studentId));
            if (!student || !student.whatsappNo) continue;

            const studentName = student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim();
            const existingStudentRec = previousRecord?.records?.find(
              (r: any) => (r.student || '').toString() === String(rec.studentId)
            );
            const nameParams = { student_name_en: studentName, student_name_te: studentName };

            if (isHalfDay) {
              if (rec.morningStatus === 'absent' && existingStudentRec?.morningStatus !== 'absent') {
                await queueTemplateNotification('attendance.morning', {
                  to: student.whatsappNo,
                  params: nameParams,
                  dedupeKey: `attendance:${dateStr}:${rec.studentId}:morning`
                });
                console.log(`[Attendance WhatsApp Alert] Morning template queued for student ${studentName} to ${student.whatsappNo}`);
              }

              if (rec.afternoonStatus === 'absent' && existingStudentRec?.afternoonStatus !== 'absent') {
                await queueTemplateNotification('attendance.afternoon', {
                  to: student.whatsappNo,
                  params: nameParams,
                  dedupeKey: `attendance:${dateStr}:${rec.studentId}:afternoon`
                });
                console.log(`[Attendance WhatsApp Alert] Afternoon template queued for student ${studentName} to ${student.whatsappNo}`);
              }
            } else {
              if (rec.status === 'absent' && existingStudentRec?.status !== 'absent') {
                await queueTemplateNotification('attendance.full', {
                  to: student.whatsappNo,
                  params: nameParams,
                  dedupeKey: `attendance:${dateStr}:${rec.studentId}:full`
                });
                console.log(`[Attendance WhatsApp Alert] Full-day template queued for student ${studentName} to ${student.whatsappNo}`);
              }
            }
          }
        } catch (alertErr) {
          console.error('[Attendance WhatsApp Alert Background Error]:', alertErr);
        }
      })();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch Attendance Register History for a date
router.get('/history', requirePermission('attendance:view'), async (req: Request, res: Response) => {
  try {
    const { teacherId, date } = req.query;

    if (!teacherId || !date) {
      return res.status(400).json({ success: false, message: 'teacherId and date are required.' });
    }

    const dateStr = new Date(date as string).toISOString().split('T')[0];

    const parsedDate = new Date(dateStr);
    const record = await Attendance.findOne({ classTeacher: teacherId, date: parsedDate });
    if (!record) {
      return res.status(200).json({ success: true, data: null });
    }

    const formattedRecords = record.records.map((r: any) => ({
      studentId: r.student.toString(),
      status: r.status,
      morningStatus: r.morningStatus,
      afternoonStatus: r.afternoonStatus,
    }));

    return res.status(200).json({
      success: true,
      data: {
        date: record.date.toISOString().split('T')[0],
        classTeacherId: record.classTeacher.toString(),
        class: record.class,
        records: formattedRecords,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Monthly attendance report for a class teacher (JSON or CSV)
router.get('/report/monthly', requirePermission('attendance:view'), async (req: Request, res: Response) => {
  try {
    const { teacherId, month, format } = req.query;
    if (!teacherId || !month || !/^\d{4}-\d{2}$/.test(String(month))) {
      return res.status(400).json({ success: false, message: 'teacherId and month (YYYY-MM) are required.' });
    }

    const monthStr = String(month);
    const start = new Date(`${monthStr}-01`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    let registers: Array<{ records: Array<{ student: any; status: string }> }>;
    registers = await Attendance.find({ classTeacher: teacherId, date: { $gte: start, $lt: end } });
    registers = await filterWorkingAttendanceRegisters(registers);

    const counts = tallyAttendance(registers);
    const studentIds = Object.keys(counts);
    const info = await resolveStudentInfo(studentIds);

    const rows = studentIds.map(sId => ({
      studentId: sId,
      name: info[sId].name,
      admissionNo: info[sId].admissionNo,
      cluster: info[sId].cluster || '',
      workingDays: counts[sId].total,
      present: counts[sId].present,
      absent: counts[sId].total - counts[sId].present,
      percentage: counts[sId].total === 0 ? 100 : Math.round((counts[sId].present / counts[sId].total) * 100)
    })).sort((a, b) => a.name.localeCompare(b.name));

    if (format === 'csv') {
      const header = 'Admission No,Name,Working Days,Present,Absent,Percentage';
      const csv = [header, ...rows.map(r =>
        `${r.admissionNo},"${r.name.replace(/"/g, '""')}",${r.workingDays},${r.present},${r.absent},${r.percentage}%`
      )].join('\r\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${monthStr}.csv"`);
      return res.status(200).send(csv);
    }

    return res.status(200).json({
      success: true,
      month: monthStr,
      registersCount: registers.length,
      data: rows
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Attendance defaulters (students below a percentage threshold, all-time)
router.get('/report/defaulters', requirePermission('attendance:view'), async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.query;
    const threshold = Math.min(100, Math.max(0, Number(req.query.threshold) || 75));
    if (!teacherId) {
      return res.status(400).json({ success: false, message: 'teacherId is required.' });
    }

    let registers: Array<{ records: Array<{ student: any; status: string }> }>;
    registers = await Attendance.find({ classTeacher: teacherId });
    registers = await filterWorkingAttendanceRegisters(registers);

    const counts = tallyAttendance(registers);
    const defaulterIds = Object.keys(counts).filter(sId => {
      const c = counts[sId];
      const pct = c.total === 0 ? 100 : (c.present / c.total) * 100;
      return pct < threshold;
    });
    const info = await resolveStudentInfo(defaulterIds);

    const data = defaulterIds.map(sId => ({
      studentId: sId,
      name: info[sId].name,
      admissionNo: info[sId].admissionNo,
      cluster: info[sId].cluster || '',
      present: counts[sId].present,
      total: counts[sId].total,
      percentage: Math.round((counts[sId].present / counts[sId].total) * 100)
    })).sort((a, b) => a.percentage - b.percentage);

    return res.status(200).json({ success: true, threshold, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch student attendance percentages stats
router.get('/student-stats', requirePermission('attendance:view'), async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.query;

    if (!teacherId) {
      return res.status(400).json({ success: false, message: 'teacherId is required.' });
    }

    const stats: Record<string, number> = {};

    let registers = await Attendance.find({ classTeacher: teacherId });
    registers = await filterWorkingAttendanceRegisters(registers);
    const studentRegistersCount: Record<string, { total: number; present: number }> = {};

    registers.forEach((reg) => {
      reg.records.forEach((r: any) => {
        const sId = r.student.toString();
        if (!studentRegistersCount[sId]) {
          studentRegistersCount[sId] = { total: 0, present: 0 };
        }
        if (r.morningStatus || r.afternoonStatus) {
          studentRegistersCount[sId].total += 1;
          let dayPresent = 0;
          if (r.morningStatus === 'present') dayPresent += 0.5;
          if (r.afternoonStatus === 'present') dayPresent += 0.5;
          studentRegistersCount[sId].present += dayPresent;
        } else {
          studentRegistersCount[sId].total++;
          if (r.status === 'present') {
            studentRegistersCount[sId].present++;
          }
        }
      });
    });

    Object.keys(studentRegistersCount).forEach((sId) => {
      const counts = studentRegistersCount[sId];
      stats[sId] = counts.total === 0 ? 100 : Math.round((counts.present / counts.total) * 100);
    });

    return res.status(200).json({ success: true, stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/attendance/summary/student/:studentId
router.get('/summary/student/:studentId', requireOwnStudent(), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    let workingDays = 0;
    let presentDays = 0;

    let records = await Attendance.find({ 'records.student': studentId });
    records = await filterWorkingAttendanceRegisters(records);
    workingDays = records.length;
    records.forEach((reg) => {
      const rec = reg.records.find((r: any) => String(r.student) === studentId);
      if (rec) {
        if (rec.morningStatus || rec.afternoonStatus) {
          let dayPres = 0;
          if (rec.morningStatus === 'present') dayPres += 0.5;
          if (rec.afternoonStatus === 'present') dayPres += 0.5;
          presentDays += dayPres;
        } else if (rec.status === 'present') {
          presentDays += 1;
        }
      }
    });

    const percentage = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;
    return res.status(200).json({
      success: true,
      data: {
        workingDays,
        presentDays,
        percentage: Number(percentage.toFixed(2))
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/attendance/history/student/:studentId
router.get('/history/student/:studentId', requireOwnStudent(), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const records = await Attendance.find({ 'records.student': studentId }).sort({ date: -1 });
    const history = records.map((reg) => {
      const rec = reg.records.find((r: any) => String(r.student) === studentId);
      return {
        date: reg.date,
        status: rec?.status || 'present',
        morningStatus: rec?.morningStatus,
        afternoonStatus: rec?.afternoonStatus
      };
    });
    
    return res.status(200).json({ success: true, data: history });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
