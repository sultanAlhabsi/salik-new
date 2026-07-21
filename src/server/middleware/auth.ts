import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient, UserRole } from '@prisma/client';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { unauthorized, forbidden } from '../domain/errors.js';
import type { AuthUser } from '../domain/access.js';
import { config } from '../config.js';
import { createSupabaseAuthClient, getSupabaseAdmin, isSupabaseEnabled, resolveSupabaseIdentity } from '../services/supabase.js';

export const sessionCookieName = 'salik_session';
export const accessCookieName = 'salik_access_token';
export const refreshCookieName = 'salik_refresh_token';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type RequestWithUser = Request;

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function authMiddleware(prisma: PrismaClient) {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    if (isSupabaseEnabled()) {
      try {
        await authenticateWithSupabase(prisma, req, res);
        next();
      } catch (error) {
        next(error);
      }
      return;
    }
    const rawToken = req.cookies?.[sessionCookieName];
    if (!rawToken) {
      next();
      return;
    }
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { include: { organization: true } } }
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      (session.user.organization && session.user.organization.status !== 'ACTIVE')
    ) {
      next();
      return;
    }
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      organizationId: session.user.organizationId,
      status: session.user.status,
      authUserId: session.user.authUserId
    };
    next();
  };
}

async function authenticateWithSupabase(prisma: PrismaClient, req: RequestWithUser, res: Response) {
  let accessToken = req.cookies?.[accessCookieName] as string | undefined;
  const refreshToken = req.cookies?.[refreshCookieName] as string | undefined;
  let authUser = accessToken ? (await getSupabaseAdmin().auth.getUser(accessToken)).data.user : null;

  if (!authUser && refreshToken) {
    const { data, error } = await createSupabaseAuthClient().auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session && data.user) {
      setSupabaseSessionCookies(res, data.session);
      accessToken = data.session.access_token;
      authUser = data.user;
    }
  }

  if (!authUser || !accessToken) return;
  const user = await resolveSupabaseIdentity(prisma, authUser);
  if (!user) return;
  if (
    user.status !== 'ACTIVE' ||
    (user.organization && user.organization.status !== 'ACTIVE')
  ) return;
  req.user = {
    id: user.id,
    authUserId: authUser.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    status: user.status
  };
}

export function setSupabaseSessionCookies(res: Response, session: SupabaseSession) {
  const shared = { httpOnly: true, sameSite: 'lax' as const, secure: config.isProduction, path: '/' };
  res.cookie(accessCookieName, session.access_token, {
    ...shared,
    expires: session.expires_at ? new Date(session.expires_at * 1000) : new Date(Date.now() + 60 * 60 * 1000)
  });
  res.cookie(refreshCookieName, session.refresh_token, { ...shared, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(res: Response) {
  const options = { httpOnly: true, sameSite: 'lax' as const, secure: config.isProduction, path: '/' };
  res.clearCookie(sessionCookieName, options);
  res.clearCookie(accessCookieName, options);
  res.clearCookie(refreshCookieName, options);
}

export function requireAuth(req: RequestWithUser, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(unauthorized());
    return;
  }
  next();
}

export function requireAnyRole(roles: UserRole[]) {
  return (req: RequestWithUser, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}
