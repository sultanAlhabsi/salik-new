# SALIK Free Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Durable progress is tracked in Beads under `salik-new-eij.8.*` and `salik-new-eij.9`; this repository does not use Markdown checkboxes as its task tracker.

**Goal:** Deploy the private SALIK pilot as one free Render web service backed by Supabase PostgreSQL, Auth, and private Storage without committing secrets or retaining SQLite in the supported runtime.

**Architecture:** React and Express remain one same-origin Node service on Render. Prisma uses a single PostgreSQL schema across development, tests, CI, and production; Render connects through Supavisor session mode, while Supabase continues to provide identity and object storage.

**Tech Stack:** Node.js 22, TypeScript, React 19, Express 5, Prisma 6, PostgreSQL 16+, Supabase, Vitest, Playwright, Docker Compose, GitHub Actions, Render Blueprint.

## Global Constraints

- Use Render's `free` plan in the `frankfurt` region.
- Use Supavisor session mode on port `5432` for the Render `DATABASE_URL`.
- Do not commit `.env`, connection strings, passwords, tokens, or Supabase secret keys.
- Do not provision the published `Password123!` demo password in the hosted environment.
- Do not run destructive seed or test operations against a non-local database without the explicit test-only safety override.
- Use committed Prisma migrations and `prisma migrate deploy`; never use `prisma db push` in production.
- Keep browser and API traffic same-origin and derive the Render origin from `RENDER_EXTERNAL_URL` when `APP_ORIGIN` is absent.
- Keep the private Storage bucket name `salik-private` and the upload limit `5242880` bytes.
- Use Beads for status and dependencies. The implementation parent is `salik-new-eij.8`; deployment verification is `salik-new-eij.9`.
- Preserve unrelated local paths `.playwright-cli/`, `.vscode/`, and `y/`; never stage them.

## File and Responsibility Map

| Path | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Canonical PostgreSQL data model |
| `prisma/migrations/` | Active PostgreSQL migration history |
| `prisma/migrations-sqlite-legacy/` | Archived SQLite history; never executed |
| `src/server/database-url.ts` | PostgreSQL URL/schema composition and destructive-test safety |
| `tests/helpers/postgres.ts` | Isolated PostgreSQL schema lifecycle for integration and E2E tests |
| `src/server/config.ts` | Environment resolution and production fail-fast validation |
| `src/server/app.ts` | Same-origin application and database-backed readiness endpoint |
| `src/server/services/bootstrap.ts` | Idempotent private administrator bootstrap domain logic |
| `prisma/bootstrap.ts` | Trusted command-line entry point for the first administrator |
| `prisma/seed.ts` | Local/test-only destructive demo seed entry point |
| `compose.yaml` | Local PostgreSQL 16 service |
| `.github/workflows/ci.yml` | PostgreSQL-backed CI quality gates |
| `render.yaml` | Free Render web-service Blueprint |
| `docs/deployment.md` | Operator setup, deployment, verification, and recovery runbook |

---

### Task 1: PostgreSQL schema, migrations, and local runtime

**Beads:** `salik-new-eij.8.1`

**Files:**

- Create: `src/server/database-url.ts`
- Create: `tests/config/postgres-database.test.ts`
- Create: `compose.yaml`
- Create: `prisma/migrations/<generated>_postgresql_baseline/migration.sql`
- Create: `prisma/migrations/migration_lock.toml`
- Move: `prisma/migrations/` to `prisma/migrations-sqlite-legacy/` before generating the new baseline
- Modify: `prisma/schema.prisma`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Delete: `prisma/apply-migrations.ts`
- Delete: `src/server/services/migrations.ts`

**Interfaces:**

- Produces `withPostgresSchema(databaseUrl: string, schema: string): string`.
- Produces `assertSafeTestDatabaseUrl(databaseUrl: string, environment?: NodeJS.ProcessEnv): URL`.
- Produces npm scripts `db:migrate:dev`, `db:migrate:deploy`, `db:reset:local`, and `db:seed:demo`.

**Step 1 — Claim the unit and write the failing URL-safety tests**

Run:

```bash
bd update salik-new-eij.8 --claim
bd update salik-new-eij.8.1 --claim
```

