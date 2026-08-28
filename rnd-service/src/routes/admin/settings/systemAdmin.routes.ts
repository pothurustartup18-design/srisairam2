import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { requireRole } from '../../../middlewares/auth.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { WhatsAppMessage } from '../../../models/whatsappMessage.model';
import { seedDatabase } from '../../../seed';
import { backupQueue, notificationQueue } from '../../../config/queue';
import redisClient from '../../../config/redis';

const router = Router();

// seedDatabase() DROPS every user, teacher, student, exam, attendance register,
// event and leave before inserting development fixtures. That is a legitimate
// tool on a scratch database and unrecoverable data loss on a real one, so it is
// refused outright once NODE_ENV=production, and requires an explicit
// confirmation body on every other environment.
router.post('/seed', requireRole(['superadmin']), audit('settings:database-seed'), async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Database seeding is disabled in production: it would delete all existing school data.'
      });
    }
    if (req.body?.confirm !== 'DELETE ALL DATA') {
      return res.status(400).json({
        success: false,
        message: 'Seeding erases all existing data. Send { "confirm": "DELETE ALL DATA" } to proceed.'
      });
    }
    // Seed database without closing connection
    await seedDatabase(false);
    return res.status(200).json({ success: true, message: 'Database seeded successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/whatsapp-messages', requireRole(['superadmin', 'admin']), async (req: Request, res: Response) => {
  try {
    const messages = await WhatsAppMessage.find({}).sort({ createdAt: -1 }).limit(100).lean();
    const mapped = messages.map((m: any) => ({
      _id: m._id,
      recipient: m.to,
      templateName: m.templateName || (m.messageType === 'text' ? 'Direct Text' : m.messageType),
      body: m.bodyPreview || '',
      status: m.status,
      createdAt: m.createdAt
    }));
    return res.status(200).json({ success: true, data: mapped });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/whatsapp-messages/clear', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    await WhatsAppMessage.deleteMany({});
    return res.status(200).json({ success: true, message: 'Simulation logs cleared.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const QUEUES: Record<string, typeof backupQueue> = { backupQueue, notificationQueue };
const JOB_STATUSES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

router.get('/queues', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    const data = await Promise.all(
      Object.entries(QUEUES).map(async ([name, queue]) => ({
        name,
        counts: await queue.getJobCounts(...JOB_STATUSES)
      }))
    );
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queues/:queueName/jobs', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    const queue = QUEUES[req.params.queueName];
    if (!queue) {
      return res.status(404).json({ success: false, message: `Unknown queue "${req.params.queueName}".` });
    }
    const status = String(req.query.status || 'failed');
    if (!(JOB_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${JOB_STATUSES.join(', ')}.` });
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const page = Math.max(1, Number(req.query.page) || 1);
    const start = (page - 1) * limit;

    const jobs = await queue.getJobs([status as any], start, start + limit - 1, false);
    const data = jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      returnvalue: job.returnvalue
    }));

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/queues/:queueName/jobs/:jobId/retry', requireRole(['superadmin']), audit('settings:queue-job-retry'), async (req: Request, res: Response) => {
  try {
    const queue = QUEUES[req.params.queueName];
    if (!queue) {
      return res.status(404).json({ success: false, message: `Unknown queue "${req.params.queueName}".` });
    }
    const job = await queue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    await job.retry();
    return res.status(200).json({ success: true, message: `Job ${req.params.jobId} re-queued.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/queues/:queueName/jobs/:jobId', requireRole(['superadmin']), audit('settings:queue-job-remove'), async (req: Request, res: Response) => {
  try {
    const queue = QUEUES[req.params.queueName];
    if (!queue) {
      return res.status(404).json({ success: false, message: `Unknown queue "${req.params.queueName}".` });
    }
    const job = await queue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    await job.remove();
    return res.status(200).json({ success: true, message: `Job ${req.params.jobId} removed.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/redis/info', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    if (redisClient.status !== 'ready') {
      return res.status(200).json({ success: true, data: { status: redisClient.status, connected: false } });
    }
    const rawInfo = await redisClient.info();
    const parsed: Record<string, string> = {};
    rawInfo.split('\r\n').forEach((line) => {
      const idx = line.indexOf(':');
      if (!line || line.startsWith('#') || idx === -1) return;
      parsed[line.slice(0, idx)] = line.slice(idx + 1);
    });
    const totalKeys = await redisClient.dbsize();
    return res.status(200).json({
      success: true,
      data: {
        status: redisClient.status,
        connected: true,
        totalKeys,
        usedMemoryHuman: parsed.used_memory_human,
        connectedClients: parsed.connected_clients,
        uptimeInSeconds: Number(parsed.uptime_in_seconds) || 0,
        redisVersion: parsed.redis_version
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/redis/keys', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    if (redisClient.status !== 'ready') {
      return res.status(200).json({ success: true, data: [], message: 'Redis is not connected.' });
    }
    const pattern = String(req.query.pattern || 'cache:*');
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    const keys: string[] = await new Promise((resolve) => {
      const found: string[] = [];
      const stream = redisClient.scanStream({ match: pattern, count: 100 });
      stream.on('data', (batch: string[]) => {
        for (const k of batch) {
          if (found.length < limit) found.push(k);
        }
      });
      stream.on('end', () => resolve(found));
      stream.on('error', () => resolve(found));
    });

    const data = await Promise.all(keys.map(async (key) => {
      const [ttl, type] = await Promise.all([redisClient.ttl(key), redisClient.type(key)]);
      let preview: string | undefined;
      if (type === 'string') {
        const val = await redisClient.get(key);
        preview = val ? (val.length > 200 ? `${val.slice(0, 200)}…` : val) : undefined;
      }
      return { key, ttl, type, preview };
    }));

    return res.status(200).json({ success: true, data, truncated: data.length >= limit });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/redis/keys', requireRole(['superadmin']), audit('settings:redis-flush'), async (req: Request, res: Response) => {
  try {
    const { pattern } = req.body;
    if (!pattern || typeof pattern !== 'string' || !pattern.trim()) {
      return res.status(400).json({ success: false, message: 'pattern is required.' });
    }
    if (redisClient.status !== 'ready') {
      return res.status(200).json({ success: true, deletedCount: 0, message: 'Redis is not connected.' });
    }

    const deletedCount = await new Promise<number>((resolve) => {
      let count = 0;
      const pending: Promise<any>[] = [];
      const stream = redisClient.scanStream({ match: pattern.trim(), count: 100 });
      stream.on('data', (batch: string[]) => {
        if (batch.length > 0) {
          count += batch.length;
          const pipeline = redisClient.pipeline();
          batch.forEach((k) => pipeline.del(k));
          pending.push(pipeline.exec().catch(() => {}));
        }
      });
      stream.on('end', async () => {
        await Promise.all(pending);
        resolve(count);
      });
      stream.on('error', () => resolve(count));
    });

    return res.status(200).json({ success: true, deletedCount, message: `Deleted ${deletedCount} key(s) matching "${pattern}".` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const SENSITIVE_COLLECTION_FIELDS: Record<string, string[]> = {
  users: ['password'],
  refreshtokens: ['token'],
  passwordresetotps: ['otp'],
  profileupdateotps: ['otp']
};

router.get('/collections', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection not established.' });
    }
    const collections = await db.listCollections().toArray();
    const data = await Promise.all(
      collections
        .filter((c) => !c.name.startsWith('system.'))
        .map(async (c) => ({
          name: c.name,
          count: await db.collection(c.name).estimatedDocumentCount().catch(() => 0)
        }))
    );
    data.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/collections/:name', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database connection not established.' });
    }
    const { name } = req.params;
    if (name.startsWith('system.')) {
      return res.status(403).json({ success: false, message: 'System collections cannot be browsed.' });
    }

    const existing = await db.listCollections({ name }).toArray();
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: `Collection "${name}" not found.` });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const projection: Record<string, 0> = {};
    (SENSITIVE_COLLECTION_FIELDS[name] || []).forEach((field) => { projection[field] = 0; });

    const collection = db.collection(name);
    const [total, docs] = await Promise.all([
      collection.countDocuments(),
      collection.find({}, { projection }).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).toArray()
    ]);

    return res.status(200).json({ success: true, total, page, limit, data: docs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
