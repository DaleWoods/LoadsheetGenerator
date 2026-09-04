import { Router } from 'express';
import type { Db } from '../db/index.js';
import { attributesFor, itemTypesView } from '../domain/catalogueView.js';
import { loadLibrary } from '../services/libraryService.js';

export function libraryRoutes(db: Db): Router {
  const router = Router();

  router.get('/item-types', async (_req, res) => {
    const { catalogue } = await loadLibrary(db);
    res.json({ itemTypes: itemTypesView(catalogue) });
  });

  router.get('/attributes', async (req, res) => {
    const itemType = String(req.query.itemType ?? '');
    if (!itemType) {
      res.status(400).json({ error: 'itemType is required' });
      return;
    }
    const { catalogue, templates } = await loadLibrary(db);
    res.json({ itemType, attributes: attributesFor(catalogue, templates, itemType) });
  });

  router.get('/templates', async (req, res) => {
    const { templates } = await loadLibrary(db);
    const itemType = req.query.itemType ? String(req.query.itemType).toLowerCase() : undefined;
    const summaries = templates
      .filter((t) => !itemType || t.blocks.some((b) => b.itemType.toLowerCase() === itemType))
      .map((t) => ({
        id: t.id,
        name: t.name,
        sourcePath: t.sourcePath,
        direction: t.direction,
        origin: t.origin,
        itemTypes: [...new Set(t.blocks.map((b) => b.itemType))],
        columns: t.blocks[0]?.columns.length ?? 0,
        columnsOffset: t.blocks[0]?.csv?.columnsOffset ?? null,
      }));
    res.json({ templates: summaries });
  });

  return router;
}
