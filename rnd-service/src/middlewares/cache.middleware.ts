import { Request, Response, NextFunction } from 'express';
import redisClient from '../config/redis';

/**
 * Middleware to cache API responses.
 * @param duration Duration in seconds to cache the response.
 */
export const cacheResponse = (duration: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching if Redis is not connected
    if (redisClient.status !== 'ready') {
      return next();
    }

    // Construct a unique cache key based on the URL and query params
    const key = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData));
      }

      // Intercept the res.json method to save the data to Redis before sending it
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.setex(key, duration, JSON.stringify(body)).catch((err) => {
            console.error('[Redis Cache Set Error]:', err);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error('[Redis Cache Error]:', err);
      next(); // Proceed without caching if there's an error
    }
  };
};

/**
 * Utility to clear cached keys matching a specific pattern (e.g. '/api/dashboard/students*').
 *
 * Uses SCAN rather than KEYS: KEYS walks the entire keyspace in one blocking
 * pass, stalling every other Redis client for the duration, and this runs on
 * ordinary write paths (student/teacher edits, attendance marking, config saves).
 */
export const clearCache = (pattern: string): Promise<void> => {
  return new Promise<void>((resolve) => {
    if (redisClient.status !== 'ready') return resolve();

    let deleted = 0;
    const pending: Promise<any>[] = [];
    const stream = redisClient.scanStream({ match: `cache:${pattern}`, count: 100 });

    stream.on('data', (keys: string[]) => {
      if (keys.length === 0) return;
      deleted += keys.length;
      const pipeline = redisClient.pipeline();
      keys.forEach((key) => pipeline.del(key));
      pending.push(pipeline.exec().catch((err) => {
        console.error('[Redis Cache Clear Pipeline Error]:', err);
      }));
    });

    stream.on('end', async () => {
      await Promise.all(pending);
      if (deleted > 0) {
        console.log(`[Redis Cache] Cleared ${deleted} cached key(s) matching "${pattern}".`);
      }
      resolve();
    });

    stream.on('error', (err) => {
      console.error('[Redis Cache Clear Error]:', err);
      resolve();
    });
  });
};

