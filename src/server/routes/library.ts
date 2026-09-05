import { Router } from 'express';
import type { Db } from '../db/index.js';
import { requireAdmin } from '../auth/middleware.js';
import { attributesFor, itemTypesView } from '../domain/catalogueView.js';
import { loadLibrary } from '../services/libraryService.js';
import {
  listRepository,
  NotRemovableError,
  removeFromRepository,
  repositoryDetail,
  type Shelf,
} from '../services/repositoryService.js';

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

  // The repository: every load sheet the app knows, on two shelves - the
  // supplied production export, and what has been saved from the app since.
  router.get('/repository', async (req, res) => {
    const shelf = req.query.shelf === 'supplied' || req.query.shelf === 'saved' ? (req.query.shelf as Shelf) : undefined;
    res.json(
      await listRepository(db, {
        ...(req.query.search ? { search: String(req.query.search) } : {}),
        ...(req.query.itemType ? { itemType: String(req.query.itemType) } : {}),
        ...(req.query.direction ? { direction: String(req.query.direction) } : {}),
        ...(shelf ? { shelf } : {}),
      }),
    );
  });

  router.get('/repository/:id', async (req, res) => {
    const detail = await repositoryDetail(db, req.params.id ?? '');
    if (!detail) {
      res.status(404).json({ error: 'No such load sheet in the repository.' });
      return;
    }
    res.json(detail);
  });

  // Removing is an administrator's job: a saved sheet is shared, and one person
  // tidying up would take it away from everybody.
  router.delete('/repository/:id', requireAdmin, async (req, res) => {
    try {
      await removeFromRepository(db, req.params.id ?? '');
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotRemovableError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
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
