import { Router, Request, Response } from 'express';
import { requirePermission } from '../../middlewares/permission.middleware';
import { audit } from '../../middlewares/audit.middleware';
import { clearCache } from '../../middlewares/cache.middleware';
import { ServiceError } from '../../utils/responseHelpers';
import {
  getSalariesForMonth,
  markSalaryPaid,
  markSalaryUnpaid,
  listVariableExpenses,
  createVariableExpense,
  toggleVariableExpensePaid,
  deleteVariableExpense,
  getDashboardSummary,
  getMonthlyTrends
} from '../../services/expenditure.service';

const router = Router();

function handleError(res: Response, error: any) {
  if (error instanceof ServiceError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: error.message });
}

// GET /api/expenditure/salaries?month=YYYY-MM
router.get('/salaries', requirePermission('expenditure:view'), async (req: Request, res: Response) => {
  try {
    const data = await getSalariesForMonth(req.query.month as string | undefined);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// PATCH /api/expenditure/salaries/:teacherId/pay
router.patch('/salaries/:teacherId/pay', requirePermission('expenditure:manage'), audit('expenditure:salary-pay'), async (req: Request, res: Response) => {
  try {
    const adminUserId = (req.user as any)?._id;
    const payment = await markSalaryPaid(req.params.teacherId, req.body.month, adminUserId);
    await clearCache('/api/expenditure/*');
    return res.status(200).json({ success: true, data: payment });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// PATCH /api/expenditure/salaries/:teacherId/unpay
router.patch('/salaries/:teacherId/unpay', requirePermission('expenditure:manage'), audit('expenditure:salary-unpay'), async (req: Request, res: Response) => {
  try {
    await markSalaryUnpaid(req.params.teacherId, req.body.month);
    await clearCache('/api/expenditure/*');
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// GET /api/expenditure/variable
router.get('/variable', requirePermission('expenditure:view'), async (req: Request, res: Response) => {
  try {
    const data = await listVariableExpenses();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// POST /api/expenditure/variable
router.post('/variable', requirePermission('expenditure:manage'), audit('expenditure:variable-create'), async (req: Request, res: Response) => {
  try {
    const adminUserId = (req.user as any)?._id;
    const expense = await createVariableExpense(req.body, adminUserId);
    await clearCache('/api/expenditure/*');
    return res.status(201).json({ success: true, data: expense });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// PATCH /api/expenditure/variable/:id/toggle-paid
router.patch('/variable/:id/toggle-paid', requirePermission('expenditure:manage'), audit('expenditure:variable-toggle'), async (req: Request, res: Response) => {
  try {
    const expense = await toggleVariableExpensePaid(req.params.id, !!req.body.paid);
    await clearCache('/api/expenditure/*');
    return res.status(200).json({ success: true, data: expense });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// DELETE /api/expenditure/variable/:id
router.delete('/variable/:id', requirePermission('expenditure:manage'), audit('expenditure:variable-delete'), async (req: Request, res: Response) => {
  try {
    await deleteVariableExpense(req.params.id);
    await clearCache('/api/expenditure/*');
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// GET /api/expenditure/dashboard?month=YYYY-MM
router.get('/dashboard', requirePermission('expenditure:view'), async (req: Request, res: Response) => {
  try {
    const data = await getDashboardSummary(req.query.month as string | undefined);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// GET /api/expenditure/trends?months=6
router.get('/trends', requirePermission('expenditure:view'), async (req: Request, res: Response) => {
  try {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
    const data = await getMonthlyTrends(months);
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error);
  }
});

export default router;
