import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { requireAdmin } from '../auth/middleware.js';
import {
  countAdmins,
  createUser,
  findById,
  listUsers,
  setDisabled,
  setPassword,
  setRole,
} from '../services/userService.js';

const newUser = z.object({
  username: z.string().trim().min(2).max(60),
  displayName: z.string().trim().max(120).optional(),
  password: z.string().min(1).max(400),
  role: z.enum(['admin', 'member']).optional(),
});

const update = z.object({
  password: z.string().min(1).max(400).optional(),
  disabled: z.boolean().optional(),
  role: z.enum(['admin', 'member']).optional(),
});

export function userRoutes(db: Db): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', async (_req, res) => {
    res.json({ users: await listUsers(db) });
  });

  router.post('/', async (req, res) => {
    const parsed = newUser.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'A username and a password are needed.' });
      return;
    }
    try {
      // A password set by somebody else has to be changed on first use.
      const user = await createUser(db, { ...parsed.data, mustChange: true });
      res.status(201).json({ user });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.patch('/:id', async (req, res) => {
    const parsed = update.safeParse(req.body);
    const user = await findById(db, req.params.id ?? '');
    if (!parsed.success || !user) {
      res.status(parsed.success ? 404 : 400).json({ error: parsed.success ? 'No such account.' : 'Nothing to change.' });
      return;
    }

    // Locking the last administrator out would need a redeploy to undo, so it
    // is refused rather than warned about.
    const lastAdmin = user.role === 'admin' && !user.disabled && (await countAdmins(db)) <= 1;
    if (lastAdmin && (parsed.data.disabled === true || parsed.data.role === 'member')) {
      res.status(409).json({ error: 'This is the only administrator. Make somebody else an administrator first.' });
      return;
    }

    try {
      if (parsed.data.password !== undefined) await setPassword(db, user.id, parsed.data.password, true);
      if (parsed.data.disabled !== undefined) await setDisabled(db, user.id, parsed.data.disabled);
      if (parsed.data.role !== undefined) await setRole(db, user.id, parsed.data.role);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    res.json({ user: await findById(db, user.id) });
  });

  return router;
}
