import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { portalForRole } from '../domain/access.js';
import { badRequest, serviceUnavailable, unauthorized } from '../domain/errors.js';
import {
  accessCookieName,
  clearAuthCookies,
  createSessionToken,
  hashToken,
  requireAuth,
  sessionCookieName,
  setSupabaseSessionCookies,
  type RequestWithUser
} from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { createSupabaseAuthClient, getSupabaseAdmin, isSupabaseEnabled, resolveSupabaseIdentity } from '../services/supabase.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const resetSchema = z.object({
  email: z.string().email()
});

export function authRoutes(prisma: PrismaClient) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const email = input.email.toLowerCase();
      let user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });
      if (isSupabaseEnabled()) {
        const { data, error } = await createSupabaseAuthClient().auth.signInWithPassword({ email, password: input.password });
        if (error || !data.user || !data.session) throw unauthorized('Invalid email or password');
        user = await resolveSupabaseIdentity(prisma, data.user);
        if (!user || user.status !== 'ACTIVE' || (user.organization && user.organization.status !== 'ACTIVE')) {
          await getSupabaseAdmin().auth.admin.signOut(data.session.access_token, 'local');
          throw unauthorized('Invalid email or password');
        }
        setSupabaseSessionCookies(res, data.session);
      }
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        (user.organization && user.organization.status !== 'ACTIVE') ||
        (!isSupabaseEnabled() && !(await bcrypt.compare(input.password, user.passwordHash)))
      ) {
        throw unauthorized('Invalid email or password');
      }
      if (!isSupabaseEnabled()) {
        const rawToken = createSessionToken();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
        await prisma.session.create({
          data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt }
        });
        res.cookie(sessionCookieName, rawToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.isProduction,
          expires: expiresAt
        });
      }
      await writeAudit(prisma, {
        actorId: user.id,
        organizationId: user.organizationId,
        action: 'AUTH_LOGIN',
        entityType: 'user',
        entityId: user.id
      });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization?.name,
          portal: portalForRole(user.role)
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (req: RequestWithUser, res, next) => {
    try {
      if (isSupabaseEnabled()) {
        const accessToken = req.cookies?.[accessCookieName];
        if (accessToken) await getSupabaseAdmin().auth.admin.signOut(accessToken, 'local');
      } else {
        const token = req.cookies?.[sessionCookieName];
        if (token) {
          await prisma.session.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
        }
      }
      clearAuthCookies(res);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: { organization: true }
      });
      if (!user) throw unauthorized();
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization?.name,
          portal: portalForRole(user.role)
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/password-reset/request', async (req, res, next) => {
    try {
      const input = resetSchema.parse(req.body);
      const user = await prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
        include: { organization: true }
      });
      if (user) {
        if (isSupabaseEnabled()) {
          const { error } = await createSupabaseAuthClient().auth.resetPasswordForEmail(user.email, {
            redirectTo: `${config.appOrigin}/?passwordRecovery=1`
          });
          if (error) {
            throw serviceUnavailable(
              'AUTH_PROVIDER_UNAVAILABLE',
              'Password reset is temporarily unavailable'
            );
          }
        } else {
          const rawToken = createSessionToken();
          await prisma.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashToken(rawToken),
              expiresAt: new Date(Date.now() + 1000 * 60 * 30)
            }
          });
        }
        await writeAudit(prisma, {
          actorId: user.id,
          organizationId: user.organizationId,
          action: 'PASSWORD_RESET_REQUESTED',
          entityType: 'user',
          entityId: user.id
        });
      }
      res.json({ message: 'If the account exists, a password reset link has been issued.' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/password-reset/complete', async (req, res, next) => {
    try {
      const input = z.object({ token: z.string().min(16), newPassword: z.string().min(10) }).parse(req.body);
      if (isSupabaseEnabled()) {
        const admin = getSupabaseAdmin();
        const { data, error } = await admin.auth.getUser(input.token);
        if (error || !data.user) throw badRequest('INVALID_RESET_TOKEN', 'The password reset link is invalid or has expired');
        const user = await resolveSupabaseIdentity(prisma, data.user);
        if (!user) throw badRequest('INVALID_RESET_TOKEN', 'The password reset link is invalid or has expired');
        const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, { password: input.newPassword });
        if (updateError) {
          throw serviceUnavailable(
            'AUTH_PROVIDER_UNAVAILABLE',
            'Password reset is temporarily unavailable'
          );
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await bcrypt.hash(input.newPassword, 10) }
        });
        await admin.auth.admin.signOut(input.token, 'global');
        await writeAudit(prisma, { actorId: user.id, organizationId: user.organizationId, action: 'PASSWORD_RESET_COMPLETED', entityType: 'user', entityId: user.id });
        res.json({ ok: true });
        return;
      }
      const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
        throw badRequest('INVALID_RESET_TOKEN', 'The password reset link is invalid or has expired');
      }
      await prisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() }
        });
        if (consumed.count !== 1) throw badRequest('INVALID_RESET_TOKEN', 'The password reset link is invalid or has expired');
        await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash: await bcrypt.hash(input.newPassword, 10) } });
        await tx.session.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        await writeAudit(tx, { actorId: resetToken.userId, action: 'PASSWORD_RESET_COMPLETED', entityType: 'user', entityId: resetToken.userId });
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/profile/password', requireAuth, async (req: RequestWithUser, res, next) => {
    try {
      const input = z
        .object({ currentPassword: z.string().min(1), newPassword: z.string().min(10) })
        .parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw badRequest('INVALID_PASSWORD', 'Current password is incorrect');
      if (isSupabaseEnabled()) {
        const { data, error } = await createSupabaseAuthClient().auth.signInWithPassword({
          email: user.email,
          password: input.currentPassword
        });
        if (error || !data.user || data.user.id !== user.authUserId) {
          throw badRequest('INVALID_PASSWORD', 'Current password is incorrect');
        }
        const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(data.user.id, {
          password: input.newPassword
        });
        if (updateError) throw updateError;
        if (data.session) await getSupabaseAdmin().auth.admin.signOut(data.session.access_token, 'local');
      } else if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
        throw badRequest('INVALID_PASSWORD', 'Current password is incorrect');
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(input.newPassword, 10) }
      });
      await writeAudit(prisma, {
        actorId: user.id,
        organizationId: user.organizationId,
        action: 'PASSWORD_CHANGED',
        entityType: 'user',
        entityId: user.id
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
