import Redis from 'ioredis';

// Create a Redis client instance
const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    // Keep retrying every 10 seconds silently so the server does not crash when Redis is offline
    return 10000;
  },
});

redisClient.on('error', (err) => {
  console.error('[Redis Error]:', err.message);
});

redisClient.on('connect', () => {
  console.log('[Redis] Connected successfully.');
});

export default redisClient;

