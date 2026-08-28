import { Teacher } from '../models/teacher.model';
import { Student } from '../models/student.model';
import { SalaryPayment } from '../models/salaryPayment.model';
import { VariableExpense } from '../models/variableExpense.model';
import { ServiceError } from '../utils/responseHelpers';

const currentMonth = (): string => new Date().toISOString().slice(0, 7); // 'YYYY-MM'

const monthBounds = (month: string) => {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { start, end };
};

export async function getSalariesForMonth(month?: string) {
  const targetMonth = month || currentMonth();

  const teachers = await Teacher.find({ status: 'active' }, { name: 1, employeeId: 1, salary: 1 }).lean();
  const payments = await SalaryPayment.find({ month: targetMonth }).lean();
  const paidByTeacher = new Map(payments.map((p) => [String(p.teacher), p]));

  const rows = teachers.map((t: any) => {
    const payment = paidByTeacher.get(String(t._id));
    return {
      teacherId: t._id,
      name: t.name,
      employeeId: t.employeeId || '',
      salary: t.salary || 0,
      paid: !!payment,
      paidDate: payment?.paidDate || null
    };
  });

  return { month: targetMonth, rows };
}

export async function markSalaryPaid(teacherId: string, month: string | undefined, adminUserId: string | undefined) {
  const targetMonth = month || currentMonth();
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) throw new ServiceError(404, 'Teacher not found.');

  const payment = await SalaryPayment.findOneAndUpdate(
    { teacher: teacherId, month: targetMonth },
    { amount: teacher.salary || 0, paidDate: new Date(), markedBy: adminUserId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return payment;
}

export async function markSalaryUnpaid(teacherId: string, month: string | undefined) {
  const targetMonth = month || currentMonth();
  await SalaryPayment.deleteOne({ teacher: teacherId, month: targetMonth });
}

// Full running ledger — used by the Variable tab, intentionally not scoped to a month
// so admins can see and settle older unpaid bills too.
export async function listVariableExpenses() {
  return VariableExpense.find({}).sort({ date: -1 }).lean();
}

// Scoped to a single month — used by the dashboard summary/trends so those figures
// actually match the selected month instead of an all-time total.
async function getVariableExpensesForMonth(month: string) {
  const { start, end } = monthBounds(month);
  return VariableExpense.find({ date: { $gte: start, $lt: end } }).lean();
}

export async function createVariableExpense(body: any, adminUserId: string | undefined) {
  const { title, note, amount, date } = body;
  if (!title || !String(title).trim()) {
    throw new ServiceError(400, 'Title is required.');
  }
  if (amount === undefined || amount === null || Number(amount) <= 0) {
    throw new ServiceError(400, 'Amount must be greater than zero.');
  }

  const expense = new VariableExpense({
    title: String(title).trim(),
    note: note ? String(note).trim() : '',
    amount: Number(amount),
    date: date ? new Date(date) : new Date(),
    createdBy: adminUserId
  });
  await expense.save();
  return expense;
}

export async function toggleVariableExpensePaid(id: string, paid: boolean) {
  const expense = await VariableExpense.findById(id);
  if (!expense) throw new ServiceError(404, 'Expense not found.');

  expense.paid = !!paid;
  expense.paidDate = paid ? new Date() : undefined;
  await expense.save();
  return expense;
}

export async function deleteVariableExpense(id: string) {
  const expense = await VariableExpense.findByIdAndDelete(id);
  if (!expense) throw new ServiceError(404, 'Expense not found.');
}

// School income for a month = fee payments actually collected that month
// (same Student.payments source the fee-collections report already uses).
export async function getMonthlyIncome(month?: string): Promise<number> {
  const targetMonth = month || currentMonth();
  const { start, end } = monthBounds(targetMonth);

  const result = await Student.aggregate([
    { $unwind: '$payments' },
    { $match: { 'payments.date': { $gte: start, $lt: end } } },
    { $group: { _id: null, total: { $sum: '$payments.amount' } } }
  ]);
  return result[0]?.total || 0;
}

// Builds the last `count` month keys ('YYYY-MM'), oldest first, ending at the current month.
function lastMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

export async function getMonthlyTrends(monthsBack = 6) {
  const months = lastMonthKeys(monthsBack);
  const rangeStart = new Date(`${months[0]}-01T00:00:00`);

  const salaryByMonth = await SalaryPayment.aggregate([
    { $match: { month: { $in: months } } },
    { $group: { _id: '$month', total: { $sum: '$amount' } } }
  ]);
  const salaryMap = new Map(salaryByMonth.map((r) => [r._id, r.total]));

  const variableByMonth = await VariableExpense.aggregate([
    { $match: { date: { $gte: rangeStart } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
        total: { $sum: '$amount' },
        paid: { $sum: { $cond: ['$paid', '$amount', 0] } }
      }
    }
  ]);
  const variableMap = new Map(variableByMonth.map((r) => [r._id, r]));

  const incomeByMonth = await Student.aggregate([
    { $unwind: '$payments' },
    { $match: { 'payments.date': { $gte: rangeStart } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$payments.date' } }, total: { $sum: '$payments.amount' } } }
  ]);
  const incomeMap = new Map(incomeByMonth.map((r) => [r._id, r.total]));

  return months.map((key) => {
    const v = variableMap.get(key);
    const salaryPaid = salaryMap.get(key) || 0;
    const variablePaid = v?.paid || 0;
    const income = incomeMap.get(key) || 0;
    return {
      month: key,
      monthLabel: monthLabel(key),
      income,
      salaryPaid,
      variableTotal: v?.total || 0,
      variablePaid,
      netProfit: income - (salaryPaid + variablePaid)
    };
  });
}

export async function getDashboardSummary(month?: string) {
  const { month: targetMonth, rows: salaryRows } = await getSalariesForMonth(month);
  const variableExpenses = await getVariableExpensesForMonth(targetMonth);
  const income = await getMonthlyIncome(targetMonth);

  const salaryTotal = salaryRows.reduce((sum, r) => sum + r.salary, 0);
  const salaryPaid = salaryRows.filter((r) => r.paid).reduce((sum, r) => sum + r.salary, 0);
  const salaryPending = salaryTotal - salaryPaid;
  const salaryPaidCount = salaryRows.filter((r) => r.paid).length;

  const variableTotal = variableExpenses.reduce((sum, e: any) => sum + e.amount, 0);
  const variablePaid = variableExpenses.filter((e: any) => e.paid).reduce((sum, e: any) => sum + e.amount, 0);
  const variablePending = variableTotal - variablePaid;

  const combinedOutflowPaid = salaryPaid + variablePaid;
  const combinedOutflowPending = salaryPending + variablePending;

  return {
    month: targetMonth,
    income,
    salary: {
      total: salaryTotal,
      paid: salaryPaid,
      pending: salaryPending,
      paidCount: salaryPaidCount,
      totalCount: salaryRows.length
    },
    variable: {
      total: variableTotal,
      paid: variablePaid,
      pending: variablePending,
      count: variableExpenses.length
    },
    combinedOutflowPaid,
    combinedOutflowPending,
    // Net profit = fees collected this month minus everything actually paid out this
    // month (salaries + variable bills). Pending/unpaid obligations aren't subtracted
    // since that money hasn't left the school's account yet.
    netProfit: income - combinedOutflowPaid
  };
}