Create `tests/config/postgres-database.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertSafeTestDatabaseUrl, withPostgresSchema } from '../../src/server/database-url';

describe('PostgreSQL database URL safety', () => {
  it('adds an isolated schema without changing credentials or host', () => {
    const result = new URL(
      withPostgresSchema('postgresql://salik:secret@127.0.0.1:54329/salik_test?connect_timeout=5', 'salik_case_123')
    );
    expect(result.hostname).toBe('127.0.0.1');
    expect(result.pathname).toBe('/salik_test');
    expect(result.searchParams.get('connect_timeout')).toBe('5');
    expect(result.searchParams.get('schema')).toBe('salik_case_123');
  });

  it('rejects invalid schema identifiers', () => {
    expect(() => withPostgresSchema('postgresql://localhost/salik_test', 'public;drop schema public')).toThrow(
      'Invalid PostgreSQL schema identifier'
    );
  });

  it('allows destructive tests on localhost', () => {
    expect(assertSafeTestDatabaseUrl('postgresql://salik:secret@localhost:54329/salik_test').hostname).toBe('localhost');
  });

  it('rejects remote destructive tests by default', () => {
    expect(() => assertSafeTestDatabaseUrl('postgresql://prisma:secret@aws-0-eu.pooler.supabase.com/postgres')).toThrow(
      'Refusing destructive tests against a remote PostgreSQL host'
    );
  });

  it('requires the exact explicit override for a disposable remote test project', () => {
    expect(
      assertSafeTestDatabaseUrl('postgresql://prisma:secret@db.test.invalid/postgres', {
        SALIK_ALLOW_REMOTE_TEST_DATABASE: 'I_UNDERSTAND_THIS_DESTROYS_TEST_DATA'
      } as NodeJS.ProcessEnv).hostname
    ).toBe('db.test.invalid');
  });
});
```

Run:

```bash
npx vitest run tests/config/postgres-database.test.ts
```

Expected: FAIL because `src/server/database-url.ts` does not exist.

**Step 2 — Implement the URL boundary and make its tests pass**

Create `src/server/database-url.ts`:

```ts
const localPostgresHosts = new Set(['localhost', '127.0.0.1', '::1']);
const remoteTestConfirmation = 'I_UNDERSTAND_THIS_DESTROYS_TEST_DATA';

function parsePostgresUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  return parsed;
}

export function withPostgresSchema(databaseUrl: string, schema: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error('Invalid PostgreSQL schema identifier');
  }
  const parsed = parsePostgresUrl(databaseUrl);
  parsed.searchParams.set('schema', schema);
  return parsed.toString();
}

export function assertSafeTestDatabaseUrl(
  databaseUrl: string,
  environment: NodeJS.ProcessEnv = process.env
) {
  const parsed = parsePostgresUrl(databaseUrl);
  if (
    !localPostgresHosts.has(parsed.hostname) &&
    environment.SALIK_ALLOW_REMOTE_TEST_DATABASE !== remoteTestConfirmation
  ) {
    throw new Error('Refusing destructive tests against a remote PostgreSQL host');
  }
  return parsed;
}
```

Run:

```bash
npx vitest run tests/config/postgres-database.test.ts
```

Expected: 5 tests pass.

**Step 3 — Add the reproducible local PostgreSQL service**

Create `compose.yaml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: salik
      POSTGRES_USER: salik
      POSTGRES_PASSWORD: salik_local_only
    ports:
      - "54329:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U salik -d salik"]
      interval: 2s
      timeout: 3s
      retries: 20
    volumes:
      - salik-postgres:/var/lib/postgresql/data

volumes:
  salik-postgres:
```

Update `.env.example` database values:

```dotenv
DATABASE_URL="postgresql://salik:salik_local_only@127.0.0.1:54329/salik?schema=public"
TEST_DATABASE_URL="postgresql://salik:salik_local_only@127.0.0.1:54329/salik"
```

Run:

```bash
docker compose up -d postgres
docker compose ps
```

Expected: `postgres` reports `healthy` on host port `54329`.

**Step 4 — Switch Prisma to PostgreSQL and generate a provider-specific baseline**

Change the datasource in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Archive the old migration history with an explicit target, then generate the new history:

```bash
mv -f prisma/migrations prisma/migrations-sqlite-legacy
DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik?schema=public' npx prisma migrate dev --name postgresql_baseline --create-only
```

Expected: Prisma creates one PostgreSQL baseline directory and `migration_lock.toml` with `provider = "postgresql"`.

Review the generated SQL for PostgreSQL enums, foreign keys, unique constraints, indexes, and all models from `schema.prisma`:

```bash
rg -n 'CREATE TYPE|CREATE TABLE|CREATE UNIQUE INDEX|ADD CONSTRAINT' prisma/migrations
```

**Step 5 — Replace the custom SQLite migration scripts**

Update the relevant `package.json` scripts to exactly:

```json
{
  "db:migrate:dev": "prisma migrate dev",
  "db:migrate:deploy": "prisma migrate deploy",
  "db:reset:local": "prisma migrate reset --force --skip-seed",
  "db:seed:demo": "tsx prisma/seed.ts"
}
```

Remove the obsolete `db:push`, `db:apply`, and `db:seed` aliases so production documentation cannot invoke the old SQLite runner. Delete `prisma/apply-migrations.ts` and `src/server/services/migrations.ts`. Install the PostgreSQL test client types for later tasks:

```bash
npm install --save-dev pg @types/pg
```

Regenerate and validate against an empty local schema:

```bash
DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik?schema=task1_verify' npm run db:migrate:deploy
npm run prisma:generate
npm run type-check
```

