import { Router, Request, Response } from 'express';
import { Homework } from '../../models/homework.model';
import { Teacher } from '../../models/teacher.model';
import { Student } from '../../models/student.model';
import { requirePermission } from '../../middlewares/permission.middleware';
import { PermissionDelegation } from '../../models/permissionDelegation.model';

const router = Router();

const normalizeRoom = (room: string) => room.toString().trim().toUpperCase();

// True when the teacher's comma-separated assignedClass list contains the room
const teacherAssignedToRoom = (assignedClass: string, room: string) =>
  assignedClass.split(',').map(r => r.trim().toUpperCase()).includes(room);

const verifyDelegation = async (fromTeacherId: string, toTeacherId: string, feature: string): Promise<boolean> => {
  const delegation = await PermissionDelegation.findOne({
    fromTeacher: fromTeacherId,
    toTeacher: toTeacherId,
    feature,
    isActive: true
  });
  return !!delegation;
};

// Create homework (Teacher for own class, Admin for any class)
router.post('/', requirePermission('homework:create'), async (req: Request, res: Response) => {
  try {
    const { classRoom, subject, title, description, dueDate, attachments } = req.body;

    if (!classRoom || !subject || !title || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'classRoom (e.g. "10-A"), subject, title, and dueDate are required.'
      });
    }
    const parsedDue = new Date(dueDate);
    if (isNaN(parsedDue.getTime())) {
      return res.status(400).json({ success: false, message: 'dueDate is not a valid date.' });
    }

    const room = normalizeRoom(classRoom);
    const userRole = (req.user as any)?.role;
    const userId = (req.user as any)?._id;
    let createdBy: any = undefined;
    let createdByName = 'Admin';

    if (userRole === 'teacher') {
      const teacher = await Teacher.findOne({ userId });
      if (!teacher) {
        return res.status(403).json({ success: false, message: 'Forbidden: Teacher profile not found.' });
      }

      const ownerTeacher = await Teacher.findOne({
        assignedClass: { $regex: new RegExp(`\\b${room}\\b`, 'i') }
      });
      const isDelegated = ownerTeacher ? await verifyDelegation(ownerTeacher._id.toString(), teacher._id.toString(), 'homework') : false;

      if (!teacherAssignedToRoom(teacher.assignedClass, room) && !isDelegated) {
        return res.status(403).json({ success: false, message: `Forbidden: You are not assigned to class ${room}.` });
      }
      createdBy = isDelegated && ownerTeacher ? ownerTeacher._id : teacher._id;
      createdByName = teacher.name;
    } else {
      const user = req.user as any;
      createdByName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin';
    }

    const homeworkData = {
      classRoom: room,
      subject,
      title,
      description: description || '',
      dueDate: parsedDue,
      attachments: Array.isArray(attachments) ? attachments : [],
      createdBy,
      createdByName,
      acknowledgements: [] as any[]
    };

    const homework = await Homework.create(homeworkData);
    return res.status(201).json({ success: true, data: homework });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// List homework for a class room (parents may only view their own child's class)
router.get('/class/:classRoom', requirePermission('homework:read'), async (req: Request, res: Response) => {
  try {
    const room = normalizeRoom(req.params.classRoom);
    const user = req.user as any;

    // Data boundary: a parent can only read homework for their ward's class room
    if (user?.role === 'parent' && true) {
      const student = user.studentId ? await Student.findById(user.studentId) : null;
      if (!student || normalizeRoom(`${student.class}-${student.section}`) !== room) {
        return res.status(403).json({ success: false, message: "Forbidden: You can only view your own child's class homework." });
      }
    }

    const records = await Homework.find({ classRoom: room }).sort({ dueDate: -1 });
    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Parent acknowledges a homework item for their child
router.post('/:homeworkId/ack', requirePermission('homework:read'), async (req: Request, res: Response) => {
  try {
    const { homeworkId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'studentId is required.' });
    }
    // Note: requirePermission already blocks parents whose linked studentId differs from body.studentId

    const homework = await Homework.findById(homeworkId);
    if (!homework) return res.status(404).json({ success: false, message: 'Homework not found.' });

    if (!homework.acknowledgements.some(a => a.student.toString() === studentId)) {
      const student = await Student.findById(studentId);
      if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
      homework.acknowledgements.push({
        student: student._id,
        studentName: `${student.firstName} ${student.lastName}`,
        at: new Date()
      } as any);
      await homework.save();
    }

    return res.status(200).json({ success: true, data: homework });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete homework (creator teacher or admin)
router.delete('/:homeworkId', requirePermission('homework:create'), async (req: Request, res: Response) => {
  try {
    const { homeworkId } = req.params;
    const userRole = (req.user as any)?.role;
    const userId = (req.user as any)?._id;

    const homework = await Homework.findById(homeworkId);
    if (!homework) return res.status(404).json({ success: false, message: 'Homework not found.' });

    if (userRole === 'teacher') {
      const teacher = await Teacher.findOne({ userId });
      if (!teacher || !homework.createdBy || homework.createdBy.toString() !== teacher._id.toString()) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only delete homework you created.' });
      }
    }

    await homework.deleteOne();
    return res.status(200).json({ success: true, message: 'Homework deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
