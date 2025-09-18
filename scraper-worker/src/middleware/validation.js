import { logger } from '../utils/logger.js';

// Authenticate requests using shared secret
export function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.WORKER_SECRET;

  if (!expectedSecret) {
    logger.warn('WORKER_SECRET not configured');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Authentication not properly configured'
    });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Bearer token required in Authorization header'
    });
  }

  const token = authHeader.substring(7);
  if (token !== expectedSecret) {
    logger.warn('Invalid authentication token attempted', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({
      error: 'Invalid authentication',
      message: 'Invalid bearer token'
    });
  }

  next();
}

// Validate job request payload
export function validateJobRequest(req, res, next) {
  const { imdbUserId, callbackUrl, forceRefresh } = req.body;

  const errors = [];

  // Validate IMDb User ID
  if (!imdbUserId || typeof imdbUserId !== 'string') {
    errors.push('imdbUserId is required and must be a string');
  } else if (!imdbUserId.match(/^ur\d+$/)) {
    errors.push('imdbUserId must be in format "ur12345678"');
  }

  // Validate callback URL (optional)
  if (callbackUrl) {
    if (typeof callbackUrl !== 'string') {
      errors.push('callbackUrl must be a string');
    } else {
      try {
        new URL(callbackUrl);
      } catch {
        errors.push('callbackUrl must be a valid URL');
      }
    }
  }

  // Validate forceRefresh (optional)
  if (forceRefresh !== undefined && typeof forceRefresh !== 'boolean') {
    errors.push('forceRefresh must be a boolean');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Request payload is invalid',
      details: errors
    });
  }

  next();
}