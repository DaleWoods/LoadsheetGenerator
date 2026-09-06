/**
 * The repository: every load sheet the app knows, on two shelves.
 *
 * The list is written for somebody who does not read ImpEx. Each entry leads
 * with what the sheet *does* in a sentence - "Sets 11 fields on a Product,
 * matched by SKU" - and keeps the file names, the offset and the header line as
 * supporting detail. The script itself is still one click away in the panel
 * beside it, because the people who do read ImpEx need exactly that.
 *
 * There are 109 of them, so the list is a pane that scrolls on its own beside a
 * detail panel that stays put. A single page of 109 entries meant clicking one
 * near the bottom scrolled its description off the top of the screen.
 *
 * The two shelves stay apart because they are different kinds of thing. The
 * supplied export is a record of what WOSG wrote and ran before this app
 * existed - the extraction captured each script's header line, its CSV
 * parameters and the CSV's heading row, but never the file, so those entries
 * describe rather than reopen. A sheet saved from the app carries the request
 * that made it, so it opens straight back into the picker.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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

/** What a sheet does, in a sentence, rather than in ImpEx. */
function whatItDoes(entry: RepositoryEntry): string {
  const fields = entry.fields.length;
  const type = entry.itemTypes.join(' and ');
  if (entry.direction === 'export') {
    return `Pulls ${fields} field${fields === 1 ? '' : 's'} of ${type} data out of SAP Commerce as a CSV.`;
  }
  if (entry.itemTypes.length > 1) {
    return `Sets up ${type} records together, ${entry.columnCount} columns in all.`;
  }
  return `Loads ${fields} field${fields === 1 ? '' : 's'} onto ${type} records${
    entry.csvFile ? ', from a CSV' : ', written into the script itself'
  }.`;
}

/**
 * A name like "Products / TrueFalse / isEditorsPick" is a file path with the
 * folder repeated on every neighbour. Under its folder heading only the last
 * part tells you anything, so that is what is set in the title and the rest is
 * dropped - the whole path is still in the panel beside it.
 */
/**
 * The folders each sheet lives in, and its own name.
 *
 * A record's name is its path in the loadsheets folder - "Products / Akamai /
 * Roundels / Import" - so splitting it gives back the tree the scripts are
 * actually kept in. That is the arrangement the team already knows, and it is
 * the one worth showing: 109 sheets in one list is unreadable however it is
 * sorted, but six folders is nothing.
 */
function pathOf(entry: RepositoryEntry): { folders: string[]; leaf: string } {
  const parts = entry.name.split(' / ').map((part) => part.trim()).filter((part) => part.length > 0);
  const leaf = parts.pop() ?? entry.name;
  return { folders: parts, leaf };
}

interface FolderNode {
  name: string;
  path: string;
  folders: Map<string, FolderNode>;
  sheets: { entry: RepositoryEntry; leaf: string }[];
  /** Everything below this folder, so a collapsed one still says how much it holds. */
  count: number;
}

function emptyFolder(name: string, path: string): FolderNode {
  return { name, path, folders: new Map(), sheets: [], count: 0 };
}

function buildTree(entries: RepositoryEntry[]): FolderNode {
  const root = emptyFolder('', '');
  for (const entry of entries) {
    const { folders, leaf } = pathOf(entry);
    let node = root;
    node.count += 1;
    let path = '';
    for (const folder of folders) {
      path = path === '' ? folder : `${path} / ${folder}`;
      let child = node.folders.get(folder);
      if (!child) {
        child = emptyFolder(folder, path);
        node.folders.set(folder, child);
      }
      child.count += 1;
      node = child;
    }
    node.sheets.push({ entry, leaf });
  }
  return root;
}

/** Every folder path in the tree, for expanding the lot while a search is on. */
function allPaths(node: FolderNode, into: Set<string> = new Set()): Set<string> {
  for (const child of node.folders.values()) {
    into.add(child.path);
    allPaths(child, into);
  }
  return into;
}

