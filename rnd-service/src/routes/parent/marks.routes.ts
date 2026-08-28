import { Router, Request, Response } from 'express';
import { Exam } from '../../models/exam.model';
import { requirePermission } from '../../middlewares/permission.middleware';
import { getPresignedDownloadUrl as presignS3Key, PRESIGN_EXPIRY_2_HOURS } from '../../services/s3.service';
async function getPresignedDownloadUrl(s3Key: string): Promise<string> {
  try {
    return await presignS3Key(s3Key, PRESIGN_EXPIRY_2_HOURS);
  } catch (err) {
    console.error('Failed to generate presigned URL', err);
    return '';
  }
}

const router = Router();

// Get all exams with marks for a specific student (Parent portal)
router.get('/student/:studentId', requirePermission('results:view'), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    const records = await Exam.find({ 'studentMarks.student': studentId });
    const exams = await Promise.all(records.map(async (e) => {
      const sm = e.studentMarks.find((sm: any) => sm.student.toString() === studentId);
      const totalObtained = sm ? sm.marks.reduce((acc: number, m: any) => acc + m.obtainedMarks, 0) : 0;
      const totalPossible = e.subjects.reduce((acc: number, s: any) => acc + s.totalMarks, 0);
      const percentage = totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100) : 0;
      
      let presignedUrl = null;
      if (sm && sm.pdfUrl) {
        if (sm.pdfUrl.includes('.amazonaws.com/')) {
          const s3Key = sm.pdfUrl.split('.amazonaws.com/')[1];
          if (s3Key) presignedUrl = await getPresignedDownloadUrl(s3Key);
        } else {
          presignedUrl = sm.pdfUrl;
        }
      }

      return {
        _id: e._id,
        examName: e.examName,
        class: e.class,
        subjects: e.subjects,
        marks: sm ? sm.marks : [],
        pdfUrl: presignedUrl,
        totalObtained,
        totalPossible,
        percentage,
      };
    }));
    return res.status(200).json({ success: true, data: exams });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
