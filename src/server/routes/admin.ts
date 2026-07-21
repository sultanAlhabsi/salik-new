import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { formatBaisa } from '../domain/money.js';
import { conflict, notFound } from '../domain/errors.js';
import { requireAnyRole, requireAuth, type RequestWithUser } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { provisionSupabaseUser } from '../services/supabase.js';

export function adminRoutes(prisma: PrismaClient) {
  const router = Router();
  router.use(requireAuth, requireAnyRole(['SUPER_ADMIN']));

  router.get('/dashboard', async (_req, res, next) => {
    try {
      const [organizations, orders, deliveries, paid, subscriptions] = await Promise.all([
        prisma.organization.count({ where: { status: 'ACTIVE' } }),
        prisma.order.count(),
        prisma.delivery.count(),
        prisma.paymentAttempt.count({ where: { status: 'PAID' } }),
        prisma.subscription.count({ where: { status: { in: ['TRIAL', 'ACTIVE'] } } })
      ]);
      const recentAudit = await prisma.auditLog.findMany({ include: { actor: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 8 });
      res.json({ stats: { organizations, orders, deliveries, paid, subscriptions }, recentAudit });
    } catch (error) {
      next(error);
    }
  });

  router.get('/organizations', async (req, res, next) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const organizations = await prisma.organization.findMany({
        where: search ? { name: { contains: search } } : undefined,
        include: {
          users: { select: { id: true, email: true, name: true, role: true, status: true, organizationId: true, timezone: true, createdAt: true, updatedAt: true } },
          subscriptions: { include: { plan: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json({ organizations });
    } catch (error) {
      next(error);
    }
  });

  router.post('/organizations', async (req: RequestWithUser, res, next) => {
    try {
      const input = z
        .object({
          name: z.string().min(2),
          type: z.enum(['SUPPLIER', 'STORE']),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          adminName: z.string().min(2).optional(),
          adminEmail: z.string().email().optional(),
          temporaryPassword: z.string().min(10).optional()
        })
        .refine((value) => !value.adminEmail || (value.adminName && value.temporaryPassword), { message: 'Admin name and temporary password are required with an admin email' })
        .parse(req.body);
      const { adminName, adminEmail, temporaryPassword, ...organizationInput } = input;
      if (adminEmail && (await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } }))) {
        throw conflict('EMAIL_IN_USE', 'A SALIK user already uses this email address');
      }
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({ data: { ...organizationInput, status: 'ACTIVE' } });
        let createdAdmin = null;
        if (adminName && adminEmail && temporaryPassword) {
          createdAdmin = await tx.user.create({ data: { organizationId: created.id, name: adminName, email: adminEmail.toLowerCase(), passwordHash: await bcrypt.hash(temporaryPassword, 10), role: created.type === 'SUPPLIER' ? 'SUPPLIER_ADMIN' : 'STORE_ADMIN', status: 'INVITED' } });
        }
        return { organization: created, admin: createdAdmin };
      });
      const organization = result.organization;
      if (result.admin && temporaryPassword) {
        const authUserId = await provisionSupabaseUser({
          email: result.admin.email,
          password: temporaryPassword,
          name: result.admin.name,
          role: result.admin.role,
          organizationId: organization.id
        });
        if (authUserId) await prisma.user.update({ where: { id: result.admin.id }, data: { authUserId } });
      }
      await writeAudit(prisma, {
        actorId: req.user!.id,
        organizationId: organization.id,
        action: 'ORGANIZATION_CREATED',
        entityType: 'organization',
        entityId: organization.id,
        newValue: { ...organizationInput, adminEmail }
      });
      res.status(201).json({ organization });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/organizations/:id/status', async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = z.string().parse(req.params.id);
      const input = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']) }).parse(req.body);
      const previous = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const organization = await prisma.organization.update({
        where: { id: organizationId },
        data: { status: input.status, archivedAt: input.status === 'ARCHIVED' ? new Date() : null }
      });
      await writeAudit(prisma, {
        actorId: req.user!.id,
        organizationId: organization.id,
        action: 'ORGANIZATION_STATUS_CHANGED',
        entityType: 'organization',
        entityId: organization.id,
        previousValue: { status: previous.status },
        newValue: { status: input.status }
      });
      res.json({ organization });
    } catch (error) {
      next(error);
    }
  });

  router.get('/plans', async (_req, res, next) => {
    try {
      const plans = await prisma.plan.findMany({ include: { subscriptions: true }, orderBy: { monthlyPriceBaisa: 'asc' } });
      res.json({ plans: plans.map((plan) => ({ ...plan, monthlyPriceFormatted: formatBaisa(plan.monthlyPriceBaisa) })) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/plans', async (req: RequestWithUser, res, next) => {
    try {
      const input = planSchema.parse(req.body);
      const plan = await prisma.plan.create({ data: input });
      await writeAudit(prisma, { actorId: req.user!.id, action: 'PLAN_CREATED', entityType: 'plan', entityId: plan.id, newValue: input });
      res.status(201).json({ plan: { ...plan, monthlyPriceFormatted: formatBaisa(plan.monthlyPriceBaisa) } });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/plans/:id', async (req: RequestWithUser, res, next) => {
    try {
      const input = planSchema.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }).parse(req.body);
      const plan = await prisma.plan.update({ where: { id: String(req.params.id) }, data: input });
      await writeAudit(prisma, { actorId: req.user!.id, action: 'PLAN_UPDATED', entityType: 'plan', entityId: plan.id, newValue: input });
      res.json({ plan });
    } catch (error) {
      next(error);
    }
  });

  router.get('/subscriptions', async (_req, res, next) => {
    try {
      const subscriptions = await prisma.subscription.findMany({ include: { supplier: true, plan: true }, orderBy: { currentPeriodEnd: 'desc' } });
      res.json({ subscriptions });
    } catch (error) {
      next(error);
    }
  });

  router.post('/subscriptions', async (req: RequestWithUser, res, next) => {
    try {
      const input = subscriptionSchema.parse(req.body);
      const supplier = await prisma.organization.findFirst({ where: { id: input.supplierId, type: 'SUPPLIER' } });
      if (!supplier) throw notFound('Supplier');
      const subscription = await prisma.$transaction(async (tx) => {
        if (['TRIAL', 'ACTIVE'].includes(input.status)) {
          await tx.subscription.updateMany({ where: { supplierId: input.supplierId, status: { in: ['TRIAL', 'ACTIVE'] } }, data: { status: 'SUSPENDED' } });
        }
        return tx.subscription.create({ data: input, include: { supplier: true, plan: true } });
      });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: input.supplierId, action: 'SUBSCRIPTION_CREATED', entityType: 'subscription', entityId: subscription.id, newValue: input });
      res.status(201).json({ subscription });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/subscriptions/:id', async (req: RequestWithUser, res, next) => {
    try {
      const input = subscriptionSchema.omit({ supplierId: true, planId: true }).partial().extend({ planId: z.string().optional() }).parse(req.body);
      const subscription = await prisma.subscription.update({ where: { id: String(req.params.id) }, data: input, include: { supplier: true, plan: true } });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: subscription.supplierId, action: 'SUBSCRIPTION_UPDATED', entityType: 'subscription', entityId: subscription.id, newValue: input });
      res.json({ subscription });
    } catch (error) {
      next(error);
    }
  });

  router.get('/payments', async (_req, res, next) => {
    try {
      const payments = await prisma.paymentAttempt.findMany({
        include: { order: { include: { supplier: true, store: true } }, invoice: true },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json({ payments: payments.map((payment) => ({ ...payment, amountFormatted: formatBaisa(payment.amountBaisa) })) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/audit', async (req, res, next) => {
    try {
      const action = typeof req.query.action === 'string' ? req.query.action : undefined;
      const actorId = typeof req.query.actorId === 'string' ? req.query.actorId : undefined;
      const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
      const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
      const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
      const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
      const logs = await prisma.auditLog.findMany({
        where: { action, actorId, entityType, organizationId, createdAt: from || to ? { gte: from, lte: to } : undefined },
        include: { actor: { select: { id: true, name: true, email: true, role: true } }, organization: true },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  router.get('/support', async (_req, res, next) => {
    try {
      const tickets = await prisma.supportTicket.findMany({ include: { organization: true }, orderBy: { createdAt: 'desc' }, take: 50 });
      res.json({ tickets });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/support/:id', async (req: RequestWithUser, res, next) => {
    try {
      const input = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(), internalNotes: z.string().max(2000).nullable().optional() }).parse(req.body);
      const ticket = await prisma.supportTicket.update({ where: { id: String(req.params.id) }, data: input, include: { organization: true } });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: ticket.organizationId, action: 'SUPPORT_TICKET_UPDATED', entityType: 'support_ticket', entityId: ticket.id, newValue: input });
      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  });

  router.get('/settings', async (_req, res, next) => {
    try {
      const settings = await prisma.platformSetting.findMany({ orderBy: { key: 'asc' } });
      res.json({ settings: settings.map((setting) => ({ ...setting, value: JSON.parse(setting.valueJson) })) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/settings/:key', async (req: RequestWithUser, res, next) => {
    try {
      const key = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,80}$/).parse(req.params.key);
      const value = z.object({ value: z.unknown() }).parse(req.body).value;
      const setting = await prisma.platformSetting.upsert({ where: { key }, update: { valueJson: JSON.stringify(value) }, create: { key, valueJson: JSON.stringify(value) } });
      await writeAudit(prisma, { actorId: req.user!.id, action: 'PLATFORM_SETTING_UPDATED', entityType: 'platform_setting', entityId: setting.id, newValue: { key, value } });
      res.json({ setting: { ...setting, value } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const planSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  monthlyPriceBaisa: z.number().int().nonnegative(),
  maxUsers: z.number().int().positive(),
  maxWarehouses: z.number().int().positive(),
  maxProducts: z.number().int().positive(),
  supportsCredit: z.boolean().default(true)
});

const subscriptionSchema = z.object({
  supplierId: z.string(),
  planId: z.string(),
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']),
  currentPeriodStart: z.coerce.date(),
  currentPeriodEnd: z.coerce.date()
});