Expected: migration applies once, the second deploy reports no pending migrations, and TypeScript exits 0.

**Step 6 — Commit the independently testable database layer**

Run:

```bash
bd close salik-new-eij.8.1 --reason="PostgreSQL schema, baseline migration, local service, and Prisma migration scripts verified."
git add package.json package-lock.json .env.example compose.yaml prisma src/server/database-url.ts tests/config/postgres-database.test.ts .beads/issues.jsonl .beads/interactions.jsonl
git diff --cached --check
git commit -m "feat: migrate SALIK data layer to PostgreSQL"
```

---

### Task 2: PostgreSQL integration harness, E2E isolation, and CI

**Beads:** `salik-new-eij.8.2`

**Files:**

- Create: `tests/helpers/postgres.ts`
- Create: `tests/helpers/postgres.test.ts`
- Modify: `tests/integration/helpers.ts`
- Modify: `tests/integration/test-harness.test.ts`
- Modify: `tests/e2e/environment.ts`
- Modify: `tests/e2e/global-teardown.ts`
- Modify: `tests/config/e2e-environment.test.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/testing.md`

**Interfaces:**

- Consumes `withPostgresSchema` and `assertSafeTestDatabaseUrl` from Task 1.
- Produces `createIsolatedPostgresSchema(options): Promise<PostgresTestScope>`.
- Produces `dropIsolatedPostgresSchema(databaseUrl, schema): Promise<void>`.
- Changes `TestDatabase.dbDir` to `TestDatabase.databaseScope`.

**Step 1 — Write the failing isolated-schema lifecycle tests**

Create `tests/helpers/postgres.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresSchema } from './postgres';

describe('isolated PostgreSQL schemas', () => {
  it('applies committed migrations and removes the schema on disposal', async () => {
    const scope = await createIsolatedPostgresSchema({ prefix: 'helper_test' });
    const schema = scope.schema;
    expect(await scope.prisma.organization.count()).toBe(0);
    await scope.prisma.organization.create({ data: { name: 'Only here', type: 'PLATFORM' } });
    expect(await scope.prisma.organization.count()).toBe(1);
    await scope.dispose();
    await expect(scope.dispose()).resolves.toBeUndefined();
    expect(schema).toMatch(/^salik_helper_test_/);
  });
});
```

Run with the explicit test database:

```bash
TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npx vitest run tests/helpers/postgres.test.ts
```

Expected: FAIL because `tests/helpers/postgres.ts` does not exist.

**Step 2 — Implement isolated schema creation and cleanup**

Create `tests/helpers/postgres.ts` with this public shape:

