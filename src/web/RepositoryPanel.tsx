/**
 * The repository: every load sheet the app knows, on two shelves.
 *
 * They are kept apart because they are different kinds of thing. The supplied
 * export is a record of what WOSG wrote and ran before this app existed - the
 * extraction captured each script's header line, its CSV parameters and the
 * CSV's heading row, but never the file, so those entries describe rather than
 * reopen. A sheet saved from the app carries the request that made it, so it
 * opens straight back into the picker and can be downloaded again.
 */

import { useEffect, useState } from 'react';
import {
  fetchRepository,
  fetchRepositoryEntry,
  removeRepositoryEntry,
  type ItemType,
  type RepositoryDetail,
  type RepositoryEntry,
  type SheetRequest,
} from './api.js';

interface Props {
  itemTypes: ItemType[];
  isAdmin: boolean;
  onOpen: (request: SheetRequest) => void;
}

function EntryCard({
  entry,
  onSelect,
  selected,
}: {
  entry: RepositoryEntry;
  onSelect: () => void;
  selected: boolean;
}): JSX.Element {
  return (
    <li className={selected ? 'repo-entry selected' : 'repo-entry'}>
      <button type="button" className="repo-open" onClick={onSelect}>
        <span className="chosen-name">{entry.name}</span>
        <span className="repo-meta">
          {entry.itemTypes.join(', ')} · {entry.columnCount} column{entry.columnCount === 1 ? '' : 's'}
          {entry.direction === 'export' ? ' · export' : ''}
          {entry.csvFile ? ` · ${entry.csvFile}` : ''}
        </span>
        {entry.description ? <span className="muted">{entry.description}</span> : null}
        <span className="muted">{entry.provenance}</span>
      </button>
    </li>
  );
}

export function RepositoryPanel({ itemTypes, isAdmin, onOpen }: Props): JSX.Element {
  const [search, setSearch] = useState('');
  const [itemType, setItemType] = useState('');
  const [supplied, setSupplied] = useState<RepositoryEntry[]>([]);
  const [saved, setSaved] = useState<RepositoryEntry[]>([]);
  const [totals, setTotals] = useState({ supplied: 0, saved: 0 });
  const [selected, setSelected] = useState<RepositoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload(): void {
    fetchRepository({ search, itemType })
      .then((listing) => {
        setSupplied(listing.supplied);
        setSaved(listing.saved);
        setTotals(listing.totals);
      })
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    const timer = setTimeout(reload, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, itemType]);

  function select(entry: RepositoryEntry): void {
    fetchRepositoryEntry(entry.id)
      .then(setSelected)
      .catch((err: Error) => setError(err.message));
  }

  async function remove(id: string): Promise<void> {
    setError(null);
    try {
      await removeRepositoryEntry(id);
      setSelected(null);
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="columns">
      <section className="panel">
        <h2>Load sheet repository</h2>
        <input
          className="search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, field, folder or CSV"
          aria-label="Search the repository"
        />
        <label className="stacked">
          Item type
          <select value={itemType} onChange={(event) => setItemType(event.target.value)}>
            <option value="">Any</option>
            {itemTypes.map((type) => (
              <option key={type.itemType} value={type.itemType}>
                {type.itemType}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="error">{error}</p> : null}

        <h2>
          Made in the app <span className="muted">({saved.length} of {totals.saved})</span>
        </h2>
        {saved.length === 0 ? (
          <p className="muted">
            Nothing saved yet. Generate a load sheet and use <strong>Save to the repository</strong> to put it here.
          </p>
        ) : (
          <ul className="repo-list">
            {saved.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                selected={selected?.entry.id === entry.id}
                onSelect={() => select(entry)}
              />
            ))}
          </ul>
        )}

        <h2>
          From the production export <span className="muted">({supplied.length} of {totals.supplied})</span>
        </h2>
        <ul className="repo-list">
          {supplied.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              selected={selected?.entry.id === entry.id}
              onSelect={() => select(entry)}
            />
          ))}
        </ul>
      </section>

      <section className="panel">
        {!selected ? (
          <p className="muted">Pick a load sheet to see what it does.</p>
        ) : (
          <>
            <h2>{selected.entry.name}</h2>
            <p className="muted">{selected.entry.provenance}</p>
            {selected.entry.description ? <p>{selected.entry.description}</p> : null}

            <div className="repo-actions">
              {selected.request ? (
                <button type="button" onClick={() => onOpen(selected.request as SheetRequest)}>
                  Open it in the generator
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onOpen({
                      name: selected.entry.name.split(' / ').slice(-1)[0] ?? selected.entry.name,
                      itemType: selected.entry.itemTypes[0] ?? 'Product',
                      fields: selected.entry.fields.map((field) => ({ name: field })),
                      ...(selected.entry.direction === 'export' ? { direction: 'export' as const } : {}),
                    })
                  }
                >
                  Start a new sheet from these fields
                </button>
              )}
              {isAdmin && selected.entry.shelf === 'saved' ? (
                <button type="button" className="link" onClick={() => void remove(selected.entry.id)}>
                  remove
                </button>
              ) : null}
            </div>

            {selected.entry.shelf === 'supplied' ? (
              <p className="muted">
                This is what the extraction captured from the original script — its header line, its CSV parameters and
                the heading row of the CSV beside it. The file itself was never in the export, so the app describes this
                one rather than handing it back.
              </p>
            ) : null}

            {selected.notes ? <p className="muted">{selected.notes}</p> : null}

            {selected.macros.length > 0 ? (
              <section>
                <h3>Macros</h3>
                <pre className="file">{selected.macros.map(([name, value]) => `$${name}=${value}`).join('\n')}</pre>
              </section>
            ) : null}

            {selected.blocks.map((block, index) => (
              <section key={`${block.itemType}-${index}`}>
                <h3>
                  {block.op} {block.itemType}
                </h3>
                <pre className="file">{block.headerLine}</pre>
                {block.csv ? (
                  <p className="muted">
                    Reads <code>{block.csv.file}</code>, {block.csv.encoding}, delimiter{' '}
                    <code>{block.csv.delimiter}</code>, skipping {block.csv.linesToSkip} line, columnsOffset{' '}
                    <strong>{block.csv.columnsOffset}</strong>.
                  </p>
                ) : null}
                {block.csvHeaderRow ? (
                  <>
                    <h3>CSV heading row</h3>
                    <pre className="file">{block.csvHeaderRow.join(',')}</pre>
                  </>
                ) : null}
              </section>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
