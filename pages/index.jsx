import { useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import Dropzone from '../components/Dropzone';

export default function Home() {
  const [watchlistFile, setWatchlistFile] = useState(null);
  const [ratingsFile, setRatingsFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleWatchlistUpload = (e) => setWatchlistFile(e.target.files?.[0] ?? null);
  const handleRatingsUpload = (e) => setRatingsFile(e.target.files?.[0] ?? null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!watchlistFile && !ratingsFile) {
      setError('Please upload at least one CSV file.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    if (watchlistFile) formData.append('watchlist', watchlistFile);
    if (ratingsFile) formData.append('ratings', ratingsFile);

    try {
      const response = await fetch('/api/migrate', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to process files');
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const Stat = ({ label, value }) => (
    <div className="flex flex-col"><span className="text-sm text-gray-500 dark:text-gray-400">{label}</span><span className="text-lg font-semibold">{value ?? 0}</span></div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
      <header className="pt-16 pb-8">
        <div className="container">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-teal-600">IMDb → Stremio</span>{' '}
                Migrator
              </h1>
              <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">
                Upload your IMDb CSV exports to migrate your Watchlist and Ratings to Stremio via Trakt.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="pb-24">
        <div className="container">
          <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white/80 p-6 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <Dropzone
                id="watchlist"
                label="IMDb Watchlist CSV"
                file={watchlistFile}
                onFileSelected={(f) => setWatchlistFile(f)}
                helper="Export your Watchlist from IMDb as CSV."
              />

              <Dropzone
                id="ratings"
                label="IMDb Ratings CSV"
                file={ratingsFile}
                onFileSelected={(f) => setRatingsFile(f)}
                helper="Optional. Export your Ratings from IMDb as CSV."
              />

              <div className="flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:focus:ring-offset-gray-900"
                >
                  {loading && (
                    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  )}
                  {loading ? 'Processing…' : 'Start Migration'}
                </button>

                <p className="text-xs text-gray-500 dark:text-gray-400">CSV only. Data stays on device until upload.</p>
              </div>
            </form>

            {result && (
              <div className="mt-8 space-y-4">
                <div className="flex flex-wrap items-center gap-6">
                  <Stat label="Watchlist" value={result?.data?.stats?.watchlistCount} />
                  <Stat label="Ratings" value={result?.data?.stats?.ratingsCount} />
                  <div className="ml-auto rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    {result?.success ? 'Success' : 'Completed'}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
                  <div className="mb-2 font-medium text-gray-800 dark:text-gray-100">Raw Response</div>
                  <pre className="overflow-x-auto text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="pb-10">
        <div className="container text-center text-xs text-gray-500 dark:text-gray-400">
          Built with Next.js & Tailwind CSS
          {process.env.NEXT_PUBLIC_COMMIT_SHA && (
            <span className="ml-2 align-middle opacity-70" title="Commit SHA">
              #{process.env.NEXT_PUBLIC_COMMIT_SHA}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
