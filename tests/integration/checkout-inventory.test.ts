import { describe, expect, it } from 'vitest';
import { checkoutCart } from '../../src/server/services/checkout';
import { useTestApp } from './helpers';

describe('multi-supplier checkout and inventory', () => {
  const ctx = useTestApp();

  it('creates one order per supplier, reserves only each supplier stock, and is idempotent', async () => {
    await ctx.login('store@alnoor.om');
    const initialFreshStock = await ctx.prisma.inventoryStock.findFirstOrThrow({
      where: { productId: ctx.seed.products.freshMilk.id }
    });
    const initialBeverageStock = await ctx.prisma.inventoryStock.findFirstOrThrow({
      where: { productId: ctx.seed.products.beverageWater.id }
    });

    await ctx.agent.post('/api/store/cart/items').send({ productId: ctx.seed.products.freshMilk.id, quantity: 4 });
    await ctx.agent.post('/api/store/cart/items').send({ productId: ctx.seed.products.beverageWater.id, quantity: 6 });

    const first = await ctx.agent.post('/api/store/checkout').send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: 'INVOICE',
      note: 'Deliver before 10 AM',
      idempotencyKey: 'checkout-test-001'
    });

    expect(first.status).toBe(201);
    expect(first.body.orders).toHaveLength(2);
    expect(new Set(first.body.orders.map((order: { supplierId: string }) => order.supplierId))).toEqual(
      new Set([ctx.seed.organizations.freshSupplier.id, ctx.seed.organizations.beverageSupplier.id])
    );

    const duplicate = await ctx.agent.post('/api/store/checkout').send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: 'INVOICE',
      idempotencyKey: 'checkout-test-001'
    });

    expect(duplicate.status).toBe(200);
    expect(duplicate.body.orders.map((order: { id: string }) => order.id).sort()).toEqual(
      first.body.orders.map((order: { id: string }) => order.id).sort()
    );

    const freshStock = await ctx.prisma.inventoryStock.findFirstOrThrow({
      where: { productId: ctx.seed.products.freshMilk.id }
    });
    const beverageStock = await ctx.prisma.inventoryStock.findFirstOrThrow({
      where: { productId: ctx.seed.products.beverageWater.id }
    });

    expect(freshStock.reserved).toBe(initialFreshStock.reserved + 4);
    expect(beverageStock.reserved).toBe(initialBeverageStock.reserved + 6);
  });

  it('does not disclose another tenant checkout when an idempotency key collides', async () => {
    await ctx.login('store@alnoor.om');
    await ctx.agent.post('/api/store/cart/items').send({ productId: ctx.seed.products.freshMilk.id, quantity: 1 });
    await ctx.agent.post('/api/store/checkout').send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: 'INVOICE',
      idempotencyKey: 'shared-checkout-key'
    });

    await expect(
      checkoutCart(
        ctx.prisma,
        { id: 'other-user', email: 'other@store.om', name: 'Other', role: 'STORE_BUYER', organizationId: 'other-store', status: 'ACTIVE' },
        { deliveryAddressId: 'other-address', paymentMethod: 'INVOICE', idempotencyKey: 'shared-checkout-key' }
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('applies a retried inventory adjustment only once', async () => {
    await ctx.login('supplier@fresh.om');
    const stock = await ctx.prisma.inventoryStock.findFirstOrThrow({ where: { productId: ctx.seed.products.freshMilk.id } });
    const payload = {
      productId: stock.productId,
      warehouseId: stock.warehouseId,
      quantity: 5,
      type: 'ADJUSTMENT_IN',
      idempotencyKey: 'adjustment-retry-001'
    };

    expect((await ctx.agent.post('/api/supplier/inventory/adjust').send(payload)).status).toBe(201);
    expect((await ctx.agent.post('/api/supplier/inventory/adjust').send(payload)).status).toBe(201);
    const updated = await ctx.prisma.inventoryStock.findUniqueOrThrow({ where: { id: stock.id } });
    expect(updated.onHand).toBe(stock.onHand + 5);
    expect(await ctx.prisma.inventoryMovement.count({ where: { idempotencyKey: payload.idempotencyKey } })).toBe(1);
  });

  it('can apply migrations repeatedly without replaying the schema', async () => {
    const { applyMigrations } = await import('../../src/server/services/migrations');

    await expect(applyMigrations(ctx.prisma)).resolves.toBeUndefined();
  });
});
