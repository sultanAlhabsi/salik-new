import type { PaymentMethod, Prisma, PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { addBaisa, calculateLineTotal } from '../domain/money.js';
import { badRequest, conflict, notFound } from '../domain/errors.js';
import type { AuthUser } from '../domain/access.js';
import { reserveInventory, releaseInventory } from './inventory.js';
import { notifyOrganization } from './notifications.js';
import { writeAudit } from './audit.js';

type Db = PrismaClient | Prisma.TransactionClient;

export const checkoutInputSchema = z.object({
  deliveryAddressId: z.string().min(1),
  paymentMethod: z.enum(['CARD', 'INVOICE']),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8)
});

export async function getOrCreateActiveCart(db: Db, storeId: string, userId: string) {
  const existing = await db.cart.findFirst({ where: { storeId, userId, status: 'ACTIVE' } });
  if (existing) return existing;
  return db.cart.create({ data: { storeId, userId, status: 'ACTIVE' } });
}

export async function addCartItem(
  db: Db,
  input: {
    storeId: string;
    userId: string;
    productId: string;
    quantity: number;
  }
) {
  if (input.quantity <= 0) {
    throw badRequest('INVALID_QUANTITY', 'Quantity must be greater than zero');
  }
  const product = await db.product.findFirst({
    where: { id: input.productId, status: 'PUBLISHED', archivedAt: null },
    include: { supplier: true }
  });
  if (!product) {
    throw notFound('Product');
  }
  if (input.quantity < product.minOrderQty) {
    throw badRequest('MINIMUM_QUANTITY', `Minimum order quantity is ${product.minOrderQty}`);
  }
  const cart = await getOrCreateActiveCart(db, input.storeId, input.userId);
  return db.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId: product.id } },
    update: { quantity: input.quantity, supplierId: product.supplierId, userId: input.userId },
    create: {
      cartId: cart.id,
      productId: product.id,
      supplierId: product.supplierId,
      userId: input.userId,
      quantity: input.quantity
    },
    include: { product: { include: { supplier: true, stocks: true } } }
  });
}

export async function getCart(db: Db, storeId: string, userId: string) {
  const cart = await getOrCreateActiveCart(db, storeId, userId);
  return db.cart.findUniqueOrThrow({
    where: { id: cart.id },
    include: { items: { include: { product: { include: { supplier: true, stocks: true } } } } }
  });
}

