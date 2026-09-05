/**
 * The columns, in the order they will be written.
 *
 * Ticking fields in a long list leaves you with no idea what you have picked or
 * what order it is in, and the order is not cosmetic here: it is the header
 * line and it is the CSV's column order, which is what somebody filling the
 * sheet in has to match.
 *
 * Once a preview has come back the list is the generator's own column list,
 * including the ones it adds - the key, which is one column on Product and two
 * on VariantProduct, and the trailing `$catalogVersion`. Reproducing that
 * guesswork in the browser is how a paste ends up one column out.
 */

import type { AttributeView, PreviewColumn } from './api.js';
import type { ChosenField } from './FieldPicker.js';

interface Props {
  chosen: ChosenField[];
  attributes: AttributeView[];
  /** The generator's columns, once there is a preview to take them from. */
  columns: PreviewColumn[] | null;
  onChange: (chosen: ChosenField[]) => void;
}

interface Row {
  key: string;
  label: string;
  attribute: string;
  note: string | null;
  unverified: boolean;
  /** Position within the ticked fields, for the reorder buttons. */
  chosenIndex: number | null;
}

function rowsFrom(chosen: ChosenField[], attributes: AttributeView[], columns: PreviewColumn[] | null): Row[] {
  const byName = new Map(attributes.map((a) => [a.attribute, a]));

  if (columns) {
    // The generator writes the ticked fields in the order they were ticked,
    // with the ones it adds itself around them, so the nth column marked
    // `chosen` is the nth ticked field. Matching them up by attribute name
    // instead broke on a localized field taken in two languages: both columns
    // are `description`, so both pointed at the first one, and removing either
    // removed both.
    let taken = -1;
    return columns.map((column, index) => ({
      key: `${column.expression}-${index}`,
      label: column.label,
      attribute: column.attribute,
      note: column.chosen ? null : column.role === 'key' ? 'the key, added for you' : 'added for you',
      unverified: column.status === 'unverified',
      chosenIndex: column.chosen ? (taken += 1) : null,
    }));
  }

  return chosen.map((field, index) => ({
    key: `${field.name}-${index}`,
    label: byName.get(field.name)?.label ?? field.name,
    attribute: field.name,
    note: null,
    unverified: false,
    chosenIndex: index,
  }));
}

export function ChosenFields({ chosen, attributes, columns, onChange }: Props): JSX.Element | null {
  if (chosen.length === 0) return null;
  const rows = rowsFrom(chosen, attributes, columns);

  function move(from: number, by: number): void {
    const next = [...chosen];
    const to = from + by;
    if (to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to]!, next[from]!];
    onChange(next);
  }

  return (
    <ol className="chosen">
      {rows.map((row) => (
        <li key={row.key} className={row.note ? 'chosen-row chosen-added' : 'chosen-row'}>
          <span className="chosen-name">{row.label}</span>
          <code>{row.attribute}</code>
          {row.unverified ? <span className="badge badge-observed">unverified</span> : null}
          {row.note ? <span className="muted">{row.note}</span> : null}
          {row.chosenIndex !== null ? (
            <span className="chosen-buttons">
              <button
                type="button"
                className="link"
                onClick={() => move(row.chosenIndex!, -1)}
                disabled={row.chosenIndex === 0}
                aria-label={`Move ${row.attribute} earlier`}
              >
                ↑
              </button>
              <button
                type="button"
                className="link"
                onClick={() => move(row.chosenIndex!, 1)}
                disabled={row.chosenIndex === chosen.length - 1}
                aria-label={`Move ${row.attribute} later`}
              >
                ↓
              </button>
              <button
                type="button"
                className="link"
                onClick={() => onChange(chosen.filter((_, index) => index !== row.chosenIndex))}
                aria-label={`Remove ${row.attribute}`}
              >
                ✕
              </button>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
