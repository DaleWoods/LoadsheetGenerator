/**
 * Which records an export pulls (§6.5).
 *
 * Three patterns, matching the export folders WOSG already keeps: a list of
 * codes, a code wildcard, and a wildcard on another attribute. There is no CSV
 * going in and none coming back to the app - the script writes its CSV inside
 * SAP Commerce when it is run in HAC, which is where you collect it (§9b Q3).
 */

import type { AttributeView } from './api.js';

export interface ExportSelection {
  kind: 'skuList' | 'skuWildcard' | 'attributeWildcard';
  codes?: string[];
  pattern?: string;
  attribute?: string;
}

interface Props {
  selection: ExportSelection;
  attributes: AttributeView[];
  onChange: (selection: ExportSelection) => void;
  /** The codes box holds free text until it is read, so it survives a half-typed list. */
  codesText: string;
  onCodesText: (text: string) => void;
}

export function ExportPanel({ selection, attributes, onChange, codesText, onCodesText }: Props): JSX.Element {
  return (
    <div className="export-panel">
      <div className="choices">
        <label>
          <input
            type="radio"
            checked={selection.kind === 'skuList'}
            onChange={() => onChange({ ...selection, kind: 'skuList' })}
          />
          A list of codes
        </label>
        <label>
          <input
            type="radio"
            checked={selection.kind === 'skuWildcard'}
            onChange={() => onChange({ ...selection, kind: 'skuWildcard' })}
          />
          Every code matching a pattern
        </label>
        <label>
          <input
            type="radio"
            checked={selection.kind === 'attributeWildcard'}
            onChange={() => onChange({ ...selection, kind: 'attributeWildcard' })}
          />
          Every record with a value in a field
        </label>
      </div>

      {selection.kind === 'skuList' ? (
        <>
          <textarea
            className="paste"
            value={codesText}
            onChange={(event) => onCodesText(event.target.value)}
            placeholder={'One code per line, or separated by commas.\n\n17331268\n17331097'}
            aria-label="Codes to export"
          />
          <p className="muted">
            {(selection.codes ?? []).length} code{(selection.codes ?? []).length === 1 ? '' : 's'}.
          </p>
        </>
      ) : null}

      {selection.kind === 'skuWildcard' ? (
        <label className="stacked">
          Code pattern
          <input
            type="text"
            value={selection.pattern ?? ''}
            onChange={(event) => onChange({ ...selection, pattern: event.target.value })}
            placeholder="173%"
          />
        </label>
      ) : null}

      {selection.kind === 'attributeWildcard' ? (
        <>
          <label className="stacked">
            Field to match on
            <select
              value={selection.attribute ?? ''}
              onChange={(event) => onChange({ ...selection, attribute: event.target.value })}
            >
              <option value="">Choose a field</option>
              {attributes.map((attribute) => (
                <option key={attribute.attribute} value={attribute.attribute}>
                  {attribute.label} ({attribute.attribute})
                </option>
              ))}
            </select>
          </label>
          <label className="stacked">
            Pattern — leave as % for every record that has any value at all
            <input
              type="text"
              value={selection.pattern ?? ''}
              onChange={(event) => onChange({ ...selection, pattern: event.target.value })}
              placeholder="%"
            />
          </label>
        </>
      ) : null}

      <p className="muted">
        The script writes its CSV inside SAP Commerce when you run it in HAC. The app cannot reach that file, so
        collecting it is yours to do.
      </p>
    </div>
  );
}

/** A pasted list, split on whatever the person used to separate it. */
export function parseCodes(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
}
