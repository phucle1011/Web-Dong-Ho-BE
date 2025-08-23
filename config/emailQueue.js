require('dotenv').config();
const Queue = require('bull');
const IORedis = require('ioredis');
const dns = require('dns');

if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const makeRedis = () => new IORedis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000,
  retryStrategy: (times) => Math.min(5000, times * 500),
});

const emailQueue = new Queue('emailQueue', {
  createClient: () => makeRedis(),
  prefix: '{email}',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 100
  }
});

emailQueue.on('error', (err) => console.error('[QUEUE ERROR]', err.message));
emailQueue.on('failed', (job, err) => console.error('[JOB FAILED]', job.id, err.message));
emailQueue.on('completed', (job) => console.log('[JOB DONE]', job.id));

module.exports = emailQueue;
