// RedisService.js
const redis = require('./redis');

class RedisService {
  constructor() {
    this.client = redis;
    this._waiter = null;
  }

  // Chờ client sẵn sàng tối đa timeoutMs
  async waitForReady(timeoutMs = 3000) {
    const status = this.client.status;
    if (status === 'ready' || status === 'connect') return;

    if (!this._waiter) {
      this._waiter = new Promise((resolve, reject) => {
        const onReady = () => { cleanup(); resolve(); };
        const onError = (e) => { cleanup(); reject(e); };
        const onEnd   = () => { cleanup(); reject(new Error('Redis ended')); };

        const cleanup = () => {
          clearTimeout(timer);
          this.client.off('ready', onReady);
          this.client.off('error', onError);
          this.client.off('end', onEnd);
          this._waiter = null;
        };

        this.client.once('ready', onReady);
        this.client.once('error', onError);
        this.client.once('end', onEnd);

        var timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Redis not ready after ${timeoutMs}ms (status=${this.client.status})`));
        }, timeoutMs);
      });
    }
    return this._waiter;
  }

  async setData(key, value, ttl = 3600) {
    try {
      await this.waitForReady();
      const payload = JSON.stringify(value);
      if (ttl) {
        await this.client.set(key, payload, 'EX', ttl);
      } else {
        await this.client.set(key, payload);
      }
      return true;
    } catch (err) {
      console.error('Redis set error:', {
        status: this.client.status,
        key,
        code: err.code,
        name: err.name,
        message: err.message,
      });
      return false;
    }
  }

  async getData(key) {
    try {
      await this.waitForReady();
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error('Redis get error:', {
        status: this.client.status,
        key,
        code: err.code,
        name: err.name,
        message: err.message,
      });
      return null;
    }
  }

  async deleteData(key) {
    try {
      await this.waitForReady();
      const n = await this.client.del(key);
      return n > 0;
    } catch (err) {
      console.error('Redis delete error:', {
        status: this.client.status,
        key,
        code: err.code,
        name: err.name,
        message: err.message,
      });
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
