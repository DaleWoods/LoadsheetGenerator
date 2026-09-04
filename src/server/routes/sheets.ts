import { Router } from 'express';
import type { Db } from '../db/index.js';
import { NotPackageableError, packageLoadSheet } from '../domain/packageSheet.js';
import { generateFromRequest, sheetRequestSchema } from '../services/sheetService.js';

export function sheetRoutes(db: Db): Router {
  const router = Router();

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
      const bundle = await packageLoadSheet(sheet);
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
