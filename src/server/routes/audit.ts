/** The audit log. Administrators only, enforced here rather than on the screen. */

import { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import type { Db } from '../db/index.js';
import { auditFacets, listAudit } from '../services/auditService.js';

export function auditRoutes(db: Db): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', async (req, res) => {
    const events = await listAudit(db, {
      ...(typeof req.query.action === 'string' && req.query.action ? { action: req.query.action } : {}),
      ...(typeof req.query.username === 'string' && req.query.username ? { username: req.query.username } : {}),
      ...(typeof req.query.before === 'string' && req.query.before ? { before: req.query.before } : {}),
      limit: Number(req.query.limit ?? 200),
    });
    res.json({ events, facets: await auditFacets(db) });
  });

  return router;
}
