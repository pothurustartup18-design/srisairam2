import { Router, Request, Response } from 'express';
import { ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission } from '../../../middlewares/permission.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { createS3BackupStream, generateStudentCSV } from '../../../services/backup.service';
import { Student } from '../../../models/student.model';
import { Exam } from '../../../models/exam.model';
import { Teacher } from '../../../models/teacher.model';
import { Readable } from 'stream';
import { parseCSVLine } from '../../../utils/csvParser';
import { backupQueue } from '../../../config/queue';
import { getS3Client } from '../../../services/s3.service';

const router = Router();

router.get('/backup/students', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const csvData = await generateStudentCSV();
    const dateStr = new Date().toISOString().slice(0, 10);

    // Also trigger the background job so S3 has a persistent history/copy of the backup
    try {
      await backupQueue.add('generateBackup', { triggeredBy: (req as any).user?._id });
    } catch (queueErr) {
      console.error('Failed to enqueue student backup job:', queueErr);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=students_backup_${dateStr}.csv`);
    return res.status(200).send(csvData);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backup/s3', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const bucketName = process.env.AWS_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!bucketName || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({ success: false, message: 'AWS S3 is not configured. Cannot generate a backup archive.' });
    }

    const s3Client = getS3Client();

    // Verify connection / fetch files list first to ensure it doesn't fail after header transmission
    try {
      const testCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1
      });
      await s3Client.send(testCommand);
    } catch (s3TestErr: any) {
      return res.status(502).json({ success: false, message: 'Could not connect to AWS S3: ' + s3TestErr.message });
    }

    const zipStream = await createS3BackupStream(s3Client, bucketName);
    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=s3_backup_${dateStr}.zip`);

    zipStream.on('error', (zipErr: any) => {
      console.error('Error during S3 backup streaming:', zipErr);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Backup archiving failed: ' + zipErr.message });
      }
    });

    zipStream.pipe(res);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/upload-sync', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { files, examId } = req.body; // files: [{ filename: string, base64: string }]
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, message: 'files array is required and cannot be empty.' });
    }
    if (!examId) {
      return res.status(400).json({ success: false, message: 'examId is required.' });
    }

    const bucketName = process.env.AWS_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'ap-southeast-2';
    if (!bucketName || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({ success: false, message: 'AWS S3 is not configured. Cannot sync report cards.' });
    }
    const s3Client = getS3Client();

    const syncLogs: Array<{ filename: string; status: 'synced' | 'failed' | 'unmatched'; details: string; studentName?: string }> = [];

    for (const file of files) {
      const { filename, base64 } = file;
      if (!filename || !base64) {
        syncLogs.push({ filename: filename || 'unknown', status: 'failed', details: 'Missing filename or base64 content.' });
        continue;
      }

      let student: any = null;
      let parsedAdm = '';

      // Check if filename contains a 24-character MongoDB ObjectId for the student
      const objectIdRegex = /[0-9a-fA-F]{24}/;
      const objectIdMatch = filename.match(objectIdRegex);

      if (objectIdMatch) {
        const studentId = objectIdMatch[0];
        student = await Student.findById(studentId);
      }

      if (!student) {
        // Regex to extract admission number: looks for ADM-xxx or adm_xxx or adm-xxx or adm001
        const regex = /adm[-_]?[0-9]+/i;
        const match = filename.match(regex);

        if (!match) {
          syncLogs.push({ filename, status: 'unmatched', details: 'No admission number (e.g. adm-001) or student ID found in filename.' });
          continue;
        }

        parsedAdm = match[0].toLowerCase();
        const format1 = parsedAdm; 
        const format2 = parsedAdm.replace(/[-_]/g, ''); 
        student = await Student.findOne({
          $or: [
            { admissionNo: { $regex: new RegExp(`^${format1}$`, 'i') } },
            { admissionNo: { $regex: new RegExp(`^${format2}$`, 'i') } },
            { admissionNo: { $regex: new RegExp(`^${format2.slice(0, 3)}-${format2.slice(3)}$`, 'i') } } 
          ]
        });
      }

      if (!student) {
        syncLogs.push({ 
          filename, 
          status: 'unmatched', 
          details: parsedAdm 
            ? `Could not find student matching admission code "${parsedAdm}".`
            : `Could not find student matching ID from filename.`
        });
        continue;
      }

      const studentId = student._id.toString();
      const studentName = `${student.firstName} ${student.lastName}`;

      try {
        const base64Parts = base64.split(',');
        const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        
        const s3Key = `reports/report_${studentId}_${examId}.pdf`;
        const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;

        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: pdfBuffer,
          ContentType: 'application/pdf'
        }));

        // Update database record (Exam marks sheet pdfUrl)
        const updateResult = await Exam.updateOne(
          { _id: examId, 'studentMarks.student': student._id },
          { $set: { 'studentMarks.$.pdfUrl': s3Url } }
        );
        if (updateResult.matchedCount === 0) {
          throw new Error(`Student ${studentName} is not enrolled in this exam's marks list.`);
        }

        syncLogs.push({
          filename,
          status: 'synced',
          studentName,
          details: `Synchronized successfully to "${student.admissionNo}".`
        });

      } catch (uploadErr: any) {
        syncLogs.push({
          filename,
          status: 'failed',
          details: `Upload/Sync error: ${uploadErr.message}`
        });
      }
    }

    return res.status(200).json({
      success: true,
      logs: syncLogs
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/download-by-admission', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {
    const { admissionNo, examId } = req.query;
    if (!admissionNo) {
      return res.status(400).json({ success: false, message: 'admissionNo is required.' });
    }
    if (!examId) {
      return res.status(400).json({ success: false, message: 'examId is required.' });
    }

    const admKey = String(admissionNo).toLowerCase().trim();
    let student: any = null;

    const format1 = admKey;
    const format2 = admKey.replace(/[-_]/g, '');
    student = await Student.findOne({
      $or: [
        { admissionNo: { $regex: new RegExp(`^${format1}$`, 'i') } },
        { admissionNo: { $regex: new RegExp(`^${format2}$`, 'i') } },
        { admissionNo: { $regex: new RegExp(`^${format2.slice(0, 3)}-${format2.slice(3)}$`, 'i') } }
      ]
    });

    if (!student) {
      return res.status(404).json({ success: false, message: `Student with admission number "${admissionNo}" not found.` });
    }

    // Find the exam record and get pdfUrl
    let pdfUrl = '';
    const studentIdStr = student._id.toString();

    const exam = await Exam.findOne({ _id: examId, 'studentMarks.student': student._id });
    if (exam) {
      const markDetail = exam.studentMarks.find(sm => sm.student.toString() === studentIdStr);
      if (markDetail && markDetail.pdfUrl) {
        pdfUrl = markDetail.pdfUrl;
      }
    }

    if (!pdfUrl) {
      return res.status(404).json({ 
        success: false, 
        message: `No report card PDF found for student "${student.firstName} ${student.lastName}" under this exam.` 
      });
    }

    // Parse the S3 key from the stored URL
    const bucketName = process.env.AWS_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!bucketName || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({ success: false, message: 'AWS S3 is not configured. Cannot download report card.' });
    }

    const s3Key = pdfUrl.split('.amazonaws.com/')[1] || `reports/report_${studentIdStr}_${examId}.pdf`;
    const downloadFilename = `${student.admissionNo}_report.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);

    const response: any = await getS3Client().send(new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    }));

    const stream = response.Body as Readable;
    stream.pipe(res);

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/restore-students', requireRole(['admin']), requirePermission('settings:manage'), audit('settings:restore-students'), async (req: Request, res: Response) => {
  try {
    const { file } = req.body; // { filename: string, base64: string }
    if (!file || !file.base64) {
      return res.status(400).json({ success: false, message: 'file base64 payload is required.' });
    }

    const base64Data = file.base64.split(',')[1] || file.base64;
    const csvContent = Buffer.from(base64Data, 'base64').toString('utf8');

    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ success: false, message: 'CSV file must contain at least headers and one student data row.' });
    }

    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    
    // Verify that the header contains key columns to check compatibility
    if (!headers.includes('Admission No') || !headers.includes('First Name') || !headers.includes('Class')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid backup file format. Headers must include "Admission No", "First Name", and "Class".' 
      });
    }

    let recordsRestored = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 3) continue;

      const admissionNo = cols[0];
      if (!admissionNo) continue;

      const existing = await Student.findOne({ admissionNo: { $regex: new RegExp(`^${admissionNo}$`, 'i') } });

      let classTeacherId = existing ? existing.classTeacher : null;
      let admissionAcademicYear = existing ? existing.admissionAcademicYear : '2026-27';

      const studentClass = cols[4] || '';
      const studentSection = cols[5] || '';

      if (!existing) {
        // Find a suitable teacher for new student
        const classStr = `${studentClass}-${studentSection}`.toUpperCase();
        let teacher = await Teacher.findOne({ classTeacherOf: classStr, status: 'active' });
        if (!teacher) {
          teacher = await Teacher.findOne({ status: 'active' });
        }
        if (!teacher) {
          teacher = await Teacher.findOne({});
        }
        if (!teacher) {
          return res.status(400).json({
            success: false,
            message: `Cannot insert new student "${cols[2]} ${cols[3]}" because no class teacher exists in the system to assign to them.`
          });
        }
        classTeacherId = teacher._id;
      }

      const studentData: any = {
        admissionNo,
        rollNumber: cols[1] ? Number(cols[1]) : undefined,
        firstName: cols[2] || '',
        lastName: cols[3] || '',
        class: studentClass,
        section: studentSection,
        whatsappNo: cols[6] || '',
        status: (cols[7] === 'active' || cols[7] === 'inactive') ? cols[7] : 'active',
        totalFee: cols[8] ? Number(cols[8]) : 0,
        feePaid: cols[9] ? Number(cols[9]) : 0,
        feePending: cols[10] ? Number(cols[10]) : 0,
        transportMode: (cols[11] === 'school' || cols[11] === 'private') ? cols[11] : 'school',
        booksFee: cols[12] ? Number(cols[12]) : 0,
        classTeacher: classTeacherId,
        admissionAcademicYear: admissionAcademicYear
      };

      await Student.findOneAndUpdate(
        { admissionNo: { $regex: new RegExp(`^${admissionNo}$`, 'i') } },
        {
          $set: studentData
        },
        { upsert: true, new: true }
      );
      recordsRestored++;
    }

    return res.status(200).json({
      success: true,
      count: recordsRestored,
      message: `Database restoration complete. Successfully restored ${recordsRestored} student records.`
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/restore-s3', requireRole(['admin']), requirePermission('settings:manage'), audit('settings:restore-s3'), async (req: Request, res: Response) => {
  try {
    const { file } = req.body; // { filename: string, base64: string }
    if (!file || !file.base64) {
      return res.status(400).json({ success: false, message: 'file base64 payload is required.' });
    }

    const bucketName = process.env.AWS_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'ap-southeast-2';

    if (!bucketName || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({ success: false, message: 'AWS S3 is not configured. Cannot restore S3 storage.' });
    }

    const s3Client = getS3Client();

    const base64Data = file.base64.split(',')[1] || file.base64;
    const zipBuffer = Buffer.from(base64Data, 'base64');

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    let filesRestored = 0;
    const syncLogs: Array<{ filename: string; status: 'synced' | 'failed' | 'unmatched'; details: string; studentName?: string }> = [];

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const s3Key = entry.entryName;
      const fileBuffer = entry.getData();

      try {
        // Upload the file back to S3 at its original key
        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: s3Key.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
        }));

        filesRestored++;

        // If the file is a report card, sync it with the database!
        // Format of key: reports/report_${studentId}_${examId}.pdf
        if (s3Key.startsWith('reports/report_') && s3Key.endsWith('.pdf')) {
          const filenamePart = s3Key.replace('reports/', '');
          const parts = filenamePart.replace('report_', '').replace('.pdf', '').split('_');
          if (parts.length >= 2) {
            const studentId = parts[0];
            const examId = parts[1];

            // Verify they are valid ObjectIds
            const objectIdRegex = /^[0-9a-fA-F]{24}$/;
            if (objectIdRegex.test(studentId) && objectIdRegex.test(examId)) {
              const student = await Student.findById(studentId);
              if (student) {
                const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
                const studentName = `${student.firstName} ${student.lastName}`;

                // Update Exam marks sheet pdfUrl
                const updateResult = await Exam.updateOne(
                  { _id: examId, 'studentMarks.student': student._id },
                  { $set: { 'studentMarks.$.pdfUrl': s3Url } }
                );

                if (updateResult.matchedCount > 0) {
                  syncLogs.push({
                    filename: s3Key,
                    status: 'synced',
                    studentName,
                    details: `Successfully synced to student "${student.admissionNo}" under exam ID "${examId}".`
                  });
                } else {
                  syncLogs.push({
                    filename: s3Key,
                    status: 'unmatched',
                    details: `Student "${studentName}" not enrolled in exam marks list for exam ID "${examId}".`
                  });
                }
              } else {
                syncLogs.push({
                  filename: s3Key,
                  status: 'failed',
                  details: `Student with ID "${studentId}" not found in database.`
                });
              }
            } else {
              syncLogs.push({
                filename: s3Key,
                status: 'failed',
                details: `Invalid studentId or examId format in key: ${s3Key}`
              });
            }
          }
        }
      } catch (err: any) {
        syncLogs.push({
          filename: s3Key,
          status: 'failed',
          details: `Failed to restore/sync: ${err.message}`
        });
      }
    }

    return res.status(200).json({
      success: true,
      count: filesRestored,
      logs: syncLogs,
      message: `S3 Restoration complete. Successfully restored ${filesRestored} files to S3.`
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
