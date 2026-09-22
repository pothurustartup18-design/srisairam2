import { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

interface RedisLike {
  status: string;
  call(command: string, ...args: string[]): Promise<unknown>;
}

const OPTIONS = {
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' }
};

// Per-IP login throttle, stored in Redis when Redis is up. When it isn't, fall
// back to an in-memory store: the shared ioredis client queues commands
// forever while disconnected (maxRetriesPerRequest: null), so a Redis-backed
// limiter would leave every login request hanging with no response.
export function createLoginRateLimiter(redis: RedisLike): RequestHandler {
  const redisLimiter = rateLimit({
    ...OPTIONS,
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<any>
    })
  });
  const memoryLimiter = rateLimit(OPTIONS);

  return (req, res, next) => (redis.status === 'ready' ? redisLimiter : memoryLimiter)(req, res, next);
}
