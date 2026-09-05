/**
 * What has been generated before (§6.7).
 *
 * Reusing an entry loads what was asked for back into the picker, not the files
 * that came out of it - so a sheet run again next month is regenerated against
 * today's library and picks up anything learned since. That is also why the
 * recurring ones (See More Styles, Site Settings) do not need describing from
 * scratch each time.
 */

import { useEffect, useState } from 'react';
import { fetchHistory, type HistoryEntry, type SheetRequest } from './api.js';

interface Props {
  onReuse: (request: SheetRequest) => void;
}

function when(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return `today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return date.toLocaleDateString();
}

export function HistoryPanel({ onReuse }: Props): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [mine, setMine] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory(mine)
      .then(setEntries)
      .catch((err: Error) => setError(err.message));
  }, [mine]);

  return (
    <>
      <div className="page-head">
        <h1>What has been built</h1>
        <p>
          Every load sheet that has been downloaded. Using one again rebuilds it from what was asked for, so it picks up
          anything the app has learned since.
        </p>
      </div>
      <section className="card">
      <div className="choices">
        <label>
          <input type="radio" checked={!mine} onChange={() => setMine(false)} />
          Everybody
        </label>
        <label>
          <input type="radio" checked={mine} onChange={() => setMine(true)} />
          Just mine
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {entries.length === 0 ? (
        <p className="muted">Nothing yet. A load sheet appears here once it has been downloaded.</p>
      ) : null}

      <ul className="history">
        {entries.map((entry) => (
          <li key={entry.id} className="history-entry">
            <div className="history-head">
              <span className="chosen-name">{entry.name}</span>
              <code>{entry.filename}</code>
              {entry.direction === 'export' ? <span className="badge">export</span> : null}
              {entry.outcome === 'learned' ? <span className="badge badge-declared">added to the library</span> : null}
              <span className="muted">
                {entry.username}, {when(entry.createdAt)}
              </span>
              <button type="button" className="link" onClick={() => onReuse(entry.request)}>
                use this again
              </button>
            </div>
            <p className="muted">{entry.summary}</p>
          </li>
        ))}
      </ul>
      </section>
    </>
  );
}
