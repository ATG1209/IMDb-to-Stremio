import { NextApiRequest, NextApiResponse } from 'next';

const VERCEL_CALLBACK_SECRET = process.env.VERCEL_CALLBACK_SECRET;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate callback
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  if (!VERCEL_CALLBACK_SECRET || token !== VERCEL_CALLBACK_SECRET) {
    return res.status(401).json({ error: 'Invalid authentication' });
  }

  try {
    const { jobId, imdbUserId, status, result, error, timestamp } = req.body;

    console.log(`Worker callback received for job ${jobId}:`, {
      imdbUserId,
      status,
      totalItems: result?.totalItems,
      timestamp
    });

    if (status === 'completed' && result) {
      // Handle successful completion
      console.log(`✅ Job ${jobId} completed: ${result.totalItems} items processed in ${result.processingTime}ms`);

      // Here you could:
      // 1. Store the result in your database
      // 2. Update cache
      // 3. Trigger dependent processes
      // 4. Send notifications

      // For now, just log the success
      console.log(`Watchlist for user ${imdbUserId} updated successfully`);

    } else if (status === 'failed') {
      // Handle failure
      console.error(`❌ Job ${jobId} failed:`, error);

      // Here you could:
      // 1. Log the error for monitoring
      // 2. Trigger retry logic
      // 3. Send failure notifications
      // 4. Update user status

    }

    // Always acknowledge the callback
    res.status(200).json({
      received: true,
      jobId,
      timestamp: new Date().toISOString()
    });

  } catch (callbackError) {
    console.error('Error processing worker callback:', callbackError);
    res.status(500).json({
      error: 'Failed to process callback',
      message: callbackError instanceof Error ? callbackError.message : 'Unknown error'
    });
  }
}