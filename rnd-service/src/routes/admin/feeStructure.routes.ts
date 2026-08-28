import { Router, Request, Response } from 'express';
import { FeeStructure } from '../../models/feeStructure.model';
import { requirePermission } from '../../middlewares/permission.middleware';
import { audit } from '../../middlewares/audit.middleware';

const router = Router();

// List all class fee structures
router.get('/', requirePermission('fees:view'), async (req: Request, res: Response) => {
  try {
    const structures = await FeeStructure.find({}).sort({ class: 1 }).lean();
    return res.status(200).json({ success: true, data: structures });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create or update the fee structure for a class (upsert by class)
router.post('/', requirePermission('fees:manage'), audit('fees:structure-upsert'), async (req: Request, res: Response) => {
  try {
    const { class: className, totalFee, booksFee, installments } = req.body;

    if (!className || totalFee === undefined) {
      return res.status(400).json({ success: false, message: 'class and totalFee are required.' });
    }
    const resolvedTotal = Number(totalFee);
    const resolvedBooks = Number(booksFee || 0);
    if (isNaN(resolvedTotal) || resolvedTotal < 0 || isNaN(resolvedBooks) || resolvedBooks < 0) {
      return res.status(400).json({ success: false, message: 'totalFee and booksFee must be non-negative numbers.' });
    }

    const resolvedInstallments: Array<{ installmentNo: number; amount: number; dueDate: Date }> = [];
    if (installments !== undefined) {
      if (!Array.isArray(installments)) {
        return res.status(400).json({ success: false, message: 'installments must be an array.' });
      }
      for (const inst of installments) {
        const amount = Number(inst.amount);
        const dueDate = new Date(inst.dueDate);
        if (!inst.installmentNo || isNaN(amount) || amount < 0 || isNaN(dueDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Each installment needs installmentNo, a non-negative amount, and a valid dueDate.'
          });
        }
        resolvedInstallments.push({ installmentNo: Number(inst.installmentNo), amount, dueDate });
      }
      const installmentSum = resolvedInstallments.reduce((acc, i) => acc + i.amount, 0);
      if (resolvedInstallments.length > 0 && installmentSum !== resolvedTotal) {
        return res.status(400).json({
          success: false,
          message: `Installments total ₹${installmentSum} but totalFee is ₹${resolvedTotal}. They must match.`
        });
      }
    }

    const cls = String(className).trim();

    const structure = await FeeStructure.findOneAndUpdate(
      { class: cls },
      { class: cls, totalFee: resolvedTotal, booksFee: resolvedBooks, installments: resolvedInstallments },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, data: structure, message: `Fee structure for Class ${cls} saved.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete the fee structure for a class
router.delete('/:class', requirePermission('fees:manage'), audit('fees:structure-delete'), async (req: Request, res: Response) => {
  try {
    const cls = String(req.params.class).trim();

    const deleted = await FeeStructure.findOneAndDelete({ class: cls });
    if (!deleted) return res.status(404).json({ success: false, message: 'Fee structure not found.' });

    return res.status(200).json({ success: true, message: `Fee structure for Class ${cls} deleted.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
