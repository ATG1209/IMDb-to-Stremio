import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';

const QUEUE_KEYS = {
  pending: 'imdb:jobs:pending',
  processing: 'imdb:jobs:processing',
  completed: 'imdb:jobs:completed',
  failed: 'imdb:jobs:failed'
};

export const jobQueue = {
  // Add job to pending queue
  async enqueue(job) {
    try {
      await redisClient.lpush(QUEUE_KEYS.pending, JSON.stringify(job));
      logger.debug(`Job ${job.id} added to pending queue`);
    } catch (error) {
      logger.error(`Failed to enqueue job ${job.id}:`, error);
      throw error;
    }
  },

  // Get next job from pending queue and move to processing
  async dequeue() {
    try {
      // Atomically move job from pending to processing
      const jobData = await redisClient.brpoplpush(
        QUEUE_KEYS.pending,
        QUEUE_KEYS.processing,
        5 // 5 second timeout
      );

      if (!jobData) {
        return null; // No jobs available
      }

      const job = JSON.parse(jobData);
      logger.debug(`Job ${job.id} moved to processing`);
      return job;
    } catch (error) {
      logger.error('Failed to dequeue job:', error);
      throw error;
    }
  },

  // Mark job as completed
  async complete(job, result) {
    try {
      // Remove from processing queue
      await redisClient.lrem(QUEUE_KEYS.processing, 1, JSON.stringify({
        ...job,
        status: 'processing'
      }));

      // Add to completed queue with result
      const completedJob = {
        ...job,
        status: 'completed',
        completedAt: new Date().toISOString(),
        result
      };

      await redisClient.lpush(QUEUE_KEYS.completed, JSON.stringify(completedJob));

      // Keep only last 100 completed jobs
      await redisClient.ltrim(QUEUE_KEYS.completed, 0, 99);

      logger.info(`Job ${job.id} completed successfully`);
    } catch (error) {
      logger.error(`Failed to mark job ${job.id} as completed:`, error);
      throw error;
    }
  },

  // Mark job as failed
  async fail(job, error) {
    try {
      // Remove from processing queue
      await redisClient.lrem(QUEUE_KEYS.processing, 1, JSON.stringify({
        ...job,
        status: 'processing'
      }));

      // Add to failed queue with error
      const failedJob = {
        ...job,
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: error.message || 'Unknown error',
        attempts: (job.attempts || 0) + 1
      };

      await redisClient.lpush(QUEUE_KEYS.failed, JSON.stringify(failedJob));

      // Keep only last 100 failed jobs
      await redisClient.ltrim(QUEUE_KEYS.failed, 0, 99);

      logger.error(`Job ${job.id} failed:`, error);
    } catch (redisError) {
      logger.error(`Failed to mark job ${job.id} as failed:`, redisError);
      throw redisError;
    }
  },

  // Get queue statistics
  async getStats() {
    try {
      const [pending, processing, completed, failed] = await Promise.all([
        redisClient.llen(QUEUE_KEYS.pending),
        redisClient.llen(QUEUE_KEYS.processing),
        redisClient.llen(QUEUE_KEYS.completed),
        redisClient.llen(QUEUE_KEYS.failed)
      ]);

      return {
        pending: pending || 0,
        processing: processing || 0,
        completed: completed || 0,
        failed: failed || 0
      };
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      throw error;
    }
  },

  // Retry failed job (move back to pending)
  async retry(jobId) {
    try {
      // Find job in failed queue
      const failedJobs = await redisClient.lrange(QUEUE_KEYS.failed, 0, -1);

      for (const jobData of failedJobs) {
        const job = JSON.parse(jobData);
        if (job.id === jobId) {
          // Remove from failed queue
          await redisClient.lrem(QUEUE_KEYS.failed, 1, jobData);

          // Reset job status and add back to pending
          const retryJob = {
            ...job,
            status: 'pending',
            retryAt: new Date().toISOString(),
            attempts: (job.attempts || 0) + 1
          };

          await redisClient.lpush(QUEUE_KEYS.pending, JSON.stringify(retryJob));
          logger.info(`Job ${jobId} moved back to pending queue for retry`);
          return true;
        }
      }

      return false; // Job not found
    } catch (error) {
      logger.error(`Failed to retry job ${jobId}:`, error);
      throw error;
    }
  }
};