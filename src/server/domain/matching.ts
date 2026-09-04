/**
 * Finding the library template a new load sheet most resembles.
 *
 * Its job is to answer one question the generator must not answer for itself:
 * how is the CSV laid out, and therefore what `columnsOffset` goes in the
 * `includeExternalDataMedia` call. The template library doc is explicit that
 * this value is not derivable - the existing scripts are not self-consistent
 * about it - so it is copied from the closest script WOSG actually ran, and
 * checked afterwards against the CSV that was written (§6.3).
 */

import type { CsvLayout, Direction, HeaderBlock, LibraryTemplate } from '../../shared/library.js';

export interface TemplateMatch {
  template: LibraryTemplate;
  block: HeaderBlock;
  blockIndex: number;
  score: number;
  /** Attribute names shared with the request, which is most of why it scored. */
  shared: string[];
}

export interface MatchRequest {
  itemType: string;
  direction: Direction;
  attributes: string[];
  /** Only consider templates that read an external CSV, when the sheet needs one. */
  needsCsv?: boolean;
}

/**
 * The house convention, used when nothing in the library matches: a leading
 * type column left blank, comma delimited, one header line skipped, offset 0.
 * That is 56 of the 59 external-CSV scripts in the seed set.
 */
export const HOUSE_CSV_CONVENTION = {
  encoding: 'UTF-8',
  delimiter: ',',
  linesToSkip: 1,
  columnsOffset: 0,
  layout: { typeColumn: true, typeColumnLabel: 'Type (Leave Blank)' } satisfies CsvLayout,
};

export function closestTemplate(templates: LibraryTemplate[], request: MatchRequest): TemplateMatch | undefined {
  const wanted = new Set(request.attributes.map((a) => a.toLowerCase()));
  const matches: TemplateMatch[] = [];

  for (const template of templates) {
    if (template.direction !== request.direction) continue;
    template.blocks.forEach((block, blockIndex) => {
      if (block.itemType.toLowerCase() !== request.itemType.toLowerCase()) return;
      if (request.needsCsv && !block.csv) return;

      const names = block.columns.filter((c) => c.kind === 'attribute').map((c) => c.name.toLowerCase());
      const shared = [...new Set(names.filter((n) => wanted.has(n)))];
      const union = new Set([...names, ...wanted]);
      // Jaccard overlap, so a sheet is not matched to the 43-column master
      // loadsheet just because the master happens to contain its two fields.
      const overlap = union.size === 0 ? 0 : shared.length / union.size;
      const score =
        overlap * 100 +
        shared.length +
        (template.origin === 'seed' ? 2 : 0) +
        (template.verified ? 1 : 0) +
        (block.csvLabels ? 1 : 0);
      matches.push({ template, block, blockIndex, score, shared });
    });
  }

  matches.sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id));
  return matches[0];
}

export interface CsvConventions {
  encoding: string;
  delimiter: string;
  linesToSkip: number;
  columnsOffset: number;
  layout: CsvLayout;
  /** The template the offset and layout were copied from, or undefined for the house default. */
  from?: string;
}

/**
 * The CSV conventions to generate under. Both the offset and the layout come
 * from the same matched block, together: an offset copied from one script and a
 * layout guessed from another is exactly the mismatch that fails at import.
 */
export function csvConventions(match: TemplateMatch | undefined): CsvConventions {
  const csv = match?.block.csv;
  const layout = match?.block.layout;
  if (!csv || !layout) return { ...HOUSE_CSV_CONVENTION };
  return {
    encoding: csv.encoding,
    delimiter: csv.delimiter,
    linesToSkip: csv.linesToSkip,
    columnsOffset: csv.columnsOffset,
    layout,
    from: match!.template.id,
  };
}
