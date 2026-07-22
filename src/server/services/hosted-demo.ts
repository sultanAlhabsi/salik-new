import type { PrismaClient, UserRole } from "@prisma/client";
import { persistDemoDataset } from "./demo-dataset.js";
import {
  demoFixtureIds,
  demoFixtures,
  demoPassword,
  preparedDemoAccounts,
} from "./demo-fixtures.js";

export const hostedDemoPassword = demoPassword;
export const hostedDemoIds = demoFixtureIds;

export type HostedDemoProvisionInput = {
  email: string;
  password: string;
  name: string;
  role: Extract<
    UserRole,
    "SUPER_ADMIN" | "SUPPLIER_ADMIN" | "STORE_ADMIN" | "DRIVER"
  >;
  organizationId: string | null;
};

export type HostedDemoProvisioner = (
  input: HostedDemoProvisionInput,
) => Promise<string>;

export const hostedDemoAccounts = preparedDemoAccounts;

export function assertHostedDemoBootstrapAllowed(
  environment: NodeJS.ProcessEnv,
  supabaseEnabled: boolean,
) {
  if (environment.HOSTED_DEMO_CONFIRM !== "SALIK_HOSTED_DEMO") {
    throw new Error(
      "Hosted demo bootstrap requires HOSTED_DEMO_CONFIRM=SALIK_HOSTED_DEMO",
    );
  }
  if (environment.NODE_ENV !== "production") {
    throw new Error("Hosted demo bootstrap requires NODE_ENV=production");
  }
  if (!supabaseEnabled) {
    throw new Error("Hosted demo bootstrap requires Supabase Auth");
  }
}

export async function bootstrapHostedDemo(
  prisma: PrismaClient,
  provision: HostedDemoProvisioner,
) {
  const existingUsers = await validateReservedDemoRecords(prisma);
  const authUserIds = new Map<string, string>();
  let createdUsers = 0;

  for (const account of hostedDemoAccounts) {
    const existingUser = existingUsers.get(account.email);
    const authUserId = await provision({
      email: account.email,
      password: hostedDemoPassword,
      name: account.name,
      role: account.role,
      organizationId: account.organizationId,
    });
    if (existingUser?.authUserId && existingUser.authUserId !== authUserId) {
      throw new Error(
        `Hosted demo identity conflicts with the existing user: ${account.email}`,
      );
    }
    if (!existingUser) createdUsers += 1;
    authUserIds.set(account.email, authUserId);
  }

  await persistDemoDataset(prisma, { authUserIds });

  return {
    createdUsers,
    reconciledUsers: hostedDemoAccounts.length - createdUsers,
  };
}

async function validateReservedDemoRecords(prisma: PrismaClient) {
  const preparedByEmail = new Map<
    string,
    {
      id: string;
      email: string;
      role: UserRole;
      organizationId: string | null;
      authUserId: string | null;
    }
  >();

  for (const organization of demoFixtures.organizations) {
    const existing = await prisma.organization.findUnique({
      where: { id: organization.id },
    });
    if (existing && existing.type !== organization.type) {
      throw new Error(
        `Hosted demo organization conflicts with an existing record: ${organization.id}`,
      );
    }
  }

  for (const user of demoFixtures.users) {
    const [byEmail, byId] = await Promise.all([
      prisma.user.findUnique({ where: { email: user.email } }),
      prisma.user.findUnique({ where: { id: user.id } }),
    ]);
    if (byEmail && byEmail.id !== user.id) {
      throw new Error(
        `Hosted demo email conflicts with an existing user: ${user.email}`,
      );
    }
    if (byId && byId.email !== user.email) {
      throw new Error(
        `Hosted demo record conflicts with an existing user: ${user.id}`,
      );
    }
    const prepared = hostedDemoAccounts.find(
      ({ email }) => email === user.email,
    );
    if (
      prepared &&
      byEmail &&
      (byEmail.role !== prepared.role ||
        byEmail.organizationId !== prepared.organizationId)
    ) {
      throw new Error(
        `Hosted demo email conflicts with an existing user: ${user.email}`,
      );
    }
    if (prepared && byEmail) preparedByEmail.set(user.email, byEmail);
  }

  const planByCode = await prisma.plan.findUnique({
    where: { code: demoFixtures.plan.code },
  });
  if (planByCode && planByCode.id !== demoFixtures.plan.id) {
    throw new Error(
      `Hosted demo plan code conflicts with an existing record: ${demoFixtures.plan.code}`,
    );
  }
  for (const product of demoFixtures.products) {
    const bySku = await prisma.product.findUnique({
      where: {
        supplierId_sku: { supplierId: product.supplierId, sku: product.sku },
      },
    });
    if (bySku && bySku.id !== product.id) {
      throw new Error(
        `Hosted demo SKU conflicts with an existing product: ${product.sku}`,
      );
    }
  }

  return preparedByEmail;
}