```ts
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { assertSafeTestDatabaseUrl, withPostgresSchema } from '../../src/server/database-url';

export type PostgresTestScope = {
  schema: string;
  databaseUrl: string;
  prisma: PrismaClient;
  dispose: () => Promise<void>;
};

function schemaName(prefix: string) {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  return `salik_${safePrefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function migrationSql() {
  const root = join(process.cwd(), 'prisma', 'migrations');
  const migrations = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (migrations.length === 0) throw new Error('PostgreSQL migrations are missing');
  return migrations
    .map((migration) => readFileSync(join(root, migration, 'migration.sql'), 'utf8'))
    .join('\n');
}

export async function createIsolatedPostgresSchema(options: { prefix: string }): Promise<PostgresTestScope> {
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests');
  assertSafeTestDatabaseUrl(baseUrl);
  const schema = schemaName(options.prefix);
  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  await admin.query(migrationSql());
  await admin.end();

  const databaseUrl = withPostgresSchema(baseUrl, schema);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let disposed = false;
  return {
    schema,
    databaseUrl,
    prisma,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await prisma.$disconnect();
      const cleanup = new Client({ connectionString: baseUrl });
      await cleanup.connect();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await cleanup.end();
    }
  };
}
```

The generated schema is restricted to lowercase alphanumerics and underscores before interpolation. Wrap connect/query/end paths in `try/finally` during implementation so failed setup does not leak a connected `pg` client or partial schema.

Run the focused test again. Expected: PASS.

**Step 3 — Convert the integration harness from files to schemas**

Modify `tests/integration/helpers.ts` to call `createIsolatedPostgresSchema({ prefix: 'integration' })`, use its Prisma client, and expose:

```ts
export type TestDatabase = {
  prisma: PrismaClient;
  agent: ReturnType<typeof request.agent>;
  databaseScope: string;
  seed: SeedResult | null;
  factories: TestFactories;
  actors: RoleTestActors | null;
  login: (email: string, password?: string) => Promise<void>;
  dispose: () => Promise<void>;
};
```

Remove all temporary-directory creation, `DATABASE_URL` mutation, and filesystem cleanup. Set `databaseScope` to the isolated schema name and delegate disposal to the scope.

Update `tests/integration/test-harness.test.ts` assertions from directory existence to database isolation:

```ts
expect(second.databaseScope).not.toBe(first.databaseScope);
expect(await second.prisma.organization.count()).toBe(0);
```

The failure-cleanup test must query `pg_namespace` from a safe admin connection and assert the captured schema no longer exists after `withTestDatabase` rejects.

Run:

```bash
TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm run test:integration
```

Expected: all integration tests pass without creating `.db` files.

**Step 4 — Convert Playwright setup and teardown to one isolated schema**

Keep `SALIK_E2E_RUN_ID`, ports, and artifact `rootDir`, but replace the SQLite URL with:

```ts
const baseDatabaseUrl = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
if (!baseDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for E2E');
assertSafeTestDatabaseUrl(baseDatabaseUrl, env as NodeJS.ProcessEnv);
const schema = `salik_e2e_${runId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
const databaseUrl = withPostgresSchema(baseDatabaseUrl, schema);
```

Extend `E2EEnvironment` with `schema` and `baseDatabaseUrl`. `prepareE2EDatabase` creates that exact safe schema, executes every committed migration in lexical order, creates `PrismaClient({ datasourceUrl: databaseUrl })`, and runs `seedDatabase`. `resetE2EDatabase` retains the schema and only runs the guarded demo seed. `global-teardown.ts` drops the exact E2E schema and then removes the artifact directory.

Update `tests/config/e2e-environment.test.ts` to assert:

```ts
expect(environment.databaseUrl).toContain('schema=salik_e2e_safe_run');
expect(() => createE2EEnvironment({ TEST_DATABASE_URL: 'file:./e2e.db' })).toThrow('DATABASE_URL must use PostgreSQL');
expect(() => createE2EEnvironment({ TEST_DATABASE_URL: 'postgresql://remote.invalid/postgres' })).toThrow(
  'Refusing destructive tests against a remote PostgreSQL host'
);
```

Pass `TEST_DATABASE_URL` through both Playwright web-server environments. Run:

```bash
TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm run test:e2e:smoke
```

Expected: Playwright smoke passes and teardown removes the E2E schema.

**Step 5 — Add PostgreSQL to GitHub Actions**

Add this service to both jobs that execute application or browser tests:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_DB: salik_test
      POSTGRES_USER: salik
      POSTGRES_PASSWORD: salik_ci_only
    ports:
      - 5432:5432
    options: >-
      --health-cmd "pg_isready -U salik -d salik_test"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 10
```

Replace every `file:` URL with:

```yaml
TEST_DATABASE_URL: postgresql://salik:salik_ci_only@127.0.0.1:5432/salik_test
DATABASE_URL: postgresql://salik:salik_ci_only@127.0.0.1:5432/salik_test?schema=ci
```

Run the full local gate:

```bash
TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm run quality
```

Expected: lint, type checks, Vitest coverage, and production build exit 0.

**Step 6 — Document and commit the PostgreSQL test harness**

Update `docs/testing.md` so every local test command is preceded by `docker compose up -d postgres`, and explain schema isolation and the exact remote-test confirmation value.

Run:

```bash
bd close salik-new-eij.8.2 --reason="Integration, E2E, and CI use isolated PostgreSQL schemas with destructive-target guards."
git add tests playwright.config.ts .github/workflows/ci.yml docs/testing.md .beads/issues.jsonl .beads/interactions.jsonl
git diff --cached --check
git commit -m "test: run SALIK suites on PostgreSQL"
```

---

### Task 3: Production configuration validation and database readiness

**Beads:** `salik-new-eij.8.3`

**Files:**

- Create: `tests/config/production-config.test.ts`
- Modify: `src/server/config.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/index.ts`
- Modify: `tests/smoke/api-health.test.ts`

**Interfaces:**

- Produces `resolveConfig(environment?: NodeJS.ProcessEnv): AppConfig`.
- Produces `validateProductionConfig(config: AppConfig): void`.
- Keeps exported singleton `config` for existing consumers.
- Changes `/api/health` to return `503` with `{ ok: false, service: 'salik' }` when PostgreSQL is unavailable.

**Step 1 — Write failing production configuration tests**

Create `tests/config/production-config.test.ts` with cases for Render origin fallback and every prohibited default:

```ts
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/server/config';

const validProduction = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://prisma:strong@pooler.example.com:5432/postgres',
  RENDER_EXTERNAL_URL: 'https://salik.onrender.com',
  SESSION_SECRET: 's'.repeat(48),
  PAYMENT_WEBHOOK_SECRET: 'p'.repeat(32),
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_value',
  SUPABASE_SECRET_KEY: 'sb_secret_value',
  SUPABASE_STORAGE_BUCKET: 'salik-private',
  SALIK_SUPABASE_DISABLED: 'false'
} as NodeJS.ProcessEnv;

