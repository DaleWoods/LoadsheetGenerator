import { useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadPackage,
  fetchAttributes,
  fetchItemTypes,
  fetchPreview,
  type AttributeView,
  type ItemType,
  type Preview,
  type SheetRequest,
} from './api.js';
import { ChosenFields } from './ChosenFields.js';
import { FieldPicker, type ChosenField } from './FieldPicker.js';
import { SheetPreview } from './SheetPreview.js';
import { alignPastedRows } from '../shared/paste.js';

/**
 * Both ways of getting data in are supported (§6.2): download the empty CSV
 * template and fill it in outside the app, or paste the rows here and get a
 * populated zip. Pasting is where the validation earns its keep, because the
 * app can then check the values against the columns before packaging.
 */
type DataSource = 'template' | 'paste';

export function App(): JSX.Element {
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [itemType, setItemType] = useState('Product');
  const [attributes, setAttributes] = useState<AttributeView[]>([]);
  const [chosen, setChosen] = useState<ChosenField[]>([]);
  const [name, setName] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>('template');
  const [pasted, setPasted] = useState('');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    fetchItemTypes()
      .then(setItemTypes)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    setChosen([]);
    setPreview(null);
    fetchAttributes(itemType)
      .then(setAttributes)
      .catch((err: Error) => setError(err.message));
  }, [itemType]);

  /**
   * The columns a paste has to line up with, taken from the last preview - the
   * generator adds the key, and how many columns that is depends on the item
   * type. The trailing macro columns come off the end: `$catalogVersion` is
   * blank in every WOSG CSV and the generator fills it in, so asking somebody
   * to paste an empty column for it would just be a way to get it wrong.
   */
  const labels = useMemo(() => {
    if (!preview?.columns) {
      const byName = new Map(attributes.map((a) => [a.attribute, a]));
      return chosen.map((field) => byName.get(field.name)?.label ?? field.name);
    }
    const columns = [...preview.columns];
    while (columns.length > 0 && columns[columns.length - 1]!.role === 'macro') columns.pop();
    return columns.map((column) => column.label);
  }, [preview, attributes, chosen]);

  /** Which shape each ticked attribute is being written in, for the picker's radio buttons. */
  const inUse = useMemo(
    () => new Map((preview?.columns ?? []).map((column) => [column.attribute, column.expression])),
    [preview],
  );

  const aligned = useMemo(
    () => (dataSource === 'paste' && pasted.trim() ? alignPastedRows(pasted, labels) : null),
    [dataSource, pasted, labels],
  );

  const sheetName = name.trim() || defaultName(itemType, chosen);

  const request = useMemo<SheetRequest | null>(() => {
    if (chosen.length === 0) return null;
    return {
      name: sheetName,
      itemType,
      fields: chosen,
      ...(aligned && aligned.rows.length > 0 ? { rows: aligned.rows } : {}),
    };
  }, [sheetName, itemType, chosen, aligned]);

  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!request) {
      setPreview(null);
      return;
    }
    setPending(true);
    setRefusal(null);
    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;
    const timer = setTimeout(() => {
      fetchPreview(request, controller.signal)
        .then((result) => {
          setPreview(result);
          setError(null);
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request]);

  async function onDownload(): Promise<void> {
    if (!request) return;
    setDownloading(true);
    setRefusal(null);
    try {
      const refused = await downloadPackage(request);
      if (refused) setRefusal(refused.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Load Sheet Generator</h1>
        <p className="muted">
          Builds the ImpEx script and its matching CSV from what WOSG has loaded before. The upload into HAC stays
          yours.
        </p>
      </header>

      <div className="columns">
        <section className="panel">
          <h2>1. What are you loading?</h2>
          <label className="stacked">
            Item type
            <select value={itemType} onChange={(event) => setItemType(event.target.value)}>
              {itemTypes.map((type) => (
                <option key={type.itemType} value={type.itemType}>
                  {type.itemType} — {type.attributes} fields, {type.templates} sheets
                </option>
              ))}
            </select>
          </label>

          <h2>2. Which fields?</h2>
          <FieldPicker attributes={attributes} chosen={chosen} inUse={inUse} onChange={setChosen} />

          {chosen.length > 0 ? (
            <>
              <h2>The columns, in order</h2>
              <ChosenFields
                chosen={chosen}
                attributes={attributes}
                columns={preview?.columns ?? null}
                onChange={setChosen}
              />
            </>
          ) : null}
        </section>

        <section className="panel">
          <h2>3. Name it</h2>
          <label className="stacked">
            Load sheet name
            <input
              type="text"
              value={name}
              placeholder={defaultName(itemType, chosen)}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <h2>4. The data</h2>
          <div className="choices">
            <label>
              <input
                type="radio"
                checked={dataSource === 'template'}
                onChange={() => setDataSource('template')}
              />
              An empty CSV to fill in outside the app
            </label>
            <label>
              <input type="radio" checked={dataSource === 'paste'} onChange={() => setDataSource('paste')} />
              Paste the rows here
            </label>
          </div>

          {dataSource === 'paste' ? (
            <>
              <textarea
                className="paste"
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                placeholder={`Paste from Excel. Columns, in order:\n${labels.join(', ')}`}
                aria-label="Paste rows"
              />
              {aligned ? (
                <p className="muted">
                  {aligned.rows.length} row{aligned.rows.length === 1 ? '' : 's'}.{' '}
                  {aligned.notes.join(' ')}
                  {aligned.ragged > 0
                    ? ` ${aligned.ragged} row${aligned.ragged === 1 ? ' does' : 's do'} not have ${labels.length} columns.`
                    : ''}
                </p>
              ) : null}
            </>
          ) : null}

          <h2>5. Check it</h2>
          {refusal ? <p className="error">{refusal}</p> : null}
          <SheetPreview
            preview={preview}
            pending={pending}
            error={error}
            onDownload={() => void onDownload()}
            downloading={downloading}
          />
        </section>
      </div>
    </div>
  );
}

/**
 * A sensible file name to start from. One field names itself; several are not
 * worth stringing together, because the name ends up in the file names and a
 * long one helps nobody.
 */
function defaultName(itemType: string, chosen: ChosenField[]): string {
  if (chosen.length === 1) return titleCase(chosen[0]!.name);
  return `${itemType} Load Sheet`;
}

function titleCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ');
}
