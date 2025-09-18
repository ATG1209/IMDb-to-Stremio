**Goal**

* Turn your IMDb Watchlist into a Stremio catalog sorted by “Last Added to IMDb.”

**Scope**

* Import IMDb via CSV or public list URL.
* Use IMDb “Created” date for sort.
* Enrich with TMDB for posters and metadata.
* Serve a Stremio add-on with catalogs:

  * Movies, Last Added
  * Series, Last Added
  * Combined, Last Added

**Out of scope**

* Streaming availability checks.
* Multi-user.
* Alerts and auth.
* Country handling.

**Success**

* After Sync, Stremio shows your list in correct order.
* End to end under 60 seconds for up to 1,000 items after first run.

# System design

**Components**

* Minimal web UI for config and Sync.
* Importer for IMDb CSV or URL.
* Resolver for TMDB id and images.
* Local store in JSON or SQLite.
* Stremio add-on server that reads the store.

**Data**

* `config.json` holds IMDb URL, TMDB key, preferences.
* `store.json` holds titles with `imdb_id`, `tmdb_id`, `type`, `title`, `year`, `imdb_added_at`.

**Ordering rule**

* Sort descending by `imdb_added_at`. Tie breaker by TMDB popularity.

# Stack

* Node.js, TypeScript.
* Fastify for HTTP.
* Stremio Addon SDK.
* Cheerio for IMDb HTML parsing.
* CSV parse for IMDb exports.
* Lowdb or SQLite. JSON is fine.

# Web UI

**Routes**

* `GET /` config form and Sync button.
* `POST /config` save config.
* `POST /sync` run importer and resolver. Return summary with counts and errors.
* `GET /preview` show current ordered list.

**Form fields**

* IMDb list URL, optional CSV upload.
* TMDB API key.
* Option to include both types or filter, default include both.

# Stremio add-on

**Endpoints**

* `GET /manifest.json`
* `GET /catalog/movie/last-added.json`
* `GET /catalog/series/last-added.json`
* `GET /catalog/all/last-added.json` optional combined feed
* `GET /meta/:type/:id.json` optional detailed meta

**Manifest**

* One addon with three catalogs. No streams. Only discovery metas.

**Meta shape**

* `id`: IMDb id like `tt1234567`
* `type`: `movie` or `series`
* `name`, `poster`, `year`, `description` short line like “Added to your IMDb list on 2025-09-12”
* `imdbRating` if available from TMDB or omitted

# Data model

```json
{
  "titles": {
    "tt0111161": {
      "tmdb_id": 278,
      "type": "movie",
      "title": "The Shawshank Redemption",
      "year": 1994,
      "poster": "https://image.tmdb.org/t/p/w342/...",
      "imdb_added_at": "1999-07-01T00:00:00Z",
      "last_synced_at": "2025-09-13T10:05:00Z"
    }
  }
}
```

# Import logic

**CSV path**

* Parse IMDb CSV. Use columns `const` and `Created`.
* Map `const` to IMDb id. Parse `Created` to ISO date.

**URL path**

* Fetch list page HTML.
* Extract `data-tconst` for items.
* If the page shows “Date Added” per item, parse it. If not available, set `imdb_added_at` as the current sync time on first sight and persist. CSV gives true dates, so prefer CSV for accuracy.

**TMDB resolution**

* Use `/find/{imdb_id}` first.
* If missing, use `/search` with title and year from the page or later metadata fetch.
* Cache all mappings.

# Sync algorithm

1. Load config and store.
2. Import IMDb items from CSV if provided, else parse URL.
3. For each IMDb id:

   * Ensure `imdb_added_at` is set. From CSV if present, else keep earliest seen.
   * Resolve TMDB id and metadata. Save poster path, title, year, type.
4. Save store.
5. Build in-memory arrays:

   * Movies sorted by `imdb_added_at` desc.
   * Series sorted by `imdb_added_at` desc.
   * Combined if enabled.
6. Expose to Stremio with paging. Slice to `skip` and `limit` if the SDK passes those.

# API contracts

**POST /sync response**

```json
{
  "imported": 742,
  "new_items": 15,
  "updated": 12,
  "skipped": 0,
  "errors": 0
}
```

**Catalog response**

```json
{
  "metas": [
    { "id":"tt123", "type":"movie", "name":"...", "year":2024, "poster":"...", "description":"Added 2025-09-12" }
  ]
}
```

# Implementation steps

**1. Scaffold**

* Init TypeScript. Add Fastify and Stremio SDK.
* Create `config.json` and `store.json`.

**2. Config UI**

* Plain HTML form. POST to `/config`.
* File input for CSV. Option to clear current store.

**3. Importers**

* `imdbCsvImport(csvFilePath)`
* `imdbUrlImport(url)` with Cheerio selectors for `data-tconst` and any “created” cell if present.

**4. Resolver**

* `resolveTmdb(imdbId, typeHint)` uses `/find/{external_id}`.
* Fetch `name`, `year`, `poster_path`, `media_type`.

**5. Store layer**

* Read, write, and merge JSON.
* Ensure idempotent updates by IMDb id.

**6. Add-on**

* Manifest with catalogs.
* Catalog handlers read store, build `metas`, sort, paginate.

**7. Hardening**

* Input validation, timeouts, retries.
* Log to console and to `logs/app.log`.

**8. Runbook**

* `npm run dev`
* Open `http://localhost:7000/`
* Set TMDB key, paste IMDb URL or upload CSV, click Sync.
* In Stremio, install `http://<your-ip>:7000/manifest.json`.

# Testing checklist

* CSV with 10 items, verify exact sort by Created.
* URL import only, verify first seen dates persist across syncs.
* Mixed movies and series, verify each catalog filters correctly.
* Missing TMDB mapping, verify fallback search or mark as unknown.
* Large list performance, target under 60 seconds for 1,000 items.

# Backlog, next

* Deduplicate remakes and alternate cuts by IMDb id only.
* Poster fallback to IMDb image if TMDB missing.
* Manual edit page to fix an incorrect mapping.
* Optional paging in web preview.
