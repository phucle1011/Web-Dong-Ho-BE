// redis.js
const Redis = require('ioredis');
const dns = require('dns');

// Ép ưu tiên IPv4 (tránh sự cố IPv6 ở một số host)
dns.setDefaultResultOrder?.('ipv4first');

const {
  REDIS_URL,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_TLS,
} = process.env;

// Parse boolean từ .env (true/1/yes)
const toBool = (v) => /^(true|1|yes)$/i.test(String(v || ''));

const baseOpts = {
  // Kết nối ngay lúc khởi động (tránh SET khi chưa sẵn sàng)
  lazyConnect: false,

  // Cho Upstash/serverless: tắt ready check, không retry per-request
  enableReadyCheck: false,
  maxRetriesPerRequest: 0,

  // Backoff reconnect
  retryStrategy: (times) => Math.min(times * 200, 3000),

  // Ép IPv4 để tránh lỗi IPv6
  dnsLookup: (hostname, options, cb) =>
    require('dns').lookup(hostname, { family: 4 }, cb),

  // Một số lỗi nên reconnect
  reconnectOnError: (err) => {
    return ['READONLY', 'ECONNRESET'].some(x => err.message?.includes(x));
  },
};

// Chỉ dùng REDIS_URL khi là rediss:// (TLS). Không chấp nhận https:// (REST).
const useUrl = REDIS_URL && /^rediss:\/\//i.test(REDIS_URL);

let client;

if (useUrl) {
  // VD: rediss://default:<TOKEN>@learning-walrus-33071.upstash.io:6379
  client = new Redis(REDIS_URL, baseOpts);
} else {
  client = new Redis({
    host: REDIS_HOST,
    port: Number(REDIS_PORT || 6379),
    username: 'default', // BẮT BUỘC với Upstash
    password: REDIS_PASSWORD || undefined,
    tls: toBool(REDIS_TLS) ? { servername: REDIS_HOST } : undefined,
    ...baseOpts,
  });
}

client.on('connect',       () => console.log('[REDIS] connect'));
client.on('ready',         () => console.log('[REDIS] ready'));
client.on('reconnecting',  () => console.log('[REDIS] reconnecting'));
client.on('end',           () => console.log('[REDIS] end'));
client.on('error', (e) => {
  console.error('[REDIS] error:', {
    message: e.message,
    code: e.code,
    name: e.name,
  });
});

module.exports = client;
