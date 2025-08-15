const Redis = require('ioredis');
const dns = require('dns');
dns.setDefaultResultOrder?.('ipv4first');

const host = process.env.REDIS_HOST;
const port = Number(process.env.REDIS_PORT || 6379);
const password = process.env.REDIS_PASSWORD;

const redis = new Redis({
  host,
  port,
  password,
  tls: { servername: host },
  dnsLookup: (hostname, options, cb) =>
    require('dns').lookup(hostname, { family: 4 }, cb),

  lazyConnect: false,
  enableReadyCheck: false,
  maxRetriesPerRequest: 0,
  retryStrategy: (times) => Math.min(times * 200, 3000),
  connectTimeout: 3000,  
 keepAlive: 30000, 
  reconnectOnError: (err) => {
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('readonly') || msg.includes('noauth') || msg.includes('tls');
  },
});

redis.on('connect', () => console.log('[REDIS] connect'));
redis.on('ready',   () => console.log('[REDIS] ready'));
redis.on('reconnecting', () => console.log('[REDIS] reconnecting'));
redis.on('end', () => console.log('[REDIS] end'));
redis.on('error', (err) => {
  console.error('[REDIS] error:', err && (err.message || err));
});

module.exports = redis;
