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

export interface ResolvedField {
  attribute: string;
  variant?: string;
  why: string;
  /** The app's verdict on whether the library has this attribute, not the model's. */
  known: boolean;
  suggestions: string[];
}

export interface Resolution {
  request: SheetRequest | null;
  fields: ResolvedField[];
  summary: string;
  clarification: string | null;
  notes: string[];
}

export interface Preview {
  impex: { filename: string; content: string };
  csvs: { filename: string; content: string }[];
  findings: Finding[];
  summary: string;
  packageable: boolean;
  basedOn: { id: string; name: string } | null;
  /** Attributes in this sheet that the library does not have. */
  unverified: string[];
  columns?: PreviewColumn[];
}

export interface ExportSelectionRequest {
  kind: 'skuList' | 'skuWildcard' | 'attributeWildcard';
  codes?: string[];
  pattern?: string;
  attribute?: string;
}

export interface SheetRequest {
  name: string;
  itemType: string;
  fields: { name: string; variant?: string; csvLabel?: string }[];
  op?: string;
  intent?: string;
  rows?: string[][];
  direction?: 'import' | 'export';
  export?: ExportSelectionRequest;
  /** The user has ticked to say they checked the unverified attributes exist. */
  confirmedUnverified?: boolean;
}

export interface SessionUser {
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  mustChange: boolean;
}

export interface Account {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  disabled: boolean;
  mustChange: boolean;
  lastSeenAt: string | null;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** The signed-in user, or null. A 403 with mustChange is still a signed-in user. */
export async function fetchSession(): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/me');
  if (response.status === 401) return null;
  const body = (await response.json()) as { user: SessionUser };
  return body.user;
}

export async function signIn(username: string, password: string): Promise<SessionUser> {
  const body = await json<{ user: SessionUser }>(
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  return body.user;
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<SessionUser> {
  const body = await json<{ user: SessionUser }>(
    await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  );
  return body.user;
}

export async function fetchUsers(): Promise<Account[]> {
  const body = await json<{ users: Account[] }>(await fetch('/api/users'));
  return body.users;
}

export async function createAccount(input: {
  username: string;
  displayName?: string;
  password: string;
}): Promise<void> {
  await json(
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateAccount(
  id: string,
  patch: { password?: string; disabled?: boolean; role?: 'admin' | 'member' },
): Promise<void> {
  await json(
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
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

export async function fetchModes(): Promise<{ describe: boolean }> {
  return json<{ describe: boolean }>(await fetch('/api/sheets/modes'));
}

export async function describeSheet(description: string): Promise<Resolution> {
  return json<Resolution>(
    await fetch('/api/sheets/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    }),
  );
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  username: string;
  name: string;
  itemType: string;
  direction: string;
  summary: string;
  filename: string;
  rowCount: number;
  outcome: 'downloaded' | 'learned';
  request: SheetRequest;
}

export interface RepositoryEntry {
  id: string;
  shelf: 'supplied' | 'saved';
  name: string;
  provenance: string;
  group: string;
  direction: string;
  itemTypes: string[];
  fields: string[];
  columnCount: number;
  csvFile: string | null;
  columnsOffset: number | null;
  verified: boolean;
  description?: string;
  reusable: boolean;
  updatedAt: string;
}

export interface RepositoryDetail {
  entry: RepositoryEntry;
  blocks: {
    op: string;
    itemType: string;
    headerLine: string;
    columns: { expression: string; label: string | null }[];
    csvHeaderRow: string[] | null;
    csv: { file: string; encoding: string; delimiter: string; linesToSkip: number; columnsOffset: number } | null;
  }[];
  macros: [string, string][];
  notes?: string;
  request: SheetRequest | null;
}

export async function fetchRepository(
  query: { search?: string; itemType?: string; direction?: string } = {},
): Promise<{
  supplied: RepositoryEntry[];
  saved: RepositoryEntry[];
  totals: { supplied: number; saved: number };
}> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.itemType) params.set('itemType', query.itemType);
  if (query.direction) params.set('direction', query.direction);
  return json(await fetch(`/api/library/repository?${params.toString()}`));
}

export async function fetchRepositoryEntry(id: string): Promise<RepositoryDetail> {
  return json<RepositoryDetail>(await fetch(`/api/library/repository/${encodeURIComponent(id)}`));
}

export async function removeRepositoryEntry(id: string): Promise<void> {
  await json(await fetch(`/api/library/repository/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

/** Put a generated sheet on the repository shelf. `imported` makes it evidence the catalogue trusts. */
export async function saveToRepository(input: {
  request: SheetRequest;
  name?: string;
  description?: string;
  imported?: boolean;
}): Promise<{ entry: RepositoryEntry; learned: string[] }> {
  return json(
    await fetch('/api/sheets/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchHistory(mine = false): Promise<HistoryEntry[]> {
  const body = await json<{ history: HistoryEntry[] }>(
    await fetch(`/api/sheets/history${mine ? '?mine=true' : ''}`),
  );
  return body.history;
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

/* --------------------------------------------------------------- queries - */

export interface FlexFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}
export interface FlexResult {
  name: string;
  kind: 'reporting' | 'export';
  query: string;
  summary: string;
  notes: string[];
  clarification?: string;
  findings: FlexFinding[];
}

export async function queryModes(): Promise<{ describe: boolean }> {
  return json<{ describe: boolean }>(await fetch('/api/queries/modes'));
}

export async function describeFlexQuery(description: string): Promise<FlexResult> {
  // Writing a query takes as long as the model takes. Left to the browser, a
  // slow one dies as a bare "failed to fetch" with nothing to act on, so it is
  // given an explicit ceiling and a message that says what happened.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    return await json<FlexResult>(
      await fetch('/api/queries/describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description }),
        signal: controller.signal,
      }),
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('That took more than two minutes and was given up on. Try asking for less in one go.');
    }
    if (error instanceof TypeError) {
      throw new Error(
        'The request did not reach the server, or the connection dropped before it answered. If the app has just woken up, try once more.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
