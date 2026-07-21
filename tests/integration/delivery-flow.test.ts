import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers';

describe('delivery assignment and driver workflow', () => {
  const ctx = useTestApp();

  it('allows a supplier to assign only its own driver and lets that driver provide proof', async () => {
    await ctx.login('store@alnoor.om');
    await ctx.agent.post('/api/store/cart/items').send({ productId: ctx.seed.products.freshMilk.id, quantity: 1 });
    const checkout = await ctx.agent.post('/api/store/checkout').send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: 'INVOICE',
      idempotencyKey: 'checkout-delivery-001'
    });
    const orderId = checkout.body.orders[0].id;

    await ctx.agent.post('/api/auth/logout');
    await ctx.login('supplier@fresh.om');
    await ctx.agent.post(`/api/supplier/orders/${orderId}/transition`).send({ status: 'ACCEPTED' });
    await ctx.agent.post(`/api/supplier/orders/${orderId}/transition`).send({ status: 'PREPARING' });
    await ctx.agent.post(`/api/supplier/orders/${orderId}/transition`).send({ status: 'READY_FOR_DELIVERY' });

    const badAssign = await ctx.agent
      .post(`/api/supplier/orders/${orderId}/assign-driver`)
      .send({ driverId: ctx.seed.users.beverageDriver.id });
    expect(badAssign.status).toBe(400);

    const assigned = await ctx.agent
      .post(`/api/supplier/orders/${orderId}/assign-driver`)
      .send({ driverId: ctx.seed.users.freshDriver.id });
    expect(assigned.status).toBe(201);

    await ctx.agent.post('/api/auth/logout');
    await ctx.login('driver@fresh.om');

    expect((await ctx.agent.post(`/api/driver/deliveries/${assigned.body.delivery.id}/status`).send({ status: 'ACCEPTED' })).status).toBe(200);
    expect((await ctx.agent.post(`/api/driver/deliveries/${assigned.body.delivery.id}/status`).send({ status: 'OUT_FOR_DELIVERY' })).status).toBe(200);
    const delivered = await ctx.agent
      .post(`/api/driver/deliveries/${assigned.body.delivery.id}/status`)
      .send({ status: 'DELIVERED', recipientName: 'Maha Al Noor', proofNote: 'Received at loading bay' });

    expect(delivered.status).toBe(200);
    expect(delivered.body.delivery.status).toBe('DELIVERED');
    expect(delivered.body.delivery.recipientName).toBe('Maha Al Noor');
  });

  it('releases reservations and cancels the invoice when a submitted order is rejected', async () => {
    await ctx.login('store@alnoor.om');
    const before = await ctx.prisma.inventoryStock.findFirstOrThrow({ where: { productId: ctx.seed.products.freshMilk.id } });
    await ctx.agent.post('/api/store/cart/items').send({ productId: ctx.seed.products.freshMilk.id, quantity: 2 });
    const checkout = await ctx.agent.post('/api/store/checkout').send({
      deliveryAddressId: ctx.seed.addresses.storeShipping.id,
      paymentMethod: 'INVOICE',
      idempotencyKey: 'checkout-rejection-001'
    });
    const orderId = checkout.body.orders[0].id;
    await ctx.agent.post('/api/auth/logout');
    await ctx.login('supplier@fresh.om');

    expect((await ctx.agent.post(`/api/supplier/orders/${orderId}/transition`).send({ status: 'REJECTED' })).status).toBe(200);
    const stock = await ctx.prisma.inventoryStock.findUniqueOrThrow({ where: { id: before.id } });
    const invoice = await ctx.prisma.invoice.findUniqueOrThrow({ where: { orderId } });
    expect(stock.reserved).toBe(before.reserved);
    expect(invoice.status).toBe('CANCELLED');
  });

  it('does not cancel a paid order without an approved refund workflow', async () => {
    await ctx.login('supplier@fresh.om');
    await ctx.prisma.order.update({ where: { id: ctx.seed.seededOrder.id }, data: { paymentStatus: 'PAID' } });

    const response = await ctx.agent.post(`/api/supplier/orders/${ctx.seed.seededOrder.id}/transition`).send({ status: 'CANCELLED' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PAID_ORDER_CANNOT_BE_CANCELLED');
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: ctx.seed.seededOrder.id } })).status).toBe('READY_FOR_DELIVERY');
  });

  it('lets the supplier reschedule a failed delivery with an audit event', async () => {
    const delivery = await ctx.prisma.delivery.findUniqueOrThrow({ where: { orderId: ctx.seed.seededOrder.id } });
    await ctx.prisma.delivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', failureReason: 'Store closed' } });
    await ctx.login('supplier@fresh.om');
    const scheduledFor = new Date(Date.now() + 86_400_000);

    const response = await ctx.agent.post(`/api/supplier/deliveries/${delivery.id}/reschedule`).send({ scheduledFor: scheduledFor.toISOString() });

    expect(response.status).toBe(200);
    expect(response.body.delivery.status).toBe('RESCHEDULED');
    expect(await ctx.prisma.deliveryEvent.count({ where: { deliveryId: delivery.id, newStatus: 'RESCHEDULED' } })).toBe(1);
  });
});
