# URGENT: VPS Action Plan - 15 Minutes

## 🚨 **Current Status:**
- ✅ **Worker**: 411 items cached perfectly
- ✅ **HTTP Addon**: Working with all data
- ❌ **Posters**: All null despite TMDB key
- ❌ **HTTPS**: 502 error preventing installation

## 🎯 **VPS Dev - Run These 4 Commands:**

### **1. Debug TMDB Service (2 minutes)**
```bash
cd /path/to/worker && node -e "
const { tmdbService } = require('./src/services/tmdbService.js');
console.log('TMDB Methods:', Object.getOwnPropertyNames(tmdbService));
console.log('getPosterBatch exists:', typeof tmdbService.getPosterBatch);
if (tmdbService.getPosterBatch) {
  tmdbService.getPosterBatch([{title: 'Black Book', year: '2006'}])
    .then(r => console.log('Poster test result:', r))
    .catch(e => console.error('Poster test error:', e.message));
} else {
  console.error('getPosterBatch method MISSING!');
}
"
```

### **2. Check Traefik Logs (1 minute)**
```bash
docker logs traefik --tail 20 | grep -i "imdb\|static\|error\|502"
```

### **3. Test Local Service (1 minute)**
```bash
curl -I http://127.0.0.1:3000/api/stremio/ur31595220/manifest.json
```

### **4. Alternative Traefik Config (5 minutes)**
```bash
# Replace /data/coolify/proxy/dynamic/imdb-addon.yml with:
cat > /data/coolify/proxy/dynamic/imdb-addon.yml << 'EOF'
http:
  routers:
    imdb-addon:
      rule: "Host(\`static.76.92.27.37.clients.your-server.de\`)"
      entryPoints:
        - "websecure"
      service: "imdb-addon"
      tls:
        certResolver: "letsencrypt"
  services:
    imdb-addon:
      loadBalancer:
        servers:
          - url: "http://host.docker.internal:3000"
EOF

# Restart Traefik:
docker-compose restart traefik
```

## 📊 **Expected Results:**

**Command 1**: Should show if `getPosterBatch` method exists and works
**Command 2**: Should reveal Traefik routing errors
**Command 3**: Should return 200 OK if service is accessible locally
**Command 4**: Should fix HTTPS 502 error

## 🔥 **If Commands Fail:**

**TMDB Issue**: `getPosterBatch` method likely missing from tmdbService.js
**HTTPS Issue**: Try `http://localhost:3000` instead of `http://127.0.0.1:3000` in Traefik config

---

**Goal**: Get both issues resolved in next 15 minutes with focused debugging instead of endless trial and error.