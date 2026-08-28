import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Event } from '../../../models/event.model';
import { ScheduledAlert } from '../../../models/scheduledAlert.model';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission } from '../../../middlewares/permission.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { SystemConfig } from '../../../models/systemConfig.model';
import { cacheResponse } from '../../../middlewares/cache.middleware';
import { getS3Client } from '../../../services/s3.service';

const router = Router();

router.get('/storage', requireRole(['admin']), requirePermission('settings:manage'), cacheResponse(300), async (req: Request, res: Response) => {
  try {
    let mongoStats: any = {};
    let s3Stats: any = {};

    // 1. Fetch MongoDB Statistics
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established.');
    }

    try {
      const stats = await db.command({ dbStats: 1 });
      mongoStats = {
        dbName: mongoose.connection.name,
        collectionsCount: stats.collections || 0,
        objectsCount: stats.objects || 0,
        dataSize: stats.dataSize || 0,
        storageSize: stats.storageSize || 0,
        indexSize: stats.indexSize || 0,
        status: 'Connected'
      };
    } catch (dbErr: any) {
      mongoStats = {
        dbName: mongoose.connection.name,
        collectionsCount: 0,
        objectsCount: 0,
        dataSize: 0,
        storageSize: 0,
        indexSize: 0,
        status: 'Error fetching stats: ' + dbErr.message
      };
    }

    // 2. Fetch AWS S3 Statistics
    const bucketName = process.env.AWS_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!bucketName) {
      s3Stats = {
        bucketName: 'Not Configured',
        objectsCount: 0,
        totalSize: 0,
        status: 'Missing Configuration'
      };
    } else if (!accessKeyId || !secretAccessKey) {
      s3Stats = {
        bucketName,
        objectsCount: 0,
        totalSize: 0,
        status: 'Missing AWS credentials'
      };
    } else {
      try {
        const s3Client = getS3Client();

        let totalSize = 0;
        let objectsCount = 0;
        let isTruncated = true;
        let continuationToken: string | undefined = undefined;

        while (isTruncated) {
          const command: ListObjectsV2Command = new ListObjectsV2Command({
            Bucket: bucketName,
            ContinuationToken: continuationToken,
          });

          const response: any = await s3Client.send(command);
          
          if (response.Contents) {
            for (const item of response.Contents) {
              if (item.Size) {
                totalSize += item.Size;
              }
              objectsCount++;
            }
          }

          isTruncated = response.IsTruncated || false;
          continuationToken = response.NextContinuationToken;
        }

        s3Stats = {
          bucketName,
          objectsCount,
          totalSize,
          status: 'Connected'
        };
      } catch (s3Err: any) {
        s3Stats = {
          bucketName,
          objectsCount: 0,
          totalSize: 0,
          status: 'Error: ' + s3Err.message
        };
      }
    }

    let disableEventS3Storage = false;
    const eventStorageConfig = await SystemConfig.findOne({ key: 'disableEventS3Storage' });
    if (eventStorageConfig) {
      disableEventS3Storage = eventStorageConfig.value === true || eventStorageConfig.value === 'true';
    }

    return res.status(200).json({
      success: true,
      data: {
        mongo: mongoStats,
        s3: s3Stats,
        disableEventS3Storage
      }
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/storage/events', requireRole(['admin']), requirePermission('settings:manage'), audit('settings:storage-clear-events'), async (req: Request, res: Response) => {
  try {
    const bucketName = process.env.AWS_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    let deletedCount = 0;

    if (!bucketName) {
      return res.status(400).json({ success: false, message: 'S3 bucket is not configured.' });
    }

    if (!accessKeyId || !secretAccessKey) {
      return res.status(400).json({ success: false, message: 'AWS credentials are not configured.' });
    }

    const s3Client = getS3Client();
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'events/',
        ContinuationToken: continuationToken,
      });

      const listResponse: any = await s3Client.send(listCommand);
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const objectsToDelete = listResponse.Contents.map((obj: any) => ({ Key: obj.Key }));
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true
          }
        });
        await s3Client.send(deleteCommand);
        deletedCount += objectsToDelete.length;
      }

      isTruncated = listResponse.IsTruncated || false;
      continuationToken = listResponse.NextContinuationToken;
    }

    // Clear media references in DB
    await Event.updateMany({}, { $set: { media: [] } });
    await ScheduledAlert.updateMany({}, { $set: { mediaUrl: '', mediaUrls: [] } });

    return res.status(200).json({
      success: true,
      message: `Successfully deleted all ${deletedCount} event media files from S3 storage and cleared references in database.`,
      deletedCount
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
