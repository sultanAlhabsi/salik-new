import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { PrismaClient } from '@prisma/client';
import { requireOrganization } from '../domain/access.js';
import { formatBaisa } from '../domain/money.js';
import { badRequest, conflict, notFound } from '../domain/errors.js';
import { requireAnyRole, requireAuth, type RequestWithUser } from '../middleware/auth.js';
import { addCartItem, checkoutCart, getCart } from '../services/checkout.js';
import { writeAudit } from '../services/audit.js';

const storeRoles = ['STORE_ADMIN', 'STORE_BUYER'] as const;

export function storeRoutes(prisma: PrismaClient) {
  const router = Router();
  router.use(requireAuth, requireAnyRole([...storeRoles]));

  router.get('/dashboard', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const [orders, invoices, suppliers, unread] = await Promise.all([
        prisma.order.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 6, include: { supplier: true, invoice: true } }),
        prisma.invoice.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 6 }),
        prisma.organization.count({ where: { type: 'SUPPLIER', status: 'ACTIVE' } }),
        prisma.notification.count({ where: { organizationId: storeId, readAt: null } })
      ]);
      res.json({
        stats: {
          orders: await prisma.order.count({ where: { storeId } }),
          openInvoices: invoices.filter((invoice) => invoice.status === 'ISSUED').length,
          suppliers,
          unread
        },
        recentOrders: orders.map((order) => ({ ...order, totalFormatted: formatBaisa(order.totalBaisa) }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/suppliers', async (_req, res, next) => {
    try {
      const suppliers = await prisma.organization.findMany({
        where: { type: 'SUPPLIER', status: 'ACTIVE' },
        orderBy: { name: 'asc' }
      });
      res.json({ suppliers });
    } catch (error) {
      next(error);
    }
  });

  router.get('/addresses', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const addresses = await prisma.address.findMany({
        where: { organizationId: storeId },
        orderBy: [{ isDefault: 'desc' }, { label: 'asc' }]
      });
      res.json({ addresses });
    } catch (error) {
      next(error);
    }
  });

  router.get('/products', async (req, res, next) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
      const products = await prisma.product.findMany({
        where: {
          status: 'PUBLISHED',
          archivedAt: null,
          supplierId,
          OR: search ? [{ name: { contains: search } }, { sku: { contains: search } }] : undefined
        },
        include: { supplier: true, stocks: true, category: true },
        orderBy: { name: 'asc' },
        take: 50
      });
      res.json({
        products: products.map((product) => ({
          ...product,
          available: product.stocks.reduce((sum, stock) => sum + stock.onHand - stock.reserved, 0),
          priceFormatted: formatBaisa(product.priceBaisa)
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/cart', async (req: RequestWithUser, res, next) => {
    try {
      const cart = await getCart(prisma, requireOrganization(req.user!), req.user!.id);
      res.json({ cart: serializeCart(cart) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/cart/items', async (req: RequestWithUser, res, next) => {
    try {
      const input = z.object({ productId: z.string(), quantity: z.number().int().positive() }).parse(req.body);
      await addCartItem(prisma, {
        storeId: requireOrganization(req.user!),
        userId: req.user!.id,
        productId: input.productId,
        quantity: input.quantity
      });
      const cart = await getCart(prisma, requireOrganization(req.user!), req.user!.id);
      res.status(201).json({ cart: serializeCart(cart) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/cart/items/:id', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const item = await prisma.cartItem.findFirst({
        where: { id: String(req.params.id), userId: req.user!.id, cart: { storeId, status: 'ACTIVE' } }
      });
      if (!item) throw notFound('Cart item');
      await prisma.cartItem.delete({ where: { id: item.id } });
      const cart = await getCart(prisma, storeId, req.user!.id);
      res.json({ cart: serializeCart(cart) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/checkout', async (req: RequestWithUser, res, next) => {
    try {
      const result = await checkoutCart(prisma, req.user!, req.body);
      res.status(result.reused ? 200 : 201).json({
        checkout: result.checkout,
        orders: result.orders
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/orders', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const orders = await prisma.order.findMany({
        where: { storeId },
        include: { supplier: true, items: true, events: true, delivery: true, invoice: true },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json({ orders: orders.map((order) => ({ ...order, totalFormatted: formatBaisa(order.totalBaisa) })) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/orders/:id/payments', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const input = z.object({ idempotencyKey: z.string().min(8), provider: z.string().min(2).default('local-pay') }).parse(req.body);
      const existing = await prisma.paymentAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        const ownedOrder = existing.orderId
          ? await prisma.order.findFirst({ where: { id: existing.orderId, storeId }, select: { id: true } })
          : null;
        if (!ownedOrder || existing.orderId !== String(req.params.id)) {
          throw conflict(
            'PAYMENT_IDEMPOTENCY_CONFLICT',
            'This payment idempotency key cannot be reused for this request'
          );
        }
        res.json({ attempt: existing, paymentUrl: `/payments/demo/${existing.id}`, reused: true });
        return;
      }
      const order = await prisma.order.findFirst({ where: { id: String(req.params.id), storeId }, include: { invoice: true } });
      if (!order) throw notFound('Order');
      if (order.paymentMethod !== 'CARD') throw badRequest('PAYMENT_METHOD_NOT_CARD', 'This order uses invoice payment terms');
      if (!['PENDING', 'FAILED'].includes(order.paymentStatus)) throw badRequest('PAYMENT_ALREADY_STARTED', 'This order cannot start another payment');
      const attempt = await prisma.$transaction(async (tx) => {
        const changed = await tx.order.updateMany({ where: { id: order.id, paymentStatus: order.paymentStatus }, data: { paymentStatus: 'PROCESSING' } });
        if (changed.count !== 1) throw conflict('PAYMENT_STATE_CONFLICT', 'Payment state changed while initiation was in progress');
        return tx.paymentAttempt.create({ data: { orderId: order.id, invoiceId: order.invoice?.id, provider: input.provider, providerReference: `demo_${nanoid(14)}`, idempotencyKey: input.idempotencyKey, status: 'PROCESSING', amountBaisa: order.totalBaisa, rawEventJson: JSON.stringify({ source: 'store-payment-initiation' }) } });
      });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: storeId, supplierId: order.supplierId, action: 'PAYMENT_INITIATED', entityType: 'order', entityId: order.id, newValue: { provider: input.provider, attemptId: attempt.id } });
      res.status(201).json({ attempt, paymentUrl: `/payments/demo/${attempt.id}`, reused: false });
    } catch (error) {
      next(error);
    }
  });

  router.get('/recurring-orders', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const recurringOrders = await prisma.recurringOrder.findMany({ where: { storeId }, include: { supplier: true, deliveryAddress: true, items: { include: { product: true } } }, orderBy: { nextRunAt: 'asc' } });
      res.json({ recurringOrders });
    } catch (error) {
      next(error);
    }
  });

  router.post('/recurring-orders', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const input = recurringOrderSchema.parse(req.body);
      const address = await prisma.address.findFirst({ where: { id: input.deliveryAddressId, organizationId: storeId } });
      if (!address) throw notFound('Delivery address');
      const products = await prisma.product.findMany({ where: { id: { in: input.items.map((item) => item.productId) }, status: 'PUBLISHED', archivedAt: null } });
      if (products.length !== input.items.length) throw badRequest('PRODUCT_UNAVAILABLE', 'Every recurring product must be published and available');
      const supplierIds = new Set(products.map((product) => product.supplierId));
      if (supplierIds.size !== 1) throw badRequest('ONE_SUPPLIER_REQUIRED', 'A recurring order must target one supplier');
      for (const item of input.items) {
        const product = products.find((candidate) => candidate.id === item.productId)!;
        if (item.quantity < product.minOrderQty) throw badRequest('MINIMUM_QUANTITY', `${product.name} requires at least ${product.minOrderQty}`);
      }
      const recurringOrder = await prisma.recurringOrder.create({
        data: { storeId, supplierId: products[0].supplierId, userId: req.user!.id, deliveryAddressId: address.id, name: input.name, cadenceDays: input.cadenceDays, nextRunAt: input.nextRunAt, paymentMethod: input.paymentMethod, note: input.note, items: { create: input.items } },
        include: { items: true, supplier: true }
      });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: storeId, supplierId: recurringOrder.supplierId, action: 'RECURRING_ORDER_CREATED', entityType: 'recurring_order', entityId: recurringOrder.id, newValue: input });
      res.status(201).json({ recurringOrder });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/recurring-orders/:id', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const recurringOrder = await prisma.recurringOrder.findFirst({ where: { id: String(req.params.id), storeId } });
      if (!recurringOrder) throw notFound('Recurring order');
      const input = z.object({ name: z.string().min(2).optional(), status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(), cadenceDays: z.number().int().min(1).max(365).optional(), nextRunAt: z.coerce.date().optional(), note: z.string().max(500).nullable().optional() }).parse(req.body);
      res.json({ recurringOrder: await prisma.recurringOrder.update({ where: { id: recurringOrder.id }, data: input }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/recurring-orders/:id/run', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const input = z.object({ idempotencyKey: z.string().min(8) }).parse(req.body);
      const recurringOrder = await prisma.recurringOrder.findFirst({ where: { id: String(req.params.id), storeId, status: 'ACTIVE' }, include: { items: true } });
      if (!recurringOrder) throw notFound('Active recurring order');
      const previousRun = await prisma.checkout.findFirst({ where: { storeId, userId: req.user!.id, idempotencyKey: input.idempotencyKey }, include: { orders: { include: { items: true, invoice: true } } } });
      if (previousRun) {
        res.json({ checkout: previousRun, orders: previousRun.orders, reused: true });
        return;
      }
      const cart = await getCart(prisma, storeId, req.user!.id);
      if (cart.items.length > 0) throw conflict('ACTIVE_CART_NOT_EMPTY', 'Submit or clear the active cart before running a recurring order');
      try {
        for (const item of recurringOrder.items) {
          await addCartItem(prisma, { storeId, userId: req.user!.id, productId: item.productId, quantity: item.quantity });
        }
        const result = await checkoutCart(prisma, req.user!, { deliveryAddressId: recurringOrder.deliveryAddressId, paymentMethod: recurringOrder.paymentMethod, note: recurringOrder.note ?? undefined, idempotencyKey: input.idempotencyKey });
        const baseline = Math.max(Date.now(), recurringOrder.nextRunAt.getTime());
        await prisma.recurringOrder.update({ where: { id: recurringOrder.id }, data: { lastRunAt: new Date(), nextRunAt: new Date(baseline + recurringOrder.cadenceDays * 86_400_000) } });
        res.status(201).json({ checkout: result.checkout, orders: result.orders, reused: false });
      } catch (error) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/spending.csv', async (req: RequestWithUser, res, next) => {
    try {
      const storeId = requireOrganization(req.user!);
      const orders = await prisma.order.findMany({ where: { storeId }, include: { supplier: true }, orderBy: { createdAt: 'desc' } });
      const rows = ['Order ID,Supplier,Status,Payment,Total OMR,Created'];
      for (const order of orders) {
        rows.push(`${order.id},${order.supplier.name},${order.status},${order.paymentStatus},${formatBaisa(order.totalBaisa)},${order.createdAt.toISOString()}`);
      }
      res.header('Content-Type', 'text/csv');
      res.send(rows.join('\n'));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const recurringOrderSchema = z.object({
  name: z.string().min(2),
  deliveryAddressId: z.string(),
  cadenceDays: z.number().int().min(1).max(365),
  nextRunAt: z.coerce.date(),
  paymentMethod: z.enum(['CARD', 'INVOICE']),
  note: z.string().max(500).optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).min(1)
});

function serializeCart(cart: Awaited<ReturnType<typeof getCart>>) {
  const groups = new Map<string, { supplierName: string; items: unknown[]; totalBaisa: number }>();
  for (const item of cart.items) {
    const supplierName = item.product.supplier.name;
    const lineTotalBaisa = item.quantity * item.product.priceBaisa;
    const group = groups.get(item.supplierId) ?? { supplierName, items: [], totalBaisa: 0 };
    group.items.push({
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      quantity: item.quantity,
      priceFormatted: formatBaisa(item.product.priceBaisa),
      lineTotalFormatted: formatBaisa(lineTotalBaisa)
    });
    group.totalBaisa += lineTotalBaisa;
    groups.set(item.supplierId, group);
  }
  return {
    id: cart.id,
    groups: [...groups.entries()].map(([supplierId, group]) => ({
      supplierId,
      ...group,
      totalFormatted: formatBaisa(group.totalBaisa)
    })),
    totalFormatted: formatBaisa([...groups.values()].reduce((sum, group) => sum + group.totalBaisa, 0))
  };
}
