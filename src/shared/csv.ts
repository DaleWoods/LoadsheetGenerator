/**
 * CSV reading and writing.
 *
 * Small on purpose: the app writes the CSVs it validates, and reads back
 * either its own output or rows a user pasted in. Quoting follows RFC 4180,
 * which is what Excel and SAP Commerce both expect.
 */

export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    if (ch === '\r' && text[i + 1] === '\n') {
      endRow();
      i += 2;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // A file ending in a newline has no trailing empty row; one ending mid-row does.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

export function csvCell(value: string, delimiter = ','): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value !== value.trim();
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CRLF line endings: these files are opened in Excel before they are uploaded. */
export function writeCsv(rows: string[][], delimiter = ','): string {
  return rows.map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}
