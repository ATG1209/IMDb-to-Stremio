# Versioning Issue and Resolution

This document explains why Stremio was still showing the old add-on (v1.0.0, “Mi Watchlist IMDb (ur31595220)”) even though the server served the updated manifest (v1.2.0, “IMDb Watchlist SORTED (ur31595220)”), and how we resolved it.

## Symptoms

- Server endpoint returned the new manifest:
  - Version: `1.2.0`
  - Name: `IMDb Watchlist SORTED (ur31595220)`
  - ID: `com.imdb.watchlist.sorted.ur31595220`
- Stremio still displayed the old installed add-on:
  - Version: `1.0.0`
  - Name: `Mi Watchlist IMDb (ur31595220)`
  - Not working due to stale/cached manifest.

## Root Causes

- Add-on ID change created a separate, new add-on entry.
  - The new ID is `com.imdb.watchlist.sorted.{userId}`.
  - The old add-on remained installed in Stremio, so the client continued to show it until manually removed.

- Insufficient cache-busting for Stremio/client/CDN layers.
  - The manifest endpoints relied on a basic `Cache-Control: no-cache, no-store, must-revalidate` which some layers can still mishandle.
  - The UI-generated manifest URLs did not include a version query parameter to force refetches.

- Missing fallback for the legacy path.
  - Older installs referenced `/api/stremio/manifest.json` (without a userId). There was no dedicated handler for that path, causing confusion and occasional stale routes.

## What We Changed

1. Strong no-cache headers on manifest endpoints
   - Files: `pages/api/stremio/[userId]/manifest.ts`, `pages/api/stremio/[userId]/manifest.json.ts`
   - Headers now include:
     - `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0`
     - `Pragma: no-cache`
     - `Expires: 0`
     - `CDN-Cache-Control: no-store`
     - `Vercel-CDN-Cache-Control: no-store`

2. Added a fallback manifest for the legacy path
   - File: `pages/api/stremio/manifest.json.ts`
   - Uses `DEFAULT_IMDB_USER_ID` from `.env` to serve a proper manifest for older installs that expect `/api/stremio/manifest.json`.

3. Single source of truth for version
   - File: `lib/version.ts` with `ADDON_VERSION = '1.2.0'`.
   - All manifest handlers read the version from this constant.

4. Cache-busting URL parameters in the UI
   - Files: `pages/simple-dashboard.jsx`, `pages/dashboard.jsx`
   - Append `?v=1.2.0` to the manifest URL shown to users, ensuring Stremio refetches the manifest.

## User Actions Required in Stremio

- Remove the old add-on: My Add-ons → find “Mi Watchlist IMDb (ur31595220)” → Remove.
- Restart Stremio (fully quit and reopen) to clear in-memory cache.
- Install the updated manifest using one of these URLs:
  - Per-user: `http://<host>:3002/api/stremio/ur31595220/manifest.json?v=1.2.0`
  - Fallback (uses `DEFAULT_IMDB_USER_ID`): `http://<host>:3002/api/stremio/manifest.json?v=1.2.0`

## Testing and Verification

Use curl to verify headers and payload (replace host/port as needed):

```
curl -i "http://localhost:3002/api/stremio/ur31595220/manifest.json?v=1.2.0"
curl -i "http://localhost:3002/api/stremio/manifest.json?v=1.2.0"
```

Check that:
- Response contains the strong no-cache headers listed above.
- Body includes:
  - `"version": "1.2.0"`
  - `"id": "com.imdb.watchlist.sorted.ur31595220"`
  - `"name": "IMDb Watchlist SORTED (ur31595220)"`

## Guidance for Future Versioning

- Keep the add-on `id` stable and only bump `version`. Stremio can upgrade in place when `id` is unchanged.
- If you must change `id`, communicate that users should uninstall the old add-on first.
- Always bump `ADDON_VERSION` in `lib/version.ts` and append `?v=<version>` to manifest URLs presented to users.
- Maintain strong no-cache headers on all manifest endpoints.

## Files Changed

- Added: `pages/api/stremio/manifest.json.ts` (fallback manifest)
- Added: `lib/version.ts` (single source for version)
- Updated: `pages/api/stremio/[userId]/manifest.ts` (no-cache + version import)
- Updated: `pages/api/stremio/[userId]/manifest.json.ts` (no-cache + version import)
- Updated: `pages/simple-dashboard.jsx` (append `?v=<version>`)
- Updated: `pages/dashboard.jsx` (append `?v=<version>`)

