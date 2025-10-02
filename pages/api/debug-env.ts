import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({
    hasWorkerUrl: !!process.env.WORKER_URL,
    workerUrl: process.env.WORKER_URL ? 'configured' : 'missing',
    hasWorkerSecret: !!process.env.WORKER_SECRET,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
}
