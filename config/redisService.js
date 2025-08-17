const client = require('./redis');      
 const rest = require('./restRedis');

class RedisService {
  constructor() {
    this.client = client;
    this.isConnected = this.client.status === 'ready';

    this.client.on('ready', () => { this.isConnected = true; });
    this.client.on('end',   () => { this.isConnected = false; });
    this.client.on('error', (err) => {
      this.isConnected = false;
      console.error('[REDIS] error:', err?.message || err);
    });
  }

  async ensureConnection() {
    const st = this.client.status;  
    if (st === 'ready' || st === 'connecting' || st === 'wait' || st === 'reconnecting') return;

    if (st === 'end') {
      await this.client.connect();  
    }
  }

async setData(key, value, ttl = 3600) {
  const payload = JSON.stringify(value);

  for (let i = 0; i < 2; i++) {
   try {
      await this.ensureConnection();
      if (ttl) await this.client.set(key, payload, 'EX', ttl);
     else await this.client.set(key, payload);
      return true;
    } catch (err) {
      console.error(`[REDIS] socket SET attempt ${i+1} failed:`, err.message);
     await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }

  if (rest) {
    try {
      if (ttl) await rest.set(key, value, { ex: ttl });
      else await rest.set(key, value);
      console.log('[REDIS-REST] SET ok:', key);
     return true;
    } catch (e) {
      console.error('[REDIS-REST] SET failed:', e.message);
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
    console.error('[REDIS] socket GET error:', err?.message || err);
    if (rest) {
      try {
        const val = await rest.get(key);
       return val ?? null;
      } catch (e) {
        console.error('[REDIS-REST] GET failed:', e.message);
      }
    }
    return null;
  }
}

async deleteData(key) {
  try {
   await this.ensureConnection();
    const result = await this.client.del(key);
    return result > 0;
 } catch (err) {
    console.error('[REDIS] socket DEL error:', err?.message || err);
    if (rest) {
     try {
        await rest.del(key);
        console.log('[REDIS-REST] DEL ok:', key);
        return true;
      } catch (e) {
        console.error('[REDIS-REST] DEL failed:', e.message);
      }
   }
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
