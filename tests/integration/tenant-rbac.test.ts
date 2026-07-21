import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers';

describe('server-side RBAC and tenant isolation', () => {
  const ctx = useTestApp();

  it('treats logout as idempotent even without an active session', async () => {
    expect((await ctx.agent.post('/api/auth/logout')).status).toBe(200);
    expect((await ctx.agent.post('/api/auth/logout')).status).toBe(200);
  });

  it('prevents a supplier from reading another supplier product through the API', async () => {
    await ctx.login('supplier@fresh.om');
    const foreignProductId = ctx.seed.products.beverageWater.id;

    const response = await ctx.agent.get(`/api/supplier/products/${foreignProductId}`);

    expect(response.status).toBe(404);
  });

  it('routes users only to their own portal', async () => {
    await ctx.login('driver@fresh.om');

    expect((await ctx.agent.get('/api/auth/me')).body.user.portal).toBe('driver');
    expect((await ctx.agent.get('/api/supplier/orders')).status).toBe(403);
    expect((await ctx.agent.get('/api/driver/deliveries')).status).toBe(200);
  });

  it('never serializes password hashes in administration or supplier responses', async () => {
    await ctx.login('admin@salik.om');
    const organizations = await ctx.agent.get('/api/admin/organizations');
    expect(organizations.status).toBe(200);
    expect(JSON.stringify(organizations.body)).not.toContain('passwordHash');

    await ctx.agent.post('/api/auth/logout');
    await ctx.login('supplier@fresh.om');
    const orders = await ctx.agent.get('/api/supplier/orders');
    expect(orders.status).toBe(200);
    expect(JSON.stringify(orders.body)).not.toContain('passwordHash');
  });

  it('prevents one store user from deleting another store cart item', async () => {
    await ctx.login('store@alnoor.om');
    const added = await ctx.agent.post('/api/store/cart/items').send({ productId: ctx.seed.products.freshMilk.id, quantity: 1 });
    const itemId = added.body.cart.groups[0].items[0].id;
    await ctx.agent.post('/api/auth/logout');

    const otherStore = await ctx.prisma.organization.create({ data: { name: 'Other Market', type: 'STORE' } });
    await ctx.prisma.user.create({
      data: {
        email: 'buyer@other.om',
        name: 'Other Buyer',
        passwordHash: await bcrypt.hash('Password123!', 10),
        role: 'STORE_BUYER',
        organizationId: otherStore.id
      }
    });
    await ctx.login('buyer@other.om');

    expect((await ctx.agent.delete(`/api/store/cart/items/${itemId}`)).status).toBe(404);
    expect(await ctx.prisma.cartItem.count({ where: { id: itemId } })).toBe(1);
  });

  it('forbids drivers from accessing supplier invoices', async () => {
    await ctx.login('driver@fresh.om');

    expect((await ctx.agent.get('/api/invoices')).status).toBe(403);
  });

  it('blocks suspended organizations at login and invalidates their existing sessions', async () => {
    await ctx.login('supplier@fresh.om');
    await ctx.prisma.organization.update({ where: { id: ctx.seed.organizations.freshSupplier.id }, data: { status: 'SUSPENDED' } });

    expect((await ctx.agent.get('/api/supplier/orders')).status).toBe(401);
    await ctx.agent.post('/api/auth/logout');
    expect((await ctx.agent.post('/api/auth/login').send({ email: 'supplier@fresh.om', password: 'Password123!' })).status).toBe(401);
  });
});
