/**
 * Checking what the model said before anything is built from it.
 *
 * This is the layer the brief asks for: Mode A produces a specification, and
 * between the model and the generator sits something that verifies every part
 * of it against the library. The model's own claim about whether an attribute
 * exists is not taken at face value - the catalogue is asked. An item type it
 * invented is refused outright; an attribute it invented generates, flagged
 * unverified, with the near-misses surfaced as a question rather than silently
 * corrected.
 */

import type { Db } from '../db/index.js';
import type { Catalogue } from '../domain/catalogue.js';
import { resolveWithClaude, type Resolver } from '../integrations/anthropic.js';
import { loadLibrary } from './libraryService.js';
import type { SheetRequest } from './sheetService.js';

export interface ResolvedField {
  attribute: string;
  variant?: string;
  /** Why the model put it in the sheet, for the summary panel. */
  why: string;
  /** The app's verdict, not the model's. */
  known: boolean;
  /** Known attribute names an unknown one is close to. */
  suggestions: string[];
}

export interface Resolution {
  /** Ready to hand to the generator, or null when the request needs a question answered first. */
  request: SheetRequest | null;
  fields: ResolvedField[];
  summary: string;
  /** A question back to the user, when the request could not be resolved. */
  clarification: string | null;
  /** What the app changed or refused to take from the model's answer. */
  notes: string[];
}

function findItemType(catalogue: Catalogue, wanted: string): string | undefined {
  return catalogue.itemTypes.find((type) => type.itemType.toLowerCase() === wanted.trim().toLowerCase())?.itemType;
}

export async function resolveDescription(
  db: Db,
  description: string,
  resolver: Resolver = resolveWithClaude,
): Promise<Resolution> {
  const library = await loadLibrary(db);
  const { resolution } = await resolver({ description, catalogue: library.catalogue });
  const notes: string[] = [];

  if (resolution.clarification) {
    return {
      request: null,
      fields: [],
      summary: resolution.summary,
      clarification: resolution.clarification,
      notes,
    };
  }

  // An item type is not something the app can generate for on trust: the key,
  // the CSV layout and the offset all come from templates for that type, and
  // there would be none.
  const itemType = findItemType(library.catalogue, resolution.itemType);
  if (!itemType) {
    return {
      request: null,
      fields: [],
      summary: resolution.summary,
      clarification: `I could not match "${resolution.itemType}" to an item type the library knows. The ones it has are ${library.catalogue.itemTypes
        .map((type) => type.itemType)
        .join(', ')}. Which of those is this?`,
      notes,
    };
  }
  if (itemType !== resolution.itemType) notes.push(`Read "${resolution.itemType}" as ${itemType}.`);

  const fields: ResolvedField[] = [];
  for (const field of resolution.fields) {
    const entry = library.catalogue.find(itemType, field.attribute);

    // The key is written by the generator; a model that includes it anyway
    // would otherwise produce the same column twice.
    if (entry?.keyColumn) {
      notes.push(`Left out ${entry.attribute}: it is the key, and the generator writes it.`);
      continue;
    }
    // The same attribute twice is only a duplicate when it is the same column
    // twice. A localized field in two languages is two columns - the house
    // convention writes them `description[lang=$lang]` then
    // `description[lang=$lang2]` - and keying this on the name alone dropped
    // the second one, so a sheet asked for in UK and US English came out with
    // only the UK column and a note saying so.
    if (
      fields.some(
        (existing) =>
          existing.attribute.toLowerCase() === field.attribute.toLowerCase() &&
          (existing.variant ?? '') === (field.variant ?? ''),
      )
    ) {
      notes.push(`Left out a second copy of ${field.attribute}.`);
      continue;
    }

    // A shape is only accepted if the library has actually written it that way.
    const variant = entry?.variants.find((candidate) => candidate.signature === field.variant)?.signature;
    if (field.variant && !variant) {
      notes.push(`Ignored a shape for ${field.attribute} that the library has not used; took the usual one instead.`);
    }

    if (entry && !field.inCatalogue) {
      notes.push(`${entry.attribute} is in the library after all.`);
    }
    if (!entry && field.inCatalogue) {
      // The model believed it was quoting the catalogue. It was not, and the
      // app says so rather than passing the claim on.
      notes.push(`${field.attribute} was offered as a known attribute but is not in the library.`);
    }

    fields.push({
      attribute: entry?.attribute ?? field.attribute,
      ...(variant ? { variant } : {}),
      why: field.why,
      known: entry !== undefined,
      suggestions: entry ? [] : library.catalogue.suggest(itemType, field.attribute),
    });
  }

  if (fields.length === 0) {
    return {
      request: null,
      fields: [],
      summary: resolution.summary,
      clarification: 'I could not work out which fields this load sheet should set. Which attributes should it write?',
      notes,
    };
  }

  const rows = resolution.rows ?? undefined;
  if (rows && rows.length > 0) notes.push(`Took ${rows.length} row${rows.length === 1 ? '' : 's'} from your description.`);

  // An export needs to say which records to pull, and the app will not invent
  // that: without it there is nothing to generate but a query over everything.
  const isExport = resolution.direction === 'export';
  const selection = resolution.exportSelection;
  if (isExport && !selection) {
    return {
      request: null,
      fields,
      summary: resolution.summary,
      clarification: 'Which records should the export pull - a list of codes, or a pattern to match?',
      notes,
    };
  }

  return {
    request: {
      name: resolution.name.trim() || `${itemType} Load Sheet`,
      itemType,
      fields: fields.map((field) => ({ name: field.attribute, ...(field.variant ? { variant: field.variant } : {}) })),
      op: resolution.operation,
      intent: description.trim(),
      ...(rows && rows.length > 0 && !isExport ? { rows } : {}),
      ...(isExport && selection
        ? {
            direction: 'export' as const,
            export: {
              kind: selection.kind,
              ...(selection.codes.length > 0 ? { codes: selection.codes } : {}),
              ...(selection.pattern ? { pattern: selection.pattern } : {}),
              ...(selection.attribute ? { attribute: selection.attribute } : {}),
            },
          }
        : {}),
    },
    fields,
    summary: resolution.summary,
    clarification: null,
    notes,
  };
}