describe('production configuration', () => {
  it('uses the Render external URL when APP_ORIGIN is absent', () => {
    expect(resolveConfig(validProduction).appOrigin).toBe('https://salik.onrender.com');
  });

  it.each([
    ['SQLite database', { DATABASE_URL: 'file:./prod.db' }],
    ['weak session secret', { SESSION_SECRET: 'short' }],
    ['HTTP origin', { RENDER_EXTERNAL_URL: 'http://salik.onrender.com' }],
    ['disabled Supabase', { SALIK_SUPABASE_DISABLED: 'true' }],
    ['missing Supabase secret', { SUPABASE_SECRET_KEY: undefined }]
  ])('rejects %s', (_name, override) => {
    expect(() => resolveConfig({ ...validProduction, ...override })).toThrow('Invalid production configuration');
  });
});
```

Run the file. Expected: at least the rejection table fails with the current permissive config.

**Step 2 — Implement explicit environment resolution**

Refactor `src/server/config.ts` around this interface:

```ts
export type AppConfig = {
  port: number;
  appOrigin: string;
  databaseUrl: string | undefined;
  sessionSecret: string;
  omanTimezone: string;
  paymentWebhookSecret: string;
  maxUploadBytes: number;
  supabaseUrl: string | undefined;
  supabasePublishableKey: string | undefined;
  supabaseSecretKey: string | undefined;
  supabaseStorageBucket: string;
  supabaseDisabled: boolean;
  isProduction: boolean;
};
```

`resolveConfig` must compute `appOrigin` as `APP_ORIGIN ?? RENDER_EXTERNAL_URL ?? 'http://localhost:5173'`, parse numeric fields, call `validateProductionConfig` only when `NODE_ENV === 'production'`, and throw one sanitized error listing invalid variable names. Never include values in the error.

Production rules are exact: PostgreSQL URL, HTTPS origin, `SESSION_SECRET.length >= 32`, `PAYMENT_WEBHOOK_SECRET.length >= 16`, all three Supabase values present, `SALIK_SUPABASE_DISABLED !== 'true'`, and positive finite `PORT`/`MAX_UPLOAD_BYTES`.

Run the focused config test. Expected: all cases pass.

**Step 3 — Make health database-aware with a failing smoke case first**

Extend `tests/smoke/api-health.test.ts` with a typed fake Prisma object whose `$queryRaw` rejects:

```ts
it('returns 503 without leaking the database error', async () => {
  const prisma = { $queryRaw: async () => { throw new Error('postgresql://secret@host/db'); } } as unknown as PrismaClient;
  const response = await request(createApp({ prisma })).get('/api/health');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ ok: false, service: 'salik' });
  expect(response.text).not.toContain('secret');
});
```

Run the smoke file. Expected: FAIL because the current health route always returns 200.

Modify `src/server/app.ts`:

```ts
app.set('trust proxy', 1);
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'salik', timezone: config.omanTimezone });
  } catch {
    res.status(503).json({ ok: false, service: 'salik' });
  }
});
```

Run the smoke test again. Expected: healthy and unavailable cases pass.

**Step 4 — Verify startup, cookies, and commit**

Ensure `src/server/index.ts` imports resolved config before listening and logs only host/port, never environment values. Run:

```bash
TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm run test:unit
TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm run test:smoke
npm run type-check
```

Expected: all focused suites and type checks pass.

Then:

```bash
bd close salik-new-eij.8.3 --reason="Production config fails closed and health reflects PostgreSQL readiness without leaking errors."
git add src/server/config.ts src/server/app.ts src/server/index.ts tests/config/production-config.test.ts tests/smoke/api-health.test.ts .beads/issues.jsonl .beads/interactions.jsonl
git diff --cached --check
git commit -m "feat: validate production readiness"
```

---

### Task 4: Safe private administrator bootstrap and seed guard

**Beads:** `salik-new-eij.8.4`

**Files:**

- Create: `src/server/services/bootstrap.ts`
- Create: `prisma/bootstrap.ts`
- Create: `tests/integration/production-bootstrap.test.ts`
- Create: `tests/config/seed-safety.test.ts`
- Modify: `src/server/services/seed.ts`
- Modify: `prisma/seed.ts`
- Modify: `package.json`
- Modify: `tsconfig.server.json`

**Interfaces:**

- Produces `bootstrapPrivateAdmin(prisma, input, provision): Promise<{ organizationId: string; userId: string; created: boolean }>`.
- Produces `assertDemoSeedAllowed(environment, databaseUrl): void`.
- Produces npm command `db:bootstrap:private`.

**Step 1 — Write failing seed safety tests**

Create `tests/config/seed-safety.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertDemoSeedAllowed } from '../../src/server/services/seed';

