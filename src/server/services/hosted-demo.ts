import bcrypt from 'bcryptjs';
import type { PrismaClient, UserRole } from '@prisma/client';
import { calculateLineTotal } from '../domain/money.js';

export const hostedDemoPassword = 'Password123!';

export const hostedDemoIds = {
  supplier: 'hosted-demo-supplier',
  store: 'hosted-demo-store',
  supplierUser: 'hosted-demo-user-supplier',
  storeUser: 'hosted-demo-user-store',
  driverUser: 'hosted-demo-user-driver',
  storeShippingAddress: 'hosted-demo-address-store-shipping',
  storeBillingAddress: 'hosted-demo-address-store-billing',
  warehouseAddress: 'hosted-demo-address-warehouse',
  warehouse: 'hosted-demo-warehouse',
  plan: 'hosted-demo-plan-growth',
  subscription: 'hosted-demo-subscription',
  category: 'hosted-demo-category-dairy',
  milkProduct: 'hosted-demo-product-milk',
  labanProduct: 'hosted-demo-product-laban',
  milkStock: 'hosted-demo-stock-milk',
  labanStock: 'hosted-demo-stock-laban',
  cart: 'hosted-demo-cart',
  cartItem: 'hosted-demo-cart-item',
  order: 'hosted-demo-order',
  orderItem: 'hosted-demo-order-item',
  orderEvent: 'hosted-demo-order-event',
  movement: 'hosted-demo-inventory-movement',
  invoice: 'hosted-demo-invoice',
  delivery: 'hosted-demo-delivery',
  deliveryEvent: 'hosted-demo-delivery-event'
} as const;

export type HostedDemoProvisionInput = {
  email: string;
  password: string;
  name: string;
  role: Extract<UserRole, 'SUPPLIER_ADMIN' | 'STORE_ADMIN' | 'DRIVER'>;
  organizationId: string;
};

export type HostedDemoProvisioner = (input: HostedDemoProvisionInput) => Promise<string>;

export function assertHostedDemoBootstrapAllowed(
  environment: NodeJS.ProcessEnv,
  supabaseEnabled: boolean
) {
  if (environment.HOSTED_DEMO_CONFIRM !== 'SALIK_HOSTED_DEMO') {
    throw new Error(
      'Hosted demo bootstrap requires HOSTED_DEMO_CONFIRM=SALIK_HOSTED_DEMO'
    );
  }
  if (environment.NODE_ENV !== 'production') {
    throw new Error('Hosted demo bootstrap requires NODE_ENV=production');
  }
  if (!supabaseEnabled) {
    throw new Error('Hosted demo bootstrap requires Supabase Auth');
  }
}

export const hostedDemoAccounts = [
  {
    id: hostedDemoIds.supplierUser,
    email: 'supplier@fresh.om',
    name: 'Salim Fresh Admin',
    role: 'SUPPLIER_ADMIN',
    organizationId: hostedDemoIds.supplier
  },
  {
    id: hostedDemoIds.storeUser,
    email: 'store@alnoor.om',
    name: 'Maha Store Buyer',
    role: 'STORE_ADMIN',
    organizationId: hostedDemoIds.store
  },
  {
    id: hostedDemoIds.driverUser,
    email: 'driver@fresh.om',
    name: 'Yusuf Delivery Driver',
    role: 'DRIVER',
    organizationId: hostedDemoIds.supplier
  }
] as const satisfies ReadonlyArray<
  Omit<HostedDemoProvisionInput, 'password'> & { id: string }
>;

export async function bootstrapHostedDemo(
  prisma: PrismaClient,
  provision: HostedDemoProvisioner
) {
  const existingUsers = await validateOwnedUsers(prisma);
  await upsertOrganizations(prisma);

  const passwordHash = await bcrypt.hash(hostedDemoPassword, 10);
  const resolvedUserIds = new Map<string, string>();
  let createdUsers = 0;

  for (const account of hostedDemoAccounts) {
    const existingUser = existingUsers.get(account.email);
    const authUserId = await provision({
      email: account.email,
      password: hostedDemoPassword,
      name: account.name,
      role: account.role,
      organizationId: account.organizationId
    });
    if (existingUser?.authUserId && existingUser.authUserId !== authUserId) {
      throw new Error(`Hosted demo identity conflicts with the existing user: ${account.email}`);
    }

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            authUserId,
            name: account.name,
            passwordHash,
            role: account.role,
            status: 'ACTIVE',
            organizationId: account.organizationId
          }
        })
      : await prisma.user.create({
          data: {
            id: account.id,
            authUserId,
            email: account.email,
            name: account.name,
            passwordHash,
            role: account.role,
            status: 'ACTIVE',
            organizationId: account.organizationId
          }
        });
    if (!existingUser) createdUsers += 1;
    resolvedUserIds.set(account.email, user.id);
  }

  await upsertBusinessData(prisma, {
    supplierUserId: resolvedUserIds.get('supplier@fresh.om')!,
    storeUserId: resolvedUserIds.get('store@alnoor.om')!,
    driverUserId: resolvedUserIds.get('driver@fresh.om')!
  });

  return {
    createdUsers,
    reconciledUsers: hostedDemoAccounts.length - createdUsers
  };
}

