// redisService.js
const client = require('./redis'); // ĐÃ cấu hình đầy đủ ở redis.js

class RedisService {
  constructor() {
    this.client = client;
    this.isConnected = this.client.status === 'ready';

    // Đã có listeners trong redis.js thì không cần lặp lại ở đây.
    // Nếu muốn theo dõi trạng thái tối thiểu:
    this.client.on('ready', () => { this.isConnected = true; });
    this.client.on('end',   () => { this.isConnected = false; });
    this.client.on('error', (err) => {
      this.isConnected = false;
      console.error('[REDIS] error:', err?.message || err);
    });
  }

  async ensureConnection() {
    // ioredis sẽ tự connect khi cần; chỉ chủ động gọi connect khi đã end
    const st = this.client.status; // 'wait' | 'connecting' | 'ready' | 'reconnecting' | 'end'
    if (st === 'ready' || st === 'connecting' || st === 'wait' || st === 'reconnecting') return;

    if (st === 'end') {
      await this.client.connect();  // KHÔNG tạo new Redis(); dùng lại client
    }
  }

async setData(key, value, ttl = 3600) {
  const payload = JSON.stringify(value);
  for (let i = 0; i < 3; i++) {
    try {
      await this.ensureConnection();
      if (ttl) {
        await this.client.set(key, payload, 'EX', ttl);
      } else {
        await this.client.set(key, payload);
      }
      return true;
    } catch (err) {
      console.error(`[REDIS] set attempt ${i+1} failed:`, err.message);
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  return false;
}

  async getData(key) {
    try {
      await this.ensureConnection();
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error('[REDIS] get error:', err?.message || err);
      return null;
    }
  }

  async deleteData(key) {
    try {
      await this.ensureConnection();
      const result = await this.client.del(key);
      return result > 0;
    } catch (err) {
      console.error('[REDIS] del error:', err?.message || err);
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.client.status !== 'end') {
        await this.client.quit();
      }
      this.isConnected = false;
    } catch (err) {
      console.error('[REDIS] quit error:', err?.message || err);
    }
  }
}

module.exports = new RedisService();