describe('demo seed safety', () => {
  it('allows test mode on localhost', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'test' } as NodeJS.ProcessEnv, 'postgresql://localhost/salik_test')).not.toThrow();
  });

  it('rejects production even when the host is local', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv, 'postgresql://localhost/salik')).toThrow(
      'Demo seed is disabled in production'
    );
  });

  it('rejects a remote database', () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv, 'postgresql://pooler.supabase.com/postgres')).toThrow(
      'Demo seed requires a local PostgreSQL host'
    );
  });
});
```

Run the file. Expected: FAIL because the guard is absent.

Implement and invoke the guard at the start of the destructive seed entry point. `seedDatabase` remains callable by already-isolated test scopes; `prisma/seed.ts` must call the guard before constructing or mutating data.

**Step 2 — Write failing idempotent bootstrap tests**

Create `tests/integration/production-bootstrap.test.ts` using `createTestDatabase({ seed: false })` and a stub provisioner:

```ts
it('creates one platform administrator and is idempotent', async () => {
  const database = await createTestDatabase({ seed: false });
  const provisioned: string[] = [];
  const provision = async (input: BootstrapProvisionInput) => {
    provisioned.push(input.email);
    return 'supabase-auth-user-1';
  };
  try {
    const input = { email: 'owner@example.com', name: 'Pilot Owner', password: 'private-password-12345' };
    const first = await bootstrapPrivateAdmin(database.prisma, input, provision);
    const second = await bootstrapPrivateAdmin(database.prisma, input, provision);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await database.prisma.organization.count({ where: { type: 'PLATFORM' } })).toBe(1);
    expect(await database.prisma.user.count({ where: { role: 'SUPER_ADMIN' } })).toBe(1);
  } finally {
    await database.dispose();
  }
});
```

Add rejection tests for an existing same-email user with a non-admin role, a conflicting `authUserId`, and a password shorter than 14 characters. Run the file. Expected: FAIL because the service does not exist.

**Step 3 — Implement the bootstrap service**

Create `src/server/services/bootstrap.ts` with these exported types:

```ts
export type BootstrapAdminInput = { email: string; name: string; password: string };
export type BootstrapProvisionInput = BootstrapAdminInput & {
  role: 'SUPER_ADMIN';
  organizationId: string;
};
export type BootstrapProvisioner = (input: BootstrapProvisionInput) => Promise<string>;
```

`bootstrapPrivateAdmin` must normalize email, validate email/name/password, ensure exactly one `PLATFORM` organization named `SALIK Operations`, reject incompatible existing users, call the injected provisioner, and upsert one active `SUPER_ADMIN` linked to the returned Auth ID. Hash the same private password with bcrypt only for the local fallback record; never return or log it. A retry after Auth success must reconcile the same email/Auth ID and return `created: false`.

Use the existing `provisionSupabaseUser` as the production provisioner through this adapter:

```ts
const provision: BootstrapProvisioner = (input) =>
  provisionSupabaseUser({
    email: input.email,
    password: input.password,
    name: input.name,
    role: input.role,
    organizationId: input.organizationId
  }).then((authUserId) => {
    if (!authUserId) throw new Error('Supabase bootstrap requires hosted Auth');
    return authUserId;
  });
```

Run the integration bootstrap file. Expected: all idempotency and conflict tests pass.

**Step 4 — Add the trusted CLI entry point**

Create `prisma/bootstrap.ts`. It must require:

```ts
const confirmation = 'SALIK_PRIVATE_PILOT';
const required = ['BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_NAME', 'BOOTSTRAP_ADMIN_PASSWORD'] as const;
```

Reject unless `BOOTSTRAP_CONFIRM === confirmation`, production configuration passes, and every required variable is present. Call `bootstrapPrivateAdmin`, log only `Private administrator ready: created|reconciled`, disconnect Prisma in `finally`, and exit nonzero with a sanitized message on failure.

Add:

```json
"db:bootstrap:private": "tsx prisma/bootstrap.ts"
```

Include `prisma/bootstrap.ts` in `tsconfig.server.json`. Run:

```bash
npm run type-check
TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npx vitest run tests/config/seed-safety.test.ts tests/integration/production-bootstrap.test.ts
```

Expected: both focused suites pass.

**Step 5 — Commit the bootstrap boundary**

```bash
bd close salik-new-eij.8.4 --reason="Private admin bootstrap is idempotent, secret-safe, and separate from the production-disabled demo seed."
git add src/server/services/bootstrap.ts src/server/services/seed.ts prisma/bootstrap.ts prisma/seed.ts package.json package-lock.json tsconfig.server.json tests/config/seed-safety.test.ts tests/integration/production-bootstrap.test.ts .beads/issues.jsonl .beads/interactions.jsonl
git diff --cached --check
git commit -m "feat: add safe private admin bootstrap"
```

---

### Task 5: Render Blueprint, operator runbook, and deployment tests

**Beads:** `salik-new-eij.8.5`

**Files:**

- Create: `render.yaml`
- Create: `tests/config/render-blueprint.test.ts`
- Create: `docs/deployment.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes production config, migrations, readiness, and bootstrap from Tasks 1–4.
- Produces a single Render service named `salik-private-pilot`.
- Produces the complete operator contract for secrets and verification.