async function validateOwnedUsers(prisma: PrismaClient) {
  const users = new Map<
    string,
    { id: string; email: string; role: UserRole; organizationId: string | null; authUserId: string | null }
  >();

  for (const account of hostedDemoAccounts) {
    const [byEmail, byId] = await Promise.all([
      prisma.user.findUnique({ where: { email: account.email } }),
      prisma.user.findUnique({ where: { id: account.id } })
    ]);
    if (
      byEmail &&
      (byEmail.role !== account.role || byEmail.organizationId !== account.organizationId)
    ) {
      throw new Error(`Hosted demo email conflicts with an existing user: ${account.email}`);
    }
    if (byId && byId.email !== account.email) {
      throw new Error(`Hosted demo record conflicts with an existing user: ${account.id}`);
    }
    if (byEmail) users.set(account.email, byEmail);
  }

  return users;
}

async function upsertOrganizations(prisma: PrismaClient) {
  const definitions = [
    {
      id: hostedDemoIds.supplier,
      name: 'Muscat Fresh Distribution',
      type: 'SUPPLIER' as const,
      email: 'sales@fresh.om',
      phone: '+96824410000',
      taxNumber: 'OM-VAT-DEMO-1001'
    },
    {
      id: hostedDemoIds.store,
      name: 'Al Noor Market',
      type: 'STORE' as const,
      email: 'procurement@alnoor.om',
      phone: '+96824550000',
      taxNumber: 'OM-VAT-DEMO-3003'
    }
  ];

  for (const definition of definitions) {
    const existing = await prisma.organization.findUnique({ where: { id: definition.id } });
    if (existing && existing.type !== definition.type) {
      throw new Error(`Hosted demo organization conflicts with an existing record: ${definition.id}`);
    }
    await prisma.organization.upsert({
      where: { id: definition.id },
      create: { ...definition, status: 'ACTIVE' },
      update: { ...definition, status: 'ACTIVE', archivedAt: null }
    });
  }
}

