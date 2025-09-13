import { useState } from 'react';

export default function Home() {
  const [watchlistFile, setWatchlistFile] = useState(null);
  const [ratingsFile, setRatingsFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleWatchlistUpload = (e) => {
    setWatchlistFile(e.target.files[0]);
  };

  const handleRatingsUpload = (e) => {
    setRatingsFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!watchlistFile && !ratingsFile) {
      alert('Please upload at least one CSV file');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    if (watchlistFile) formData.append('watchlist', watchlistFile);
    if (ratingsFile) formData.append('ratings', ratingsFile);

    try {
      const response = await fetch('/api/migrate', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: 'Failed to process files' });
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>IMDb to Stremio Migrator</h1>
      <p>Upload your IMDb CSV exports to migrate your watchlist and ratings to Stremio via Trakt.</p>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="watchlist">IMDb Watchlist CSV:</label>
          <input
            type="file"
            id="watchlist"
            accept=".csv"
            onChange={handleWatchlistUpload}
            style={{ display: 'block', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="ratings">IMDb Ratings CSV:</label>
          <input
            type="file"
            id="ratings"
            accept=".csv"
            onChange={handleRatingsUpload}
            style={{ display: 'block', marginTop: '5px' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Processing...' : 'Start Migration'}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <h3>Result:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}