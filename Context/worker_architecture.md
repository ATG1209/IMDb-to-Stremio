# Worker Architecture Documentation

## Problem Solved

**Issue**: Browser automation (Playwright/Puppeteer) fails in serverless environments due to:
- Missing system libraries (libnss3.so, libatk, etc.)
- Memory constraints (1GB limit)
- Execution timeouts (10-30 seconds)
- Read-only file systems
- No package managers (apt-get, yum)

**Solution**: Hybrid architecture that separates browser automation from serverless API serving.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Stremio App  │────│  Vercel Next.js │────│ Railway Worker  │
│                │    │      (API)      │    │   (Browser)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              │                        │
                         ┌─────────────────┐    ┌─────────────────┐
                         │ Upstash Redis   │    │  TMDB API       │
                         │   (Queue)       │    │ (Metadata)      │
                         └─────────────────┘    └─────────────────┘
```

## Component Responsibilities

### Vercel Next.js App
- **Purpose**: Fast API serving, global CDN, Stremio manifest endpoints
- **Responsibilities**:
  - Serve Stremio addon manifests
  - Handle `/api/sync` requests by enqueueing jobs
  - Serve catalog data from worker results
  - Manage user authentication and settings
- **Benefits**:
  - Global edge network for fast responses
  - Zero-config deployment
  - Automatic HTTPS and scaling

### Railway Worker Service
- **Purpose**: Browser automation in proper Linux container
- **Responsibilities**:
  - Launch Chrome/Chromium with full dependencies
  - Scrape IMDb watchlists using Playwright
  - Enhance data with TMDB posters/metadata
  - Process job queue from Redis
  - Store results back to Redis
- **Benefits**:
  - Full system library support
  - Unlimited memory and execution time
  - Proper error handling and retries

### Upstash Redis
- **Purpose**: Job queue and result caching
- **Responsibilities**:
  - Queue management (pending, processing, completed, failed)
  - Job status tracking and progress updates
  - Result caching with TTL
  - Inter-service communication
- **Benefits**:
  - Serverless-friendly (HTTP API)
  - Built-in persistence and reliability
  - Free tier sufficient for moderate usage

## Data Flow

### Sync Request Flow
```
1. User triggers sync: POST /api/sync
2. Vercel enqueues job: POST worker/jobs
3. Worker processes job: Browser scraping
4. Worker stores result: Redis cache
5. Vercel serves result: GET /api/stremio/catalog
```

### Catalog Request Flow
```
1. Stremio requests catalog: GET /api/stremio/.../catalog/...
2. Vercel checks worker cache: GET worker/jobs?user=...
3. If cached: Return immediately
4. If stale: Trigger background refresh
5. Return cached data while refreshing
```

## API Contracts

### Worker Service Endpoints

**POST /jobs**
```typescript
Request: {
  imdbUserId: string
  callbackUrl?: string
  forceRefresh?: boolean
}

Response: {
  jobId: string
  status: 'pending' | 'completed'
  cached?: boolean
  result?: WorkerJobResult
}
```

**GET /jobs/:id**
```typescript
Response: {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: string
  result?: WorkerJobResult
  error?: string
}
```

**GET /health**
```typescript
Response: {
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: {
    redis: 'healthy' | 'unhealthy'
    memory: string
    uptime: number
  }
}
```

### Vercel API Updates

**POST /api/sync**
```typescript
// Before: Direct scraping (60s timeout, browser errors)
const items = await fetchWatchlist(userId, { forceRefresh })

// After: Worker delegation (instant response)
const job = await workerClient.enqueueSyncJob(userId, { forceRefresh })
return { jobId: job.id, status: job.status }
```

**GET /api/stremio/.../catalog**
```typescript
// Before: Direct scraping every request
const items = await fetchWatchlist(userId)

