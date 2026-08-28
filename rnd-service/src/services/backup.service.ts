import { Readable } from 'stream';
import { ZipArchive } from 'archiver';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Student } from '../models/student.model';

/**
 * Escapes characters for CSV fields
 */
function escapeCSVField(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Replace quotes with double quotes
  str = str.replace(/"/g, '""');
  // If the string contains comma, quotes, or newlines, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str}"`;
  }
  return str;
}

/**
 * Generates CSV string containing all student records
 */
export async function generateStudentCSV(): Promise<string> {
  let studentsList: any[] = [];

  studentsList = await Student.find({}).sort({ class: 1, section: 1, firstName: 1 });

  const headers = [
    'Admission No',
    'Roll Number',
    'First Name',
    'Last Name',
    'Class',
    'Section',
    'WhatsApp Number',
    'Status',
    'Total Fee',
    'Fee Paid',
    'Fee Pending',
    'Transport Mode',
    'Books Fee',
    'Date Registered'
  ];

  let csvContent = headers.join(',') + '\r\n';

  for (const student of studentsList) {
    const row = [
      escapeCSVField(student.admissionNo),
      escapeCSVField(student.rollNumber),
      escapeCSVField(student.firstName || student.name?.split(' ')[0]),
      escapeCSVField(student.lastName || student.name?.split(' ')[1]),
      escapeCSVField(student.class),
      escapeCSVField(student.section),
      escapeCSVField(student.whatsappNo),
      escapeCSVField(student.status),
      escapeCSVField(student.totalFee),
      escapeCSVField(student.feePaid),
      escapeCSVField(student.feePending),
      escapeCSVField(student.transportMode),
      escapeCSVField(student.booksFee),
      escapeCSVField(student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '')
    ];
    csvContent += row.join(',') + '\r\n';
  }

  return csvContent;
}

/**
 * Creates a zip archive stream of all files stored in the AWS S3 bucket
 */
export async function createS3BackupStream(
  s3Client: S3Client,
  bucketName: string
): Promise<Readable> {
  const archive = new ZipArchive({
    zlib: { level: 9 } // Maximum compression
  });

  // Since archiver is a pass-through stream, we can begin adding files asynchronously
  // and return the archive stream immediately.
  process.nextTick(async () => {
    try {
      let isTruncated = true;
      let continuationToken: string | undefined = undefined;
      let filesArchivedCount = 0;

      while (isTruncated) {
        const listCommand: ListObjectsV2Command = new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        });

        const listResponse: any = await s3Client.send(listCommand);

        if (listResponse.Contents) {
          for (const item of listResponse.Contents) {
            if (!item.Key) continue;
            
            try {
              // Fetch object from S3 as a stream
              const getCommand: GetObjectCommand = new GetObjectCommand({
                Bucket: bucketName,
                Key: item.Key
              });
              
              const getResponse: any = await s3Client.send(getCommand);
              const fileStream = getResponse.Body as Readable;
              
              if (fileStream) {
                archive.append(fileStream, { name: item.Key });
                filesArchivedCount++;
              }
            } catch (fileErr) {
              console.error(`Failed to archive S3 file "${item.Key}":`, fileErr);
              // Append a text error file into the zip instead of crashing the whole archive
              archive.append(`Failed to download this file from S3: ${String(fileErr)}`, { 
                name: `errors/${item.Key}.error.txt` 
              });
            }
          }
        }

        isTruncated = listResponse.IsTruncated || false;
        continuationToken = listResponse.NextContinuationToken;
      }

      if (filesArchivedCount === 0) {
        // If bucket was empty, put a placeholder file so the zip isn't corrupt
        archive.append('Bucket was empty at the time of backup.', { name: 'empty_bucket.txt' });
      }

      await archive.finalize();
    } catch (err) {
      console.error('Error finalising S3 backup ZIP archive:', err);
      // Emit error on archive so the Express route can handle it
      archive.emit('error', err);
    }
  });

  return archive;
}
