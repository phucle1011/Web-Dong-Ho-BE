const redis = require('./redis');

class RedisService {
    constructor() {
        this.client = redis;
        this.isConnected = false;

        this.client.on('connect', () => {
            console.log('Redis connected');
            this.isConnected = true;
        });
        
        this.client.on('error', (err) => {
            console.error('Redis error:', err);
            this.isConnected = false;
        });
        
        this.client.on('end', () => {
            console.log('Redis disconnected');
            this.isConnected = false;
        });
    }

    async ensureConnection() {
        if (!this.isConnected) {
            try {

                if (this.client.status !== 'ready') {
                    this.client = new Redis({
                        host: '127.0.0.1',
                        port: 6379,
                        retryStrategy: (times) => {
                            const delay = Math.min(times * 50, 2000);
                            return delay;
                        }
                    });
                }
                this.isConnected = true;
            } catch (err) {
                console.error('Redis connection error:', err);
                throw err;
            }
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
            console.error('Redis set error:', err);
            return false;
        }
    }

    async getData(key) {
        try {
            await this.ensureConnection();
            
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            console.error('Redis get error:', err);
            return null;
        }
    }

    async deleteData(key) {
        try {
            await this.ensureConnection();
            
            const result = await this.client.del(key);
            return result > 0;
        } catch (err) {
            console.error('Redis delete error:', err);
            return false;
        }
    }

    async disconnect() {
        try {
            if (this.isConnected) {
                await this.client.quit();
                this.isConnected = false;
            }
        } catch (err) {
            console.error('Redis disconnect error:', err);
        }
    }
}

module.exports = new RedisService();