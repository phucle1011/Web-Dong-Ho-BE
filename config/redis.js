const Redis = require('ioredis');
const dns = require('dns');

// Ưu tiên IPv4 (tránh sự cố IPv6 ở một số host)
dns.setDefaultResultOrder?.('ipv4first');

const {
  REDIS_URL,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_TLS
} = process.env;

let client;

if (REDIS_URL) {
  // Hỗ trợ chuỗi kết nối rediss://
  client = new Redis(REDIS_URL, {
    // serverless providers (Upstash) thường cần:
    enableReadyCheck: false,
    maxRetriesPerRequest: 0,
    lazyConnect: true,
    dnsLookup: (hostname, options, cb) =>
      require('dns').lookup(hostname, { family: 4 }, cb),
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET'];
      return targetErrors.some(e => err.message.includes(e));
    }
  });
} else {
  client = new Redis({
    host: REDIS_HOST,
    port: Number(REDIS_PORT || 6379),
    password: REDIS_PASSWORD || undefined,
    // Upstash/Redis Cloud thường yêu cầu TLS + SNI
    tls: REDIS_TLS ? { servername: REDIS_HOST } : undefined,

    enableReadyCheck: false,
    maxRetriesPerRequest: 0,
    lazyConnect: true,
    // ép IPv4
    dnsLookup: (hostname, options, cb) =>
      require('dns').lookup(hostname, { family: 4 }, cb),
    retryStrategy: (times) => Math.min(times * 200, 3000),
    reconnectOnError: (err) => {
      const retriable = ['READONLY', 'ECONNRESET'];
      return retriable.some(x => err.message.includes(x));
    }
  });
}

client.on('connect', () => console.log('[REDIS] connect'));
client.on('ready',   () => console.log('[REDIS] ready'));
client.on('error',   (e) => console.error('[REDIS] error:', e.message));
client.on('end',     () => console.log('[REDIS] end'));
client.on('reconnecting', () => console.log('[REDIS] reconnecting'));

module.exports = client;
