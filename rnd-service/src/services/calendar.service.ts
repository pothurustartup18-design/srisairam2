import { AcademicCalendar } from '../models/academicCalendar.model';

/**
 * Checks whether a given date is a valid working day for the specified class.
 * - Non-working Sundays (without working day override) return false.
 * - Declared holidays or vacation ranges (school-wide or for this class) return false.
 * - Otherwise returns true.
 */
export async function isDateWorkingDay(date: Date | string, className?: string): Promise<boolean> {
  const d = new Date(date);
  if (isNaN(d.getTime())) return true;

  const dateStr = d.toISOString().slice(0, 10);
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
  const dayOfWeek = startOfDay.getUTCDay(); // 0 = Sunday

  // Sunday check
  if (dayOfWeek === 0) {
    const override = await AcademicCalendar.findOne({
      date: { $gte: startOfDay, $lte: endOfDay },
      type: 'working_day_override'
    }).lean();

    if (!override) return false; // Default Sunday is non-working
    if (override.isSchoolWide) return true;
    if (className && override.applicableClasses && override.applicableClasses.includes(className)) {
      return true;
    }
    return false;
  }

  // Declared Holiday / Vacation check
  const holiday = await AcademicCalendar.findOne({
    type: { $in: ['holiday', 'vacation'] },
    $or: [
      { date: { $lte: endOfDay }, endDate: { $gte: startOfDay } },
      { date: { $gte: startOfDay, $lte: endOfDay } }
    ]
  }).lean();

  if (holiday) {
    if (holiday.isSchoolWide) return false;
    if (className && holiday.applicableClasses && holiday.applicableClasses.includes(className)) {
      return false;
    }
  }

  return true;
}

/**
 * Filters an array of attendance registers to exclude registers that fall on
 * non-working Sundays or declared holidays, automatically protecting report cards
 * and attendance % from retroactive holidays.
 */
export async function filterWorkingAttendanceRegisters(registers: any[], className?: string): Promise<any[]> {
  if (!registers || registers.length === 0) return [];

  const dates = registers.map(r => new Date(r.date)).filter(d => !isNaN(d.getTime()));
  if (dates.length === 0) return registers;

  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
  minDate.setUTCHours(0, 0, 0, 0);
  maxDate.setUTCHours(23, 59, 59, 999);

  const calendarItems = await AcademicCalendar.find({
    $or: [
      { date: { $gte: minDate, $lte: maxDate } },
      { endDate: { $gte: minDate, $lte: maxDate } },
      { date: { $lte: minDate }, endDate: { $gte: maxDate } }
    ]
  }).lean();

  return registers.filter(reg => {
    const regDate = new Date(reg.date);
    const regDateStr = regDate.toISOString().slice(0, 10);
    const dayOfWeek = regDate.getUTCDay(); // 0 = Sunday
    const regClass = reg.class || className;

    // 1. Sunday check
    if (dayOfWeek === 0) {
      const override = calendarItems.find(
        c => c.type === 'working_day_override' &&
             new Date(c.date).toISOString().slice(0, 10) === regDateStr
      );
      if (!override) return false; // Default Sunday is non-working
      if (!override.isSchoolWide && regClass && override.applicableClasses && !override.applicableClasses.includes(regClass)) {
        return false;
      }
      return true;
    }

    // 2. Holiday / Vacation check
    const holiday = calendarItems.find(c => {
      if (c.type !== 'holiday' && c.type !== 'vacation') return false;
      const sDateStr = new Date(c.date).toISOString().slice(0, 10);
      const eDateStr = c.endDate ? new Date(c.endDate).toISOString().slice(0, 10) : sDateStr;
      return sDateStr <= regDateStr && eDateStr >= regDateStr;
    });

    if (holiday) {
      if (holiday.isSchoolWide) return false;
      if (regClass && holiday.applicableClasses && holiday.applicableClasses.includes(regClass)) {
        return false;
      }
    }

    return true;
  });
}
