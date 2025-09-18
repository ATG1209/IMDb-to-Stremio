# IMDb Scraper Worker

A dedicated worker service for scraping IMDb watchlists using Playwright in a full Linux container environment.

## Architecture

This service solves the serverless browser automation limitation by running in a container with pre-installed Chrome and all required system dependencies.

### Components

- **Express API**: REST endpoints for job management
- **Redis Queue**: Job queue management with Upstash
- **Playwright Scraper**: Browser automation for IMDb scraping
- **TMDB Integration**: Poster and metadata enhancement
- **Docker Container**: Based on `mcr.microsoft.com/playwright:focal`

## API Endpoints

### Health Check
```
GET /health
```
Returns service health status and Redis connectivity.

### Job Management
```
POST /jobs
Authorization: Bearer <WORKER_SECRET>
Content-Type: application/json

{
  "imdbUserId": "ur31595220",
  "callbackUrl": "https://your-app.vercel.app/api/callback",
  "forceRefresh": false
}
```

```
GET /jobs/:id
```
Get job status and results.

```
GET /jobs
```
List jobs with pagination.

## Environment Variables

Required:
- `UPSTASH_REDIS_URL` - Redis connection URL
- `WORKER_SECRET` - Authentication secret
- `TMDB_API_KEY` - TMDB API key for poster enhancement

Optional:
- `VERCEL_CALLBACK_SECRET` - Shared secret for callbacks
- `DEFAULT_IMDB_USER_ID` - Default user for testing
- `LOG_LEVEL` - Logging level (debug, info, warn, error)
- `PORT` - Server port (default: 3000)

## Local Development

1. **Install dependencies**:
   ```bash
   cd scraper-worker
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start Redis** (if running locally):
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

4. **Run the service**:
   ```bash
   npm run dev
   ```

## Deployment to Railway

1. **Create Railway project**:
   - Connect GitHub repository
   - Select the `scraper-worker` folder as root

2. **Configure environment variables** in Railway dashboard:
   - `UPSTASH_REDIS_URL`
   - `WORKER_SECRET`
   - `TMDB_API_KEY`
   - `VERCEL_CALLBACK_SECRET`

3. **Deploy**:
   Railway will automatically build and deploy using the Dockerfile.

## Integration with Vercel

The Vercel `/api/sync` endpoint should be updated to:

1. **Enqueue job** instead of direct scraping
2. **Return immediately** with job ID
3. **Poll job status** or use callbacks
4. **Serve cached results** when available

Example integration:
```javascript
// In Vercel API route
const response = await fetch(`${WORKER_URL}/jobs`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${WORKER_SECRET}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    imdbUserId: userId,
    callbackUrl: `${VERCEL_URL}/api/callback`,
    forceRefresh: forceRefresh
  })
});

const { jobId, status, result } = await response.json();

if (status === 'completed') {
  // Return cached result immediately
  return result;
} else {
  // Return job ID for polling
  return { jobId, status: 'processing' };
}
```

## Features

- ✅ **Browser Automation**: Full Chrome with all dependencies
- ✅ **Queue Management**: Redis-based job queue with retries
- ✅ **Rate Limiting**: Respects TMDB API limits
- ✅ **Caching**: Smart caching to avoid unnecessary scrapes
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **Health Monitoring**: Health checks and metrics
- ✅ **Scalability**: Can run multiple instances
- ✅ **Security**: Authentication and input validation

## Cost Estimate

- **Railway Starter**: $5/month
- **Upstash Redis**: Free tier (10K commands/day)
- **Total**: ~$5/month additional cost

## Monitoring

- Health endpoint: `GET /health`
- Metrics endpoint: `GET /health/metrics`
- Logs available in Railway dashboard
- Queue statistics via Redis monitoring

## Troubleshooting

### Browser Launch Issues
Check Docker logs for missing dependencies. The `mcr.microsoft.com/playwright:focal` image should include all required libraries.

### Redis Connection Issues
Verify `UPSTASH_REDIS_URL` is correctly set and accessible.

### Rate Limiting
TMDB API has rate limits. The service includes automatic retry logic and batching.

### Memory Issues
Railway provides 1GB RAM by default. For heavy scraping, consider upgrading the plan.