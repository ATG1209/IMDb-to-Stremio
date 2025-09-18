import { NextApiRequest, NextApiResponse } from 'next';

// Worker service configuration
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3000';
const WORKER_SECRET = process.env.WORKER_SECRET;

// In-memory job tracking (in production, use Redis/database)
const activeJobs = new Map<string, { jobId: string; startedAt: string; status: string }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Trigger manual sync via worker
    const { forceRefresh = false } = req.body;
    const userId = process.env.DEFAULT_IMDB_USER_ID || 'ur31595220';

    // Check if there's already an active job for this user
    const existingJob = activeJobs.get(userId);
    if (existingJob && existingJob.status === 'processing') {
      return res.status(429).json({
        error: 'Sync already in progress',
        message: 'Please wait for the current sync to complete',
        jobId: existingJob.jobId,
        startedAt: existingJob.startedAt
      });
    }

    try {
      console.log(`Starting worker-based sync for user ${userId}...`);

      if (!WORKER_SECRET) {
        throw new Error('WORKER_SECRET not configured');
      }

      // Enqueue job with worker service
      const workerResponse = await fetch(`${WORKER_URL}/jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WORKER_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imdbUserId: userId,
          callbackUrl: `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/worker-callback`,
          forceRefresh
        }),
        timeout: 10000
      });

      if (!workerResponse.ok) {
        const errorText = await workerResponse.text();
        throw new Error(`Worker service error: ${workerResponse.status} - ${errorText}`);
      }

      const workerResult = await workerResponse.json();

      // Track the job
      if (workerResult.status === 'pending') {
        activeJobs.set(userId, {
          jobId: workerResult.jobId,
          startedAt: new Date().toISOString(),
          status: 'processing'
        });
      }

      if (workerResult.cached && workerResult.result) {
        // Return cached result immediately
        console.log(`Returning cached result for user ${userId}`);
        return res.status(200).json({
          success: true,
          message: 'Watchlist synced successfully (cached)',
          totalItems: workerResult.result.totalItems,
          lastUpdated: workerResult.result.lastUpdated,
          cached: true,
          jobId: workerResult.jobId,
          data: workerResult.result.items?.slice(0, 5) || []
        });
      }

      // Return job ID for polling
      return res.status(202).json({
        success: true,
        message: 'Sync job started successfully',
        jobId: workerResult.jobId,
        status: workerResult.status,
        estimatedDuration: workerResult.estimatedDuration || '30-60 seconds',
        pollUrl: `/api/sync/status/${workerResult.jobId}`
      });

    } catch (error) {
      console.error('Worker sync failed:', error);
      return res.status(500).json({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        fallback: 'Worker service unavailable. Please try again later.'
      });
    }
  } 
  
  else if (req.method === 'GET') {
    // Get sync status
    const userId = process.env.DEFAULT_IMDB_USER_ID || 'ur31595220';
    const activeJob = activeJobs.get(userId);

    if (activeJob) {
      try {
        // Check job status with worker
        const statusResponse = await fetch(`${WORKER_URL}/jobs/${activeJob.jobId}`, {
          headers: {
            'Authorization': `Bearer ${WORKER_SECRET}`
          },
          timeout: 5000
        });

        if (statusResponse.ok) {
          const jobStatus = await statusResponse.json();

          // Update local tracking
          if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
            activeJobs.delete(userId);
          }

          return res.status(200).json({
            syncInProgress: jobStatus.status === 'processing',
            jobId: activeJob.jobId,
            status: jobStatus.status,
            startedAt: activeJob.startedAt,
            progress: jobStatus.progress,
            message: `Sync ${jobStatus.status}`,
            result: jobStatus.result
          });
        }
      } catch (error) {
        console.warn('Failed to check job status:', error);
      }
    }

    return res.status(200).json({
      syncInProgress: false,
      message: 'No sync running'
    });
  }
  
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}