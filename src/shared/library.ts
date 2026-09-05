/**
 * What the app knows about WOSG's load sheets.
 *
 * A library record is one real script that was written and run against
 * production: its header blocks, the `includeExternalDataMedia` parameters
 * exactly as they were written, and the header row of the CSV that sat next to
 * it. Records are reference knowledge, never output -- the generator reads them
 * to decide how a column is written and how the CSV is laid out, and composes a
 * fresh sheet every time (§6.3).
 */

import type { ImpexColumn } from './impex.js';
import type { ExportSelection } from './spec.js';

export type ImpexOperation = 'INSERT' | 'INSERT_UPDATE' | 'UPDATE' | 'REMOVE';

/** Which way the data flows. Export scripts produce a CSV inside SAP; imports consume one (§6.5). */
export type Direction = 'import' | 'export';

/**
 * How the CSV next to a script is laid out.
 *
 * `typeColumn` is the house convention: a leading column, headed
 * "Type (Leave Blank)", that ImpEx reads as the item type of each data row and
 * that WOSG leaves empty so the header's type applies. Its presence is what
 * `columnsOffset` is really recording -- present means 0, absent means -1 --
 * but the two are stored separately and checked against each other rather than
 * one being derived from the other, because the value that ships is copied from
 * the library, not computed (§6.3, template library §1).
 */
export interface CsvLayout {
  typeColumn: boolean;
  typeColumnLabel: string;
}

export interface ExternalCsvCall {
  file: string;
  encoding: string;
  delimiter: string;
  linesToSkip: number;
  columnsOffset: number;
}

export interface HeaderBlock {
  op: ImpexOperation;
  itemType: string;
  columns: ImpexColumn[];
  /** The CSV this block reads, when it reads one. Absent on inline and export blocks. */
  csv?: ExternalCsvCall;
  layout?: CsvLayout;
  /** The CSV's own header row as found beside the script, when one was captured. */
  csvHeaderRow?: string[];
  /**
   * Column labels aligned to `columns`, where the captured CSV header row could
   * be lined up with the header line. This is where the app's CSV labels come
   * from: WOSG's own wording ("Show Price On Site"), not a machine-readable
   * name. Null entries are columns the row did not reach.
   */
  csvLabels?: (string | null)[];
}

/**
 * What was asked for, kept on a sheet somebody saved.
 *
 * The request rather than the files, for the same reason the history keeps it:
 * opening a saved sheet regenerates it against the library as it stands now.
 */
export interface SavedSheetRequest {
  name: string;
  itemType: string;
  fields: { name: string; variant?: string; csvLabel?: string }[];
  op?: ImpexOperation;
  intent?: string;
  rows?: string[][];
  direction?: Direction;
  export?: ExportSelection;
}

export interface LibraryTemplate {
  id: string;
  /** Human name, from the source path: "Products / Site Settings / Append". */
  name: string;
  /** Path within the supplied export, kept so a record can be traced back. */
  sourcePath: string;
  /** Top-level folder: Products, Categories, Facets, Orders, Solr, Stores. */
  group: string;
  direction: Direction;
  dataSource: 'externalCsv' | 'inline';
  blocks: HeaderBlock[];
  /** Macro definitions in the order the script declared them. */
  macros: Record<string, string>;
  /**
   * Where this record came from. `seed` is the December-21 production export,
   * `user` is anything added in-app. A later phase adds `sap` for definitions
   * read from the live type system (§6.3) -- new records slot in beside these
   * without the shape changing.
   */
  origin: 'seed' | 'user' | 'sap';
  /**
   * Whether the record is known to reflect a script that imported cleanly.
   * Seed records are trusted; anything the app learns from a user's own
   * generation is not, until they say it worked.
   */
  verified: boolean;
  notes?: string;
  /** What the person who saved it wanted it remembered for. */
  description?: string;
  /** Who saved it, on a record added in the app. */
  savedBy?: string;
  /**
   * The request that produced it, on a record saved in the app. Its presence is
   * what lets the repository open a sheet again rather than only describe it -
   * the seed records have no request, because they were extracted from scripts
   * rather than generated.
   */
  savedRequest?: SavedSheetRequest;
  createdAt: string;
  updatedAt: string;
}
