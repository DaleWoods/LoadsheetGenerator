/**
 * One request in, one generated load sheet out.
 *
 * Preview and download go through the same call, so what somebody checks on
 * screen is byte-for-byte what they download - there is no second generation
 * between looking and getting.
 */

import { z } from 'zod';
import type { Db } from '../db/index.js';
import { composeSpec, type ComposeRequest } from '../domain/compose.js';
import { generateLoadSheet, type GeneratedLoadSheet } from '../domain/generate.js';
import { loadLibrary } from './libraryService.js';

/**
 * Zod strips what it does not declare, so a field added to the form has to be
 * added here too or it is silently dropped on the way in.
 */
export const sheetRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  itemType: z.string().trim().min(1).max(120),
  fields: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        variant: z.string().max(500).optional(),
        csvLabel: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(200),
  op: z.enum(['INSERT', 'INSERT_UPDATE', 'UPDATE', 'REMOVE']).optional(),
  direction: z.enum(['import', 'export']).optional(),
  intent: z.string().max(2000).optional(),
  templateId: z.string().max(200).optional(),
  rows: z.array(z.array(z.string())).max(50000).optional(),
  /** Set by the download button once the user has ticked the unverified confirmation. */
  confirmedUnverified: z.boolean().optional(),
});

export type SheetRequest = z.infer<typeof sheetRequestSchema>;

export interface SheetResult extends GeneratedLoadSheet {
  /** The library template the conventions came from, for the summary panel. */
  basedOn?: { id: string; name: string };
}

export async function generateFromRequest(db: Db, request: SheetRequest): Promise<SheetResult> {
  const context = await loadLibrary(db);
  const spec = composeSpec(request as ComposeRequest, context);
  const sheet = generateLoadSheet(spec, context);
  const template = context.templates.find((t) => t.id === spec.basedOnTemplateId);
  return { ...sheet, ...(template ? { basedOn: { id: template.id, name: template.name } } : {}) };
}
