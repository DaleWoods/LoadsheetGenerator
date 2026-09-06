import { describe, expect, it } from 'vitest';
import { readIncludeCall } from './impex.js';

describe('reading the include call back out of a finished script', () => {
  it('reads the file, encoding, delimiter and offset the script actually says', () => {
    const script = `INSERT_UPDATE Product;code[unique=true];syncToSite(uid)[mode=append]
"#% impex.includeExternalDataMedia( ""GoldsmithsDisplayOnSite.csv"", ""UTF-8"", ',', 1, 0);"`;
    expect(readIncludeCall(script)).toEqual({
      file: 'GoldsmithsDisplayOnSite.csv',
      encoding: 'UTF-8',
      delimiter: ',',
      linesToSkip: 1,
      columnsOffset: 0,
    });
  });

  it('reads a negative offset, which is half of what makes an import work', () => {
    const script = `"#% impex.includeExternalDataMedia( ""X.csv"", ""UTF-8"", ',', 1, -1);"`;
    expect(readIncludeCall(script)?.columnsOffset).toBe(-1);
  });

  it('returns nothing for a script that reads no file', () => {
    expect(readIncludeCall('INSERT_UPDATE Product;code[unique=true]')).toBeNull();
  });
});
