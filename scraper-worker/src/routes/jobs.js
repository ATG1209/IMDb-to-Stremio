import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { jobQueue } from '../services/jobQueue.js';
import { jobStorage } from '../services/jobStorage.js';
import { logger } from '../utils/logger.js';
import { validateJobRequest, authenticateRequest } from '../middleware/validation.js';

const router = express.Router();

// POST /jobs - Enqueue a new IMDb sync job
router.post('/', authenticateRequest, validateJobRequest, async (req, res) => {
  try {
    const { imdbUserId, callbackUrl, forceRefresh = false } = req.body;

    const jobId = uuidv4();
    const job = {
      id: jobId,
      imdbUserId,
      callbackUrl,
      forceRefresh,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };

    // Check if there's already a recent job for this user
    if (!forceRefresh) {
      const existingJob = await jobStorage.getLatestJobForUser(imdbUserId);
      if (existingJob && existingJob.status === 'completed') {
        const completedAt = new Date(existingJob.completedAt);
        const hoursSinceCompletion = (Date.now() - completedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceCompletion < 12) {
          logger.info(`Returning cached result for user ${imdbUserId}`, {
            jobId: existingJob.id,
            hoursSinceCompletion: Math.round(hoursSinceCompletion * 100) / 100
          });

          return res.json({
            jobId: existingJob.id,
            status: 'completed',
            cached: true,
            result: existingJob.result
          });
        }
      }
    }

    // Store job and enqueue
    await jobStorage.saveJob(job);
    await jobQueue.enqueue(job);

    logger.info(`Job ${jobId} enqueued for user ${imdbUserId}`, {
      jobId,
      imdbUserId,
      forceRefresh
    });

    res.status(202).json({
      jobId,
      status: 'pending',
      message: 'Job enqueued successfully',
      estimatedDuration: '30-60 seconds'
    });

  } catch (error) {
    logger.error('Failed to enqueue job:', error);
    res.status(500).json({
      error: 'Failed to enqueue job',
      message: error.message
    });
  }
});

// GET /jobs/:id - Get job status and results
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await jobStorage.getJob(id);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: `Job with ID ${id} does not exist`
      });
    }

    // Remove sensitive data
    const publicJob = {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      result: job.result,
      error: job.error,
      progress: job.progress
    };

    res.json(publicJob);

  } catch (error) {
    logger.error('Failed to get job:', error);
    res.status(500).json({
      error: 'Failed to get job',
      message: error.message
    });
  }
});

// GET /jobs - List jobs (with pagination)
router.get('/', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status,
      imdbUserId
    } = req.query;

    const jobs = await jobStorage.listJobs({
      limit: parseInt(limit),
      offset: parseInt(offset),
      status,
      imdbUserId
    });

    res.json({
      jobs: jobs.map(job => ({
        id: job.id,
        imdbUserId: job.imdbUserId,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        itemCount: job.result?.totalItems || 0
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    logger.error('Failed to list jobs:', error);
    res.status(500).json({
      error: 'Failed to list jobs',
      message: error.message
    });
  }
});

export { router as jobsRouter };