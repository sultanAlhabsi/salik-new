import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import {
  bootstrapHostedDemo,
  hostedDemoAccounts,
  hostedDemoIds,
  hostedDemoPassword,
  type HostedDemoProvisionInput
} from '../../src/server/services/hosted-demo';
import { createTestDatabase } from './helpers';

describe('hosted demo bootstrap', () => {
  it('creates linked portal data, preserves the private administrator, and is idempotent', async () => {
    const database = await createTestDatabase({ seed: false });
    const provisioned: HostedDemoProvisionInput[] = [];
    const provision = async (input: HostedDemoProvisionInput) => {
      provisioned.push(input);
      return `auth:${input.email}`;
    };

    try {
      const platform = await database.prisma.organization.create({
        data: { id: 'private-platform', name: 'Private SALIK', type: 'PLATFORM' }
      });
      await database.prisma.user.create({
        data: {
          id: 'private-admin',
          authUserId: 'private-auth',
          email: 'admin@salik.om',
          name: 'Private Owner',
          passwordHash: 'private-password-hash',
          role: 'SUPER_ADMIN',
          organizationId: platform.id
        }
      });

      const first = await bootstrapHostedDemo(database.prisma, provision);
      const second = await bootstrapHostedDemo(database.prisma, provision);

      expect(first).toEqual({ createdUsers: 4, reconciledUsers: 0 });
      expect(second).toEqual({ createdUsers: 0, reconciledUsers: 4 });
      expect(provisioned.map(({ email }) => email)).toEqual([
        ...hostedDemoAccounts.map(({ email }) => email),
        ...hostedDemoAccounts.map(({ email }) => email)
      ]);

      const privateAdmin = await database.prisma.user.findUniqueOrThrow({
        where: { id: 'private-admin' }
      });
      expect(privateAdmin).toMatchObject({
        authUserId: 'private-auth',
        email: 'admin@salik.om',
        passwordHash: 'private-password-hash',
        role: 'SUPER_ADMIN',
        organizationId: platform.id
      });

      const users = await database.prisma.user.findMany({
        where: { id: { startsWith: 'hosted-demo-user-' } },
        orderBy: { email: 'asc' }
      });
      expect(users).toHaveLength(4);
      expect(users.map(({ email, role, status, organizationId, authUserId }) => ({
        email,
        role,
        status,
        organizationId,
        authUserId
      }))).toEqual([
        {
          email: 'demo-admin@salik.om',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          organizationId: null,
          authUserId: 'auth:demo-admin@salik.om'
        },
        {
          email: 'driver@fresh.om',
          role: 'DRIVER',
          status: 'ACTIVE',
          organizationId: hostedDemoIds.supplier,
          authUserId: 'auth:driver@fresh.om'
        },
        {
          email: 'store@alnoor.om',
          role: 'STORE_ADMIN',
          status: 'ACTIVE',
          organizationId: hostedDemoIds.store,
          authUserId: 'auth:store@alnoor.om'
        },
        {
          email: 'supplier@fresh.om',
          role: 'SUPPLIER_ADMIN',
          status: 'ACTIVE',
          organizationId: hostedDemoIds.supplier,
          authUserId: 'auth:supplier@fresh.om'
        }
      ]);
      await Promise.all(
        users.map(({ passwordHash }) =>
          expect(bcrypt.compare(hostedDemoPassword, passwordHash)).resolves.toBe(true)
        )
      );

      const [organizations, addresses, warehouses, categories, products, stocks] =
        await Promise.all([
          database.prisma.organization.count({ where: { id: { startsWith: 'hosted-demo-' } } }),
          database.prisma.address.count({ where: { id: { startsWith: 'hosted-demo-' } } }),
          database.prisma.warehouse.count({ where: { id: { startsWith: 'hosted-demo-' } } }),
          database.prisma.productCategory.count({ where: { id: { startsWith: 'hosted-demo-' } } }),
          database.prisma.product.count({ where: { id: { startsWith: 'hosted-demo-' } } }),
          database.prisma.inventoryStock.count({ where: { id: { startsWith: 'hosted-demo-' } } })
        ]);
      expect({ organizations, addresses, warehouses, categories, products, stocks }).toEqual({
        organizations: 2,
        addresses: 3,
        warehouses: 1,
        categories: 1,
        products: 2,
        stocks: 2
      });

      const [subscription, cart, cartItem, order, orderItem, movement, invoice, delivery, event] =
        await Promise.all([
          database.prisma.subscription.findUnique({ where: { id: hostedDemoIds.subscription } }),
          database.prisma.cart.findUnique({ where: { id: hostedDemoIds.cart } }),
          database.prisma.cartItem.findUnique({ where: { id: hostedDemoIds.cartItem } }),
          database.prisma.order.findUnique({ where: { id: hostedDemoIds.order } }),
          database.prisma.orderItem.findUnique({ where: { id: hostedDemoIds.orderItem } }),
          database.prisma.inventoryMovement.findUnique({ where: { id: hostedDemoIds.movement } }),
          database.prisma.invoice.findUnique({ where: { id: hostedDemoIds.invoice } }),
          database.prisma.delivery.findUnique({ where: { id: hostedDemoIds.delivery } }),
          database.prisma.deliveryEvent.findUnique({ where: { id: hostedDemoIds.deliveryEvent } })
        ]);
      expect(subscription).toMatchObject({ supplierId: hostedDemoIds.supplier, status: 'ACTIVE' });
      expect(cart).toMatchObject({ storeId: hostedDemoIds.store, status: 'ACTIVE' });
      expect(cartItem).toMatchObject({ cartId: hostedDemoIds.cart, quantity: 2 });
      expect(order).toMatchObject({
        supplierId: hostedDemoIds.supplier,
        storeId: hostedDemoIds.store,
        status: 'READY_FOR_DELIVERY'
      });
      expect(orderItem).toMatchObject({ orderId: hostedDemoIds.order, quantity: 3 });
      expect(movement).toMatchObject({
        orderId: hostedDemoIds.order,
        type: 'RESERVATION',
        quantity: 3,
        afterReserved: 3
      });
      expect(invoice).toMatchObject({ orderId: hostedDemoIds.order, status: 'ISSUED' });
      expect(delivery).toMatchObject({
        orderId: hostedDemoIds.order,
        driverId: hostedDemoIds.driverUser,
        status: 'ASSIGNED'
      });
      expect(event).toMatchObject({ deliveryId: hostedDemoIds.delivery, newStatus: 'ASSIGNED' });
    } finally {
      await database.dispose();
    }
  });

  it('rejects a prepared email already assigned to another tenant role', async () => {
    const database = await createTestDatabase({ seed: false });
    try {
      const conflictingStore = await database.prisma.organization.create({
        data: { name: 'Conflicting Store', type: 'STORE' }
      });
      await database.prisma.user.create({
        data: {
          email: 'supplier@fresh.om',
          name: 'Wrong Role',
          passwordHash: 'unused',
          role: 'STORE_ADMIN',
          organizationId: conflictingStore.id
        }
      });

      await expect(
        bootstrapHostedDemo(database.prisma, async ({ email }) => `auth:${email}`)
      ).rejects.toThrow('Hosted demo email conflicts with an existing user: supplier@fresh.om');
    } finally {
      await database.dispose();
    }
  });

  it('rejects a different hosted Auth identity on a retry', async () => {
    const database = await createTestDatabase({ seed: false });
    try {
      await bootstrapHostedDemo(database.prisma, async ({ email }) => `first:${email}`);
      await expect(
        bootstrapHostedDemo(database.prisma, async ({ email }) => `second:${email}`)
      ).rejects.toThrow('Hosted demo identity conflicts with the existing user: supplier@fresh.om');
    } finally {
      await database.dispose();
    }
  });
});
