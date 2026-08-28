import { Router, Request, Response } from 'express';
import { requirePermission } from '../../middlewares/permission.middleware';
import { audit } from '../../middlewares/audit.middleware';
import { ServiceError } from '../../utils/responseHelpers';
import {
  previewNextAdmissionNo,
  createStudent,
  listStudents,
  updateStudent,
  deleteStudent,
  promoteStudents,
  addStudentDocument,
  listStudentDocuments,
  deleteStudentDocument,
  listStudentReceipts,
  getStudentReceiptDownloadUrl,
} from '../../services/student.service';

const router = Router();

function handleError(res: Response, error: any) {
  if (error instanceof ServiceError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, error: error.message });
}

// Get the next available admission number
router.get('/next-admission-no', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const nextNo = await previewNextAdmissionNo(req.query.academicYear as string);
    return res.status(200).json({ success: true, nextAdmissionNo: nextNo });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// Create new student
router.post('/', requirePermission('students:create'), audit('student:create'), async (req: Request, res: Response) => {
  try {
    const populatedStudent = await createStudent(req.body);
    return res.status(201).json({ success: true, data: populatedStudent });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// List all students
router.get('/', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const students = await listStudents();
    return res.status(200).json({ success: true, data: students });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// Update student profile
router.put('/:id', requirePermission('students:create'), audit('student:update'), async (req: Request, res: Response) => {
  try {
    const populatedStudent = await updateStudent(req.params.id, req.body);
    return res.status(200).json({ success: true, data: populatedStudent });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// Bulk-promote students to the next class (same section), rolling the academic year forward
router.post('/promote', requirePermission('students:promote'), audit('student:promote'), async (req: Request, res: Response) => {
  try {
    const { studentIds, toClass, toSection } = req.body;
    const result = await promoteStudents(studentIds, toClass, toSection, (req.user as any)?._id);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// Delete a student
router.delete('/:id', requirePermission('students:delete'), audit('student:delete'), async (req: Request, res: Response) => {
  try {
    await deleteStudent(req.params.id, req.body.password, (req.user as any)?._id);
    return res.status(200).json({ success: true, message: 'Student successfully deleted.' });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// ─── Student Documents Vault (birth certificates, TCs, photos, …) ────────────

// Upload a document for a student (stored in S3 under the student's folder)
router.post('/:id/documents', requirePermission('students:update'), audit('student:document-upload'), async (req: Request, res: Response) => {
  try {
    const { docType, filename, base64 } = req.body;
    const data = await addStudentDocument(req.params.id, docType, filename, base64);
    return res.status(201).json({ success: true, data, message: 'Document uploaded successfully.' });
  } catch (error: any) {
    console.error('[Student Documents] Upload failed:', error);
    return handleError(res, error);
  }
});

// List a student's documents with presigned download URLs
router.get('/:id/documents', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const documents = await listStudentDocuments(req.params.id);
    return res.status(200).json({ success: true, data: documents });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// Delete a student document (removes metadata and the S3 object)
router.delete('/:id/documents/:docId', requirePermission('students:update'), audit('student:document-delete'), async (req: Request, res: Response) => {
  try {
    await deleteStudentDocument(req.params.id, req.params.docId);
    return res.status(200).json({ success: true, message: 'Document deleted successfully.' });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// GET /api/students/:id/receipts
// Gets a list of all fee receipts for a student with S3 download URLs
router.get('/:id/receipts', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const receipts = await listStudentReceipts(req.params.id);
    return res.status(200).json({ success: true, data: receipts });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// GET /api/students/:id/receipts/:receiptNo/download
// Gets a presigned URL to download a payment receipt PDF
router.get('/:id/receipts/:receiptNo/download', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const downloadUrl = await getStudentReceiptDownloadUrl(req.params.id, req.params.receiptNo);
    return res.status(200).json({ success: true, downloadUrl });
  } catch (error: any) {
    return handleError(res, error);
  }
});

// Proxy S3 photo to avoid browser CORS errors
router.get('/photo-proxy', requirePermission('students:read'), async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, message: 'url is required.' });
    }

    const imageUrl = String(url);

    if (imageUrl.startsWith('data:')) {
      const parts = imageUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const base64Data = parts[1];
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', mime);
      return res.status(200).send(buffer);
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: 'Failed to fetch image from remote source' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const buffer = Buffer.from(await response.arrayBuffer());
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error('[Photo Proxy] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