async function upsertBusinessData(
  prisma: PrismaClient,
  users: { supplierUserId: string; storeUserId: string; driverUserId: string }
) {
  const line = calculateLineTotal({ unitPriceBaisa: 650, quantity: 3, taxRateBps: 500 });
  const periodStart = new Date('2026-01-01T00:00:00.000Z');
  const periodEnd = new Date('2036-01-01T00:00:00.000Z');

  await prisma.$transaction(async (transaction) => {
    await transaction.address.upsert({
      where: { id: hostedDemoIds.storeShippingAddress },
      create: {
        id: hostedDemoIds.storeShippingAddress,
        organizationId: hostedDemoIds.store,
        type: 'SHIPPING',
        label: 'Al Noor Market - Muttrah',
        line1: 'Souq Street, Muttrah',
        city: 'Muscat',
        phone: '+96824550001',
        isDefault: true
      },
      update: {
        organizationId: hostedDemoIds.store,
        type: 'SHIPPING',
        label: 'Al Noor Market - Muttrah',
        line1: 'Souq Street, Muttrah',
        city: 'Muscat',
        phone: '+96824550001',
        isDefault: true
      }
    });
    await transaction.address.upsert({
      where: { id: hostedDemoIds.storeBillingAddress },
      create: {
        id: hostedDemoIds.storeBillingAddress,
        organizationId: hostedDemoIds.store,
        type: 'BILLING',
        label: 'Al Noor Finance',
        line1: 'Corniche Road',
        city: 'Muscat',
        isDefault: true
      },
      update: {
        organizationId: hostedDemoIds.store,
        type: 'BILLING',
        label: 'Al Noor Finance',
        line1: 'Corniche Road',
        city: 'Muscat',
        isDefault: true
      }
    });
    await transaction.address.upsert({
      where: { id: hostedDemoIds.warehouseAddress },
      create: {
        id: hostedDemoIds.warehouseAddress,
        organizationId: hostedDemoIds.supplier,
        type: 'WAREHOUSE',
        label: 'Fresh Cold Store',
        line1: 'Ghala Industrial Area',
        city: 'Muscat',
        isDefault: true
      },
      update: {
        organizationId: hostedDemoIds.supplier,
        type: 'WAREHOUSE',
        label: 'Fresh Cold Store',
        line1: 'Ghala Industrial Area',
        city: 'Muscat',
        isDefault: true
      }
    });
    await transaction.warehouse.upsert({
      where: { id: hostedDemoIds.warehouse },
      create: {
        id: hostedDemoIds.warehouse,
        supplierId: hostedDemoIds.supplier,
        addressId: hostedDemoIds.warehouseAddress,
        name: 'Muscat Cold Warehouse',
        status: 'ACTIVE'
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        addressId: hostedDemoIds.warehouseAddress,
        name: 'Muscat Cold Warehouse',
        status: 'ACTIVE'
      }
    });
    await transaction.plan.upsert({
      where: { id: hostedDemoIds.plan },
      create: {
        id: hostedDemoIds.plan,
        code: 'hosted-demo-growth',
        name: 'Hosted Demo Growth',
        status: 'ACTIVE',
        monthlyPriceBaisa: 49000,
        maxUsers: 15,
        maxWarehouses: 4,
        maxProducts: 500,
        supportsCredit: true
      },
      update: {
        code: 'hosted-demo-growth',
        name: 'Hosted Demo Growth',
        status: 'ACTIVE',
        monthlyPriceBaisa: 49000,
        maxUsers: 15,
        maxWarehouses: 4,
        maxProducts: 500,
        supportsCredit: true
      }
    });
    await transaction.subscription.upsert({
      where: { id: hostedDemoIds.subscription },
      create: {
        id: hostedDemoIds.subscription,
        supplierId: hostedDemoIds.supplier,
        planId: hostedDemoIds.plan,
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        planId: hostedDemoIds.plan,
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd
      }
    });
    await transaction.productCategory.upsert({
      where: { id: hostedDemoIds.category },
      create: {
        id: hostedDemoIds.category,
        supplierId: hostedDemoIds.supplier,
        name: 'Dairy',
        status: 'PUBLISHED'
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        name: 'Dairy',
        status: 'PUBLISHED'
      }
    });
    await transaction.product.upsert({
      where: { id: hostedDemoIds.milkProduct },
      create: {
        id: hostedDemoIds.milkProduct,
        supplierId: hostedDemoIds.supplier,
        categoryId: hostedDemoIds.category,
        sku: 'DEMO-FR-MILK-1L',
        name: 'Fresh Milk 1L',
        description: 'Chilled whole milk packed for grocery shelves and cafes.',
        unit: 'carton',
        priceBaisa: 650,
        taxRateBps: 500,
        minOrderQty: 1,
        status: 'PUBLISHED',
        archivedAt: null
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        categoryId: hostedDemoIds.category,
        sku: 'DEMO-FR-MILK-1L',
        name: 'Fresh Milk 1L',
        description: 'Chilled whole milk packed for grocery shelves and cafes.',
        unit: 'carton',
        priceBaisa: 650,
        taxRateBps: 500,
        minOrderQty: 1,
        status: 'PUBLISHED',
        archivedAt: null
      }
    });
    await transaction.product.upsert({
      where: { id: hostedDemoIds.labanProduct },
      create: {
        id: hostedDemoIds.labanProduct,
        supplierId: hostedDemoIds.supplier,
        categoryId: hostedDemoIds.category,
        sku: 'DEMO-FR-LABAN-500',
        name: 'Laban 500ml',
        description: 'Single-serve laban packs for chilled displays.',
        unit: 'case',
        priceBaisa: 4200,
        taxRateBps: 500,
        minOrderQty: 2,
        status: 'PUBLISHED',
        archivedAt: null
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        categoryId: hostedDemoIds.category,
        sku: 'DEMO-FR-LABAN-500',
        name: 'Laban 500ml',
        description: 'Single-serve laban packs for chilled displays.',
        unit: 'case',
        priceBaisa: 4200,
        taxRateBps: 500,
        minOrderQty: 2,
        status: 'PUBLISHED',
        archivedAt: null
      }
    });
    await transaction.inventoryStock.upsert({
      where: { id: hostedDemoIds.milkStock },
      create: {
        id: hostedDemoIds.milkStock,
        supplierId: hostedDemoIds.supplier,
        productId: hostedDemoIds.milkProduct,
        warehouseId: hostedDemoIds.warehouse,
        onHand: 120,
        reserved: 3,
        lowStockThreshold: 20
      },
      update: { onHand: 120, reserved: 3, lowStockThreshold: 20 }
    });
    await transaction.inventoryStock.upsert({
      where: { id: hostedDemoIds.labanStock },
      create: {
        id: hostedDemoIds.labanStock,
        supplierId: hostedDemoIds.supplier,
        productId: hostedDemoIds.labanProduct,
        warehouseId: hostedDemoIds.warehouse,
        onHand: 80,
        reserved: 0,
        lowStockThreshold: 15
      },
      update: { onHand: 80, reserved: 0, lowStockThreshold: 15 }
    });
    await transaction.cart.upsert({
      where: { id: hostedDemoIds.cart },
      create: {
        id: hostedDemoIds.cart,
        storeId: hostedDemoIds.store,
        userId: users.storeUserId,
        status: 'ACTIVE'
      },
      update: {
        storeId: hostedDemoIds.store,
        userId: users.storeUserId,
        status: 'ACTIVE',
        checkoutRef: null
      }
    });
    await transaction.cartItem.upsert({
      where: { id: hostedDemoIds.cartItem },
      create: {
        id: hostedDemoIds.cartItem,
        cartId: hostedDemoIds.cart,
        productId: hostedDemoIds.labanProduct,
        supplierId: hostedDemoIds.supplier,
        userId: users.storeUserId,
        quantity: 2
      },
      update: {
        cartId: hostedDemoIds.cart,
        productId: hostedDemoIds.labanProduct,
        supplierId: hostedDemoIds.supplier,
        userId: users.storeUserId,
        quantity: 2
      }
    });
    await transaction.order.upsert({
      where: { id: hostedDemoIds.order },
      create: {
        id: hostedDemoIds.order,
        supplierId: hostedDemoIds.supplier,
        storeId: hostedDemoIds.store,
        createdById: users.storeUserId,
        deliveryAddressId: hostedDemoIds.storeShippingAddress,
        status: 'READY_FOR_DELIVERY',
        paymentStatus: 'PENDING',
        paymentMethod: 'INVOICE',
        note: 'Prepared hosted demo order',
        subtotalBaisa: line.subtotalBaisa,
        taxBaisa: line.taxBaisa,
        totalBaisa: line.totalBaisa,
        idempotencyKey: 'hosted-demo-order-0001'
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        storeId: hostedDemoIds.store,
        createdById: users.storeUserId,
        deliveryAddressId: hostedDemoIds.storeShippingAddress,
        status: 'READY_FOR_DELIVERY',
        paymentStatus: 'PENDING',
        paymentMethod: 'INVOICE',
        note: 'Prepared hosted demo order',
        subtotalBaisa: line.subtotalBaisa,
        taxBaisa: line.taxBaisa,
        shippingBaisa: 0,
        discountBaisa: 0,
        totalBaisa: line.totalBaisa,
        idempotencyKey: 'hosted-demo-order-0001'
      }
    });
    await transaction.orderItem.upsert({
      where: { id: hostedDemoIds.orderItem },
      create: {
        id: hostedDemoIds.orderItem,
        orderId: hostedDemoIds.order,
        productId: hostedDemoIds.milkProduct,
        skuSnapshot: 'DEMO-FR-MILK-1L',
        nameSnapshot: 'Fresh Milk 1L',
        unit: 'carton',
        quantity: 3,
        unitPriceBaisa: 650,
        taxRateBps: 500,
        lineTotalBaisa: line.totalBaisa
      },
      update: {
        orderId: hostedDemoIds.order,
        productId: hostedDemoIds.milkProduct,
        skuSnapshot: 'DEMO-FR-MILK-1L',
        nameSnapshot: 'Fresh Milk 1L',
        unit: 'carton',
        quantity: 3,
        unitPriceBaisa: 650,
        taxRateBps: 500,
        lineTotalBaisa: line.totalBaisa
      }
    });
    await transaction.orderEvent.upsert({
      where: { id: hostedDemoIds.orderEvent },
      create: {
        id: hostedDemoIds.orderEvent,
        orderId: hostedDemoIds.order,
        actorId: users.supplierUserId,
        type: 'STATUS_CHANGED',
        newValueJson: JSON.stringify({ status: 'READY_FOR_DELIVERY' }),
        message: 'Prepared demo order is ready for delivery'
      },
      update: {
        orderId: hostedDemoIds.order,
        actorId: users.supplierUserId,
        type: 'STATUS_CHANGED',
        previousValueJson: null,
        newValueJson: JSON.stringify({ status: 'READY_FOR_DELIVERY' }),
        message: 'Prepared demo order is ready for delivery'
      }
    });
    await transaction.inventoryMovement.upsert({
      where: { id: hostedDemoIds.movement },
      create: {
        id: hostedDemoIds.movement,
        supplierId: hostedDemoIds.supplier,
        productId: hostedDemoIds.milkProduct,
        warehouseId: hostedDemoIds.warehouse,
        orderId: hostedDemoIds.order,
        actorId: users.storeUserId,
        type: 'RESERVATION',
        quantity: 3,
        beforeOnHand: 120,
        afterOnHand: 120,
        beforeReserved: 0,
        afterReserved: 3,
        idempotencyKey: 'hosted-demo-reservation-0001'
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        productId: hostedDemoIds.milkProduct,
        warehouseId: hostedDemoIds.warehouse,
        orderId: hostedDemoIds.order,
        actorId: users.storeUserId,
        type: 'RESERVATION',
        quantity: 3,
        beforeOnHand: 120,
        afterOnHand: 120,
        beforeReserved: 0,
        afterReserved: 3,
        idempotencyKey: 'hosted-demo-reservation-0001'
      }
    });
    await transaction.invoice.upsert({
      where: { id: hostedDemoIds.invoice },
      create: {
        id: hostedDemoIds.invoice,
        orderId: hostedDemoIds.order,
        supplierId: hostedDemoIds.supplier,
        storeId: hostedDemoIds.store,
        invoiceNumber: 'INV-HOSTED-DEMO-0001',
        status: 'ISSUED',
        subtotalBaisa: line.subtotalBaisa,
        taxBaisa: line.taxBaisa,
        totalBaisa: line.totalBaisa,
        issueDate: periodStart,
        dueDate: periodEnd
      },
      update: {
        orderId: hostedDemoIds.order,
        supplierId: hostedDemoIds.supplier,
        storeId: hostedDemoIds.store,
        invoiceNumber: 'INV-HOSTED-DEMO-0001',
        status: 'ISSUED',
        subtotalBaisa: line.subtotalBaisa,
        taxBaisa: line.taxBaisa,
        totalBaisa: line.totalBaisa,
        issueDate: periodStart,
        dueDate: periodEnd
      }
    });
    await transaction.delivery.upsert({
      where: { id: hostedDemoIds.delivery },
      create: {
        id: hostedDemoIds.delivery,
        supplierId: hostedDemoIds.supplier,
        storeId: hostedDemoIds.store,
        orderId: hostedDemoIds.order,
        driverId: users.driverUserId,
        status: 'ASSIGNED',
        scheduledFor: periodEnd
      },
      update: {
        supplierId: hostedDemoIds.supplier,
        storeId: hostedDemoIds.store,
        orderId: hostedDemoIds.order,
        driverId: users.driverUserId,
        status: 'ASSIGNED',
        recipientName: null,
        proofNote: null,
        failureReason: null,
        scheduledFor: periodEnd,
        deliveredAt: null
      }
    });
    await transaction.deliveryEvent.upsert({
      where: { id: hostedDemoIds.deliveryEvent },
      create: {
        id: hostedDemoIds.deliveryEvent,
        deliveryId: hostedDemoIds.delivery,
        actorId: users.supplierUserId,
        newStatus: 'ASSIGNED',
        message: 'Prepared demo delivery assigned'
      },
      update: {
        deliveryId: hostedDemoIds.delivery,
        actorId: users.supplierUserId,
        previousStatus: null,
        newStatus: 'ASSIGNED',
        message: 'Prepared demo delivery assigned'
      }
    });
  }, { maxWait: 10_000, timeout: 60_000 });
}
