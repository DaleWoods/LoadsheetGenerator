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

export interface SheetRequest {
  name: string;
  itemType: string;
  fields: { name: string; variant?: string; csvLabel?: string }[];
  op?: string;
  intent?: string;
  rows?: string[][];
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

/** "It imported cleanly" - save the sheet into the library so the attribute is known next time. */
export async function learnSheet(request: SheetRequest): Promise<{ learned: string[] }> {
  return json<{ learned: string[] }>(
    await fetch('/api/sheets/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
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
