import { useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadPackage,
  fetchAttributes,
  fetchItemTypes,
  fetchModes,
  fetchPreview,
  learnSheet,
  type AttributeView,
  type ItemType,
  type Preview,
  type Resolution,
  type SheetRequest,
} from './api.js';
import { ChosenFields } from './ChosenFields.js';
import { DescribeBox } from './DescribeBox.js';
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

  const [describeEnabled, setDescribeEnabled] = useState(false);
  /** The user has said they checked the unverified attributes exist in SAP Commerce. */
  const [confirmedUnverified, setConfirmedUnverified] = useState(false);
  const [learned, setLearned] = useState<string[] | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    fetchItemTypes()
      .then(setItemTypes)
      .catch((err: Error) => setError(err.message));
    fetchModes()
      .then((modes) => setDescribeEnabled(modes.describe))
      .catch(() => setDescribeEnabled(false));
  }, []);

  // Only fetches. Clearing the ticked fields belongs to the thing that changed
  // the item type, because a resolution changes both at once.
  useEffect(() => {
    fetchAttributes(itemType)
      .then(setAttributes)
      .catch((err: Error) => setError(err.message));
  }, [itemType]);

  /**
   * A described load sheet lands in the picker rather than going straight to a
   * download: same fields, same order, same shapes, all of it adjustable, and
   * the same generator behind it.
   */
  function applyResolution(resolution: Resolution): void {
    const request = resolution.request;
    if (!request) return;
    setItemType(request.itemType);
    setChosen(request.fields.map((field) => ({ name: field.name, ...(field.variant ? { variant: field.variant } : {}) })));
    setName(request.name);
    setConfirmedUnverified(false);
    setLearned(null);
    setDownloaded(false);
    if (request.rows && request.rows.length > 0) {
      // Rows the description carried are shown as text, so they can be checked
      // and corrected like any other paste.
      setDataSource('paste');
      setPasted(request.rows.map((row) => row.join('\t')).join('\n'));
    }
  }

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

  /**
   * The request, keyed on its own content.
   *
   * The preview effect runs whenever this object changes identity, and the
   * paste alignment reads its column labels from the last preview - so a memo
   * over the dependency objects feeds back on itself: every preview produces a
   * fresh `labels` array, a fresh request, and another preview, for ever.
   * Rebuilding from a JSON key means the identity changes only when the sheet
   * really does.
   */
  const requestKey = JSON.stringify({
    name: sheetName,
    itemType,
    fields: chosen,
    rows: aligned?.rows ?? [],
  });
  const request = useMemo<SheetRequest | null>(() => {
    if (chosen.length === 0) return null;
    const parsed = JSON.parse(requestKey) as SheetRequest & { rows: string[][] };
    return {
      name: parsed.name,
      itemType: parsed.itemType,
      fields: parsed.fields,
      ...(parsed.rows.length > 0 ? { rows: parsed.rows } : {}),
    };
  }, [requestKey, chosen.length]);

  const unverified = preview?.unverified ?? [];

  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!request) {
      setPreview(null);
      return;
    }
    setPending(true);
    setRefusal(null);
    setConfirmedUnverified(false);
    setDownloaded(false);
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
      const refused = await downloadPackage({ ...request, confirmedUnverified });
      if (refused) setRefusal(refused.error);
      else setDownloaded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  /** The library grows from sheets that actually worked, and only the user can say so. */
  async function onLearn(): Promise<void> {
    if (!request) return;
    try {
      const result = await learnSheet(request);
      setLearned(result.learned);
      fetchAttributes(itemType).then(setAttributes).catch(() => undefined);
    } catch (err) {
      setError((err as Error).message);
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
          <h2>Describe it</h2>
          <DescribeBox enabled={describeEnabled} onResolved={applyResolution} />

          <h2>1. What are you loading?</h2>
          <label className="stacked">
            Item type
            <select
              value={itemType}
              onChange={(event) => {
                setChosen([]);
                setPreview(null);
                setItemType(event.target.value);
              }}
            >
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
          {unverified.length > 0 ? (
            <label className="confirm">
              <input
                type="checkbox"
                checked={confirmedUnverified}
                onChange={(event) => setConfirmedUnverified(event.target.checked)}
              />
              <span>
                I have checked that <strong>{unverified.join(', ')}</strong>{' '}
                {unverified.length === 1 ? 'exists' : 'exist'} in SAP Commerce. The app cannot check this without a live
                connection, and a name that is wrong will fail at import.
              </span>
            </label>
          ) : null}
          {refusal ? <p className="error">{refusal}</p> : null}
          {downloaded && unverified.length > 0 && learned === null ? (
            <p className="learn">
              <button type="button" onClick={() => void onLearn()}>
                It imported cleanly — add to the library
              </button>
              <span className="muted">
                Saves this sheet so {unverified.join(', ')} {unverified.length === 1 ? 'is' : 'are'} known next time.
              </span>
            </p>
          ) : null}
          {learned !== null ? (
            <p className="muted">
              {learned.length > 0
                ? `Added to the library: ${learned.join(', ')}. ${learned.length === 1 ? 'It is' : 'They are'} now offered in the field list.`
                : 'Saved to the library.'}
            </p>
          ) : null}
          <SheetPreview
            preview={preview}
            pending={pending}
            error={error}
            onDownload={() => void onDownload()}
            downloading={downloading}
            blocked={unverified.length > 0 && !confirmedUnverified}
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
