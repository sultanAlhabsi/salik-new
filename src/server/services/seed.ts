import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { calculateLineTotal } from '../domain/money.js';

const password = 'Password123!';

export function assertDemoSeedAllowed(
  environment: NodeJS.ProcessEnv,
  databaseUrl: string
) {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Demo seed is disabled in production');
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Demo seed requires a local PostgreSQL host');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  ) {
    throw new Error('Demo seed requires a local PostgreSQL host');
  }
}

export async function seedDatabase(prisma: PrismaClient) {
  await clearDatabase(prisma);
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const platform = await prisma.organization.create({
    data: { name: 'SALIK Operations', type: 'PLATFORM', email: 'ops@salik.om', phone: '+96824000000' }
  });
  const freshSupplier = await prisma.organization.create({
    data: { name: 'Muscat Fresh Distribution', type: 'SUPPLIER', email: 'sales@fresh.om', phone: '+96824410000', taxNumber: 'OM-VAT-1001' }
  });
  const beverageSupplier = await prisma.organization.create({
    data: { name: 'Nizwa Beverages', type: 'SUPPLIER', email: 'orders@beverages.om', phone: '+96825440000', taxNumber: 'OM-VAT-2002' }
  });
  const alNoorStore = await prisma.organization.create({
    data: { name: 'Al Noor Market', type: 'STORE', email: 'procurement@alnoor.om', phone: '+96824550000', taxNumber: 'OM-VAT-3003' }
  });

  const storeShipping = await prisma.address.create({
    data: {
      organizationId: alNoorStore.id,
      type: 'SHIPPING',
      label: 'Al Noor Market - Muttrah',
      line1: 'Souq Street, Muttrah',
      city: 'Muscat',
      phone: '+96824550001',
      isDefault: true
    }
  });
  const storeBilling = await prisma.address.create({
    data: {
      organizationId: alNoorStore.id,
      type: 'BILLING',
      label: 'Al Noor Finance',
      line1: 'Corniche Road',
      city: 'Muscat',
      isDefault: true
    }
  });
  const freshWarehouseAddress = await prisma.address.create({
    data: {
      organizationId: freshSupplier.id,
      type: 'WAREHOUSE',
      label: 'Fresh Cold Store',
      line1: 'Ghala Industrial Area',
      city: 'Muscat',
      isDefault: true
    }
  });
  const beverageWarehouseAddress = await prisma.address.create({
    data: {
      organizationId: beverageSupplier.id,
      type: 'WAREHOUSE',
      label: 'Nizwa Drinks Depot',
      line1: 'Industrial Road',
      city: 'Nizwa',
      isDefault: true
    }
  });

  const freshWarehouse = await prisma.warehouse.create({
    data: { supplierId: freshSupplier.id, addressId: freshWarehouseAddress.id, name: 'Muscat Cold Warehouse' }
  });
  const beverageWarehouse = await prisma.warehouse.create({
    data: { supplierId: beverageSupplier.id, addressId: beverageWarehouseAddress.id, name: 'Nizwa Main Warehouse' }
  });

  const plan = await prisma.plan.create({
    data: {
      code: 'growth',
      name: 'Growth',
      monthlyPriceBaisa: 49000,
      maxUsers: 15,
      maxWarehouses: 4,
      maxProducts: 500,
      supportsCredit: true
    }
  });
  await prisma.subscription.create({
    data: {
      supplierId: freshSupplier.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: nextMonth
    }
  });
  await prisma.subscription.create({
    data: {
      supplierId: beverageSupplier.id,
      planId: plan.id,
      status: 'TRIAL',
      currentPeriodStart: now,
      currentPeriodEnd: nextMonth
    }
  });

  const users = {
    superAdmin: await prisma.user.create({
      data: { email: 'admin@salik.om', name: 'Aisha Platform Admin', passwordHash, role: 'SUPER_ADMIN', organizationId: platform.id }
    }),
    demoAdmin: await prisma.user.create({
      data: { email: 'demo-admin@salik.om', name: 'SALIK Demo Admin', passwordHash, role: 'SUPER_ADMIN' }
    }),
    freshAdmin: await prisma.user.create({
      data: { email: 'supplier@fresh.om', name: 'Salim Fresh Admin', passwordHash, role: 'SUPPLIER_ADMIN', organizationId: freshSupplier.id }
    }),
    beverageAdmin: await prisma.user.create({
      data: { email: 'supplier@beverages.om', name: 'Huda Beverage Admin', passwordHash, role: 'SUPPLIER_ADMIN', organizationId: beverageSupplier.id }
    }),
    storeAdmin: await prisma.user.create({
      data: { email: 'store@alnoor.om', name: 'Maha Store Buyer', passwordHash, role: 'STORE_ADMIN', organizationId: alNoorStore.id }
    }),
    freshDriver: await prisma.user.create({
      data: { email: 'driver@fresh.om', name: 'Yusuf Delivery Driver', passwordHash, role: 'DRIVER', organizationId: freshSupplier.id }
    }),
    beverageDriver: await prisma.user.create({
      data: { email: 'driver@beverages.om', name: 'Nasser Beverage Driver', passwordHash, role: 'DRIVER', organizationId: beverageSupplier.id }
    })
  };

  const dairy = await prisma.productCategory.create({ data: { supplierId: freshSupplier.id, name: 'Dairy' } });
  const drinks = await prisma.productCategory.create({ data: { supplierId: beverageSupplier.id, name: 'Beverages' } });

  const freshMilk = await prisma.product.create({
    data: {
      supplierId: freshSupplier.id,
      categoryId: dairy.id,
      sku: 'FR-MILK-1L',
      name: 'Fresh Milk 1L',
      description: 'Chilled whole milk packed for grocery shelves and cafes.',
      unit: 'carton',
      priceBaisa: 650,
      taxRateBps: 500,
      minOrderQty: 1,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80'
    }
  });
  const laban = await prisma.product.create({
    data: {
      supplierId: freshSupplier.id,
      categoryId: dairy.id,
      sku: 'FR-LABAN-500',
      name: 'Laban 500ml',
      description: 'Single-serve laban packs for chilled displays.',
      unit: 'case',
      priceBaisa: 4200,
      taxRateBps: 500,
      minOrderQty: 2,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=900&q=80'
    }
  });
  const beverageWater = await prisma.product.create({
    data: {
      supplierId: beverageSupplier.id,
      categoryId: drinks.id,
      sku: 'NZ-WATER-12',
      name: 'Spring Water 12 Pack',
      description: 'Omani spring water case for restaurants and minimarkets.',
      unit: 'case',
      priceBaisa: 1800,
      taxRateBps: 500,
      minOrderQty: 1,
      status: 'PUBLISHED',
      imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80'
    }
  });

  await prisma.inventoryStock.createMany({
    data: [
      { supplierId: freshSupplier.id, productId: freshMilk.id, warehouseId: freshWarehouse.id, onHand: 120, reserved: 0, lowStockThreshold: 20 },
      { supplierId: freshSupplier.id, productId: laban.id, warehouseId: freshWarehouse.id, onHand: 80, reserved: 0, lowStockThreshold: 15 },
      { supplierId: beverageSupplier.id, productId: beverageWater.id, warehouseId: beverageWarehouse.id, onHand: 200, reserved: 0, lowStockThreshold: 30 }
    ]
  });

  await prisma.cart.create({ data: { storeId: alNoorStore.id, userId: users.storeAdmin.id, status: 'ACTIVE' } });

  const seededOrder = await createSeededReadyOrder(prisma, {
    supplierId: freshSupplier.id,
    storeId: alNoorStore.id,
    createdById: users.storeAdmin.id,
    deliveryAddressId: storeShipping.id,
    productId: freshMilk.id,
    driverId: users.freshDriver.id
  });

  await prisma.supportTicket.create({
    data: {
      organizationId: alNoorStore.id,
      createdById: users.storeAdmin.id,
      subject: 'Need invoice copy',
      message: 'Please share the latest invoice copy for accounting.',
      status: 'OPEN'
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: users.superAdmin.id,
      organizationId: platform.id,
      action: 'SEED_CREATED',
      entityType: 'platform',
      entityId: platform.id,
      newValueJson: JSON.stringify({ message: 'Demo data loaded' })
    }
  });
  await prisma.platformSetting.create({ data: { key: 'order-policy', valueJson: JSON.stringify({ cancellationWindowMinutes: 30 }) } });

  return {
    password,
    organizations: { platform, freshSupplier, beverageSupplier, alNoorStore },
    users,
    addresses: { storeShipping, storeBilling, freshWarehouseAddress, beverageWarehouseAddress },
    warehouses: { freshWarehouse, beverageWarehouse },
    products: { freshMilk, laban, beverageWater },
    plan,
    seededOrder
  };
}

