/**
 * Building a specification from a request for some fields on an item type.
 *
 * Both modes come through here. The field picker passes the ticked attributes;
 * the natural-language resolver passes the attributes it worked out. Everything
 * that makes a load sheet a WOSG load sheet rather than a bare list of columns -
 * the key it is matched on, the `$catalogVersion` that closes the header line,
 * the CSV layout and the `columnsOffset` that goes with it - is taken from the
 * library rather than decided here.
 */

import type { Direction, ImpexOperation, LibraryTemplate } from '../../shared/library.js';
import type { ImpexColumn } from '../../shared/impex.js';
import type { ExportSelection, LoadSheetSpec, SpecBlock, SpecColumn } from '../../shared/spec.js';
import type { Catalogue } from './catalogue.js';
import { houseStyle } from './houseStyle.js';
import { closestTemplate, csvConventions, type TemplateMatch } from './matching.js';
import { slugForFiles } from './generate.js';

export interface FieldRequest {
  /** Attribute name as the user picked or wrote it. */
  name: string;
  /** Which observed shape to use, when the picker offered a choice (append vs remove, say). */
  variant?: string;
  csvLabel?: string;
  /** Set when the caller already knows the library does not have this attribute. */
  unverified?: boolean;
}

export interface ComposeRequest {
  name: string;
  itemType: string;
  fields: FieldRequest[];
  direction?: Direction;
  op?: ImpexOperation;
  intent?: string;
  rows?: string[][];
  /** How an export picks its rows (§6.5). Its presence makes this an export. */
  export?: ExportSelection;
  /** Override the template whose conventions are copied. Otherwise the closest match wins. */
  templateId?: string;
}

export interface ComposeContext {
  catalogue: Catalogue;
  templates: LibraryTemplate[];
}

function toSpecColumn(field: FieldRequest, itemType: string, catalogue: Catalogue): SpecColumn {
  const entry = catalogue.find(itemType, field.name);
  return {
    kind: field.name.startsWith('$') ? 'macro' : field.name.startsWith('&') ? 'documentId' : 'attribute',
    name: entry?.attribute ?? field.name,
    ...(field.variant ? { variant: field.variant } : {}),
    ...(field.csvLabel ? { csvLabel: field.csvLabel } : {}),
    ...(entry === undefined || field.unverified ? { unverified: true } : {}),
  };
}

function fromLibraryColumn(column: ImpexColumn): SpecColumn {
  return {
    kind: column.kind,
    name: column.name,
    ...(column.qualifier !== undefined ? { qualifier: column.qualifier } : {}),
    modifiers: column.modifiers,
  };
}

/**
 * The columns a script of this kind opens with: everything up to and including
 * the last column the matched block keys on. For Product that is
 * `code[unique=true]`; for VariantProduct it is the parent reference and the
 * variant's own code, which is the pair that identifies a variant.
 */
function keyColumns(match: TemplateMatch | undefined, style: ReturnType<typeof houseStyle>): SpecColumn[] {
  if (match) {
    const columns = match.block.columns;
    const lastUnique = columns.reduce(
      (last, column, index) => (column.modifiers.some((m) => m.name.toLowerCase() === 'unique') ? index : last),
      -1,
    );
    if (lastUnique >= 0) return columns.slice(0, lastUnique + 1).map(fromLibraryColumn);
  }
  return style.key.map(fromLibraryColumn);
}

/** The macro columns a script closes with: `$catalogVersion`, and sometimes `$unit` and `$approved`. */
function trailingMacroColumns(match: TemplateMatch | undefined, style: ReturnType<typeof houseStyle>): SpecColumn[] {
  const columns = match
    ? (() => {
        const trailing: ImpexColumn[] = [];
        for (let i = match.block.columns.length - 1; i >= 0; i--) {
          const column = match.block.columns[i]!;
          if (column.kind !== 'macro') break;
          trailing.unshift(column);
        }
        return trailing;
      })()
    : style.trailingMacros;
  return columns.map((column) => ({ kind: 'macro' as const, name: column.name, modifiers: [] }));
}

