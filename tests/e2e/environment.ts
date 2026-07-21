import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertSafeTestDatabaseUrl,
  withPostgresSchema,
} from "../../src/server/database-url";
import { seedDatabase } from "../../src/server/services/seed";
import {
  dropPostgresSchema,
  preparePostgresSchema,
} from "../helpers/postgres";

const e2eTempRoot = resolve(tmpdir(), "salik-playwright");

export type E2EEnvironment = {
  runId: string;
  rootDir: string;
  baseDatabaseUrl: string;
  schema: string;
  databaseUrl: string;
  apiOrigin: string;
  webOrigin: string;
};

function safeRunId(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("SALIK_E2E_RUN_ID may contain only letters, digits, _ and -");
  }
  return value;
}

export function createE2EEnvironment(
  env: Record<string, string | undefined> = process.env,
): E2EEnvironment {
  const runId = safeRunId(
    env.SALIK_E2E_RUN_ID ?? `run-${process.pid}-${Date.now()}`,
  );
  const apiPort = Number(env.SALIK_E2E_API_PORT ?? 3300);
  const webPort = Number(env.SALIK_E2E_WEB_PORT ?? 5273);
  if (![apiPort, webPort].every(Number.isInteger)) {
    throw new Error("E2E ports must be integers");
  }
  if (apiPort === 3000 || webPort === 5173 || apiPort === webPort) {
    throw new Error("E2E ports must be isolated from development ports");
  }
  const baseDatabaseUrl = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
  if (!baseDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for E2E");
  }
  assertSafeTestDatabaseUrl(baseDatabaseUrl, env as NodeJS.ProcessEnv);
  const schema = `salik_e2e_${runId.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
  const rootDir = join(e2eTempRoot, runId);
  return {
    runId,
    rootDir,
    baseDatabaseUrl,
    schema,
    databaseUrl: withPostgresSchema(baseDatabaseUrl, schema),
    apiOrigin: `http://127.0.0.1:${apiPort}`,
    webOrigin: `http://127.0.0.1:${webPort}`,
  };
}

export function installE2EEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): E2EEnvironment {
  const environment = createE2EEnvironment(env);
  env.SALIK_E2E_RUN_ID = environment.runId;
  env.TEST_DATABASE_URL = environment.baseDatabaseUrl;
  env.DATABASE_URL = environment.databaseUrl;
  env.SALIK_E2E_DATABASE_SCHEMA = environment.schema;
  env.SALIK_E2E_ROOT = environment.rootDir;
  env.SALIK_E2E_API_ORIGIN = environment.apiOrigin;
  env.SALIK_E2E_WEB_ORIGIN = environment.webOrigin;
  return environment;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runE2ESetup(steps: {
  migrate: () => Promise<unknown>;
  seed: () => Promise<unknown>;
}) {
  try {
    await steps.migrate();
  } catch (error) {
    throw new Error(`E2E setup failed during migrations: ${messageOf(error)}`, {
      cause: error,
    });
  }
  try {
    await steps.seed();
  } catch (error) {
    throw new Error(`E2E setup failed during seed: ${messageOf(error)}`, {
      cause: error,
    });
  }
}

export async function prepareE2EDatabase(
  environment = createE2EEnvironment(),
) {
  mkdirSync(environment.rootDir, { recursive: true });
  let prisma: PrismaClient | undefined;
  try {
    await runE2ESetup({
      migrate: () =>
        preparePostgresSchema(
          environment.baseDatabaseUrl,
          environment.schema,
        ),
      seed: async () => {
        prisma = new PrismaClient({ datasourceUrl: environment.databaseUrl });
        await seedDatabase(prisma);
      },
    });
  } catch (error) {
    await dropPostgresSchema(
      environment.baseDatabaseUrl,
      environment.schema,
    ).catch(() => undefined);
    throw error;
  } finally {
    await prisma?.$disconnect();
  }
}

export async function resetE2EDatabase(
  environment = createE2EEnvironment(),
) {
  const prisma = new PrismaClient({ datasourceUrl: environment.databaseUrl });
  try {
    await runE2ESetup({
      migrate: async () => undefined,
      seed: () => seedDatabase(prisma),
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function removeE2EEnvironment(
  rootDir = process.env.SALIK_E2E_ROOT,
  baseDatabaseUrl = process.env.TEST_DATABASE_URL,
  schema = process.env.SALIK_E2E_DATABASE_SCHEMA,
) {
  if (baseDatabaseUrl && schema) {
    await dropPostgresSchema(baseDatabaseUrl, schema);
  }
  if (!rootDir) return;
  const resolvedRoot = resolve(rootDir);
  const relativePath = relative(e2eTempRoot, resolvedRoot);
  if (relativePath.startsWith("..") || isAbsolute(relativePath) || relativePath === "") {
    throw new Error("Refusing to remove a directory outside the E2E temp root");
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}
