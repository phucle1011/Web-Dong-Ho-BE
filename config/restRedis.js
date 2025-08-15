const { Redis: UpstashRedis } = require('@upstash/redis');

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let rest = null;
if (url && token) {
  rest = new UpstashRedis({ url, token });
  console.log('[REDIS-REST] enabled');
} else {
  console.log('[REDIS-REST] missing URL/TOKEN -> disabled');
}

module.exports = rest;
