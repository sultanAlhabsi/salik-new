import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export type BootstrapAdminInput = {
  email: string;
  name: string;
  password: string;
};

export type BootstrapProvisionInput = BootstrapAdminInput & {
  role: 'SUPER_ADMIN';
  organizationId: string;
};

export type BootstrapProvisioner = (input: BootstrapProvisionInput) => Promise<string>;

const bootstrapInputSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(14, 'Bootstrap password must contain at least 14 characters')
});

export async function bootstrapPrivateAdmin(
  prisma: PrismaClient,
  rawInput: BootstrapAdminInput,
  provision: BootstrapProvisioner
) {
  const input = bootstrapInputSchema.parse({
    ...rawInput,
    email: rawInput.email.toLowerCase()
  });
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    include: { organization: true }
  });
  if (
    existingUser &&
    (existingUser.role !== 'SUPER_ADMIN' || existingUser.organization?.type !== 'PLATFORM')
  ) {
    throw new Error('Bootstrap email conflicts with an existing user');
  }

  const platformOrganizations = await prisma.organization.findMany({
    where: { type: 'PLATFORM' },
    orderBy: { createdAt: 'asc' },
    take: 2
  });
  if (platformOrganizations.length > 1) {
    throw new Error('Bootstrap requires exactly one platform organization');
  }
  const platform =
    platformOrganizations[0] ??
    (await prisma.organization.create({
      data: { name: 'SALIK Operations', type: 'PLATFORM', status: 'ACTIVE' }
    }));
  if (existingUser?.organizationId && existingUser.organizationId !== platform.id) {
    throw new Error('Bootstrap email conflicts with an existing user');
  }

  const authUserId = await provision({
    ...input,
    role: 'SUPER_ADMIN',
    organizationId: platform.id
  });
  if (existingUser?.authUserId && existingUser.authUserId !== authUserId) {
    throw new Error('Bootstrap identity conflicts with the existing administrator');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          authUserId,
          name: input.name,
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          organizationId: platform.id
        }
      })
    : await prisma.user.create({
        data: {
          authUserId,
          email: input.email,
          name: input.name,
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          organizationId: platform.id
        }
      });

  return { organizationId: platform.id, userId: user.id, created: !existingUser };
}
