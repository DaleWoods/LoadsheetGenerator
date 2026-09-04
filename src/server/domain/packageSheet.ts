/**
 * Bundling the generated files for download.
 *
 * An import load sheet goes out as a zip - the script and its CSV together,
 * which is the shape HAC expects and the shape WOSG already uses (§6.6). An
 * export script has no paired CSV, so it goes out as a single file (§6.5).
 *
 * Packaging refuses on a validation error. That is the whole point of the
 * checks: a zip that fails at import an hour later costs more than a refusal
 * now, so the errors have to be dealt with rather than dismissed.
 */

import JSZip from 'jszip';
import type { GeneratedLoadSheet } from './generate.js';
import type { Finding } from './validate.js';

export class NotPackageableError extends Error {
  constructor(readonly findings: Finding[]) {
    super('The load sheet has problems that would make the import fail.');
    this.name = 'NotPackageableError';
  }
}

export interface PackagedLoadSheet {
  filename: string;
  contentType: string;
  body: Buffer;
}

export async function packageLoadSheet(sheet: GeneratedLoadSheet): Promise<PackagedLoadSheet> {
  if (!sheet.packageable) throw new NotPackageableError(sheet.findings.filter((f) => f.severity === 'error'));

  const base = sheet.impex.filename.replace(/\.impex$/, '');

  if (sheet.csvs.length === 0) {
    return {
      filename: sheet.impex.filename,
      contentType: 'text/plain; charset=utf-8',
      body: Buffer.from(sheet.impex.content, 'utf8'),
    };
  }

  const zip = new JSZip();
  zip.file(sheet.impex.filename, sheet.impex.content);
  for (const csv of sheet.csvs) zip.file(csv.filename, csv.content);
  return {
    filename: `${base}.zip`,
    contentType: 'application/zip',
    body: await zip.generateAsync({ type: 'nodebuffer' }),
  };
}
