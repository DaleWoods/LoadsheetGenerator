import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { addressOf, record as audit } from '../services/auditService.js';
import { NotPackageableError, packageLoadSheet, unverifiedColumns } from '../domain/packageSheet.js';
import { isResolverConfigured, type Resolver } from '../integrations/anthropic.js';
import { saveToRepository } from '../services/repositoryService.js';
import { failuresLike, getEntry, listHistory, record, reportFailure } from '../services/historyService.js';
import { resolveDescription } from '../services/resolveService.js';
import { generateFromRequest, sheetRequestSchema } from '../services/sheetService.js';

const describeSchema = z.object({ description: z.string().trim().min(3).max(4000) });
const failureSchema = z.object({
  id: z.string().min(1).max(200),
  note: z.string().trim().min(3).max(4000),
});

const saveSchema = z.object({
  request: sheetRequestSchema,
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(600).optional(),
  /** Ticked when the user has run it and it imported cleanly. */
  imported: z.boolean().optional(),
});

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
    if (req.user) {
      void audit(db, {
        userId: req.user.id,
        username: req.user.username,
        action: 'sheet.described',
        summary: `${req.user.displayName} described a load sheet: ${resolution.summary}`,
        detail: {
          asked: parsed.data.description,
          ...(resolution.request ? { itemType: resolution.request.itemType, fields: resolution.request.fields.map((f) => f.name) } : {}),
          ...(resolution.clarification ? { clarification: resolution.clarification } : {}),
          notes: resolution.notes,
        },
        ip: addressOf(req),
      });
    }
    res.json(resolution);
  });

  router.get('/history', async (req, res) => {
    const mine = req.query.mine === 'true';
    res.json({
      history: await listHistory(db, mine && req.user ? { username: req.user.username } : {}),
    });
  });

  router.get('/history/:id', async (req, res) => {
    const entry = await getEntry(db, req.params.id ?? '');
    if (!entry) {
      res.status(404).json({ error: 'No such load sheet in the history.' });
      return;
    }
    res.json({ entry });
  });

  // Putting a sheet on the repository shelf. Saving keeps it for reuse; saying
  // it imported cleanly additionally makes it evidence the catalogue trusts.
  router.post('/save', async (req, res) => {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'That request does not make sense', detail: parsed.error.issues });
      return;
    }
    const result = await saveToRepository(db, {
      request: parsed.data.request,
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.imported !== undefined ? { imported: parsed.data.imported } : {}),
      ...(req.user ? { savedBy: req.user.username } : {}),
    });
    if (req.user) {
      const sheet = await generateFromRequest(db, parsed.data.request);
      await record(db, {
        request: parsed.data.request,
        summary: `Saved to the repository${result.learned.length > 0 ? `, and ${result.learned.join(', ')} is now known` : ''}`,
        filename: sheet.impex.filename,
        direction: sheet.resolved.direction,
        rowCount: sheet.resolved.blocks[0]?.rows.length ?? 0,
        outcome: 'learned',
        user: req.user,
      });
      void audit(db, {
        userId: req.user.id,
        username: req.user.username,
        action: 'sheet.saved',
        summary:
          `${req.user.displayName} saved ${sheet.impex.filename} to the repository` +
          (parsed.data.imported ? ', marked as imported cleanly' : ''),
        detail: {
          filename: sheet.impex.filename,
          itemType: parsed.data.request.itemType,
          imported: parsed.data.imported === true,
          // Saying it imported cleanly is what promotes a sheet to evidence,
          // so it is the part of this worth being able to trace back.
          learned: result.learned,
          ...(parsed.data.description ? { note: parsed.data.description } : {}),
        },
        ip: addressOf(req),
      });
    }
    res.status(201).json(result);
  });

  router.post('/preview', async (req, res) => {
    const parsed = sheetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'That request does not make sense', detail: parsed.error.issues });
      return;
    }
    const sheet = await generateFromRequest(db, parsed.data);

    /*
     * A sheet with exactly these fields on this item type has failed in HAC
     * before. Said as a finding rather than a separate panel, because it
     * belongs with everything else somebody checks before downloading - and it
     * is the one finding the app could not work out for itself.
     */
    const failures = await failuresLike(
      db,
      parsed.data.itemType,
      parsed.data.fields.map((field) => field.name),
    );
    const findings = [
      ...sheet.findings,
      ...failures.slice(0, 1).map((failure) => ({
        severity: 'warning' as const,
        code: 'history.failedBefore',
        message:
          `A sheet with these fields was reported as failing in SAP Commerce on ` +
          `${new Date(failure.at).toLocaleDateString('en-GB')}: ${failure.note}`,
      })),
    ];

    res.json({
      impex: sheet.impex,
      csvs: sheet.csvs,
      findings,
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

  // Reporting that a sheet failed after it left the app. The other half of the
  // "it imported cleanly" tick, and the more useful one: success only confirms
  // what the app already believed, where a failure is something it did not know.
  router.post('/failed', async (req, res) => {
    const parsed = failureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Say which sheet failed and what SAP Commerce said.' });
      return;
    }
    const entry = await reportFailure(db, parsed.data.id, parsed.data.note.trim());
    if (!entry) {
      res.status(404).json({ error: 'No such load sheet in the history.' });
      return;
    }
    if (req.user) {
      void audit(db, {
        userId: req.user.id,
        username: req.user.username,
        action: 'sheet.failed',
        summary: `${req.user.displayName} reported ${entry.filename} as failing in HAC`,
        detail: {
          filename: entry.filename,
          itemType: entry.itemType,
          fields: entry.request.fields.map((field) => field.name),
          message: parsed.data.note.trim(),
        },
        ip: addressOf(req),
      });
    }
    res.json({ entry });
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
      // Recorded here rather than on preview: a preview happens on every
      // keystroke, a download is somebody deciding to use the thing (§6.7).
      if (req.user) {
        await record(db, {
          request: parsed.data,
          summary: sheet.summary,
          filename: bundle.filename,
          direction: sheet.resolved.direction,
          rowCount: sheet.resolved.blocks[0]?.rows.length ?? 0,
          outcome: 'downloaded',
          user: req.user,
        });
        // The audit record is the other half: history says what was built so it
        // can be built again, this says who took it. A downloaded sheet is the
        // one thing here that reaches production.
        void audit(db, {
          userId: req.user.id,
          username: req.user.username,
          action: 'sheet.downloaded',
          summary: `${req.user.displayName} downloaded ${bundle.filename}`,
          detail: {
            filename: bundle.filename,
            itemType: parsed.data.itemType,
            direction: sheet.resolved.direction,
            fields: parsed.data.fields.map((field) => field.name),
            rows: sheet.resolved.blocks[0]?.rows.length ?? 0,
            unverified: sheet.resolved.blocks.flatMap((b) => b.columns.filter((c) => c.status === 'unverified').map((c) => c.column.name)),
            summary: sheet.summary,
          },
          ip: addressOf(req),
        });
      }
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
