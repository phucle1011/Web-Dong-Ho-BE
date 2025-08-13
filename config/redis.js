const Redis = require('ioredis');
const dns = require('dns');

// Ép ưu tiên IPv4 (tránh lỗi IPv6 trên một số host)
dns.setDefaultResultOrder?.('ipv4first');

const host = process.env.REDIS_HOST;
const port = Number(process.env.REDIS_PORT);
const password = process.env.REDIS_PASSWORD;

const redis = new Redis({
  host,
  port,
  password,

  // BẮT BUỘC với Upstash (TLS + SNI)
  tls: { servername: host },

  // Ép ioredis resolve IPv4
  dnsLookup: (hostname, options, cb) =>
    require('dns').lookup(hostname, { family: 4 }, cb),

  // đừng để treo app
  lazyConnect: true,
  enableReadyCheck: false,
  maxRetriesPerRequest: 0,
  retryStrategy: (t) => Math.min(t * 100, 3000),
});

redis.on('connect', () => console.log('[REDIS] connect'));
redis.on('ready',   () => console.log('[REDIS] ready'));
redis.on('error',   (e) => console.warn('[REDIS] error:', e.message));
redis.on('end',     () => console.warn('[REDIS] disconnected'));
redis.on('reconnecting', () => console.log('[REDIS] reconnecting'));

redis.connect().catch(() => {
  console.warn('[REDIS] cannot connect at boot, will run with fallback');
});

module.exports = redis;
