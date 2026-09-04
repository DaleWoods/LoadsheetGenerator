/**
 * The specification object.
 *
 * Both input modes end here: the field picker builds one directly, and the
 * natural-language mode resolves a sentence into one. Nothing downstream reads
 * the user's words or the model's prose -- the generator only ever sees this.
 * That is the point: a column arrives as an attribute name plus options that
 * were checked against the library, so a modifier the model invented has
 * somewhere to be caught before it reaches a header line (§6.1).
 */

import type { Modifier } from './impex.js';
import type { CsvLayout, Direction, ImpexOperation } from './library.js';

export interface SpecColumn {
  kind: 'attribute' | 'macro' | 'documentId';
  /** Attribute name (`akamaiImageCount`), macro reference (`$catalogVersion`), or document id (`&addrID`). */
  name: string;
  /**
   * Which of the shapes the library has seen for this attribute to use, by
   * signature. Absent means "the one WOSG uses most often for this item type".
   */
  variant?: string;
  /** Overrides applied on top of the library's shape. Left alone, the library wins. */
  qualifier?: string;
  modifiers?: Modifier[];
  /** Column heading in the CSV. Falls back to WOSG's own wording from the library. */
  csvLabel?: string;
  /** Set by the resolver when the attribute is not in the library, never by the caller. */
  unverified?: boolean;
  /** Why this column is here -- shown in the summary, not written into the script. */
  note?: string;
}

export interface SpecCsv {
  file: string;
  encoding: string;
  delimiter: string;
  linesToSkip: number;
  /**
   * Copied from the library template named in `columnsOffsetFrom`, never
   * derived. Getting this wrong is what broke the See More Styles import
   * (§6.3); the validator re-checks it against the CSV that was actually
   * written rather than trusting either value on its own.
   */
  columnsOffset: number;
  columnsOffsetFrom?: string;
  layout: CsvLayout;
}

export interface SpecBlock {
  op: ImpexOperation;
  itemType: string;
  columns: SpecColumn[];
  /** Absent for an inline block or an export. */
  csv?: SpecCsv;
  /**
   * Data rows, one array of cells per row, aligned to `columns` -- the type
   * column is not included, the writer adds it. Empty means the user is
   * downloading a template to fill in outside the app (§6.2).
   */
  rows?: string[][];
}

export interface ExportSelection {
  /** How the export picks its rows (§6.5). */
  kind: 'skuList' | 'skuWildcard' | 'attributeWildcard';
  /** For `skuList`: the product codes to pull. */
  codes?: string[];
  /** For the wildcard kinds: the pattern, and for `attributeWildcard` the attribute to match on. */
  pattern?: string;
  attribute?: string;
  /** Name of the CSV the script writes inside SAP Commerce. */
  targetFile?: string;
}

export interface LoadSheetSpec {
  /** Used for the file names and shown in history. */
  name: string;
  direction: Direction;
  /** The library record the conventions were taken from, above all `columnsOffset`. */
  basedOnTemplateId?: string;
  /** Macro definitions to declare, in order. The generator prunes unused ones. */
  macros: Record<string, string>;
  blocks: SpecBlock[];
  /** Plain-English description of what was asked for, carried into the script header. */
  intent?: string;
  export?: ExportSelection;
}
