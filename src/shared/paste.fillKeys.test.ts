import { describe, expect, it } from 'vitest';
import { fillKeys, parseCodeList } from './paste.js';

describe('putting a list of SKUs against values the sheet already has', () => {
  const rows = [
    ['', 'Goldsmiths_UK'],
    ['', 'Goldsmiths_UK'],
    ['', 'Goldsmiths_UK'],
  ];

  it('writes each code into the key column and keeps the rest of the row', () => {
    expect(fillKeys(rows, ['17331268', '17331097', '17331228'])).toEqual([
      ['17331268', 'Goldsmiths_UK'],
      ['17331097', 'Goldsmiths_UK'],
      ['17331228', 'Goldsmiths_UK'],
    ]);
  });

  it('carries the values on past the rows that were there', () => {
    // "For 10 SKUs" gave three rows and the user has five. The value is the
    // point of the sheet, so it goes down all five rather than stopping short.
    expect(fillKeys(rows, ['a', 'b', 'c', 'd', 'e'])).toHaveLength(5);
    expect(fillKeys(rows, ['a', 'b', 'c', 'd', 'e'])[4]).toEqual(['e', 'Goldsmiths_UK']);
  });

  it('drops rows nobody named a record for', () => {
    // A row with no key cannot import, so five rows and two SKUs is two rows.
    expect(fillKeys(rows, ['a', 'b'])).toEqual([
      ['a', 'Goldsmiths_UK'],
      ['b', 'Goldsmiths_UK'],
    ]);
  });

  it('leaves the rows alone when there is nothing to put in them', () => {
    expect(fillKeys(rows, [])).toEqual(rows);
    expect(fillKeys(rows, ['   ', ''])).toEqual(rows);
  });

  it('reads a code list however it was pasted', () => {
    expect(parseCodeList('17331268\n17331097\r\n17331228')).toEqual(['17331268', '17331097', '17331228']);
    expect(parseCodeList('17331268, 17331097 ; 17331228')).toEqual(['17331268', '17331097', '17331228']);
    expect(parseCodeList('  \n \n ')).toEqual([]);
  });
});
