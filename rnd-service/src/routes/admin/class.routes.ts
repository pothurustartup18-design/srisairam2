import { Router, Request, Response } from 'express';
import { ClassRoom } from '../../models/classRoom.model';
import { Student } from '../../models/student.model';
import { Teacher } from '../../models/teacher.model';
import { requirePermission } from '../../middlewares/permission.middleware';

const router = Router();

// Create new class
router.post('/', requirePermission('teachers:create'), async (req: Request, res: Response) => {
  try {
    let { className, section } = req.body;
    
    if (!className) {
      return res.status(400).json({ success: false, message: 'className is required.' });
    }

    className = className.toString().trim().toUpperCase();
    const validGrades = ['NURSERY', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    if (!validGrades.includes(className)) {
      return res.status(400).json({
        success: false,
        message: `Invalid grade '${className}'. Predefined grades are Nursery, LKG, UKG, and 1 to 10.`
      });
    }

    section = section ? section.toString().trim().toUpperCase() : '-';

    // Check if it already exists in DB
    const existing = await ClassRoom.findOne({ className, section });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Class already exists.' });
    }

    const classRoom = new ClassRoom({ className, section });
    await classRoom.save();
    return res.status(201).json({ success: true, data: classRoom });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a class
router.delete('/:id', requirePermission('teachers:create'), async (req: Request, res: Response) => {
  try {
    const classId = req.params.id;

    const classRoom = await ClassRoom.findById(classId);
    if (!classRoom) {
      return res.status(404).json({ success: false, message: 'Class not found.' });
    }

    // Check if any student is in this class and section
    const studentCount = await Student.countDocuments({ class: classRoom.className, section: classRoom.section });

    // Check if any teacher is assigned to this class and section
    const targetClassString = `${classRoom.className}-${classRoom.section}`;
    const teacherCount = await Teacher.countDocuments({
      $or: [
        { classTeacherOf: targetClassString },
        { teachingClasses: targetClassString },
        { assignedClass: { $regex: new RegExp(`(^|,\\s*)${targetClassString}(\\s*,|$)`, 'i') } }
      ]
    });

    if (studentCount > 0 || teacherCount > 0) {
      const reasons: string[] = [];
      if (studentCount > 0) reasons.push(`${studentCount} student(s) are currently enrolled`);
      if (teacherCount > 0) reasons.push(`${teacherCount} teacher(s) are assigned to it`);
      return res.status(400).json({
        success: false,
        message: `Cannot delete class ${classRoom.className}-${classRoom.section} because: ${reasons.join(', ')}. Please reassign them first.`
      });
    }

    await ClassRoom.findByIdAndDelete(classId);
    return res.status(200).json({ success: true, message: 'Class deleted successfully.', data: classRoom });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// List all classes
router.get('/', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const classes = await ClassRoom.find({}).lean();
    return res.status(200).json({ success: true, data: classes });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