export async function checkoutCart(db: PrismaClient, user: AuthUser, rawInput: unknown) {
  const input = checkoutInputSchema.parse(rawInput);
  const storeId = user.organizationId;
  if (!storeId) {
    throw badRequest('STORE_REQUIRED', 'Checkout requires a store user');
  }

  const existing = await db.checkout.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { orders: { include: { items: true, invoice: true } } }
  });
  if (existing) {
    if (existing.storeId !== storeId || existing.userId !== user.id) {
      throw conflict('IDEMPOTENCY_KEY_CONFLICT', 'This checkout idempotency key is already in use');
    }
    return { checkout: existing, orders: existing.orders, reused: true };
  }

  const cart = await db.cart.findFirst({
    where: { storeId, userId: user.id, status: 'ACTIVE' },
    include: { items: { include: { product: { include: { stocks: true } } } } }
  });
  if (!cart || cart.items.length === 0) {
    throw badRequest('EMPTY_CART', 'Cart is empty');
  }

  const address = await db.address.findFirst({ where: { id: input.deliveryAddressId, organizationId: storeId } });
  if (!address) {
    throw notFound('Delivery address');
  }

  return db.$transaction(async (tx) => {
    const checkout = await tx.checkout.create({
      data: {
        reference: `CHK-${nanoid(10).toUpperCase()}`,
        storeId,
        userId: user.id,
        idempotencyKey: input.idempotencyKey,
        status: 'SUBMITTED'
      }
    });

    const itemsBySupplier = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
      const product = item.product;
      if (product.status !== 'PUBLISHED' || product.archivedAt) {
        throw badRequest('PRODUCT_UNAVAILABLE', `${product.name} is not currently available`);
      }
      if (item.quantity < product.minOrderQty) {
        throw badRequest('MINIMUM_QUANTITY', `${product.name} requires at least ${product.minOrderQty}`);
      }
      const available = product.stocks.reduce((sum, stock) => sum + stock.onHand - stock.reserved, 0);
      if (available < item.quantity) {
        throw badRequest('INSUFFICIENT_STOCK', `${product.name} does not have enough stock`);
      }
      itemsBySupplier.set(product.supplierId, [...(itemsBySupplier.get(product.supplierId) ?? []), item]);
    }

    const orders = [];
    for (const [supplierId, supplierItems] of itemsBySupplier) {
      const lineTotals = supplierItems.map((item) =>
        calculateLineTotal({
          unitPriceBaisa: item.product.priceBaisa,
          quantity: item.quantity,
          taxRateBps: item.product.taxRateBps
        })
      );
      const subtotalBaisa = addBaisa(lineTotals.map((line) => line.subtotalBaisa));
      const taxBaisa = addBaisa(lineTotals.map((line) => line.taxBaisa));
      const totalBaisa = subtotalBaisa + taxBaisa;
      const order = await tx.order.create({
        data: {
          checkoutId: checkout.id,
          supplierId,
          storeId,
          createdById: user.id,
          deliveryAddressId: address.id,
          status: 'SUBMITTED',
          paymentStatus: 'PENDING',
          paymentMethod: input.paymentMethod as PaymentMethod,
          note: input.note,
          subtotalBaisa,
          taxBaisa,
          totalBaisa,
          idempotencyKey: `${input.idempotencyKey}:${supplierId}`,
          items: {
            create: supplierItems.map((item, index) => ({
              productId: item.productId,
              skuSnapshot: item.product.sku,
              nameSnapshot: item.product.name,
              unit: item.product.unit,
              quantity: item.quantity,
              unitPriceBaisa: item.product.priceBaisa,
              taxRateBps: item.product.taxRateBps,
              lineTotalBaisa: lineTotals[index].totalBaisa
            }))
          },
          events: {
            create: {
              actorId: user.id,
              type: 'ORDER_SUBMITTED',
              newValueJson: JSON.stringify({ status: 'SUBMITTED' }),
              message: `Order submitted from checkout ${checkout.reference}`
            }
          }
        },
        include: { items: true }
      });

      await tx.invoice.create({
        data: {
          orderId: order.id,
          supplierId,
          storeId,
          invoiceNumber: `INV-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`,
          status: 'ISSUED',
          subtotalBaisa,
          taxBaisa,
          totalBaisa
        }
      });

      for (const item of supplierItems) {
        await reserveInventory(tx, {
          supplierId,
          productId: item.productId,
          quantity: item.quantity,
          orderId: order.id,
          actorId: user.id,
          idempotencyKey: `reserve:${order.id}:${item.productId}`
        });
      }

      await notifyOrganization(tx, {
        organizationId: supplierId,
        entityType: 'order',
        entityId: order.id,
        title: 'New order submitted',
        body: `A store submitted order ${order.id.slice(-6).toUpperCase()}`
      });
      await writeAudit(tx, {
        actorId: user.id,
        organizationId: storeId,
        supplierId,
        action: 'ORDER_SUBMITTED',
        entityType: 'order',
        entityId: order.id,
        newValue: { status: 'SUBMITTED', totalBaisa }
      });

      orders.push(order);
    }

    await tx.cart.update({ where: { id: cart.id }, data: { status: 'CHECKED_OUT', checkoutRef: checkout.reference } });
    await tx.cart.create({ data: { storeId, userId: user.id, status: 'ACTIVE' } });

    return {
      checkout,
      orders,
      reused: false
    };
  });
}

export async function releaseOrderReservations(db: Db, orderId: string, actorId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw notFound('Order');
  for (const item of order.items) {
    await releaseInventory(db, {
      supplierId: order.supplierId,
      productId: item.productId,
      quantity: item.quantity,
      orderId: order.id,
      actorId,
      idempotencyKey: `release:${order.id}:${item.productId}`
    });
  }
}
