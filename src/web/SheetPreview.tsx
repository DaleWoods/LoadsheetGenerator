/**
 * What was generated, before it is downloaded (§6.1, §6.4).
 *
 * The findings come first and in words, because they are the reason the app
 * exists: the failures this replaces are a mismatched column count and a wrong
 * offset, both of which only announce themselves an hour later in HAC. An error
 * stops the download; a warning is something to check.
 */

import type { Finding, Preview } from './api.js';

function FindingList({ findings }: { findings: Finding[] }): JSX.Element | null {
  if (findings.length === 0) return null;
  return (
    <ul className="findings">
      {findings.map((finding, index) => (
        <li key={`${finding.code}-${index}`} className={`finding finding-${finding.severity}`}>
          <span className="finding-severity">{finding.severity}</span>
          <span>{finding.message}</span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  preview: Preview | null;
  pending: boolean;
  error: string | null;
  onDownload: () => void;
  downloading: boolean;
  /** Held back until the unverified attributes have been confirmed. */
  blocked: boolean;
}

export function SheetPreview({ preview, pending, error, onDownload, downloading, blocked }: Props): JSX.Element {
  if (error) return <p className="error">{error}</p>;
  if (!preview) return <p className="muted">{pending ? 'Generating…' : 'Tick a field to generate a load sheet.'}</p>;

  const csv = preview.csvs[0];
  const rows = csv ? csv.content.split('\r\n').filter((line) => line.length > 0) : [];
  const shownRows = rows.slice(0, 6);

  return (
    <div className={pending ? 'preview stale' : 'preview'}>
      <div className="preview-actions">
        <button type="button" onClick={onDownload} disabled={!preview.packageable || downloading || blocked}>
          {downloading ? 'Packaging…' : csv ? 'Download zip' : 'Download .impex'}
        </button>
        <p className="summary">{preview.summary}</p>
      </div>

      {preview.basedOn ? (
        <p className="muted">
          Conventions, including <code>columnsOffset</code>, copied from <strong>{preview.basedOn.name}</strong>.
        </p>
      ) : (
        <p className="muted">No close match in the library; the house convention was used.</p>
      )}

      <FindingList findings={preview.findings} />

      <section>
        <h3>{preview.impex.filename}</h3>
        <pre className="file">{preview.impex.content}</pre>
      </section>

      {csv ? (
        <section>
          <h3>
            {csv.filename}
            {rows.length > shownRows.length ? <span className="muted"> — first {shownRows.length} of {rows.length} lines</span> : null}
          </h3>
          <pre className="file">{shownRows.join('\n')}</pre>
        </section>
      ) : null}
    </div>
  );
}
