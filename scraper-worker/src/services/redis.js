import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

// Create Redis client
const redisClient = createClient({
  url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379'
});

// Error handling
redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('end', () => {
  logger.info('Redis client disconnected');
});

// Connect to Redis
async function connectRedis() {
  try {
    await redisClient.connect();
    logger.info('✅ Connected to Redis');
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
}

// Initialize connection
connectRedis().catch((error) => {
  logger.error('Failed to initialize Redis connection:', error);
  process.exit(1);
});

export { redisClient };