// After: Worker cache with smart fallback
const items = await workerClient.getWatchlist(userId, { maxAgeHours: 12 })
```

## Performance Characteristics

### Before (Direct Serverless)
- **Cold start**: 15-30 seconds
- **Browser launch**: FAILED (missing dependencies)
- **Memory usage**: >1GB (exceeded limits)
- **Timeout**: 10-30 seconds (insufficient)
- **Success rate**: 0% in production

### After (Hybrid Architecture)
- **Cached response**: <200ms (Vercel edge)
- **Fresh scrape**: 30-60 seconds (Railway container)
- **Memory usage**: Unlimited in worker
- **Timeout**: No limits
- **Success rate**: >95% with retries

## Deployment Strategy

### Phase 1: Infrastructure Setup
1. **Upstash Redis**: Free tier, instant setup
2. **Railway Worker**: $5/month, Docker deployment
3. **Environment Config**: Secrets and URLs

### Phase 2: Code Migration
1. **Worker Service**: Independent deployment
2. **Vercel Updates**: API endpoint modifications
3. **Client Integration**: Stremio addon compatibility

### Phase 3: Testing & Rollout
1. **Health Checks**: End-to-end validation
2. **Gradual Migration**: Feature flags for rollback
3. **Performance Monitoring**: Metrics and alerts

## Error Handling

### Worker Service Failures
- **Browser crashes**: Automatic restart with fresh browser
- **Network timeouts**: Retry with exponential backoff
- **Memory issues**: Process restart and job requeue
- **Rate limiting**: Respect TMDB API limits with delays

### Queue Management
- **Failed jobs**: Move to failed queue with error details
- **Stuck jobs**: Timeout detection and recovery
- **Retry logic**: Maximum 3 attempts with increasing delays
- **Dead letter queue**: Manual intervention for persistent failures

### Vercel Fallbacks
- **Worker unavailable**: Return cached data or empty arrays
- **Network issues**: Graceful degradation with user messaging
- **Authentication errors**: Clear error messages with fix instructions

## Monitoring & Observability

### Health Metrics
- **Worker**: CPU, memory, queue depth, success rate
- **Redis**: Connection count, memory usage, command latency
- **Vercel**: Function duration, error rates, cache hit ratio

### Alerting
- **Worker down**: Immediate notification
- **Queue backlog**: Alert if >10 pending jobs
- **High error rate**: >5% failures in 5 minutes
- **Memory pressure**: >80% usage sustained

### Logging
- **Structured logs**: JSON format with correlation IDs
- **Log levels**: Debug (development), Info (production)
- **Log retention**: 7 days Railway, 30 days Vercel
- **Log aggregation**: Consider external service for production

## Security Considerations

### Authentication
- **Bearer tokens**: Shared secrets between services
- **Token rotation**: Regular secret updates
- **Scope limitation**: Worker can only process jobs
- **IP filtering**: Optional Railway network restrictions

### Data Protection
- **No PII storage**: Only IMDb IDs and public data
- **TTL policies**: Automatic data expiration
- **Encryption**: Redis TLS, HTTPS endpoints
- **Audit logs**: Track all API access

## Cost Analysis

### Monthly Costs
- **Railway Starter**: $5 (1GB RAM, shared CPU)
- **Upstash Redis**: $0 (free tier, 10K commands/day)
- **Vercel Hobby**: $0 (existing)
- **Total**: $5/month additional

### Usage Estimates
- **Redis commands**: ~100 per sync job (well under 10K/day)
- **Railway compute**: <10% utilization for single user
- **Vercel functions**: No change in usage patterns

### Scaling Costs
- **Railway Pro**: $20/month (4GB RAM, dedicated CPU)
- **Upstash Pro**: $20/month (100K commands/day)
- **Multiple workers**: Linear scaling per $5/month

## Migration Risks & Mitigation

### High Risk
- **Worker deployment failure**: Pre-test with staging environment
- **Environment variable mismatch**: Use deployment checklist
- **Redis connectivity**: Test connection before switching

### Medium Risk
- **Performance regression**: Monitor response times closely
- **Data inconsistency**: Validate worker results vs direct scraping
- **User experience**: Implement polling UI for job status

### Low Risk
- **Cost overrun**: Free tiers with alerts before limits
- **Vendor lock-in**: Standard Docker/Redis, easily portable
- **Security gaps**: Well-established authentication patterns

## Future Enhancements

### Multi-User Support
- **User management**: Support multiple IMDb accounts
- **Rate limiting**: Per-user quotas and throttling
- **Subscription tiers**: Different service levels

### Advanced Features
- **Real-time updates**: WebSocket notifications
- **Batch processing**: Multiple users per job
- **Smart scheduling**: Optimal sync timing
- **Analytics**: Usage patterns and optimization

### Performance Optimization
- **CDN caching**: Geographic result distribution
- **Preemptive refresh**: Predict user requests
- **Compression**: Reduce payload sizes
- **Connection pooling**: Optimize database connections

This architecture provides a robust, scalable solution for browser automation in serverless environments while maintaining the performance benefits of edge computing.