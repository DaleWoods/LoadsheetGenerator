/** Everything the browser asks the server for. */

export interface ItemType {
  itemType: string;
  templates: number;
  attributes: number;
  directions: string[];
}

export interface VariantView {
  signature: string;
  description: string;
  label: string;
  uses: number;
  usedIn: string[];
}

export interface AttributeView {
  attribute: string;
  label: string;
  type: string;
  localized: boolean;
  boolean?: 'declared' | 'observed';
  keyColumn: boolean;
  uses: number;
  variants: VariantView[];
  usedIn: string[];
}

export interface Finding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  block?: number;
  column?: number;
  row?: number;
}

export interface PreviewColumn {
  attribute: string;
  expression: string;
  label: string;
  type: string;
  status: 'known' | 'unverified';
  suggestions: string[];
  role: 'key' | 'field' | 'macro';
  /** True when the user ticked it; false when the generator added it. */
  chosen: boolean;
}

export interface Preview {
  impex: { filename: string; content: string };
  csvs: { filename: string; content: string }[];
  findings: Finding[];
  summary: string;
  packageable: boolean;
  basedOn: { id: string; name: string } | null;
  columns?: PreviewColumn[];
}

export interface SheetRequest {
  name: string;
  itemType: string;
  fields: { name: string; variant?: string; csvLabel?: string }[];
  op?: string;
  intent?: string;
  rows?: string[][];
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchItemTypes(): Promise<ItemType[]> {
  const body = await json<{ itemTypes: ItemType[] }>(await fetch('/api/library/item-types'));
  return body.itemTypes;
}

export async function fetchAttributes(itemType: string): Promise<AttributeView[]> {
  const body = await json<{ attributes: AttributeView[] }>(
    await fetch(`/api/library/attributes?itemType=${encodeURIComponent(itemType)}`),
  );
  return body.attributes;
}

export async function fetchPreview(request: SheetRequest, signal?: AbortSignal): Promise<Preview> {
  return json<Preview>(
    await fetch('/api/sheets/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      ...(signal ? { signal } : {}),
    }),
  );
}

export interface DownloadRefusal {
  error: string;
  findings: Finding[];
}

/**
 * Ask the server to package the sheet and hand the file to the browser.
 *
 * The download is generated from the same request the preview came from, so
 * what was checked on screen is what lands in the zip.
 */
export async function downloadPackage(request: SheetRequest): Promise<DownloadRefusal | null> {
  const response = await fetch('/api/sheets/package', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (response.status === 422) return (await response.json()) as DownloadRefusal;
  if (!response.ok) throw new Error(`Could not package the load sheet (${response.status})`);

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'loadsheet.zip';
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return null;
}
