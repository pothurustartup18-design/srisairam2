import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/auditLog.model';

/**
 * Records who did what on sensitive endpoints.
 * The entry is written after the response finishes (fire-and-forget), so it
 * never blocks or fails the request itself.
 * Storage: MongoDB "auditlogs" collection, auto-pruned by a 180-day TTL index.
 */
export const audit = (action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      try {
        const user = req.user as any;
        const entry = {
          userId: user?._id ? String(user._id) : undefined,
          username: user?.username,
          role: user?.role,
          action,
          method: req.method,
          path: req.originalUrl,
          entityId: req.params?.id || req.params?.examId || req.params?.leaveId
            || req.params?.class || req.body?.studentId || req.body?.teacherId || undefined,
          statusCode: res.statusCode,
          ip: req.ip
        };

        AuditLog.create(entry).catch((err) => {
          console.error('[Audit] Failed to persist audit log:', err.message);
        });
      } catch (err: any) {
        console.error('[Audit] Unexpected error building audit entry:', err.message);
      }
    });

    next();
  };
};
