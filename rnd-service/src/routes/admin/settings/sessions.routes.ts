import { Router, Request, Response } from 'express';
import { requireRole } from '../../../middlewares/auth.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { RefreshToken } from '../../../models/refreshToken.model';
import { User } from '../../../models/user.model';
import redisClient from '../../../config/redis';

const router = Router();

router.get('/sessions', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {

    // 1. Count active Redis session markers per user
    const redisCountByUser = new Map<string, number>();
    if (redisClient.status === 'ready') {
      await new Promise<void>((resolve) => {
        const stream = redisClient.scanStream({ match: 'session:refresh:*', count: 100 });
        stream.on('data', (keys: string[]) => {
          for (const key of keys) {
            const userId = key.split(':')[2];
            if (userId) redisCountByUser.set(userId, (redisCountByUser.get(userId) || 0) + 1);
          }
        });
        stream.on('end', () => resolve());
        stream.on('error', () => resolve());
      });
    }

    // 2. MongoDB fallback sessions, with device/IP metadata
    const mongoSessions = await RefreshToken.find({ isRevoked: false, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean();
    const mongoByUser = new Map<string, any[]>();
    for (const s of mongoSessions) {
      const uid = String(s.userId);
      if (!mongoByUser.has(uid)) mongoByUser.set(uid, []);
      mongoByUser.get(uid)!.push({
        deviceInfo: s.deviceInfo,
        ipAddress: s.ipAddress,
        expiresAt: s.expiresAt,
        createdAt: (s as any).createdAt
      });
    }

    const userIds = Array.from(new Set([...redisCountByUser.keys(), ...mongoByUser.keys()]));
    const users = await User.find({ _id: { $in: userIds } })
      .select('username firstName lastName role email employeeId lastLogin isActive')
      .lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    const data = userIds.map((uid) => {
      const u: any = userMap.get(uid);
      const redisSessionCount = redisCountByUser.get(uid) || 0;
      const mongoSessionList = mongoByUser.get(uid) || [];
      return {
        userId: uid,
        username: u?.username,
        name: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : 'Unknown user',
        role: u?.role,
        employeeId: u?.employeeId,
        isActive: u?.isActive,
        lastLogin: u?.lastLogin,
        activeSessionCount: redisSessionCount + mongoSessionList.length,
        redisSessionCount,
        mongoSessions: mongoSessionList
      };
    }).sort((a, b) => b.activeSessionCount - a.activeSessionCount);

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/sessions/revoke', requireRole(['superadmin']), audit('settings:session-revoke'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    let redisRevoked = 0;
    if (redisClient.status === 'ready') {
      redisRevoked = await new Promise<number>((resolve) => {
        let count = 0;
        const pending: Promise<any>[] = [];
        const stream = redisClient.scanStream({ match: `session:refresh:${userId}:*`, count: 100 });
        stream.on('data', (keys: string[]) => {
          if (keys.length > 0) {
            count += keys.length;
            const pipeline = redisClient.pipeline();
            keys.forEach((k) => pipeline.del(k));
            pending.push(pipeline.exec().catch(() => {}));
          }
        });
        stream.on('end', async () => {
          await Promise.all(pending);
          resolve(count);
        });
        stream.on('error', () => resolve(count));
      });
    }

    const mongoResult = await RefreshToken.deleteMany({ userId });

    return res.status(200).json({
      success: true,
      message: `Revoked ${redisRevoked} Redis session(s) and ${mongoResult.deletedCount || 0} stored session(s). The user's current access token stays valid for up to 1 hour but can no longer be refreshed.`
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
