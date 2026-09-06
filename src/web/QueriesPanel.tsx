/**
 * Writing a FlexibleSearch query from a description.
 *
 * The same bargain as the load sheet side, and it is worth saying why the
 * checks are lighter here: a query reads. Getting one wrong costs an error
 * message in the console rather than a column of wrong data in production. So
 * an unknown field is a warning and the query still appears - what would not
 * be acceptable is it appearing with nothing said, because a query that runs
 * and returns plausible but wrong rows is how a bad decision gets made.
 *
 * The query is shown, not hidden. The people using this write FlexibleSearch;
 * what they are short of is the ten minutes it takes to remember which field
 * on Order holds the store and how OrderEntry joins to it.
 */

import { useState } from 'react';
import { describeFlexQuery, type FlexFinding, type FlexResult } from './api.js';

const SEVERITY_LABEL: Record<FlexFinding['severity'], string> = {
  error: 'Fix this',
  warning: 'Worth a look',
  info: 'For information',
};

const EXAMPLES = [
  'All orders from the last week with the order number and date',
  'An export query that pulls all categories with type Watches',
  'Products with no price row, approved, code starting 17',
];

export function QueriesPanel({ enabled }: { enabled: boolean }): JSX.Element {
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<FlexResult | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    if (description.trim().length < 3) return;
    setWorking(true);
    setError(null);
    setCopied(false);
    try {
      setResult(await describeFlexQuery(description));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Write a query</h1>
        <p>
          Say what you need out of SAP Commerce in your own words. Claude writes the FlexibleSearch, reading the
          team&rsquo;s own query library for the types, fields and joins — so it uses the way you already query rather
          than something generic. Copy it into the backoffice console yourself.
        </p>
      </div>

      <div className="columns columns-even">
        <section className="card">
          <h2 className="step" style={{ marginTop: 0 }}>
            What do you need?
          </h2>
          {!enabled ? (
            <p className="muted">
              Writing a query needs <code>ANTHROPIC_API_KEY</code> set on the server. Everything else on this tab works
              without it.
            </p>
          ) : (
            <>
              <textarea
                className="paste"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={`For example:\n\n${EXAMPLES.map((e) => `· ${e}`).join('\n')}`}
                aria-label="Describe the query"
              />
              <div className="describe-actions">
                <button type="button" onClick={() => void run()} disabled={working || description.trim().length < 3}>
                  {working ? 'Working it out…' : 'Write the query'}
                </button>
                <span className="muted">
                  Reads only — nothing here changes anything. It can take up to a minute.
                </span>
              </div>
              {error ? <p className="error">{error}</p> : null}
            </>
          )}
        </section>

        <section className="card">
          {!result ? (
            <p className="repo-empty">The query appears here, with what it does in words above it.</p>
          ) : (
            <>
              <div className="detail-head">
                <h2>{result.name}</h2>
                <p className="repo-does">{result.summary}</p>
                <span className={result.kind === 'export' ? 'badge badge-key' : 'badge'}>
                  {result.kind === 'export' ? 'for an ImpEx export' : 'to read in the console'}
                </span>
              </div>

              {result.clarification ? (
                <p className="finding finding-warning">
                  <span className="finding-severity">Question</span>
                  <span>{result.clarification}</span>
                </p>
              ) : null}

              {result.findings.length > 0 ? (
                <ul className="findings">
                  {result.findings.map((finding, index) => (
                    <li key={`${finding.code}-${index}`} className={`finding finding-${finding.severity}`}>
                      <span className="finding-severity">{SEVERITY_LABEL[finding.severity]}</span>
                      <span>{finding.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {result.query ? (
                <>
                  <pre className="file" style={{ marginTop: 14 }}>
                    {result.query}
                  </pre>
                  <div className="describe-actions">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(result.query).then(() => setCopied(true));
                      }}
                    >
                      {copied ? 'Copied' : 'Copy the query'}
                    </button>
                  </div>
                </>
              ) : null}

              {result.notes.length > 0 ? (
                <ul className="notes">
                  {result.notes.map((note) => (
                    <li key={note} className="muted">
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
