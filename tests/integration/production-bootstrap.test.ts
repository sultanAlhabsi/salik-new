import { describe, expect, it } from 'vitest';
import {
  bootstrapPrivateAdmin,
  type BootstrapProvisionInput
} from '../../src/server/services/bootstrap';
import { createTestDatabase } from './helpers';

describe('private administrator bootstrap', () => {
  it('creates one platform administrator and is idempotent', async () => {
    const database = await createTestDatabase({ seed: false });
    const provisioned: string[] = [];
    const provision = async (input: BootstrapProvisionInput) => {
      provisioned.push(input.email);
      return 'supabase-auth-user-1';
    };

    try {
      const input = {
        email: 'owner@example.com',
        name: 'Pilot Owner',
        password: 'private-password-12345'
      };
      const first = await bootstrapPrivateAdmin(database.prisma, input, provision);
      const second = await bootstrapPrivateAdmin(database.prisma, input, provision);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(provisioned).toEqual(['owner@example.com', 'owner@example.com']);
      expect(await database.prisma.organization.count({ where: { type: 'PLATFORM' } })).toBe(1);
      expect(await database.prisma.user.count({ where: { role: 'SUPER_ADMIN' } })).toBe(1);
    } finally {
      await database.dispose();
    }
  });

  it('rejects weak private administrator passwords before creating data', async () => {
    const database = await createTestDatabase({ seed: false });
    try {
      await expect(
        bootstrapPrivateAdmin(
          database.prisma,
          { email: 'owner@example.com', name: 'Pilot Owner', password: 'too-short' },
          async () => 'unused-auth-id'
        )
      ).rejects.toThrow('Bootstrap password must contain at least 14 characters');
      expect(await database.prisma.organization.count()).toBe(0);
    } finally {
      await database.dispose();
    }
  });

  it('rejects an email already assigned to a non-platform user', async () => {
    const database = await createTestDatabase({ seed: false });
    try {
      const store = await database.prisma.organization.create({
        data: { name: 'Existing Store', type: 'STORE' }
      });
      await database.prisma.user.create({
        data: {
          email: 'owner@example.com',
          name: 'Existing Buyer',
          passwordHash: 'not-used',
          role: 'STORE_ADMIN',
          organizationId: store.id
        }
      });

      await expect(
        bootstrapPrivateAdmin(
          database.prisma,
          {
            email: 'owner@example.com',
            name: 'Pilot Owner',
            password: 'private-password-12345'
          },
          async () => 'unused-auth-id'
        )
      ).rejects.toThrow('Bootstrap email conflicts with an existing user');
    } finally {
      await database.dispose();
    }
  });

  it('rejects a different Supabase identity on retry', async () => {
    const database = await createTestDatabase({ seed: false });
    const input = {
      email: 'owner@example.com',
      name: 'Pilot Owner',
      password: 'private-password-12345'
    };
    try {
      await bootstrapPrivateAdmin(database.prisma, input, async () => 'auth-user-1');
      await expect(
        bootstrapPrivateAdmin(database.prisma, input, async () => 'auth-user-2')
      ).rejects.toThrow('Bootstrap identity conflicts with the existing administrator');
    } finally {
      await database.dispose();
    }
  });
});
