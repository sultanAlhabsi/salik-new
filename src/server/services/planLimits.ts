import type { PrismaClient } from '@prisma/client';
import { conflict } from '../domain/errors.js';

export async function getSupplierPlan(prisma: PrismaClient, supplierId: string) {
  return prisma.subscription.findFirst({
    where: { supplierId, status: { in: ['TRIAL', 'ACTIVE'] } },
    include: { plan: true },
    orderBy: { currentPeriodEnd: 'desc' }
  });
}

export async function assertSupplierLimit(
  prisma: PrismaClient,
  supplierId: string,
  resource: 'users' | 'warehouses' | 'products'
) {
  const subscription = await getSupplierPlan(prisma, supplierId);
  if (!subscription) return;
  const limit =
    resource === 'users'
      ? subscription.plan.maxUsers
      : resource === 'warehouses'
        ? subscription.plan.maxWarehouses
        : subscription.plan.maxProducts;
  const count =
    resource === 'users'
      ? await prisma.user.count({ where: { organizationId: supplierId, status: { not: 'REVOKED' } } })
      : resource === 'warehouses'
        ? await prisma.warehouse.count({ where: { supplierId, status: { not: 'ARCHIVED' } } })
        : await prisma.product.count({ where: { supplierId, archivedAt: null } });
  if (count >= limit) {
    throw conflict('PLAN_LIMIT_REACHED', `The current plan allows up to ${limit} ${resource}`);
  }
}
