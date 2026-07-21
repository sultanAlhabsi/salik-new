import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export async function notifyOrganization(
  db: Db,
  input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    title: string;
    body: string;
  }
) {
  return db.notification.create({
    data: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      body: input.body
    }
  });
}

export async function notifyUser(
  db: Db,
  input: {
    userId: string;
    entityType: string;
    entityId: string;
    title: string;
    body: string;
  }
) {
  return db.notification.create({
    data: {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      body: input.body
    }
  });
}
