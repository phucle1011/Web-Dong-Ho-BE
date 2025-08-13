// RedisService.js
const redis = require('./redis');
const LRU = require('lru-cache');

class RedisService {
  constructor() {

    this.memory = new LRU({
      max: 5000,             
      ttl: 1000 * 60 * 5,   
    });

    this.redisUp = false;

    const markUp   = () => { this.redisUp = true; };
    const markDown = () => { this.redisUp = false; };

    redis.on('ready', markUp);
    redis.on('connect', markUp);
    redis.on('end', markDown);
    redis.on('error', markDown);

    this.redisUp = redis.status === 'ready';
  }

  isRedisAvailable() {
    return this.redisUp && redis.status === 'ready';
  }

  async setData(key, value, ttl = 3600) {

    this.memory.set(key, value, { ttl: ttl * 1000 });

    if (this.isRedisAvailable()) {
      try {
        if (ttl) {
          await redis.set(key, JSON.stringify(value), 'EX', ttl);
        } else {
          await redis.set(key, JSON.stringify(value));
        }
      } catch (e) {

        console.warn('[REDIS] set fail, used memory fallback:', e.message);
      }
    }
    return true;
  }

  async getData(key) {

    if (this.isRedisAvailable()) {
      try {
        const raw = await redis.get(key);
        if (raw !== null && raw !== undefined) {
          return JSON.parse(raw);
        }
      } catch (e) {
        console.warn('[REDIS] get fail, using memory:', e.message);
      }
    }

    const v = this.memory.get(key);
    return v === undefined ? null : v;
  }

  async deleteData(key) {

    this.memory.delete(key);

    if (this.isRedisAvailable()) {
      try {
        const n = await redis.del(key);
        return n > 0;
      } catch (e) {
        console.warn('[REDIS] del fail (ignored):', e.message);
      }
    }
    return true; 
  }

  async disconnect() {
    try {

      if (redis && redis.status !== 'end') {
        await redis.quit();
      }
    } catch (e) {
      console.warn('[REDIS] quit error (ignored):', e.message);
    }
  }

  health() {
    return { redis: this.isRedisAvailable() ? 'up' : 'down' };
  }
}

module.exports = new RedisService();
