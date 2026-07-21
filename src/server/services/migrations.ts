import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

export async function applyMigrations(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "_salik_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
  const migrationNames = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationName of migrationNames) {
    const applied = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT "name" FROM "_salik_migrations" WHERE "name" = ?',
      migrationName
    );
    if (applied.length > 0) continue;

    if (migrationName === '0001_init') {
      const existingSchema = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        'SELECT "name" FROM sqlite_master WHERE type = \'table\' AND name = \'Organization\''
      );
      if (existingSchema.length > 0) {
        await prisma.$executeRawUnsafe('INSERT INTO "_salik_migrations" ("name") VALUES (?)', migrationName);
        continue;
      }
    }

    const migrationPath = join(migrationsRoot, migrationName, 'migration.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.replace(/--.*$/gm, '').trim())
      .filter(Boolean);

    await prisma.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
      await tx.$executeRawUnsafe('INSERT INTO "_salik_migrations" ("name") VALUES (?)', migrationName);
    });
  }
}
