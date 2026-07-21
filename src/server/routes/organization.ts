import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient, UserRole } from '@prisma/client';
import { requireOrganization } from '../domain/access.js';
import { conflict, forbidden, notFound } from '../domain/errors.js';
import { requireAnyRole, requireAuth, type RequestWithUser } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { assertSupplierLimit, getSupplierPlan } from '../services/planLimits.js';
import { provisionSupabaseUser, updateSupabaseUserAccess } from '../services/supabase.js';

const adminRoles: UserRole[] = ['SUPPLIER_ADMIN', 'STORE_ADMIN'];
const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  organizationId: true,
  timezone: true,
  createdAt: true,
  updatedAt: true
} as const;

export function organizationRoutes(prisma: PrismaClient) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const plan = organization.type === 'SUPPLIER' ? await getSupplierPlan(prisma, organizationId) : null;
      const counts = await Promise.all([
        prisma.user.count({ where: { organizationId, status: { not: 'REVOKED' } } }),
        prisma.warehouse.count({ where: { supplierId: organizationId, status: { not: 'ARCHIVED' } } }),
        prisma.product.count({ where: { supplierId: organizationId, archivedAt: null } })
      ]);
      res.json({ organization, subscription: plan, usage: { users: counts[0], warehouses: counts[1], products: counts[2] } });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/', requireAnyRole(adminRoles), async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const input = z.object({ name: z.string().min(2).optional(), email: z.string().email().nullable().optional(), phone: z.string().nullable().optional(), taxNumber: z.string().nullable().optional() }).parse(req.body);
      const organization = await prisma.organization.update({ where: { id: organizationId }, data: input });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId, action: 'ORGANIZATION_UPDATED', entityType: 'organization', entityId: organizationId, newValue: input });
      res.json({ organization });
    } catch (error) {
      next(error);
    }
  });

  router.get('/addresses', async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      res.json({ addresses: await prisma.address.findMany({ where: { organizationId }, orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/addresses', requireAnyRole(adminRoles), async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const input = addressSchema.parse(req.body);
      const address = await prisma.address.create({ data: { ...input, organizationId } });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId, action: 'ADDRESS_CREATED', entityType: 'address', entityId: address.id, newValue: input });
      res.status(201).json({ address });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/addresses/:id', requireAnyRole(adminRoles), async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const address = await prisma.address.findFirst({ where: { id: String(req.params.id), organizationId } });
      if (!address) throw notFound('Address');
      const input = addressSchema.partial().parse(req.body);
      res.json({ address: await prisma.address.update({ where: { id: address.id }, data: input }) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/users', requireAnyRole(adminRoles), async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      res.json({ users: await prisma.user.findMany({ where: { organizationId }, select: safeUserSelect, orderBy: { name: 'asc' } }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/users', requireAnyRole(adminRoles), async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const input = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(['SUPPLIER_ADMIN', 'SUPPLIER_STAFF', 'STORE_ADMIN', 'STORE_BUYER', 'DRIVER']), temporaryPassword: z.string().min(10) }).parse(req.body);
      const allowed = organization.type === 'SUPPLIER' ? ['SUPPLIER_ADMIN', 'SUPPLIER_STAFF', 'DRIVER'] : ['STORE_ADMIN', 'STORE_BUYER'];
      if (!allowed.includes(input.role)) throw forbidden('This role is not valid for the organization type');
      if (organization.type === 'SUPPLIER') await assertSupplierLimit(prisma, organizationId, 'users');
      const email = input.email.toLowerCase();
      if (await prisma.user.findUnique({ where: { email } })) {
        throw conflict('EMAIL_IN_USE', 'A SALIK user already uses this email address');
      }
      const authUserId = await provisionSupabaseUser({
        email,
        password: input.temporaryPassword,
        name: input.name,
        role: input.role,
        organizationId
      });
      const user = await prisma.user.create({
        data: { authUserId, organizationId, name: input.name, email, role: input.role, passwordHash: await bcrypt.hash(input.temporaryPassword, 10), status: 'INVITED' },
        select: safeUserSelect
      });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId, action: 'USER_INVITED', entityType: 'user', entityId: user.id, newValue: { email: user.email, role: user.role } });
      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id', requireAnyRole(adminRoles), async (req: RequestWithUser, res, next) => {
    try {
      const organizationId = requireOrganization(req.user!);
      const target = await prisma.user.findFirst({ where: { id: String(req.params.id), organizationId } });
      if (!target) throw notFound('User');
      const input = z.object({ name: z.string().min(2).optional(), role: z.enum(['SUPPLIER_ADMIN', 'SUPPLIER_STAFF', 'STORE_ADMIN', 'STORE_BUYER', 'DRIVER']).optional(), status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED']).optional() }).parse(req.body);
      if (input.role) {
        const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
        const allowed = organization.type === 'SUPPLIER' ? ['SUPPLIER_ADMIN', 'SUPPLIER_STAFF', 'DRIVER'] : ['STORE_ADMIN', 'STORE_BUYER'];
        if (!allowed.includes(input.role)) throw forbidden('This role is not valid for the organization type');
      }
      if (target.id === req.user!.id && input.status && input.status !== 'ACTIVE') throw forbidden('You cannot revoke your own active session');
      const user = await prisma.user.update({ where: { id: target.id }, data: input, select: safeUserSelect });
      await updateSupabaseUserAccess(target.authUserId, {
        name: input.name,
        role: input.role,
        organizationId,
        active: input.status ? input.status === 'ACTIVE' : undefined
      });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId, action: 'USER_ACCESS_CHANGED', entityType: 'user', entityId: user.id, previousValue: { role: target.role, status: target.status }, newValue: input });
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const addressSchema = z.object({
  type: z.enum(['SHIPPING', 'BILLING', 'WAREHOUSE']),
  label: z.string().min(2),
  line1: z.string().min(2),
  line2: z.string().nullable().optional(),
  city: z.string().min(2),
  country: z.string().min(2).default('Oman'),
  phone: z.string().nullable().optional(),
  isDefault: z.boolean().default(false)
});