function sameColumn(a: SpecColumn, b: SpecColumn): boolean {
  return a.kind === b.kind && a.name.toLowerCase() === b.name.toLowerCase();
}

export function composeSpec(request: ComposeRequest, context: ComposeContext): LoadSheetSpec {
  const direction = request.direction ?? (request.export ? 'export' : 'import');
  const attributes = request.fields.map((f) => f.name);
  const found = request.templateId
    ? matchNamedTemplate(context.templates, request.templateId, request.itemType)
    : closestTemplate(context.templates, {
        itemType: request.itemType,
        direction,
        attributes,
        needsCsv: direction === 'import',
      });

  // A match that shares no attribute with the request is not a match, it is
  // whatever sorted first. Copying its layout, its offset or its trailing
  // macros would be copying at random, so the house style stands in.
  const match = found && (request.templateId || found.shared.length > 0) ? found : undefined;
  const style = houseStyle(context.templates, request.itemType, direction);

  const key = keyColumns(match, style);
  const chosen = request.fields.map((field) => toSpecColumn(field, request.itemType, context.catalogue));
  const middle = chosen.filter((column) => !key.some((k) => sameColumn(k, column)));
  const trailing = trailingMacroColumns(match, style).filter(
    (macro) => ![...key, ...middle].some((column) => sameColumn(macro, column)),
  );
  /*
   * An export puts `$catalogVersion` in front of the key, and always has one.
   *
   * From the known-good export in `docs/wosg-export-script.md`:
   *   INSERT_UPDATE Product;$catalogVersion;code[unique=true];virtualStockOnSite(uid)
   *
   * It is not decoration. A Product is identified by its code *and* its
   * catalog version, so a header line declaring only `code[unique=true]`
   * cannot identify the rows the query found - and an export whose header
   * cannot identify its rows is the one that came back from HAC having failed
   * with nothing to say. It also declares the macros, which is what gives the
   * query its catalog restriction; without it an export ran across every
   * catalog version at once.
   */
  const exportCatalogVersion: SpecColumn[] =
    direction === 'export' && ![...key, ...middle, ...trailing].some((c) => /catalogversion/i.test(c.name))
      ? [{ kind: 'macro', name: '$catalogVersion', modifiers: [] }]
      : [];
  const columns = [...exportCatalogVersion, ...key, ...middle, ...trailing];

  const conventions = csvConventions(match);
  const block: SpecBlock = {
    op: request.op ?? match?.block.op ?? 'INSERT_UPDATE',
    itemType: request.itemType,
    columns,
    ...(direction === 'import'
      ? {
          csv: {
            file: `${slugForFiles(request.name)}.csv`,
            encoding: conventions.encoding,
            delimiter: conventions.delimiter,
            linesToSkip: conventions.linesToSkip,
            columnsOffset: conventions.columnsOffset,
            ...(conventions.from ? { columnsOffsetFrom: conventions.from } : {}),
            layout: conventions.layout,
          },
        }
      : {}),
    ...(request.rows ? { rows: request.rows } : {}),
  };

  return {
    name: request.name,
    direction,
    ...(match ? { basedOnTemplateId: match.template.id } : {}),
    macros: {},
    blocks: [block],
    ...(request.intent ? { intent: request.intent } : {}),
    ...(request.export ? { export: request.export } : {}),
  };
}

function matchNamedTemplate(
  templates: LibraryTemplate[],
  templateId: string,
  itemType: string,
): TemplateMatch | undefined {
  const template = templates.find((t) => t.id === templateId);
  if (!template) return undefined;
  const blockIndex = template.blocks.findIndex((b) => b.itemType.toLowerCase() === itemType.toLowerCase());
  const index = blockIndex === -1 ? 0 : blockIndex;
  const block = template.blocks[index];
  if (!block) return undefined;
  return { template, block, blockIndex: index, score: Number.POSITIVE_INFINITY, shared: [] };
}