**Step 1 — Write the failing Blueprint contract test**

Install a direct YAML parser:

```bash
npm install --save-dev yaml
```

Create `tests/config/render-blueprint.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const blueprint = parse(readFileSync('render.yaml', 'utf8'));

describe('Render Blueprint', () => {
  it('defines one free Frankfurt Node service with health checks', () => {
    expect(blueprint.services).toHaveLength(1);
    expect(blueprint.services[0]).toMatchObject({
      type: 'web',
      name: 'salik-private-pilot',
      runtime: 'node',
      plan: 'free',
      region: 'frankfurt',
      branch: 'main',
      healthCheckPath: '/api/health',
      buildCommand: 'npm ci && npm run build',
      startCommand: 'npm run db:migrate:deploy && npm start'
    });
  });

  it('never commits secret values', () => {
    const vars = Object.fromEntries(blueprint.services[0].envVars.map((entry: { key: string }) => [entry.key, entry]));
    for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
      expect(vars[key]).toEqual({ key, sync: false });
    }
    expect(vars.SESSION_SECRET).toEqual({ key: 'SESSION_SECRET', generateValue: true });
    expect(vars.PAYMENT_WEBHOOK_SECRET).toEqual({ key: 'PAYMENT_WEBHOOK_SECRET', generateValue: true });
  });
});
```

Run the file. Expected: FAIL because `render.yaml` does not exist.

**Step 2 — Add the free Render Blueprint**

Create `render.yaml`:

```yaml
services:
  - type: web
    name: salik-private-pilot
    runtime: node
    plan: free
    region: frankfurt
    branch: main
    autoDeployTrigger: commit
    buildCommand: npm ci && npm run build
    startCommand: npm run db:migrate:deploy && npm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: DATABASE_URL
        sync: false
      - key: SESSION_SECRET
        generateValue: true
      - key: PAYMENT_WEBHOOK_SECRET
        generateValue: true
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_PUBLISHABLE_KEY
        sync: false
      - key: SUPABASE_SECRET_KEY
        sync: false
      - key: SUPABASE_STORAGE_BUCKET
        value: salik-private
      - key: SALIK_SUPABASE_DISABLED
        value: "false"
      - key: OMAN_TIMEZONE
        value: Asia/Muscat
      - key: MAX_UPLOAD_BYTES
        value: "5242880"
```

Do not set `APP_ORIGIN`; production config must use Render's built-in `RENDER_EXTERNAL_URL`. Run the Blueprint contract test. Expected: both tests pass.

**Step 3 — Write the exact operator runbook**

Create `docs/deployment.md` with these sections and commands:

1. Free-tier behavior and lack of automatic backups.
2. Supabase Prisma role creation using the official SQL Editor instructions, with a generated password entered only in Supabase and Render.
3. Supavisor session URL selection on port `5432`.
4. Storage migration application from `supabase/migrations/`.
5. Render Blueprint URL: `https://dashboard.render.com/blueprint/new?repo=https://github.com/sultanAlhabsi/salik-new`.
6. The four `sync: false` values and where each comes from.
7. Local trusted bootstrap invocation with values loaded from an ignored `.env.production.local` file.
8. Post-deploy health, login, tenant isolation, attachment, restart persistence, and log-redaction checks.
9. PostgreSQL export command before important changes and Render application rollback steps.

The bootstrap example must contain names only, never sample credentials:

```bash
set -a
. ./.env.production.local
set +a
BOOTSTRAP_CONFIRM=SALIK_PRIVATE_PILOT npm run db:bootstrap:private
```

Update `README.md` to describe PostgreSQL as the supported business database and link to `docs/deployment.md`. Remove SQLite production claims and rename local setup commands to the new migration and demo-seed scripts.

**Step 4 — Validate docs, Blueprint, build, and secrets**

Run:

```bash
npx vitest run tests/config/render-blueprint.test.ts tests/config/production-config.test.ts
npm run build
git diff --check
git grep -nE '(sb_secret_[A-Za-z0-9_-]{8,}|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@)' -- ':!package-lock.json' ':!docs/superpowers' || true
```

Expected: tests and build pass. Secret scan returns no real tracked credentials; documentation-only localhost examples are reviewed manually.

If the Render CLI is installed and authenticated, also run:

```bash
render blueprints validate
```

Expected: Blueprint is valid. If the CLI is unavailable, the parsed contract test remains the local structural gate and Dashboard validation is required during Task 7.

**Step 5 — Commit the deployment package**

```bash
bd close salik-new-eij.8.5 --reason="Render Blueprint, secret contract, and private-pilot operations runbook verified."
bd close salik-new-eij.8 --reason="PostgreSQL migration, tests, production safety, bootstrap, and Render configuration implemented."
git add render.yaml docs/deployment.md README.md package.json package-lock.json tests/config/render-blueprint.test.ts .beads/issues.jsonl .beads/interactions.jsonl
git diff --cached --check
git commit -m "deploy: configure free Render pilot"
```

