import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { env } from '../config/env.js';
import { requireSignedIn } from '../auth/middleware.js';
import {
  SESSION_COOKIE,
  endSession,
  setPassword,
  signIn,
  startSession,
  type User,
} from '../services/userService.js';
import { verifyPassword } from '../auth/passwords.js';

const credentials = z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(400) });
const change = z.object({ currentPassword: z.string().min(1).max(400), newPassword: z.string().min(1).max(400) });

function publicUser(user: User) {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    mustChange: user.mustChange,
  };
}

export function authRoutes(db: Db): Router {
  const router = Router();

  function setCookie(res: Parameters<Router['get']>[1] extends never ? never : any, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.cookieSecure,
      expires: expiresAt,
      path: '/',
    });
  }

  router.post('/login', async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a username and password.' });
      return;
    }
    const result = await signIn(db, parsed.data.username, parsed.data.password, req.ip);
    if (!result.ok) {
      if (result.reason === 'throttled') {
        res.status(429).json({
          error: `Too many attempts. Try again in ${Math.ceil((result.retryInSeconds ?? 60) / 60)} minute(s).`,
        });
        return;
      }
      if (result.reason === 'disabled') {
        res.status(403).json({ error: 'That account has been switched off. Ask an administrator.' });
        return;
      }
      // The same answer whether the username or the password was wrong.
      res.status(401).json({ error: 'That username and password do not match.' });
      return;
    }

    const session = await startSession(db, result.user.id, req.get('user-agent') ?? undefined);
    setCookie(res, session.token, session.expiresAt);
    res.json({ user: publicUser(result.user) });
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await endSession(db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not signed in.' });
      return;
    }
    res.json({ user: publicUser(req.user) });
  });

  router.post('/password', requireSignedIn, async (req, res) => {
    const parsed = change.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter your current password and the new one.' });
      return;
    }
    const stored = await db.get<{ password_hash: string }>('SELECT password_hash FROM app_user WHERE id = ?', [
      req.user!.id,
    ]);
    if (!stored || !(await verifyPassword(parsed.data.currentPassword, stored.password_hash))) {
      res.status(401).json({ error: 'That is not your current password.' });
      return;
    }
    try {
      await setPassword(db, req.user!.id, parsed.data.newPassword);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    // Changing a password ends every session, so this one is replaced.
    const session = await startSession(db, req.user!.id, req.get('user-agent') ?? undefined);
    setCookie(res, session.token, session.expiresAt);
    res.json({ user: publicUser({ ...req.user!, mustChange: false }) });
  });

  return router;
}
