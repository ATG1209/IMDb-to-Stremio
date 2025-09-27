import { redisClient } from './redis.js';
import { logger } from '../utils/logger.js';

const STORAGE_KEYS = {
  job: (id) => `imdb:job:${id}`,
  userJobs: (userId) => `imdb:user:${userId}:jobs`,
  jobResults: (id) => `imdb:job:${id}:result`
};

export const jobStorage = {
  // Save job data
  async saveJob(job) {
    try {
      const jobKey = STORAGE_KEYS.job(job.id);
      const userJobsKey = STORAGE_KEYS.userJobs(job.imdbUserId);

      // Store job data (expires in 7 days)
      await redisClient.setEx(jobKey, 7 * 24 * 60 * 60, JSON.stringify(job));

      // Add to user's job list (keep last 10 jobs per user)
      await redisClient.lPush(userJobsKey, job.id);
      await redisClient.lTrim(userJobsKey, 0, 9);
      await redisClient.expire(userJobsKey, 7 * 24 * 60 * 60);

      logger.debug(`Job ${job.id} saved to storage`);
    } catch (error) {
      logger.error(`Failed to save job ${job.id}:`, error);
      throw error;
    }
  },

  // Get job by ID
  async getJob(jobId) {
    try {
      const jobKey = STORAGE_KEYS.job(jobId);
      const jobData = await redisClient.get(jobKey);

      if (!jobData) {
        return null;
      }

      return JSON.parse(jobData);
    } catch (error) {
      logger.error(`Failed to get job ${jobId}:`, error);
      throw error;
    }
  },

  // Update job data
  async updateJob(jobId, updates) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      const updatedJob = {
        ...job,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await this.saveJob(updatedJob);
      logger.debug(`Job ${jobId} updated`);
      return updatedJob;
    } catch (error) {
      logger.error(`Failed to update job ${jobId}:`, error);
      throw error;
    }
  },

  // Get latest job for a user
  async getLatestJobForUser(imdbUserId) {
    try {
      const userJobsKey = STORAGE_KEYS.userJobs(imdbUserId);
      const jobIds = await redisClient.lRange(userJobsKey, 0, 0); // Get latest job ID

      if (jobIds.length === 0) {
        return null;
      }

      return await this.getJob(jobIds[0]);
    } catch (error) {
      logger.error(`Failed to get latest job for user ${imdbUserId}:`, error);
      throw error;
    }
  },

  // List jobs with filters
  async listJobs(options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        status,
        imdbUserId
      } = options;

      let jobIds = [];

      if (imdbUserId) {
        // Get jobs for specific user
        const userJobsKey = STORAGE_KEYS.userJobs(imdbUserId);
        jobIds = await redisClient.lRange(userJobsKey, offset, offset + limit - 1);
      } else {
        // Get all job IDs (this is expensive, should be paginated)
        const pattern = STORAGE_KEYS.job('*');
        const keys = await redisClient.keys(pattern);
        jobIds = keys.map(key => key.split(':').pop()).slice(offset, offset + limit);
      }

      const jobs = [];
      for (const jobId of jobIds) {
        const job = await this.getJob(jobId);
        if (job && (!status || job.status === status)) {
          jobs.push(job);
        }
      }

      return jobs;
    } catch (error) {
      logger.error('Failed to list jobs:', error);
      throw error;
    }
  },

  // Store watchlist result separately (for faster access)
  async saveResult(jobId, result) {
    try {
      const resultKey = STORAGE_KEYS.jobResults(jobId);

      // Store result with 30-day expiration
      await redisClient.setEx(resultKey, 30 * 24 * 60 * 60, JSON.stringify(result));

      logger.debug(`Result for job ${jobId} saved to storage`);
    } catch (error) {
      logger.error(`Failed to save result for job ${jobId}:`, error);
      throw error;
    }
  },

  // Get watchlist result
  async getResult(jobId) {
    try {
      const resultKey = STORAGE_KEYS.jobResults(jobId);
      const resultData = await redisClient.get(resultKey);

      if (!resultData) {
        return null;
      }

      return JSON.parse(resultData);
    } catch (error) {
      logger.error(`Failed to get result for job ${jobId}:`, error);
      throw error;
    }
  }
};
