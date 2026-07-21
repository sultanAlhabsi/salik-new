import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { requireOrganization } from '../domain/access.js';
import { badRequest, conflict, notFound } from '../domain/errors.js';
import { formatBaisa } from '../domain/money.js';
import { assertOrderTransition } from '../domain/stateMachines.js';
import { requireAnyRole, requireAuth, type RequestWithUser } from '../middleware/auth.js';
import { releaseOrderReservations } from '../services/checkout.js';
import { assignDriverToOrder } from '../services/deliveries.js';
import { adjustInventory } from '../services/inventory.js';
import { notifyOrganization } from '../services/notifications.js';
import { writeAudit } from '../services/audit.js';
import { assertSupplierLimit } from '../services/planLimits.js';

const supplierRoles = ['SUPPLIER_ADMIN', 'SUPPLIER_STAFF'] as const;

export function supplierRoutes(prisma: PrismaClient) {
  const router = Router();
  router.use(requireAuth, requireAnyRole([...supplierRoles]));

  router.get('/dashboard', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const [orders, products, lowStock, deliveries, invoices] = await Promise.all([
        prisma.order.findMany({ where: { supplierId }, include: { store: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
        prisma.product.count({ where: { supplierId, archivedAt: null } }),
        prisma.inventoryStock.count({ where: { supplierId, onHand: { lte: 20 } } }),
        prisma.delivery.count({ where: { supplierId, status: { notIn: ['DELIVERED', 'FAILED'] } } }),
        prisma.invoice.findMany({ where: { supplierId }, orderBy: { createdAt: 'desc' }, take: 6 })
      ]);
      res.json({
        stats: {
          orders: await prisma.order.count({ where: { supplierId } }),
          products,
          lowStock,
          activeDeliveries: deliveries,
          openInvoices: invoices.filter((invoice) => invoice.status === 'ISSUED').length
        },
        recentOrders: orders.map((order) => ({ ...order, totalFormatted: formatBaisa(order.totalBaisa) }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/products', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const products = await prisma.product.findMany({
        where: { supplierId, archivedAt: null },
        include: { category: true, stocks: true },
        orderBy: { name: 'asc' }
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

  router.get('/products/:id', async (req: RequestWithUser, res, next) => {
    try {
      const productId = z.string().parse(req.params.id);
      const supplierId = requireOrganization(req.user!);
      const product = await prisma.product.findFirst({
        where: { id: productId, supplierId, archivedAt: null },
        include: { stocks: true, category: true }
      });
      if (!product) throw notFound('Product');
      res.json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.post('/products', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      await assertSupplierLimit(prisma, supplierId, 'products');
      const input = z
        .object({
          sku: z.string().min(2),
          name: z.string().min(2),
          description: z.string().min(2),
          unit: z.string().min(1),
          priceBaisa: z.number().int().positive(),
          taxRateBps: z.number().int().min(0).max(10_000).default(0),
          minOrderQty: z.number().int().positive().default(1),
          categoryId: z.string().nullable().optional(),
          imageUrl: z.string().url().nullable().optional()
        })
        .parse(req.body);
      if (input.categoryId && !(await prisma.productCategory.findFirst({ where: { id: input.categoryId, supplierId } }))) {
        throw notFound('Category');
      }
      const product = await prisma.product.create({ data: { ...input, supplierId, status: 'DRAFT' } });
      await writeAudit(prisma, {
        actorId: req.user!.id,
        organizationId: supplierId,
        supplierId,
        action: 'PRODUCT_CREATED',
        entityType: 'product',
        entityId: product.id,
        newValue: input
      });
      res.status(201).json({ product });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/products/:id', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const product = await prisma.product.findFirst({ where: { id: String(req.params.id), supplierId, archivedAt: null } });
      if (!product) throw notFound('Product');
      const input = z.object({
        name: z.string().min(2).optional(), description: z.string().min(2).optional(), unit: z.string().min(1).optional(),
        priceBaisa: z.number().int().positive().optional(), taxRateBps: z.number().int().min(0).max(10_000).optional(),
        minOrderQty: z.number().int().positive().optional(), categoryId: z.string().nullable().optional(), imageUrl: z.string().url().nullable().optional(),
        status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED']).optional()
      }).parse(req.body);
      if (input.categoryId) {
        const category = await prisma.productCategory.findFirst({ where: { id: input.categoryId, supplierId } });
        if (!category) throw notFound('Category');
      }
      const updated = await prisma.product.update({
        where: { id: product.id },
        data: { ...input, archivedAt: input.status === 'ARCHIVED' ? new Date() : undefined }
      });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: supplierId, supplierId, action: 'PRODUCT_UPDATED', entityType: 'product', entityId: product.id, previousValue: product, newValue: input });
      res.json({ product: updated });
    } catch (error) {
      next(error);
    }
  });

  router.get('/categories', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      res.json({ categories: await prisma.productCategory.findMany({ where: { supplierId }, include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/categories', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const input = z.object({ name: z.string().min(2) }).parse(req.body);
      const category = await prisma.productCategory.create({ data: { supplierId, name: input.name } });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: supplierId, supplierId, action: 'CATEGORY_CREATED', entityType: 'category', entityId: category.id, newValue: input });
      res.status(201).json({ category });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/categories/:id', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const category = await prisma.productCategory.findFirst({ where: { id: String(req.params.id), supplierId } });
      if (!category) throw notFound('Category');
      const input = z.object({ name: z.string().min(2).optional(), status: z.enum(['PUBLISHED', 'HIDDEN', 'ARCHIVED']).optional() }).parse(req.body);
      res.json({ category: await prisma.productCategory.update({ where: { id: category.id }, data: input }) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/warehouses', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      res.json({ warehouses: await prisma.warehouse.findMany({ where: { supplierId }, include: { address: true, _count: { select: { stocks: true } } }, orderBy: { name: 'asc' } }) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/warehouses', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      await assertSupplierLimit(prisma, supplierId, 'warehouses');
      const input = z.object({ name: z.string().min(2), addressId: z.string().nullable().optional() }).parse(req.body);
      if (input.addressId && !(await prisma.address.findFirst({ where: { id: input.addressId, organizationId: supplierId } }))) throw notFound('Address');
      const warehouse = await prisma.warehouse.create({ data: { supplierId, ...input } });
      await writeAudit(prisma, { actorId: req.user!.id, organizationId: supplierId, supplierId, action: 'WAREHOUSE_CREATED', entityType: 'warehouse', entityId: warehouse.id, newValue: input });
      res.status(201).json({ warehouse });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/warehouses/:id', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const warehouse = await prisma.warehouse.findFirst({ where: { id: String(req.params.id), supplierId } });
      if (!warehouse) throw notFound('Warehouse');
      const input = z.object({ name: z.string().min(2).optional(), addressId: z.string().nullable().optional(), status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional() }).parse(req.body);
      res.json({ warehouse: await prisma.warehouse.update({ where: { id: warehouse.id }, data: input }) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/inventory', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const stocks = await prisma.inventoryStock.findMany({
        where: { supplierId },
        include: { product: true, warehouse: true },
        orderBy: { updatedAt: 'desc' }
      });
      res.json({
        stocks: stocks.map((stock) => ({
          ...stock,
          available: stock.onHand - stock.reserved,
          isLow: stock.onHand - stock.reserved <= stock.lowStockThreshold
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/inventory/adjust', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const input = z
        .object({
          productId: z.string(),
          warehouseId: z.string(),
          quantity: z.number().int().positive(),
          type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
          idempotencyKey: z.string().min(8)
        })
        .parse(req.body);
      const movement = await adjustInventory(prisma, { ...input, supplierId, actorId: req.user!.id });
      res.status(201).json({ movement });
    } catch (error) {
      next(error);
    }
  });

  router.get('/orders', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const orders = await prisma.order.findMany({
        where: { supplierId },
        include: {
          store: true,
          items: true,
          delivery: { include: { driver: { select: { id: true, name: true, email: true, status: true } } } },
          invoice: true,
          events: true
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json({ orders: orders.map((order) => ({ ...order, totalFormatted: formatBaisa(order.totalBaisa) })) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/orders/:id/transition', async (req: RequestWithUser, res, next) => {
    try {
      const orderId = z.string().parse(req.params.id);
      const supplierId = requireOrganization(req.user!);
      const input = z.object({ status: z.enum(['ACCEPTED', 'PREPARING', 'READY_FOR_DELIVERY', 'REJECTED', 'CANCELLED']) }).parse(req.body);
      const order = await prisma.order.findFirst({ where: { id: orderId, supplierId }, include: { items: true } });
      if (!order) throw notFound('Order');
      if (!assertOrderTransition(order.status, input.status)) {
        throw badRequest('INVALID_ORDER_TRANSITION', `Cannot move order from ${order.status} to ${input.status}`);
      }
      if (order.paymentStatus === 'PAID' && ['REJECTED', 'CANCELLED'].includes(input.status)) {
        throw badRequest('PAID_ORDER_CANNOT_BE_CANCELLED', 'A paid order requires an approved refund workflow before cancellation');
      }
      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.order.updateMany({
          where: { id: order.id, supplierId, status: order.status },
          data: { status: input.status }
        });
        if (changed.count !== 1) {
          throw conflict('ORDER_STATE_CONFLICT', 'The order changed while this update was being applied');
        }
        if (input.status === 'CANCELLED' || input.status === 'REJECTED') {
          await releaseOrderReservations(tx, order.id, req.user!.id);
          await tx.invoice.updateMany({ where: { orderId: order.id }, data: { status: 'CANCELLED' } });
        }
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            actorId: req.user!.id,
            type: 'ORDER_STATUS_CHANGED',
            previousValueJson: JSON.stringify({ status: order.status }),
            newValueJson: JSON.stringify({ status: input.status }),
            message: `Order moved from ${order.status} to ${input.status}`
          }
        });
        await notifyOrganization(tx, {
          organizationId: order.storeId,
          entityType: 'order',
          entityId: order.id,
          title: 'Order status updated',
          body: `Order status changed to ${input.status.replaceAll('_', ' ').toLowerCase()}`
        });
        await writeAudit(tx, {
          actorId: req.user!.id,
          organizationId: supplierId,
          supplierId,
          action: 'ORDER_STATUS_CHANGED',
          entityType: 'order',
          entityId: order.id,
          previousValue: { status: order.status },
          newValue: { status: input.status }
        });
        return tx.order.findUniqueOrThrow({ where: { id: order.id } });
      });
      res.json({ order: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/orders/:id/assign-driver', async (req: RequestWithUser, res, next) => {
    try {
      const orderId = z.string().parse(req.params.id);
      const input = z.object({ driverId: z.string() }).parse(req.body);
      const delivery = await assignDriverToOrder(prisma, {
        supplierUser: req.user!,
        orderId,
        driverId: input.driverId
      });
      res.status(201).json({ delivery });
    } catch (error) {
      next(error);
    }
  });

  router.get('/drivers', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const drivers = await prisma.user.findMany({
        where: { organizationId: supplierId, role: 'DRIVER' },
        select: { id: true, name: true, email: true, status: true }
      });
      res.json({ drivers });
    } catch (error) {
      next(error);
    }
  });

  router.get('/deliveries', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const deliveries = await prisma.delivery.findMany({
        where: { supplierId },
        include: { driver: { select: { id: true, name: true, email: true, status: true } }, order: { include: { store: true, deliveryAddress: true } }, events: true },
        orderBy: { updatedAt: 'desc' }
      });
      res.json({ deliveries });
    } catch (error) {
      next(error);
    }
  });

  router.post('/deliveries/:id/reschedule', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const input = z.object({ scheduledFor: z.coerce.date() }).parse(req.body);
      const delivery = await prisma.delivery.findFirst({ where: { id: String(req.params.id), supplierId, status: 'FAILED' } });
      if (!delivery) throw notFound('Failed delivery');
      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.delivery.updateMany({ where: { id: delivery.id, status: 'FAILED' }, data: { status: 'RESCHEDULED', scheduledFor: input.scheduledFor } });
        if (changed.count !== 1) throw conflict('DELIVERY_STATE_CONFLICT', 'The delivery changed while it was being rescheduled');
        await tx.deliveryEvent.create({ data: { deliveryId: delivery.id, actorId: req.user!.id, previousStatus: 'FAILED', newStatus: 'RESCHEDULED', message: `Delivery rescheduled for ${input.scheduledFor.toISOString()}` } });
        await writeAudit(tx, { actorId: req.user!.id, organizationId: supplierId, supplierId, action: 'DELIVERY_RESCHEDULED', entityType: 'delivery', entityId: delivery.id, previousValue: { status: 'FAILED' }, newValue: { status: 'RESCHEDULED', scheduledFor: input.scheduledFor } });
        return tx.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      });
      res.json({ delivery: updated });
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/sales.csv', async (req: RequestWithUser, res, next) => {
    try {
      const supplierId = requireOrganization(req.user!);
      const orders = await prisma.order.findMany({ where: { supplierId }, include: { store: true }, orderBy: { createdAt: 'desc' } });
      const rows = ['Order ID,Store,Status,Payment,Total OMR,Created'];
      for (const order of orders) {
        rows.push(`${order.id},${order.store.name},${order.status},${order.paymentStatus},${formatBaisa(order.totalBaisa)},${order.createdAt.toISOString()}`);
      }
      res.header('Content-Type', 'text/csv');
      res.send(rows.join('\n'));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
