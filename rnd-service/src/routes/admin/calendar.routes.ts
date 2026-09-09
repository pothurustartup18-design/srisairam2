import { Router, Request, Response } from 'express';
import { AcademicCalendar } from '../../models/academicCalendar.model';
import { requirePermission } from '../../middlewares/permission.middleware';

const router = Router();

// GET /api/calendar/holidays — Fetch holidays & overrides for month/year or range
router.get('/holidays', requirePermission('attendance:view'), async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;

    let query: any = {};
    if (month && /^\d{4}-\d{2}$/.test(String(month))) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);

      query = {
        $or: [
          { date: { $gte: start, $lt: end } },
          { endDate: { $gte: start, $lt: end } },
          { date: { $lte: start }, endDate: { $gte: end } }
        ]
      };
    } else if (year && /^\d{4}$/.test(String(year))) {
      const start = new Date(`${year}-01-01T00:00:00.000Z`);
      const end = new Date(`${parseInt(String(year), 10) + 1}-01-01T00:00:00.000Z`);
      query = {
        $or: [
          { date: { $gte: start, $lt: end } },
          { endDate: { $gte: start, $lt: end } }
        ]
      };
    }

    const items = await AcademicCalendar.find(query).sort({ date: 1 }).lean();
    return res.status(200).json({ success: true, data: items });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/calendar/holidays — Create/Declare a holiday or vacation range
router.post('/holidays', requirePermission('attendance:mark'), async (req: Request, res: Response) => {
  try {
    const { title, date, endDate, type, category, isSchoolWide, applicableClasses, description } = req.body;

    if (!title || !date) {
      return res.status(400).json({ success: false, message: 'Title and Start Date are required.' });
    }

    const startDateObj = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`);
    if (isNaN(startDateObj.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid start date format.' });
    }

    let endDateObj: Date | undefined = undefined;
    if (endDate) {
      endDateObj = new Date(`${String(endDate).slice(0, 10)}T23:59:59.999Z`);
      if (isNaN(endDateObj.getTime())) {
        endDateObj = undefined;
      }
    }

    const holiday = await AcademicCalendar.create({
      title: title.trim(),
      date: startDateObj,
      endDate: endDateObj,
      type: type || (endDateObj ? 'vacation' : 'holiday'),
      category: category || 'festival',
      isSchoolWide: isSchoolWide !== false,
      applicableClasses: Array.isArray(applicableClasses) ? applicableClasses : [],
      description: description || '',
      createdBy: (req.user as any)?._id
    });

    return res.status(201).json({ success: true, data: holiday });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/calendar/holidays/:id — Delete a declared holiday
router.delete('/holidays/:id', requirePermission('attendance:mark'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await AcademicCalendar.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Holiday record not found.' });
    }
    return res.status(200).json({ success: true, message: 'Holiday removed successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/calendar/override-sunday — Toggle/Configure Sunday working day for specific classes
router.post('/override-sunday', requirePermission('attendance:mark'), async (req: Request, res: Response) => {
  try {
    const { date, enabled, applicableClasses, title } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required.' });
    }

    const dateStr = String(date).slice(0, 10);
    const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

    // Remove existing Sunday override for this date if any
    await AcademicCalendar.deleteMany({
      date: { $gte: dateStart, $lte: dateEnd },
      type: 'working_day_override'
    });

    const isEnabled = enabled !== undefined
      ? Boolean(enabled)
      : (Array.isArray(applicableClasses) ? applicableClasses.length > 0 : true);

    if (isEnabled && (!Array.isArray(applicableClasses) || applicableClasses.length > 0)) {
      const override = await AcademicCalendar.create({
        date: dateStart,
        title: title || 'Special Sunday Working Session',
        type: 'working_day_override',
        category: 'special_working_day',
        isSchoolWide: !applicableClasses || applicableClasses.length === 0,
        applicableClasses: Array.isArray(applicableClasses) ? applicableClasses : [],
        createdBy: (req.user as any)?._id
      });
      return res.status(200).json({ success: true, message: 'Sunday working day enabled.', data: override });
    }

    return res.status(200).json({ success: true, message: 'Sunday set to regular holiday.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
