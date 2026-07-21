import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(
  db: Db,
  input: {
    actorId?: string | null;
    organizationId?: string | null;
    supplierId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    previousValue?: unknown;
    newValue?: unknown;
  }
) {
  return db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      organizationId: input.organizationId ?? null,
      supplierId: input.supplierId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousValueJson: input.previousValue === undefined ? null : JSON.stringify(input.previousValue),
      newValueJson: input.newValue === undefined ? null : JSON.stringify(input.newValue)
    }
  });
}
