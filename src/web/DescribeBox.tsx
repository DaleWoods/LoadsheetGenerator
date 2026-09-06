/**
 * Mode A: describe the load sheet in plain English (§6.1).
 *
 * What comes back is a specification, and it lands in the field picker rather
 * than going straight to a download - so the fields, their order and the shape
 * each is written in are all there to be checked and changed before anything is
 * generated. The model's reasoning is shown per field, in its own words, for
 * the same reason.
 */

import { useState } from 'react';
import { describeSheet, type Resolution } from './api.js';

interface Props {
  onResolved: (resolution: Resolution) => void;
  enabled: boolean;
}

/**
 * Every example has to name a field the library actually has.
 * `describeBox.test.ts` checks that against the catalogue, because the first
 * one shipped naming `isEditorsPick`, which exists nowhere in SAP Commerce or
 * in the library - so the one worked example of the app's headline feature was
 * a request it would have flagged as unverified.
 */
export const EXAMPLES: { text: string; attributes: string[] }[] = [
  {
    text: 'Add Goldsmiths to display on site for 10 SKUs',
    attributes: ['syncToSite'],
  },
  {
    text: 'Load meta description and meta keywords for a list of products',
    attributes: ['metaDescription', 'metaKeywords'],
  },
  {
    text: 'Add products to the see more styles list without replacing what is there',
    attributes: ['seeMoreStylesRef'],
  },
];

export function DescribeBox({ onResolved, enabled }: Props): JSX.Element {
  const [description, setDescription] = useState('');
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    if (!description.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const result = await describeSheet(description);
      setResolution(result);
      // A question back means there is nothing to fill the picker with yet.
      if (result.request) onResolved(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  if (!enabled) {
    return (
      <p className="muted">
        Describing a load sheet in words needs <code>ANTHROPIC_API_KEY</code> set on the server. Until then, pick the
        fields below.
      </p>
    );
  }

  return (
    <div className="describe">
      <textarea
        className="paste"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={`What do you need?  For example:\n\n${EXAMPLES.map((example) => `· ${example.text}`).join('\n')}`}
        aria-label="Describe the load sheet"
      />
      <div className="describe-actions">
        <button type="button" onClick={() => void run()} disabled={working || description.trim().length < 3}>
          {working ? 'Working it out…' : 'Work it out'}
        </button>
        {resolution === null && !working ? (
          <span className="muted">Nothing is generated until you have seen it — and you can change any of it.</span>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {resolution ? (
        <div className="resolution">
          <p>{resolution.summary}</p>

          {resolution.clarification ? (
            <p className="finding finding-warning">
              <span className="finding-severity">question</span>
              <span>{resolution.clarification}</span>
            </p>
          ) : null}

          {resolution.fields.length > 0 ? (
            <ul className="resolved-fields">
              {resolution.fields.map((field) => (
                <li key={field.attribute}>
                  <code>{field.attribute}</code> <span className="muted">{field.why}</span>
                  {field.known ? null : (
                    <span className="badge badge-observed">
                      not in the library
                      {field.suggestions.length > 0 ? ` — did you mean ${field.suggestions.join(' or ')}?` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {resolution.notes.length > 0 ? (
            <ul className="notes">
              {resolution.notes.map((note) => (
                <li key={note} className="muted">
                  {note}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
