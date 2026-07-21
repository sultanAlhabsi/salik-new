import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { applyMigrations } from "../../src/server/services/migrations";
import { seedDatabase } from "../../src/server/services/seed";

const e2eTempRoot = resolve(tmpdir(), "salik-playwright");

export type E2EEnvironment = {
  runId: string;
  rootDir: string;
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
  const rootDir = join(e2eTempRoot, runId);
  return {
    runId,
    rootDir,
    databaseUrl: `file:${join(rootDir, "e2e.db")}`,
    apiOrigin: `http://127.0.0.1:${apiPort}`,
    webOrigin: `http://127.0.0.1:${webPort}`,
  };
}

export function installE2EEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): E2EEnvironment {
  const environment = createE2EEnvironment(env);
  env.SALIK_E2E_RUN_ID = environment.runId;
  env.DATABASE_URL = environment.databaseUrl;
  env.SALIK_E2E_ROOT = environment.rootDir;
  env.SALIK_E2E_API_ORIGIN = environment.apiOrigin;
  env.SALIK_E2E_WEB_ORIGIN = environment.webOrigin;
  return environment;
}

export function assertSafeE2EDatabaseUrl(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Refusing E2E reset: database must be a temporary SQLite file");
  }
  const databasePath = databaseUrl.slice("file:".length);
  const absolutePath = resolve(databasePath);
  const relativePath = relative(e2eTempRoot, absolutePath);
  if (
    !isAbsolute(databasePath) ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath) ||
    basename(absolutePath) !== "e2e.db"
  ) {
    throw new Error("Refusing E2E reset outside the dedicated E2E directory");
  }
  return absolutePath;
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

export async function prepareE2EDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("E2E DATABASE_URL is required");
  const databasePath = assertSafeE2EDatabaseUrl(databaseUrl);
  mkdirSync(dirname(databasePath), { recursive: true });
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  try {
    await runE2ESetup({
      migrate: () => applyMigrations(prisma),
      seed: () => seedDatabase(prisma),
    });
  } finally {
    await prisma.$disconnect();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

export async function resetE2EDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("E2E DATABASE_URL is required");
  assertSafeE2EDatabaseUrl(databaseUrl);
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  try {
    await runE2ESetup({
      migrate: async () => undefined,
      seed: () => seedDatabase(prisma),
    });
  } finally {
    await prisma.$disconnect();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

export function removeE2EEnvironment(rootDir = process.env.SALIK_E2E_ROOT) {
  if (!rootDir) return;
  const resolvedRoot = resolve(rootDir);
  const relativePath = relative(e2eTempRoot, resolvedRoot);
  if (relativePath.startsWith("..") || isAbsolute(relativePath) || relativePath === "") {
    throw new Error("Refusing to remove a directory outside the E2E temp root");
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}
