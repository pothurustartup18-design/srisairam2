import { Worker } from 'bullmq';
import { generateStudentCSV } from '../services/backup.service';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '../services/s3.service';
import { Student } from '../models/student.model';
import { connectionOptions } from './queue';
import { processNotificationJob } from '../services/notificationJobHandler';

// 1. Backup Queue Worker
const backupWorker = new Worker('backupQueue', async job => {
  if (job.name === 'generateBackup') {
    console.log(`[Worker] Started processing backup job ${job.id}`);
    try {
      const bucketName = process.env.AWS_BUCKET_NAME;
      // The job previously built the CSV in memory, discarded it, and still logged
      // "Saved to <bucket>" with { success: true } — so every backup an admin
      // triggered reported success while storing nothing. Refuse to report success
      // when there is nowhere to store the export, and actually upload it otherwise.
      if (!bucketName) {
        throw new Error('AWS_BUCKET_NAME is not configured — cannot store the student backup.');
      }

      const csvData = await generateStudentCSV();
      const dataCount = await Student.countDocuments();
      const totalSize = Buffer.byteLength(csvData, 'utf8');

      const key = `backups/students/students_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: csvData,
          ContentType: 'text/csv; charset=utf-8'
        })
      );

      console.log(`[Worker] Successfully completed backup job ${job.id}. Saved to s3://${bucketName}/${key}.`);
      return { success: true, dataCount, totalSize, bucketName, key };
    } catch (err: any) {
      console.error(`[Worker] Failed backup job ${job.id}:`, err);
      throw err;
    }
  }
}, { connection: connectionOptions });

backupWorker.on('failed', (job, err) => {
  console.error(`[Worker] Backup Job ${job?.id} failed with error:`, err.message);
});

// 2. Notification Queue Worker
// Handles: sendWhatsAppText, sendWhatsAppMedia, sendWhatsAppResolved, sendWhatsAppTemplate.
// Dispatch logic lives in services/notificationJobHandler.ts so it is testable
// without a live Redis/BullMQ connection.
const notificationWorker = new Worker('notificationQueue', job => processNotificationJob(job), {
  connection: connectionOptions
});

notificationWorker.on('failed', (job, err) => {
  console.error(`[Worker] Notification job ${job?.id} failed with error:`, err.message);
});

// 3. Asset Optimization Queue Worker
const assetOptimizationWorker = new Worker('assetOptimizationQueue', async job => {
  console.log(`[Worker] Started processing asset optimization job ${job.id} (Type: ${job.name})`);
  try {
    if (job.name === 'optimizeAsset') {
      const { optimizeAssetSync } = require('../services/assetOptimization.service');
      await optimizeAssetSync(job.data);
    }
    console.log(`[Worker] Successfully completed asset optimization job ${job.id}`);
  } catch (err: any) {
    console.error(`[Worker] Failed asset optimization job ${job.id}:`, err.message);
    throw err;
  }
}, { connection: connectionOptions });

assetOptimizationWorker.on('failed', (job, err) => {
  console.error(`[Worker] Asset optimization job ${job?.id} failed with error:`, err.message);
});

console.log('[BullMQ] Workers initialized and listening for jobs.');
