const redis = require('./redis');

class RedisService {
  constructor() {
    this.client = redis;
  }

  async ensureConnection() {
    // ioredis tự reconnect — chỉ gọi connect nếu đang 'wait' hoặc 'end'
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect().catch(() => {}); // tránh throw
    }
  }

  async setData(key, value, ttl = 3600) {
    try {
      await this.ensureConnection();
      if (ttl) {
        await this.client.set(key, JSON.stringify(value), 'EX', ttl);
      } else {
        await this.client.set(key, JSON.stringify(value));
      }
      return true;
    } catch (err) {
      console.error('Redis set error:', err.message);
      return false;
    }
  }

  async getData(key) {
    try {
      await this.ensureConnection();
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error('Redis get error:', err.message);
      return null;
    }
  }

  async deleteData(key) {
    try {
      await this.ensureConnection();
      return (await this.client.del(key)) > 0;
    } catch (err) {
      console.error('Redis delete error:', err.message);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.client.status !== 'end') await this.client.quit();
    } catch (err) {
      console.error('Redis disconnect error:', err.message);
    }
  }
}

module.exports = new RedisService();