async function createSeededReadyOrder(
  prisma: PrismaClient,
  input: {
    supplierId: string;
    storeId: string;
    createdById: string;
    deliveryAddressId: string;
    productId: string;
    driverId: string;
  }
) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: input.productId } });
  const line = calculateLineTotal({ unitPriceBaisa: product.priceBaisa, quantity: 3, taxRateBps: product.taxRateBps });
  const order = await prisma.order.create({
    data: {
      supplierId: input.supplierId,
      storeId: input.storeId,
      createdById: input.createdById,
      deliveryAddressId: input.deliveryAddressId,
      status: 'READY_FOR_DELIVERY',
      paymentStatus: 'PENDING',
      paymentMethod: 'INVOICE',
      subtotalBaisa: line.subtotalBaisa,
      taxBaisa: line.taxBaisa,
      totalBaisa: line.totalBaisa,
      items: {
        create: {
          productId: product.id,
          skuSnapshot: product.sku,
          nameSnapshot: product.name,
          unit: product.unit,
          quantity: 3,
          unitPriceBaisa: product.priceBaisa,
          taxRateBps: product.taxRateBps,
          lineTotalBaisa: line.totalBaisa
        }
      }
    }
  });
  const stock = await prisma.inventoryStock.findFirstOrThrow({ where: { productId: product.id } });
  await prisma.inventoryStock.update({ where: { id: stock.id }, data: { reserved: stock.reserved + 3 } });
  await prisma.inventoryMovement.create({
    data: {
      supplierId: input.supplierId,
      productId: product.id,
      warehouseId: stock.warehouseId,
      orderId: order.id,
      actorId: input.createdById,
      type: 'RESERVATION',
      quantity: 3,
      beforeOnHand: stock.onHand,
      afterOnHand: stock.onHand,
      beforeReserved: stock.reserved,
      afterReserved: stock.reserved + 3,
      idempotencyKey: `seed-reserve:${order.id}:${product.id}`
    }
  });
  await prisma.invoice.create({
    data: {
      orderId: order.id,
      supplierId: input.supplierId,
      storeId: input.storeId,
      invoiceNumber: 'INV-SEED-0001',
      status: 'ISSUED',
      subtotalBaisa: line.subtotalBaisa,
      taxBaisa: line.taxBaisa,
      totalBaisa: line.totalBaisa
    }
  });
  const delivery = await prisma.delivery.create({
    data: {
      supplierId: input.supplierId,
      storeId: input.storeId,
      orderId: order.id,
      driverId: input.driverId,
      status: 'ASSIGNED'
    }
  });
  await prisma.deliveryEvent.create({
    data: {
      deliveryId: delivery.id,
      actorId: input.createdById,
      newStatus: 'ASSIGNED',
      message: 'Seed delivery assigned'
    }
  });
  return order;
}

async function clearDatabase(prisma: PrismaClient) {
  await prisma.recurringOrderItem.deleteMany();
  await prisma.recurringOrder.deleteMany();
  await prisma.platformSetting.deleteMany();
  await prisma.paymentAttempt.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.deliveryEvent.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.checkout.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.inventoryStock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.address.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
