import { Router, Request, Response } from 'express';
import { ReceiptVerificationService } from '../../services/receipt.service';

const router = Router();

// GET /api/receipts/verify
// Public endpoint for parents to verify a receipt via QR code
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        status: 'INVALID',
        reason: 'Verification token is required.',
      });
    }

    const result = await ReceiptVerificationService.verifyReceipt(token);
    
    if (result.status === 'INVALID') {
      return res.status(200).json({
        success: false,
        status: 'INVALID',
        reason: result.reason,
      });
    }

    return res.status(200).json({
      success: true,
      status: 'VERIFIED',
      receipt: result.receipt,
    });
  } catch (error: any) {
    // Return a generic security-compliant invalid response on system error
    return res.status(200).json({
      success: false,
      status: 'INVALID',
      reason: 'An error occurred during verification. Please try scanning again.',
    });
  }
});

export default router;
