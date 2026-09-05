/**
 * Who is asking.
 *
 * Everything behind /api needs a session except signing in itself and the
 * health check. The guard is applied once, to the whole surface, rather than
 * route by route: a route added later is protected by default, and forgetting
 * to protect one is the mistake that matters here.
 */

import type { NextFunction, Request, Response } from 'express';
import type { Db } from '../db/index.js';
import { SESSION_COOKIE, userForSession, type User } from '../services/userService.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function attachUser(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) req.user = await userForSession(db, token);
    next();
  };
}

/** A session, and nothing more - what changing your own password needs. */
export function requireSignedIn(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to use the load sheet generator.' });
    return;
  }
  next();
}

/**
 * A session, and a password of the user's own.
 *
 * A password an administrator handed out has to be replaced before the account
 * is good for anything else - otherwise a password that has been read out over
 * a desk stays live indefinitely. Changing it goes through `requireSignedIn`,
 * which is the one thing this state allows.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to use the load sheet generator.' });
    return;
  }
  if (req.user.mustChange) {
    res.status(403).json({ error: 'Choose a new password before carrying on.', mustChange: true });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to use the load sheet generator.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Only an administrator can manage accounts.' });
    return;
  }
  next();
}
