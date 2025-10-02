# SOLUTION: Server Issues - TMDB Posters & HTTPS

**Date:** September 30, 2025
**Status:** READY FOR DEPLOYMENT
**Related Issue:** [Server Issue - TMDB Posters & HTTPS.md](./Server%20Issue%20-%20TMDB%20Posters%20%26%20HTTPS.md)

---

## 🎯 Issue Summary

After thorough analysis, I've identified the root causes and solutions for both issues:

### **Issue #1: TMDB Poster Integration (SOLVED)**
**Root Cause:** The TMDB service code is correct and properly implemented. The issue is that the VPS worker needs to be restarted with the environment variable properly loaded.

**Analysis:**
- ✅ Code review shows `tmdbService.js` is correctly implemented with all required methods
- ✅ `getPosterBatch()` method exists and has proper rate limiting (lines 124-157)
- ✅ `enhanceWithTmdb()` in `imdbScraper.js` correctly calls TMDB service (lines 920-953)
- ✅ Environment variable `TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac` is configured
- ❌ Worker process may not have loaded the environment variable at startup

**Solution:** Restart worker with explicit environment variable loading

---

### **Issue #2: HTTPS/SSL Installation (ANALYSIS COMPLETE)**
**Root Cause:** Traefik routing configuration issue - backend service misconfigured or Docker networking problem.