---

### Task 6: Full local verification and GitHub delivery

**Beads:** parent `salik-new-eij`; deployment task `salik-new-eij.9` remains open until the public URL is verified.

**Files:** No planned source changes. Any failure discovered here returns to the owning Beads unit and receives a regression test before a fix.

**Step 1 — Run the complete quality gate against local PostgreSQL**

```bash
docker compose up -d postgres
export TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik'
npm run lint
npm run type-check
npm test
npm run test:coverage
npm run build
npm run test:e2e:smoke
```

Expected: every command exits 0; Vitest reports zero failures; Playwright smoke reports zero failures.

**Step 2 — Verify repository safety and committed scope**

```bash
git diff --check
git status --short --branch
git ls-files .env .env.production.local
git grep -nE '(SUPABASE_SECRET_KEY=.+|DATABASE_URL=postgres(ql)?://.+:.+@)' -- ':!*.example' || true
```

Expected: no secret environment file is tracked, no staged unrelated artifact exists, and only intentional changes remain.

**Step 3 — Push the implementation**

```bash
git fetch origin main --prune
git rebase origin/main
git push origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected: push succeeds and the final count is `0 0`.

---

### Task 7: Supabase preparation, Render deployment, and live verification

**Beads:** `salik-new-eij.9`

**External prerequisites:** An authenticated Supabase Dashboard session with access to the existing project and an authenticated Render account connected to GitHub. No credential is copied into chat, shell history, Git, or logs.

**Step 1 — Prepare Supabase**

Run the reviewed Storage SQL migrations in the Supabase SQL Editor. Create the dedicated Prisma role following the official Supabase Prisma guide, then copy the Supavisor session connection string ending in port `5432` into the ignored `.env.production.local` file and Render secret form.

Verify from the trusted workstation without printing the URL:

```bash
set -a
. ./.env.production.local
set +a
npm run db:migrate:deploy
npx prisma migrate status
```

Expected: all PostgreSQL migrations are applied and status reports the database schema is up to date.

**Step 2 — Create the Render service from the committed Blueprint**

Open:

```text
https://dashboard.render.com/blueprint/new?repo=https://github.com/sultanAlhabsi/salik-new
```

Authorize GitHub if requested, select the free plan, keep Frankfurt, fill only the four `sync: false` values, and apply the Blueprint. Monitor build, migration, start, and `/api/health` until Render reports healthy.

**Step 3 — Bootstrap the private administrator**

From the trusted workstation with the same ignored production environment loaded:

```bash
BOOTSTRAP_CONFIRM=SALIK_PRIVATE_PILOT npm run db:bootstrap:private
```

Expected output contains only `Private administrator ready: created` or `reconciled`.

**Step 4 — Verify the live private pilot**

Set `SALIK_LIVE_ORIGIN` to the Render HTTPS URL and run non-secret checks:

```bash
curl --fail --silent --show-error "$SALIK_LIVE_ORIGIN/api/health"
```

Expected JSON: `{"ok":true,"service":"salik","timezone":"Asia/Muscat"}`.

Use the private administrator credentials through the browser to verify login, refresh, logout, one tenant-scoped create/read flow, private attachment upload/download, and one unauthorized cross-tenant denial. Trigger one manual Render redeploy, wait for health, and verify the created record still exists.

**Step 5 — Close the deployment work only after evidence exists**

Record the public Render URL and verification evidence in Beads without credentials:

```bash
bd update salik-new-eij.9 --notes="Render URL verified; health, private auth, tenant isolation, private attachment, and restart persistence passed."
bd close salik-new-eij.9 --reason="Free Render + Supabase private pilot deployed and verified."
bd close salik-new-eij --reason="Approved private SALIK pilot is online with persistent Supabase data and documented recovery."
```

Commit and push only the resulting Beads export/interactions, then verify `HEAD...origin/main` is `0 0`.

## Plan Self-Review

- **Spec coverage:** PostgreSQL migration, unified tests, CI, production validation, readiness, safe bootstrap, Storage/Auth, Blueprint, secrets, live verification, persistence, and recovery each map to a task above.
- **Scope:** The work remains one deployment program with independently reviewable Beads units. Payment-provider and UI changes remain excluded.
- **Type consistency:** `withPostgresSchema`, `assertSafeTestDatabaseUrl`, `createIsolatedPostgresSchema`, `resolveConfig`, and `bootstrapPrivateAdmin` have one signature throughout the plan.
- **Safety:** Remote destructive tests require the exact confirmation string; production demo seeding remains forbidden; deployment secrets stay in ignored local or hosted configuration.
- **Execution mode:** Inline execution is selected because the user delegated decisions and requested minimal interruptions, while current repository instructions do not request multi-agent delegation.
