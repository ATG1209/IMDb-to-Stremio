# IMDb to Stremio Migrator

Modernized UI
- Tailwind CSS-based responsive layout
- Dark mode toggle (persisted)
- Drag-and-drop CSV inputs with keyboard support
- Improved error handling and loading states

Deployment
- This project is set up for Vercel. If your Vercel Production Branch is set to `main`, pushing to `main` will auto-deploy.

Command line tool for migrating IMDb watchlists and ratings to Stremio via Trakt.

## Configuration

The global Stremio catalog can pull from a default IMDb account. Create a `.env` file and set your user ID:

```
DEFAULT_IMDB_USER_ID=ur12345678
```

When no watchlist cache is present, requests to `/api/stremio/catalog/movie/imdb-watchlist.json` will fetch items from this account.

## Development

Build the project:

```
npm run build
```

Run tests:

```
npm test
```

Execute the CLI:

```
npm start
```