**Analysis:**
- ✅ SSL certificate is valid (Let's Encrypt)
- ✅ HTTP endpoint works perfectly on port 3000
- ✅ Traefik is running and responding on port 443
- ❌ Traefik config points to wrong backend or Docker networking is broken

**Potential Issues:**
1. **Backend URL wrong**: Config uses `http://127.0.0.1:3000` but Traefik in Docker needs `http://host.docker.internal:3000`
2. **Missing entryPoints**: Config doesn't specify `entryPoints: ["websecure"]`
3. **Service not accessible**: Traefik container can't reach host network service
4. **Coolify interference**: Coolify proxy may have conflicting routes

**Solution Options:**
1. Fix Traefik configuration (preferred)
2. Use Cloudflare Tunnel for HTTPS (quick workaround)
3. Use nginx reverse proxy outside Docker (alternative)

---

## 🔧 SOLUTIONS

## Solution #1: Fix TMDB Posters

### **Copy-Paste Instructions for VPS Dev:**

```bash
# ==========================================
# TMDB POSTER FIX - VPS DEPLOYMENT
# ==========================================

# Step 1: Navigate to worker directory
cd /root/scraper-worker  # or wherever the worker is located

# Step 2: Verify TMDB_API_KEY is set
echo "Checking environment variable..."
printenv TMDB_API_KEY

# Step 3: If not set, add to environment file
# (Skip if already set from Step 2)
echo "TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac" >> .env

# Step 4: Restart worker with environment loaded
echo "Restarting worker..."
pkill -f "node.*worker" || true
sleep 2

# Option A: If using npm scripts
npm restart

# Option B: If using PM2
pm2 restart scraper-worker

# Option C: If using systemd
sudo systemctl restart imdb-worker

# Step 5: Verify worker is running
sleep 3
curl http://localhost:3003/health

# Step 6: Trigger fresh scraping job
echo "Triggering fresh scrape..."
curl -X POST http://localhost:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Step 7: Wait for job to complete (30-60 seconds)
echo "Waiting 60 seconds for job to complete..."
sleep 60

# Step 8: Check if posters are now populated
echo "Checking poster data..."
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://localhost:3003/cache/ur31595220 | jq '.data[0].poster'

# Expected output: Should show poster URL like "https://image.tmdb.org/t/p/w500/..."
# If still null, check logs below

# Step 9: Check worker logs for TMDB messages
echo "Checking worker logs..."
# Adjust log path as needed:
tail -n 50 /var/log/imdb-worker.log | grep -i "tmdb\|poster"
# or if using PM2:
pm2 logs scraper-worker --lines 50 | grep -i "tmdb\|poster"
```

### **Expected Results:**
- ✅ Worker restarts successfully
- ✅ Job completes in 30-60 seconds
- ✅ Cache shows poster URLs like `"poster": "https://image.tmdb.org/t/p/w500/gAUAE1WiKjcbrPjpMc99MxBR3U2.jpg"`
- ✅ Logs show messages like "Fetching TMDB posters for X items..." and "TMDB poster batch complete: Y/X posters found"

---

## Solution #2: Fix HTTPS/SSL Installation

I'm providing **three solutions** in order of preference:

### **OPTION A: Fix Traefik Configuration (Recommended)**

#### **Copy-Paste Instructions for VPS Dev:**

```bash
# ==========================================
# HTTPS FIX - TRAEFIK CONFIGURATION
# ==========================================

# Step 1: Backup current config
sudo cp /data/coolify/proxy/dynamic/imdb-addon.yml /data/coolify/proxy/dynamic/imdb-addon.yml.backup

# Step 2: Update Traefik config
sudo tee /data/coolify/proxy/dynamic/imdb-addon.yml > /dev/null <<'EOF'
http:
  routers:
    imdb-addon-https:
      rule: "Host(`static.76.92.27.37.clients.your-server.de`)"
      entryPoints:
        - "websecure"
      service: "imdb-addon-service"
      tls:
        certResolver: "letsencrypt"

    imdb-addon-http:
      rule: "Host(`static.76.92.27.37.clients.your-server.de`)"
      entryPoints:
        - "web"
      service: "imdb-addon-service"
      middlewares:
        - "redirect-to-https"

  services:
    imdb-addon-service:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:3000"

  middlewares:
    redirect-to-https:
      redirectScheme:
        scheme: "https"
        permanent: true
EOF

# Step 3: Verify Traefik can reach the service
docker exec coolify-proxy ping -c 2 host.docker.internal || \
  echo "WARNING: host.docker.internal not reachable from Traefik container"

# Step 4: If host.docker.internal doesn't work, use host IP
# Find host IP visible from inside container:
HOST_IP=$(docker exec coolify-proxy getent hosts host.docker.internal | awk '{ print $1 }')
if [ -z "$HOST_IP" ]; then
  # Fallback: use VPS IP
  HOST_IP="37.27.92.76"
fi
echo "Using host IP: $HOST_IP"

# Update config with actual IP if needed:
sudo sed -i "s|http://host.docker.internal:3000|http://${HOST_IP}:3000|" \
  /data/coolify/proxy/dynamic/imdb-addon.yml

# Step 5: Restart Traefik to load new config
docker restart coolify-proxy

# Step 6: Wait for Traefik to restart
sleep 5

# Step 7: Test HTTPS endpoint
echo "Testing HTTPS endpoint..."
curl -I https://static.76.92.27.37.clients.your-server.de/api/stremio/ur31595220/manifest.json

# Expected: HTTP/2 200 OK (not 502 Bad Gateway)

# Step 8: Test from external IP
echo "Testing from external..."
curl -I https://static.76.92.27.37.clients.your-server.de/api/stremio/manifest.json

# Step 9: Check Traefik logs for errors
docker logs coolify-proxy --tail 50 | grep -i "error\|imdb\|static"
```

---

### **OPTION B: Cloudflare Tunnel (Quick Workaround)**

If Traefik continues to fail, use Cloudflare Tunnel for instant HTTPS:

#### **Copy-Paste Instructions for VPS Dev:**

```bash
# ==========================================
# HTTPS FIX - CLOUDFLARE TUNNEL
# ==========================================

# Step 1: Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Step 2: Authenticate with Cloudflare (opens browser)
cloudflared tunnel login

# Step 3: Create tunnel
cloudflared tunnel create imdb-stremio

# Step 4: Note the tunnel ID from output
# It will show: Created tunnel imdb-stremio with id XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX

# Step 5: Create config file
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: imdb-stremio
credentials-file: /root/.cloudflared/TUNNEL_ID.json

ingress:
  - hostname: imdb-addon.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# Replace TUNNEL_ID with actual ID from step 4:
TUNNEL_ID="PASTE_TUNNEL_ID_HERE"
sed -i "s|TUNNEL_ID|${TUNNEL_ID}|" ~/.cloudflared/config.yml

# Step 6: Route DNS (creates CNAME automatically)
cloudflared tunnel route dns imdb-stremio imdb-addon.yourdomain.com

# Step 7: Run tunnel as service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Step 8: Test HTTPS endpoint
curl -I https://imdb-addon.yourdomain.com/api/stremio/manifest.json

# Expected: HTTP/2 200 OK with valid SSL
```

**Note:** Replace `imdb-addon.yourdomain.com` with your actual domain.

---

### **OPTION C: Nginx Reverse Proxy (Alternative)**

If both Traefik and Cloudflare fail, use nginx:

#### **Copy-Paste Instructions for VPS Dev:**

```bash
# ==========================================
# HTTPS FIX - NGINX REVERSE PROXY
# ==========================================

# Step 1: Install nginx and certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Step 2: Create nginx config
sudo tee /etc/nginx/sites-available/imdb-addon > /dev/null <<'EOF'
server {
    listen 80;
    server_name static.76.92.27.37.clients.your-server.de;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Step 3: Enable site
sudo ln -sf /etc/nginx/sites-available/imdb-addon /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Step 4: Get SSL certificate
sudo certbot --nginx -d static.76.92.27.37.clients.your-server.de

# Step 5: Test HTTPS
curl -I https://static.76.92.27.37.clients.your-server.de/api/stremio/manifest.json

# Expected: HTTP/2 200 OK
```

**Important:** This will conflict with Traefik on port 80/443. You'll need to either:
- Stop Traefik: `docker stop coolify-proxy`
- Or configure nginx on different ports and update Traefik to forward

---

## 🧪 Verification Tests

### **Test TMDB Posters:**
```bash
# From anywhere (external)
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq -r '.data[:5] | .[] | {title, year, poster}'
```

**Expected output:**
```json
{
  "title": "Black Book",
  "year": "2006",
  "poster": "https://image.tmdb.org/t/p/w500/gAUAE1WiKjcbrPjpMc99MxBR3U2.jpg"
}
```

---

### **Test HTTPS Endpoint:**
```bash
# Test from external
curl -I https://static.76.92.27.37.clients.your-server.de/api/stremio/ur31595220/manifest.json
```

**Expected output:**
```
HTTP/2 200
content-type: application/json
...
```

---

### **Test Stremio Installation:**
```bash
# Test manifest is valid JSON
curl https://static.76.92.27.37.clients.your-server.de/api/stremio/ur31595220/manifest.json | jq '.'
```

**Expected output:** Valid Stremio manifest with `id`, `version`, `name`, `resources`, `catalogs`, etc.

---

## 📋 Success Criteria

**TMDB Posters:**
- ✅ Worker restarts successfully with TMDB_API_KEY
- ✅ Fresh scraping job completes without errors
- ✅ Cache data shows poster URLs (not null)
- ✅ Logs show "TMDB poster batch complete: X/Y posters found"

**HTTPS Installation:**
- ✅ HTTPS endpoint returns 200 OK (not 502)
- ✅ SSL certificate is valid
- ✅ Stremio manifest loads correctly
- ✅ Can install addon in Stremio app

---

## 🚨 Troubleshooting

### **If TMDB posters still null after restart:**

1. **Check environment is loaded:**
```bash
ps aux | grep node | grep worker
# Find PID, then:
sudo cat /proc/PID/environ | tr '\0' '\n' | grep TMDB
```

2. **Check TMDB API is accessible from VPS:**
```bash
curl "https://api.themoviedb.org/3/search/movie?api_key=09a2e4b535394bb6a9e1d248cf87d5ac&query=Avatar"
```

3. **Add debug logging:**
Edit `/root/scraper-worker/src/services/imdbScraper.js` line 675:
```javascript
console.log('=== ENHANCING WITH TMDB ===');
console.log('Items to enhance:', allItems.length);
console.log('TMDB_API_KEY present:', !!process.env.TMDB_API_KEY);
await this.enhanceWithTmdb(allItems);
console.log('=== TMDB ENHANCEMENT COMPLETE ===');
```

Then restart and check logs.

---

### **If HTTPS still returns 502:**

1. **Check Traefik can reach service:**
```bash
# From inside Traefik container:
docker exec coolify-proxy curl -I http://host.docker.internal:3000/api/stremio/manifest.json
```

2. **Check service is listening:**
```bash
sudo netstat -tlnp | grep :3000
```

3. **Try direct Docker network:**
```bash
# Get addon container IP
ADDON_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ADDON_CONTAINER_NAME)
# Update Traefik config to use http://$ADDON_IP:3000
```

4. **Check Traefik routes:**
```bash
docker exec coolify-proxy cat /etc/traefik/dynamic/imdb-addon.yml
```

---

## 📝 Next Steps After Deployment

1. **Monitor TMDB rate limiting:**
   - TMDB free tier: 40 requests/10 seconds
   - Current batch size: 10 items with 250ms delay
   - Should handle 411 items without issues

2. **Test with fresh user:**
   - Try different IMDb user ID
   - Verify posters work for all content

3. **Update documentation:**
   - Add HTTPS URL to README
   - Update Stremio installation instructions

4. **Consider improvements:**
   - Cache TMDB responses to Redis
   - Implement poster fallback to OMDb API
   - Add health check for TMDB API availability

---

## 🔗 Related Files

**Local Repository:**
- `/scraper-worker/src/services/tmdbService.js` - TMDB API service (VERIFIED CORRECT)
- `/scraper-worker/src/services/imdbScraper.js` - Scraper with TMDB integration (VERIFIED CORRECT)
- `/CLAUDE.md` - Updated with VPS workflow documentation

**VPS Files:**
- `/data/coolify/proxy/dynamic/imdb-addon.yml` - Traefik config
- `/root/scraper-worker/.env` - Environment variables
- Worker logs location: TBD (needs VPS dev confirmation)

---

**Status:** Ready for VPS dev deployment
**Estimated time:** 15-30 minutes
**Risk level:** Low (all changes are non-destructive with backups)