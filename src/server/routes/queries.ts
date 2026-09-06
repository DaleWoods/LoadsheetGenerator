/** The Queries tab: a description in, a checked FlexibleSearch query out. */

import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { anthropicFlexResolver } from '../integrations/flexResolver.js';
import { describeQuery } from '../services/flexService.js';

const askSchema = z.object({ description: z.string().trim().min(3).max(4000) });

export function queryRoutes(): Router {
  const router = Router();

  router.get('/modes', (_req, res) => {
    res.json({ describe: env.anthropicApiKey !== undefined });
  });

  router.post('/describe', (req, res, next) => {
    void (async () => {
      const parsed = askSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Say what you need the query to return.' });
        return;
      }
      if (!env.anthropicApiKey) {
        res.status(503).json({ error: 'Writing a query from a description needs ANTHROPIC_API_KEY set on the server.' });
        return;
      }
      // Timed and logged: when this fails it fails on a deployment, where the
      // only account of it is the server log. A request that dies in the
      // browser as "failed to fetch" leaves nothing else to go on.
      const started = Date.now();
      try {
        const result = await describeQuery(parsed.data.description, anthropicFlexResolver(env.anthropicApiKey));
        console.log(`query written in ${Date.now() - started}ms: ${result.name}`);
        res.json(result);
      } catch (error) {
        console.error(`query failed after ${Date.now() - started}ms:`, error);
        next(error);
      }
    })();
  });

  return router;
}
