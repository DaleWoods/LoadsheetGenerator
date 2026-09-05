/**
 * What was generated, before it is downloaded (§6.1, §6.4).
 *
 * Ordered by what somebody needs to decide: what this will do, then anything
 * wrong with it, then the CSV as a sheet they can read - and only then, folded
 * away, the ImpEx itself. Most of the people using this are not going to read
 * the script, and putting it first made the app look like it was for somebody
 * else. The people who do read it are one click away.
 *
 * The findings come before the files because they are the reason the app
 * exists: the failures this replaces are a mismatched column count and a wrong
 * offset, both of which otherwise announce themselves an hour later in HAC.
 */

import { parseCsv } from '../shared/csv.js';
import type { Finding, Preview } from './api.js';

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  error: 'Fix this',
  warning: 'Worth a look',
  info: 'For information',
};

function FindingList({ findings }: { findings: Finding[] }): JSX.Element | null {
  if (findings.length === 0) return null;
  return (
    <ul className="findings">
      {findings.map((finding, index) => (
        <li key={`${finding.code}-${index}`} className={`finding finding-${finding.severity}`}>
          <span className="finding-severity">{SEVERITY_LABEL[finding.severity]}</span>
          <span>{finding.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** The CSV as a sheet. A line of commas is not something anybody can check. */
function CsvTable({ content, delimiter = ',' }: { content: string; delimiter?: string }): JSX.Element {
  const rows = parseCsv(content, delimiter).filter((row) => row.some((cell) => cell !== ''));
  const [heading = [], ...body] = rows;
  const shown = body.slice(0, 5);

  return (
    <>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              {heading.map((cell, index) => (
                <th key={`${cell}-${index}`} className={/leave blank/i.test(cell) ? 'blank-col' : undefined}>
                  {cell || ' '}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {heading.map((_, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={/leave blank/i.test(heading[cellIndex] ?? '') ? 'blank-col' : undefined}
                  >
                    {row[cellIndex] || ' '}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {body.length === 0 ? (
        <p className="muted">Headings only — fill it in once you have downloaded it.</p>
      ) : body.length > shown.length ? (
        <p className="muted">
          Showing {shown.length} of {body.length} rows.
        </p>
      ) : null}
    </>
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
  if (!preview) {
    return <p className="muted">{pending ? 'Working…' : 'Choose a field or two and your load sheet appears here.'}</p>;
  }

  const csv = preview.csvs[0];
  const errors = preview.findings.filter((finding) => finding.severity === 'error');
  const rest = preview.findings.filter((finding) => finding.severity !== 'error');

  return (
    <div className={pending ? 'preview stale' : 'preview'} style={pending ? { opacity: 0.55 } : undefined}>
      <div className="outcome">
        <div className="outcome-text">
          <strong>{preview.summary}</strong>
          <br />
          {preview.basedOn ? (
            <>
              Built the way <strong>{preview.basedOn.name}</strong> was, down to the column offset.
            </>
          ) : (
            <>No close match in the library, so the usual conventions were used.</>
          )}
        </div>
        <button type="button" onClick={onDownload} disabled={!preview.packageable || downloading || blocked}>
          {downloading ? 'Packaging…' : csv ? 'Download the zip' : 'Download the script'}
        </button>
      </div>

      <FindingList findings={[...errors, ...rest]} />

      {csv ? (
        <>
          <p className="file-name" style={{ marginTop: 18 }}>
            {csv.filename}
          </p>
          <CsvTable content={csv.content} />
        </>
      ) : null}

      <details className="reveal">
        <summary>The ImpEx script — {preview.impex.filename}</summary>
        <div className="reveal-body">
          <pre className="file">{preview.impex.content}</pre>
        </div>
      </details>
    </div>
  );
}
