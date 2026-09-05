import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { NotPackageableError, packageLoadSheet, unverifiedColumns } from '../domain/packageSheet.js';
import { isResolverConfigured, type Resolver } from '../integrations/anthropic.js';
import { learnFromSheet } from '../services/libraryLearn.js';
import { resolveDescription } from '../services/resolveService.js';
import { generateFromRequest, sheetRequestSchema } from '../services/sheetService.js';

const describeSchema = z.object({ description: z.string().trim().min(3).max(4000) });

/** `resolver` is injectable so the routes can be driven in tests without calling the model. */
export function sheetRoutes(db: Db, resolver?: Resolver): Router {
  const router = Router();

  router.get('/modes', (_req, res) => {
    // Mode A needs a key; without one the field picker still works, and the UI
    // says why rather than offering a box that fails.
    res.json({ describe: isResolverConfigured() || resolver !== undefined });
  });

  router.post('/describe', async (req, res) => {
    const parsed = describeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Describe what the load sheet should do.' });
      return;
    }
    if (!isResolverConfigured() && !resolver) {
      res.status(503).json({ error: 'Describing a load sheet needs ANTHROPIC_API_KEY to be set on the server.' });
      return;
    }
    const resolution = await resolveDescription(db, parsed.data.description, resolver);
    res.json(resolution);
  });

  router.post('/learn', async (req, res) => {
    const parsed = sheetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'That request does not make sense', detail: parsed.error.issues });
      return;
    }
    const result = await learnFromSheet(db, parsed.data);
    res.json(result);
  });

  router.post('/preview', async (req, res) => {
    const parsed = sheetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'That request does not make sense', detail: parsed.error.issues });
      return;
    }
    const sheet = await generateFromRequest(db, parsed.data);
    res.json({
      impex: sheet.impex,
      csvs: sheet.csvs,
      findings: sheet.findings,
      summary: sheet.summary,
      packageable: sheet.packageable,
      basedOn: sheet.basedOn ?? null,
      unverified: unverifiedColumns(sheet),
      // The columns as they will actually be written, so the screen can line a
      // paste up against them rather than working out for itself which ones the
      // generator adds - the key is one column on Product and two on
      // VariantProduct, and guessing that wrong shifts every pasted value.
      columns: sheet.resolved.blocks[0]?.columns.map((column) => ({
        attribute: column.column.name,
        expression: column.expression,
        label: column.label,
        type: column.shape.type,
        status: column.status,
        suggestions: column.suggestions ?? [],
        role: column.column.kind === 'macro' ? 'macro' : column.unique ? 'key' : 'field',
        chosen: parsed.data.fields.some((field) => field.name.toLowerCase() === column.column.name.toLowerCase()),
      })),
    });
  });

  router.post('/package', async (req, res) => {
    const parsed = sheetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'That request does not make sense', detail: parsed.error.issues });
      return;
    }
    const sheet = await generateFromRequest(db, parsed.data);
    try {
      const bundle = await packageLoadSheet(sheet, { confirmedUnverified: parsed.data.confirmedUnverified });
      res.setHeader('Content-Type', bundle.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${bundle.filename}"`);
      res.send(bundle.body);
    } catch (err) {
      if (err instanceof NotPackageableError) {
        // Refusing here rather than shipping a zip that dies in HAC an hour later.
        res.status(422).json({ error: err.message, findings: err.findings });
        return;
      }
      throw err;
    }
  });

  return router;
}
