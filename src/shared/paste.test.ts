import { describe, expect, it } from 'vitest';
import { alignPastedRows } from './paste.js';

const labels = ['SKU', 'Meta Description', 'Meta Keywords'];

describe('lining a paste up with the columns', () => {
  it('reads what Excel puts on the clipboard', () => {
    const result = alignPastedRows('17331268\tA description\tsome, keywords', labels);
    expect(result.rows).toEqual([['17331268', 'A description', 'some, keywords']]);
    expect(result.notes).toContain('Read as tab-separated, the way Excel pastes.');
  });

  it('drops a pasted heading row rather than loading it as data', () => {
    const text = 'SKU,Meta Description,Meta Keywords\n17331268,A description,keywords';
    const result = alignPastedRows(text, labels);
    expect(result.rows).toEqual([['17331268', 'A description', 'keywords']]);
    expect(result.notes).toContain('Dropped the pasted heading row.');
  });

  it('drops the leading blank type column when a whole sheet was copied', () => {
    // Every value would otherwise land one column left - the same failure as a
    // wrong columnsOffset, reached from the other end.
    const text = ',17331268,A description,keywords\n,17331097,Another,more';
    const result = alignPastedRows(text, labels);
    expect(result.rows[0]).toEqual(['17331268', 'A description', 'keywords']);
    expect(result.notes.join(' ')).toContain('leading blank type column');
  });

  it('keeps a leading column that holds data', () => {
    const text = 'Product,17331268,A description\nProduct,17331097,Another';
    const result = alignPastedRows(text, labels);
    expect(result.rows[0]).toEqual(['Product', '17331268', 'A description']);
    expect(result.notes.join(' ')).not.toContain('leading blank');
  });

  it('recognises a heading row whose wording is not quite the same', () => {
    // The headings people paste come from the CSV they were sent, and WOSG's
    // own wording drifts around the same field. Read as data, a row of column
    // names is a row SAP tries to import.
    const text =
      'SKU\tHome Delivery Available on site - Append\n17331268\tWatchesOfSwitzerland_UK';
    const result = alignPastedRows(text, ['SKU', 'Home Delivery Available on site']);
    expect(result.rows).toEqual([['17331268', 'WatchesOfSwitzerland_UK']]);
    expect(result.notes).toContain('Dropped the pasted heading row.');
  });

  it('reports rows of the wrong width rather than padding them', () => {
    const result = alignPastedRows('17331268,A description\n17331097,Another,keywords', labels);
    expect(result.ragged).toBe(1);
    expect(result.rows).toHaveLength(2);
  });

  it('keeps a leading empty cell, which is a column, not whitespace', () => {
    // Trimming the paste would eat the first row's empty type-column cell and
    // shift that row one column left while leaving the others alone - a
    // one-row-off error that looks like a typo in the data.
    const text = '\t17331268\tA description\tkeywords\n\t17331097\tAnother\tmore';
    const result = alignPastedRows(text, labels);
    expect(result.rows).toEqual([
      ['17331268', 'A description', 'keywords'],
      ['17331097', 'Another', 'more'],
    ]);
    expect(result.ragged).toBe(0);
  });

  it('ignores blank lines at the end of a paste', () => {
    expect(alignPastedRows('17331268,A,B\n\n\n', labels).rows).toHaveLength(1);
  });
});
