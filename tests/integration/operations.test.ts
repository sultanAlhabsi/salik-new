import { describe, expect, it } from 'vitest';
import { hashToken } from '../../src/server/middleware/auth';
import { useTestApp } from './helpers';

describe('organization and operational workflows', () => {
  const ctx = useTestApp();

  it('completes a password reset with a single-use expiring token', async () => {
    const rawToken = 'known-password-reset-token';
    await ctx.prisma.passwordResetToken.create({
      data: {
        userId: ctx.seed.users.storeAdmin.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000)
      }
    });

    expect((await ctx.agent.post('/api/auth/password-reset/complete').send({ token: rawToken, newPassword: 'NewPassword123!' })).status).toBe(200);
    expect((await ctx.agent.post('/api/auth/password-reset/complete').send({ token: rawToken, newPassword: 'AnotherPassword123!' })).status).toBe(400);
    expect((await ctx.agent.post('/api/auth/login').send({ email: 'store@alnoor.om', password: 'NewPassword123!' })).status).toBe(200);
  });

  it('does not reactivate a suspended user during password recovery', async () => {
    const rawToken = 'suspended-user-reset-token';
    await ctx.prisma.user.update({ where: { id: ctx.seed.users.storeAdmin.id }, data: { status: 'SUSPENDED' } });
    await ctx.prisma.passwordResetToken.create({
      data: {
        userId: ctx.seed.users.storeAdmin.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000)
      }
    });

    expect((await ctx.agent.post('/api/auth/password-reset/complete').send({ token: rawToken, newPassword: 'NewPassword123!' })).status).toBe(200);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.seed.users.storeAdmin.id } })).status).toBe('SUSPENDED');
    expect((await ctx.agent.post('/api/auth/login').send({ email: 'store@alnoor.om', password: 'NewPassword123!' })).status).toBe(401);
  });

  it('lets organization admins manage safe user, address, warehouse, category, and product records', async () => {
    await ctx.login('supplier@fresh.om');
    const user = await ctx.agent.post('/api/organization/users').send({
      name: 'New Driver',
      email: 'new.driver@fresh.om',
      role: 'DRIVER',
      temporaryPassword: 'Temporary123!'
    });
    expect(user.status).toBe(201);
    expect(user.body.user.passwordHash).toBeUndefined();
    const duplicate = await ctx.agent.post('/api/organization/users').send({
      name: 'Duplicate Driver',
      email: 'new.driver@fresh.om',
      role: 'DRIVER',
      temporaryPassword: 'Temporary123!'
    });
    expect(duplicate.status).toBe(409);

    const address = await ctx.agent.post('/api/organization/addresses').send({
      type: 'WAREHOUSE', label: 'Seeb Depot', line1: 'Industrial Road', city: 'Seeb', country: 'Oman'
    });
    expect(address.status).toBe(201);
    const warehouse = await ctx.agent.post('/api/supplier/warehouses').send({ name: 'Seeb Warehouse', addressId: address.body.address.id });
    expect(warehouse.status).toBe(201);
    const category = await ctx.agent.post('/api/supplier/categories').send({ name: 'Chilled' });
    expect(category.status).toBe(201);
    const product = await ctx.agent.patch(`/api/supplier/products/${ctx.seed.products.freshMilk.id}`).send({ categoryId: category.body.category.id, status: 'HIDDEN' });
    expect(product.status).toBe(200);
    expect(product.body.product.status).toBe('HIDDEN');
  });

  it('runs a recurring order as a normal auditable checkout', async () => {
    await ctx.login('store@alnoor.om');
    const recurring = await ctx.agent.post('/api/store/recurring-orders').send({
      name: 'Weekly milk',
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      cadenceDays: 7,
      nextRunAt: new Date().toISOString(),
      paymentMethod: 'INVOICE',
      items: [{ productId: ctx.seed.products.freshMilk.id, quantity: 2 }]
    });
    expect(recurring.status).toBe(201);

    const runKey = 'recurring-run-test-001';
    const run = await ctx.agent.post(`/api/store/recurring-orders/${recurring.body.recurringOrder.id}/run`).send({ idempotencyKey: runKey });
    expect(run.status).toBe(201);
    expect(run.body.orders).toHaveLength(1);
    const retry = await ctx.agent.post(`/api/store/recurring-orders/${recurring.body.recurringOrder.id}/run`).send({ idempotencyKey: runKey });
    expect(retry.status).toBe(200);
    expect(retry.body.orders[0].id).toBe(run.body.orders[0].id);
    expect((await ctx.prisma.recurringOrder.findUniqueOrThrow({ where: { id: recurring.body.recurringOrder.id } })).lastRunAt).not.toBeNull();
  });

  it('lets admins manage plans, subscriptions, settings, and support state', async () => {
    await ctx.login('admin@salik.om');
    const duplicateAdmin = await ctx.agent.post('/api/admin/organizations').send({
      name: 'Duplicate Admin Store',
      type: 'STORE',
      adminName: 'Existing Store Admin',
      adminEmail: 'store@alnoor.om',
      temporaryPassword: 'Temporary123!'
    });
    expect(duplicateAdmin.status).toBe(409);
    const plan = await ctx.agent.post('/api/admin/plans').send({
      code: 'starter', name: 'Starter', monthlyPriceBaisa: 19000, maxUsers: 5, maxWarehouses: 1, maxProducts: 100, supportsCredit: false
    });
    expect(plan.status).toBe(201);
    const subscription = await ctx.agent.post('/api/admin/subscriptions').send({
      supplierId: ctx.seed.organizations.freshSupplier.id,
      planId: plan.body.plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    expect(subscription.status).toBe(201);
    expect((await ctx.agent.put('/api/admin/settings/order-policy').send({ value: { cancellationWindowMinutes: 30 } })).status).toBe(200);
    const ticket = await ctx.prisma.supportTicket.findFirstOrThrow();
    expect((await ctx.agent.patch(`/api/admin/support/${ticket.id}`).send({ status: 'IN_PROGRESS', internalNotes: 'Investigating' })).status).toBe(200);
  });

  it('protects uploaded files with entity-level tenant authorization', async () => {
    await ctx.login('supplier@fresh.om');
    const upload = await ctx.agent
      .post('/api/files')
      .field('entityType', 'product')
      .field('entityId', ctx.seed.products.freshMilk.id)
      .attach('file', Buffer.from('fake png bytes'), { filename: 'milk.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    expect((await ctx.agent.get(`/api/files/${upload.body.attachment.id}`)).status).toBe(200);

    await ctx.agent.post('/api/auth/logout');
    await ctx.login('supplier@beverages.om');
    expect((await ctx.agent.get(`/api/files/${upload.body.attachment.id}`)).status).toBe(403);
  });
});
