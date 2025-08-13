// redis.js
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),

  // Quan trọng để không block app khi Redis chết:
  lazyConnect: true,          // không auto connect khi require
  enableReadyCheck: false,    // khỏi chờ INFO/ROLE
  maxRetriesPerRequest: 0,    // tránh promise bị giữ vô hạn
  retryStrategy: (times) => Math.min(times * 100, 3000), // backoff nhẹ
});

redis.on('connect', () => console.log('[REDIS] connect'));
redis.on('ready',   () => console.log('[REDIS] ready'));
redis.on('error',   (e) => console.warn('[REDIS] error:', e.message));
redis.on('end',     () => console.warn('[REDIS] disconnected'));
redis.on('reconnecting', () => console.log('[REDIS] reconnecting'));

// Thử connect nhưng không phá app nếu fail
redis.connect().catch(() => {
  console.warn('[REDIS] cannot connect at boot, will run with fallback');
});

module.exports = redis;
