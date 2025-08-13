const Redis = require('ioredis');

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => console.log('Kết nối Redis thành công'));
redis.on('error', err => console.error('Redis lỗi:', err));
redis.on('ready', () => console.log('Redis ready'));
redis.on('reconnecting', () => console.log('Redis reconnecting'));
redis.on('end', () => console.log('Redis disconnected'));

module.exports = redis;