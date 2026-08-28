import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { buildReportCardViewModel } from '../../services/reportCard.service';
import { ReportCardVerificationService } from '../../services/reportCardToken.service';

const router = Router();

// GET /api/report-card/verify?token=...
// Public — mirrors GET /api/receipts/verify. The QR code printed on a report
// card resolves here; every fact shown is re-derived from the live database,
// never trusted from the token itself.
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      return res.status(200).json({ success: false, status: 'INVALID', reason: 'Verification token is required.' });
    }

    const result = await ReportCardVerificationService.verifyReportCard(token);
    if (result.status === 'INVALID') {
      return res.status(200).json({ success: false, status: 'INVALID', reason: result.reason });
    }
    return res.status(200).json({ success: true, status: 'VERIFIED', reportCard: result.reportCard });
  } catch {
    return res.status(200).json({
      success: false,
      status: 'INVALID',
      reason: 'An error occurred during verification. Please try scanning again.',
    });
  }
});

// GET /api/report-card/:examId?studentId=...
// Assembles the full ReportCardViewModel (school/exam/teacher/principal info
// plus one or all students in the class, with every image already inlined as
// a base64 data URI) so the frontend renders the PDF from one typed object
// instead of orchestrating several fetches itself.
router.get('/:examId', authenticateJWT, requirePermission('results:view'), async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;
    const { studentId } = req.query;

    const viewModel = await buildReportCardViewModel(
      examId,
      typeof studentId === 'string' ? studentId : undefined
    );

    if (!viewModel) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }
    if (studentId && viewModel.students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found in this exam record.' });
    }

    return res.status(200).json({ success: true, data: viewModel });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/report-card/view/:examId/:studentId
// Public redirect endpoint that fetches the clean S3 URL from the database,
// generates a fresh presigned URL on-the-fly, and redirects the browser.
router.get('/view/:examId/:studentId', async (req: Request, res: Response) => {
  try {
    const { examId, studentId } = req.params;
    const { Exam } = require('../../models/exam.model');
    const { getPresignedDownloadUrl } = require('../../services/s3.service');

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return res.status(404).send('Exam record not found.');
    }

    const smRecord = exam.studentMarks.find(
      (sm: any) => String(sm.student) === String(studentId)
    );

    if (!smRecord || !smRecord.pdfUrl) {
      return res.status(404).send('Report card PDF not generated/found for this student.');
    }

    const rawUrl = smRecord.pdfUrl;
    if (!rawUrl.includes('.amazonaws.com/')) {
      return res.status(400).send('Invalid PDF URL stored in database.');
    }

    const s3Key = rawUrl.split('.amazonaws.com/')[1];
    if (!s3Key) {
      return res.status(400).send('Failed to parse S3 key.');
    }

    // Generate a fresh presigned URL valid for 15 minutes (900 seconds)
    const presignedUrl = await getPresignedDownloadUrl(s3Key, 900);

    return res.redirect(presignedUrl);
  } catch (error: any) {
    console.error('[ReportCardRedirect] Error:', error);
    return res.status(500).send('Internal server error.');
  }
});

export default router;
