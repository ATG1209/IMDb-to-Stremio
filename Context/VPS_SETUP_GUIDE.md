# VPS Setup Guide: Copy-Paste Commands

**IMPORTANT**: Run these commands one by one, don't paste everything at once.

## Step 1: Connect to Your VPS

```bash
# SSH into your Hetzner VPS (replace with your details)
ssh root@your-vps-ip
# or
ssh your-username@your-vps-ip
```

## Step 2: Check Current Resources

```bash
# Check what's currently running
echo "=== MEMORY USAGE ==="
free -h

echo "=== DISK SPACE ==="
df -h

echo "=== RUNNING SERVICES ==="
docker ps

echo "=== CPU INFO ==="
lscpu | grep "CPU(s)"
```

**Copy the output and we can verify you have enough resources.**

## Step 3: Install Dependencies (if needed)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Check if Docker is installed
docker --version

# If Docker is NOT installed, run this:
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose (if not installed)
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in to apply docker group
exit
```

**Re-SSH after running the above**

## Step 4: Create Working Directory

```bash
# Create directory for the worker
mkdir -p /opt/imdb-worker
cd /opt/imdb-worker

# Download the worker files
curl -o Dockerfile https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/Dockerfile
curl -o package.json https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/package.json

# Create src directory and download source files
mkdir -p src/{services,routes,middleware,utils}

# Download all the worker source files
curl -o src/server.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/server.js
curl -o src/utils/logger.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/utils/logger.js
curl -o src/routes/health.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/routes/health.js
curl -o src/routes/jobs.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/routes/jobs.js
curl -o src/services/redis.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/services/redis.js
curl -o src/services/jobQueue.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/services/jobQueue.js
curl -o src/services/jobStorage.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/services/jobStorage.js
curl -o src/services/imdbScraper.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/services/imdbScraper.js
curl -o src/services/tmdbService.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/services/tmdbService.js
curl -o src/services/queueProcessor.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/services/queueProcessor.js
curl -o src/middleware/validation.js https://raw.githubusercontent.com/ATG1209/IMBd-to-Stremio/main/scraper-worker/src/middleware/validation.js

# Verify files downloaded
ls -la
ls -la src/
```

## Step 5: Generate Secrets

```bash
# Generate random secrets
echo "Copy these secrets for your environment file:"
echo "WORKER_SECRET=$(openssl rand -base64 32)"
echo "VERCEL_CALLBACK_SECRET=$(openssl rand -base64 32)"
```

**Copy the output - you'll need these secrets!**

## Step 6: Create Environment File

```bash
# Create environment file
cat > .env << 'EOF'
# Redis Configuration
REDIS_URL=redis://redis:6379

# API Security (REPLACE WITH YOUR GENERATED SECRETS)
WORKER_SECRET=REPLACE_WITH_GENERATED_SECRET
VERCEL_CALLBACK_SECRET=REPLACE_WITH_GENERATED_SECRET

# TMDB Integration (REPLACE WITH YOUR API KEY)
TMDB_API_KEY=YOUR_TMDB_API_KEY_HERE

# Default IMDb User
DEFAULT_IMDB_USER_ID=ur31595220

# Environment
NODE_ENV=production
PORT=3000

# Logging
LOG_LEVEL=info
EOF

# Edit the environment file with your actual values
nano .env
```

**In nano editor:**
1. Replace `REPLACE_WITH_GENERATED_SECRET` with your generated secrets
2. Replace `YOUR_TMDB_API_KEY_HERE` with your TMDB API key
3. Save with `Ctrl+X`, then `Y`, then `Enter`

## Step 7: Create Docker Compose File

```bash
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  redis:
    image: redis:alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  imdb-worker:
    build: .
    restart: unless-stopped
    ports:
      - "3001:3000"
    env_file:
      - .env
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs
    environment:
      - REDIS_URL=redis://redis:6379

volumes:
  redis_data:
EOF
```

## Step 8: Build and Start Services

```bash
# Build and start everything
docker-compose up -d --build

# Check if services are running
docker-compose ps

# Check logs
docker-compose logs -f imdb-worker
```

**If you see "🚀 IMDb Scraper Worker started on port 3000" then it's working!**

Press `Ctrl+C` to exit log viewing.

## Step 9: Test the Worker

```bash
# Test health endpoint
curl http://localhost:3001/health

# Should return something like:
# {"status":"healthy","timestamp":"...","checks":{"redis":"healthy",...}}
```

## Step 10: Configure Reverse Proxy

**First, check what web server you're using:**

```bash
# Check if nginx is running
systemctl status nginx

# Check if apache is running
systemctl status apache2

# Check if you're using Traefik/Caddy (common with n8n)
docker ps | grep -E "(traefik|caddy)"
```

**Tell me what's running and I'll give you the exact config!**

## Step 11: Get Your VPS Domain/IP

```bash
# Get your public IP
curl -4 ifconfig.co

# If you have a domain, we'll use that instead
echo "Your VPS domain: your-domain.com"
```

## Step 12: Update Vercel Environment

**Go to your Vercel dashboard and add these environment variables:**

```
WORKER_URL=http://YOUR_VPS_IP:3001
WORKER_SECRET=YOUR_GENERATED_WORKER_SECRET
VERCEL_CALLBACK_SECRET=YOUR_GENERATED_CALLBACK_SECRET
VERCEL_URL=https://imdb-migrator.vercel.app
```

**Replace `YOUR_VPS_IP` with the IP from step 11.**

## Step 13: Test End-to-End

```bash
# Test worker directly
curl -X POST http://localhost:3001/jobs \
  -H "Authorization: Bearer YOUR_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Should return a job ID
```

## Troubleshooting Commands

```bash
# If something goes wrong:

# Check all containers
docker-compose ps

# View worker logs
docker-compose logs imdb-worker

# View redis logs
docker-compose logs redis

# Restart everything
docker-compose restart

# Stop everything
docker-compose down

# Rebuild and start
docker-compose up -d --build
```

## When Everything is Working

You should see:
1. ✅ Health check returns "healthy"
2. ✅ Job creation returns a job ID
3. ✅ Vercel sync endpoint returns job info instead of errors
4. ✅ Stremio addon shows populated watchlist

---

**Run these commands step by step and let me know if you get stuck anywhere!**

I'll help troubleshoot any issues that come up.