function SheetRow({
  entry,
  leaf,
  selected,
  onSelect,
}: {
  entry: RepositoryEntry;
  leaf: string;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <li className={selected ? 'repo-entry selected' : 'repo-entry'}>
      <button type="button" className="repo-open" onClick={onSelect}>
        <span className="repo-title">
          <span className="repo-icon" aria-hidden="true" />
          <strong>{leaf}</strong>
          {entry.direction === 'export' ? <span className="badge">export</span> : null}
          {entry.shelf === 'saved' && entry.verified ? (
            <span className="badge badge-declared">imported cleanly</span>
          ) : null}
        </span>
        <span className="repo-does">{whatItDoes(entry)}</span>
        {entry.description ? <span className="repo-note">“{entry.description}”</span> : null}
      </button>
    </li>
  );
}

function Folder({
  node,
  depth,
  open,
  onToggle,
  selectedId,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  open: Set<string>;
  onToggle: (path: string) => void;
  selectedId: string | undefined;
  onSelect: (entry: RepositoryEntry) => void;
}): JSX.Element {
  const isOpen = open.has(node.path);
  return (
    <li className="repo-folder">
      <button
        type="button"
        className={isOpen ? 'repo-folder-head open' : 'repo-folder-head'}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onToggle(node.path)}
        aria-expanded={isOpen}
      >
        <span className="repo-caret" aria-hidden="true">
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="repo-folder-name">{node.name}</span>
        <span className="repo-folder-count">{node.count}</span>
      </button>

      {isOpen ? (
        <ul className="repo-children" style={{ paddingLeft: depth === 0 ? 0 : 0 }}>
          {[...node.folders.values()].map((child) => (
            <Folder
              key={child.path}
              node={child}
              depth={depth + 1}
              open={open}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
          {node.sheets.length > 0 ? (
            <li>
              <ul className="repo-list" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
                {node.sheets.map(({ entry, leaf }) => (
                  <SheetRow
                    key={entry.id}
                    entry={entry}
                    leaf={leaf}
                    selected={selectedId === entry.id}
                    onSelect={() => onSelect(entry)}
                  />
                ))}
              </ul>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function Tree({
  entries,
  open,
  onToggle,
  selectedId,
  onSelect,
}: {
  entries: RepositoryEntry[];
  open: Set<string>;
  onToggle: (path: string) => void;
  selectedId: string | undefined;
  onSelect: (entry: RepositoryEntry) => void;
}): JSX.Element {
  const root = useMemo(() => buildTree(entries), [entries]);
  return (
    <ul className="repo-tree">
      {[...root.folders.values()].map((folder) => (
        <Folder
          key={folder.path}
          node={folder}
          depth={0}
          open={open}
          onToggle={onToggle}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
      {root.sheets.length > 0 ? (
        <li>
          <ul className="repo-list">
            {root.sheets.map(({ entry, leaf }) => (
              <SheetRow
                key={entry.id}
                entry={entry}
                leaf={leaf}
                selected={selectedId === entry.id}
                onSelect={() => onSelect(entry)}
              />
            ))}
          </ul>
        </li>
      ) : null}
    </ul>
  );
}

export function RepositoryPanel({ itemTypes, isAdmin, onOpen }: Props): JSX.Element {
  const [search, setSearch] = useState('');
  const [itemType, setItemType] = useState('');
  const [direction, setDirection] = useState('');
  const [supplied, setSupplied] = useState<RepositoryEntry[]>([]);
  const [saved, setSaved] = useState<RepositoryEntry[]>([]);
  const [totals, setTotals] = useState({ supplied: 0, saved: 0 });
  const [selected, setSelected] = useState<RepositoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);

  function reload(): void {
    fetchRepository({ search, itemType, direction })
      .then((listing) => {
        setSupplied(listing.supplied);
        setSaved(listing.saved);
        setTotals(listing.totals);
      })
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    // A new set of results read from wherever the old one was left, which put
    // the first match half under the folder heading.
    if (scroller.current) scroller.current.scrollTop = 0;
    const timer = setTimeout(reload, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, itemType, direction]);

  // Only the types that actually have sheets are worth offering as filters.
  const filterTypes = useMemo(() => itemTypes.slice(0, 8), [itemTypes]);

  const filtered = search.trim() !== '' || itemType !== '' || direction !== '';

  /*
   * Closed to start with, so the page opens on six folders rather than 109
   * sheets, and a search opens everything - a match three folders down is no
   * use behind a closed door. Which folders somebody opened by hand is kept
   * while they search and put back afterwards.
   */
  const byHand = useRef<Set<string>>(new Set());
  const expanded = useMemo(() => {
    if (!filtered) return byHand.current;
    return allPaths(buildTree([...saved, ...supplied]));
  }, [filtered, saved, supplied, open]);

  function toggle(path: string): void {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    if (!filtered) byHand.current = next;
    setOpen(next);
  }

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
    <>
      <div className="page-head">
        <h1>Load sheet repository</h1>
        <p>
          Every load sheet the team has — the ones already run against production, and the ones built here since. Open
          one to see what it does, or use it as the starting point for a new one.
        </p>
      </div>

      <div className="repo-layout">
        <section className="card repo-browser">
          <div className="repo-toolbar">
            <input
              className="search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, field, folder or CSV"
              aria-label="Search the repository"
            />
            <div className="chips">
              <button
                type="button"
                className={itemType === '' && direction === '' ? 'chip on' : 'chip'}
                onClick={() => {
                  setItemType('');
                  setDirection('');
                }}
              >
                Everything
              </button>
              {filterTypes.map((type) => (
                <button
                  key={type.itemType}
                  type="button"
                  className={itemType === type.itemType ? 'chip on' : 'chip'}
                  onClick={() => setItemType(itemType === type.itemType ? '' : type.itemType)}
                >
                  {type.itemType}
                </button>
              ))}
              <button
                type="button"
                className={direction === 'export' ? 'chip on' : 'chip'}
                onClick={() => setDirection(direction === 'export' ? '' : 'export')}
              >
                Exports only
              </button>
            </div>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="repo-scroll" ref={scroller}>
          <div className="repo-shelf">
            <h2>Made here</h2>
            <span className="muted">
              {filtered ? `${saved.length} of ${totals.saved}` : `${totals.saved} saved`}
            </span>
          </div>
          {saved.length === 0 ? (
            <p className="repo-empty">
              {totals.saved === 0
                ? 'Nothing saved yet. Build a load sheet and use “Save to the repository” to keep it here for next time.'
                : 'None of the saved sheets match that.'}
            </p>
          ) : (
            <Tree
              entries={saved}
              open={expanded}
              onToggle={toggle}
              selectedId={selected?.entry.id}
              onSelect={select}
            />
          )}

          <div className="repo-shelf">
            <h2>Already run against production</h2>
            <span className="muted">
              {filtered ? `${supplied.length} of ${totals.supplied}` : `${totals.supplied} sheets`}
            </span>
          </div>
          {supplied.length === 0 ? (
            <p className="repo-empty">Nothing here matches that.</p>
          ) : (
            <Tree
              entries={supplied}
              open={expanded}
              onToggle={toggle}
              selectedId={selected?.entry.id}
              onSelect={select}
            />
          )}
          </div>
        </section>

        <section className="card repo-detail">
          {!selected ? (
            <p className="repo-empty">
              Pick a load sheet on the left and this is where it explains itself — what it writes, which CSV it reads
              and how, and the script behind it.
            </p>
          ) : (
            <Detail detail={selected} isAdmin={isAdmin} onOpen={onOpen} onRemove={remove} />
          )}
        </section>
      </div>
    </>
  );
}

function Detail({
  detail,
  isAdmin,
  onOpen,
  onRemove,
}: {
  detail: RepositoryDetail;
  isAdmin: boolean;
  onOpen: (request: SheetRequest) => void;
  onRemove: (id: string) => Promise<void>;
}): JSX.Element {
  const { entry } = detail;

  return (
    <>
      <div className="detail-head">
        <h2>{entry.name}</h2>
        <p className="repo-does">{whatItDoes(entry)}</p>
        {entry.description ? <p className="repo-note">“{entry.description}”</p> : null}
        <p className="repo-source">{entry.provenance}</p>

        <div className="detail-actions">
          {detail.request ? (
            <button type="button" onClick={() => onOpen(detail.request as SheetRequest)}>
              Open it in the generator
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onOpen({
                  name: entry.name.split(' / ').slice(-1)[0] ?? entry.name,
                  itemType: entry.itemTypes[0] ?? 'Product',
                  fields: entry.fields.map((field) => ({ name: field })),
                  ...(entry.direction === 'export' ? { direction: 'export' as const } : {}),
                })
              }
            >
              Start a new sheet from these fields
            </button>
          )}
          {isAdmin && entry.shelf === 'saved' ? (
            <button type="button" className="link" onClick={() => void onRemove(entry.id)}>
              remove from the repository
            </button>
          ) : null}
        </div>
      </div>

      {entry.shelf === 'supplied' ? (
        <p className="muted">
          This is what was captured from the original script — the columns it wrote, the CSV it read and how it read it.
          The file itself was never in the export, so the app can describe this one and reuse its fields, but not hand
          the original back.
        </p>
      ) : null}

      {detail.blocks.map((block, index) => (
        <div className="detail-block" key={`${block.itemType}-${index}`}>
          <h3>
            {detail.blocks.length > 1 ? `${block.itemType} — ` : ''}What it writes
          </h3>
          <table className="columns-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Field</th>
              </tr>
            </thead>
            <tbody>
              {block.columns.map((column, columnIndex) => (
                <tr key={`${column.expression}-${columnIndex}`}>
                  <td>
                    {column.label ?? <span className="col-role">—</span>}
                    {column.expression.includes('unique=true') ? (
                      <span className="badge badge-key" style={{ marginLeft: 6 }}>
                        key
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <code>{column.expression}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {block.csv ? (
            <p className="muted" style={{ marginTop: 10 }}>
              Reads <strong>{block.csv.file}</strong> — {block.csv.encoding}, separated by{' '}
              <code>{block.csv.delimiter === '\t' ? 'tab' : block.csv.delimiter}</code>, skipping{' '}
              {block.csv.linesToSkip} heading line, at column offset <strong>{block.csv.columnsOffset}</strong>.
            </p>
          ) : null}

          {block.csvHeaderRow ? (
            <>
              <h3 style={{ marginTop: 16 }}>The CSV it was paired with</h3>
              <div className="sheet-wrap">
                <table className="sheet">
                  <thead>
                    <tr>
                      {block.csvHeaderRow.map((heading, headingIndex) => (
                        <th
                          key={`${heading}-${headingIndex}`}
                          className={/leave blank/i.test(heading) ? 'blank-col' : undefined}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                </table>
              </div>
            </>
          ) : null}

          <details className="reveal">
            <summary>The ImpEx header line</summary>
            <div className="reveal-body">
              <pre className="file">{block.headerLine}</pre>
            </div>
          </details>
        </div>
      ))}

      {detail.macros.length > 0 ? (
        <details className="reveal">
          <summary>Macros this script declares</summary>
          <div className="reveal-body">
            <pre className="file">{detail.macros.map(([name, value]) => `$${name}=${value}`).join('\n')}</pre>
          </div>
        </details>
      ) : null}

      {detail.notes ? <p className="muted">{detail.notes}</p> : null}
    </>
  );
}
