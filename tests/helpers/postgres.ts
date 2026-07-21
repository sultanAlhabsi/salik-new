import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import {
  assertSafeTestDatabaseUrl,
  withPostgresSchema
} from '../../src/server/database-url';

export type PostgresTestScope = {
  schema: string;
  databaseUrl: string;
  prisma: PrismaClient;
  dispose: () => Promise<void>;
};

function schemaName(prefix: string) {
  const safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return `salik_${safePrefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function assertSchemaName(schema: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error('Invalid PostgreSQL schema identifier');
  }
}

function migrationSql() {
  const root = join(process.cwd(), 'prisma', 'migrations');
  const migrations = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (migrations.length === 0) {
    throw new Error('PostgreSQL migrations are missing');
  }
  return migrations
    .map((migration) => readFileSync(join(root, migration, 'migration.sql'), 'utf8'))
    .join('\n');
}

async function dropSchema(client: Client, schema: string) {
  await client.query('SET search_path TO public');
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

export async function preparePostgresSchema(baseUrl: string, schema: string) {
  assertSafeTestDatabaseUrl(baseUrl);
  assertSchemaName(schema);
  const admin = new Client({ connectionString: baseUrl });
  let connected = false;
  let schemaCreated = false;
  try {
    await admin.connect();
    connected = true;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(migrationSql());
  } catch (error) {
    if (connected && schemaCreated) {
      await dropSchema(admin, schema).catch(() => undefined);
    }
    throw error;
  } finally {
    if (connected) {
      await admin.end();
    }
  }
  return withPostgresSchema(baseUrl, schema);
}

export async function dropPostgresSchema(baseUrl: string, schema: string) {
  assertSafeTestDatabaseUrl(baseUrl);
  assertSchemaName(schema);
  const cleanup = new Client({ connectionString: baseUrl });
  await cleanup.connect();
  try {
    await dropSchema(cleanup, schema);
  } finally {
    await cleanup.end();
  }
}

export async function createIsolatedPostgresSchema(options: {
  prefix: string;
}): Promise<PostgresTestScope> {
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests');
  }
  assertSafeTestDatabaseUrl(baseUrl);

  const schema = schemaName(options.prefix);
  const databaseUrl = await preparePostgresSchema(baseUrl, schema);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let disposed = false;

  return {
    schema,
    databaseUrl,
    prisma,
    dispose: async () => {
      if (disposed) return;
      await prisma.$disconnect();
      await dropPostgresSchema(baseUrl, schema);
      disposed = true;
    }
  };
}

export async function postgresSchemaExists(schema: string) {
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests');
  }
  assertSafeTestDatabaseUrl(baseUrl);
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema]);
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}
