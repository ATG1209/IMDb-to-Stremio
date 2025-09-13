export interface WatchlistItem {
  imdbId: string;
  title: string;
  year: number;
  type: string;
}

export interface RatingItem {
  imdbId: string;
  title: string;
  year: number;
  rating: number;
  ratedAt?: string;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = values[i] ?? '';
    });
    return record;
  });
}

function parseWatchlist(csv: string): WatchlistItem[] {
  const rows = parseCsv(csv);
  return rows.map((r) => ({
    imdbId: r.const,
    title: r.Title,
    year: Number(r.Year),
    type: r['Title Type'] || r.TitleType,
  }));
}

function parseRatings(csv: string): RatingItem[] {
  const rows = parseCsv(csv);
  return rows.map((r) => ({
    imdbId: r.const,
    title: r.Title,
    year: Number(r.Year),
    rating: Number(r['Your Rating']),
    ratedAt: r['Date Rated'] || undefined,
  }));
}

module.exports = { parseWatchlist, parseRatings };
