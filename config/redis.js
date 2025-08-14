const Redis = require('ioredis');
const dns = require('dns');

// Ép ưu tiên IPv4 để tránh lỗi IPv6
dns.setDefaultResultOrder?.('ipv4first');

const host = 'learning-walrus-33071.upstash.io';
const port = 6379;
const password = 'AYEvAAIncDFkZjBhZGE2NDNlYTU0MmVkODg3NGUwNDFlNmU0YTI4Y3AxMzMwNzE'; // từ trang Upstash

const redis = new Redis({
  host,
  port,
  password,
  tls: { servername: host }, // bắt buộc với Upstash
  dnsLookup: (hostname, options, cb) =>
    require('dns').lookup(hostname, { family: 4 }, cb),
  lazyConnect: true,
  enableReadyCheck: false,
  maxRetriesPerRequest: 0,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('connect', () => console.log('[REDIS] Connected'));
redis.on('ready', () => console.log('[REDIS] Ready'));
redis.on('error', (err) => console.error('[REDIS] Error:', err));
redis.on('end', () => console.log('[REDIS] Disconnected'));

module.exports = redis;
