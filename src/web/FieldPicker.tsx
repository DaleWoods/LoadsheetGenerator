/**
 * Mode B: pick an item type, tick the fields you need (§6.2).
 *
 * The list is the library's own knowledge of that item type, so what a person
 * can tick is what WOSG has loaded before. Where an attribute has been written
 * more than one way - append and remove, per-language or not - both shapes are
 * offered rather than one being chosen for them, because that difference
 * changes what the import does.
 */

import { useMemo, useState } from 'react';
import type { AttributeView } from './api.js';

export interface ChosenField {
  name: string;
  variant?: string;
}

interface Props {
  attributes: AttributeView[];
  chosen: ChosenField[];
  /**
   * The shape each attribute is actually being written in, from the last
   * preview. The generator takes it from the sheet it matched - which is how an
   * append sheet keeps `[mode=append]` - so the radio buttons show what is in
   * use rather than a guess made before generating.
   */
  inUse: Map<string, string>;
  onChange: (chosen: ChosenField[]) => void;
}

function TypeBadge({ attribute }: { attribute: AttributeView }): JSX.Element | null {
  if (attribute.boolean) {
    return (
      <span className={`badge badge-${attribute.boolean}`} title={
        attribute.boolean === 'declared'
          ? 'The library has this written as TRUE/FALSE'
          : 'The library infers this is a flag from the sheets it appears in'
      }>
        TRUE/FALSE
      </span>
    );
  }
  if (attribute.type === 'string' && !attribute.localized) return null;
  return <span className="badge">{attribute.localized ? `${attribute.type}, per language` : attribute.type}</span>;
}

export function FieldPicker({ attributes, chosen, inUse, onChange }: Props): JSX.Element {
  const [search, setSearch] = useState('');

  const chosenByName = useMemo(() => new Map(chosen.map((field) => [field.name, field])), [chosen]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return attributes;
    return attributes.filter(
      (attribute) =>
        attribute.attribute.toLowerCase().includes(term) ||
        attribute.label.toLowerCase().includes(term) ||
        attribute.usedIn.some((name) => name.toLowerCase().includes(term)),
    );
  }, [attributes, search]);

  function toggle(attribute: AttributeView): void {
    if (chosenByName.has(attribute.attribute)) {
      onChange(chosen.filter((field) => field.name !== attribute.attribute));
      return;
    }
    // Ticked fields keep the order they were ticked in; that order is the
    // header line and the CSV column order. No shape is chosen here: leaving it
    // open lets the generator use the one the matched sheet writes, and
    // pre-selecting the most common shape would quietly turn an append sheet
    // into an overwrite.
    onChange([...chosen, { name: attribute.attribute }]);
  }

  function setVariant(name: string, signature: string): void {
    onChange(chosen.map((field) => (field.name === name ? { ...field, variant: signature } : field)));
  }

  return (
    <div className="picker">
      <input
        className="search"
        type="search"
        placeholder={`Search ${attributes.length} fields`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search fields"
      />

      <ul className="fields">
        {shown.map((attribute) => {
          const picked = chosenByName.get(attribute.attribute);
          return (
            <li key={attribute.attribute} className={picked ? 'field picked' : 'field'}>
              <label title={attribute.keyColumn ? 'The generator writes the key itself' : undefined}>
                <input
                  type="checkbox"
                  checked={picked !== undefined}
                  onChange={() => toggle(attribute)}
                  // The key is always written, so ticking it would only produce
                  // the same column twice.
                  disabled={attribute.keyColumn}
                />
                <span className="field-label">{attribute.label}</span>
                <code>{attribute.attribute}</code>
                <TypeBadge attribute={attribute} />
                {attribute.keyColumn ? <span className="badge badge-key">key, added for you</span> : null}
              </label>

              {picked && attribute.variants.length > 1 ? (
                <div className="variants">
                  {attribute.variants.map((variant) => (
                    <label key={variant.signature} className="variant">
                      <input
                        type="radio"
                        name={`variant-${attribute.attribute}`}
                        checked={
                          (picked.variant ?? inUse.get(attribute.attribute) ?? attribute.variants[0]!.signature) ===
                          variant.signature
                        }
                        onChange={() => setVariant(attribute.attribute, variant.signature)}
                      />
                      <span>{variant.description}</span>
                      <code className="variant-signature">{variant.signature}</code>
                    </label>
                  ))}
                </div>
              ) : null}

              {picked && attribute.usedIn.length > 0 ? (
                <p className="used-in">Used in {attribute.usedIn.join(', ')}</p>
              ) : null}
            </li>
          );
        })}
        {shown.length === 0 ? <li className="empty">Nothing in the library matches that.</li> : null}
      </ul>
    </div>
  );
}
