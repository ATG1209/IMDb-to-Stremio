import { NextApiRequest, NextApiResponse } from 'next';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3000';
const WORKER_SECRET = process.env.WORKER_SECRET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobId } = req.query;

  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({
      error: 'Missing job ID',
      message: 'Job ID is required'
    });
  }

  if (!WORKER_SECRET) {
    return res.status(500).json({
      error: 'Configuration error',
      message: 'Worker service not properly configured'
    });
  }

  try {
    // Get job status from worker
    const statusResponse = await fetch(`${WORKER_URL}/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${WORKER_SECRET}`
      },
      timeout: 10000
    });

    if (!statusResponse.ok) {
      if (statusResponse.status === 404) {
        return res.status(404).json({
          error: 'Job not found',
          message: `Job ${jobId} does not exist or has expired`
        });
      }

      throw new Error(`Worker service error: ${statusResponse.status}`);
    }

    const jobStatus = await statusResponse.json();

    // Transform response for public API
    const publicStatus = {
      jobId: jobStatus.id,
      status: jobStatus.status,
      createdAt: jobStatus.createdAt,
      startedAt: jobStatus.startedAt,
      completedAt: jobStatus.completedAt,
      progress: jobStatus.progress,
      message: getStatusMessage(jobStatus.status, jobStatus.progress)
    };

    // Include result if completed
    if (jobStatus.status === 'completed' && jobStatus.result) {
      publicStatus.result = {
        totalItems: jobStatus.result.totalItems,
        lastUpdated: jobStatus.result.lastUpdated,
        processingTime: jobStatus.result.processingTime,
        data: jobStatus.result.items?.slice(0, 10) || [] // Return first 10 items
      };
    }

    // Include error if failed
    if (jobStatus.status === 'failed' && jobStatus.error) {
      publicStatus.error = jobStatus.error;
    }

    res.json(publicStatus);

  } catch (error) {
    console.error(`Failed to get job status for ${jobId}:`, error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function getStatusMessage(status: string, progress?: string): string {
  switch (status) {
    case 'pending':
      return 'Job is queued and waiting to start';
    case 'processing':
      return progress || 'Processing your watchlist...';
    case 'completed':
      return 'Watchlist sync completed successfully';
    case 'failed':
      return 'Sync failed. Please try again.';
    default:
      return `Job status: ${status}`;
  }
}