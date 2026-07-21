# SALIK Free Deployment Design

**Status:** Approved
**Date:** 2026-07-21
**Tracking:** `salik-new-eij`

## Objective

Publish SALIK for a small, private team at zero monthly cost while preserving business data across application restarts. The deployment must not expose secrets or shared demo credentials, and it must remain reproducible from the GitHub repository.

The accepted hosting path is:

- one free Render web service for the React and Express application;
- one existing Supabase free project for PostgreSQL, Auth, and private Storage;
- GitHub `main` as the deployment source.

This is a private pilot, not a production SLA. Render cold starts, Supabase inactivity pauses, free-tier quotas, and the absence of managed backups are accepted constraints.

## Scope

### Included

- migrate the Prisma business database from SQLite to PostgreSQL;
- make PostgreSQL the supported database for local development, CI, tests, and production;
- replace the SQLite-specific migration runner with standard Prisma migrations;
- add a safe, one-time bootstrap path for the first private administrator;
- add a Render Blueprint and production environment validation;
- retain the existing Supabase Auth and private Storage integration;
- deploy, verify health, authenticate, and exercise one private business flow;
- document operation, free-tier limitations, and recovery steps.

### Excluded

- a public shared demo account;
- paid uptime, persistent Render disks, or managed backups;
- custom domains;
- production payment processing;
- importing disposable local demo data from SQLite;
- unrelated feature or visual redesign work.

## Approaches Considered

### 1. Render web service with Supabase PostgreSQL, Auth, and Storage — selected

This keeps identity, files, and persistent business data in the existing Supabase project while Render runs a single Node process. It avoids Render's ephemeral filesystem and the 30-day expiry of free Render Postgres.

### 2. Render web service with Render Postgres

This has tighter Blueprint integration, but a free Render Postgres database expires after 30 days. SALIK would still need Supabase for Auth and Storage, so this adds another expiring datastore without simplifying the application enough.

### 3. Static frontend plus a serverless API

This could reduce cold-start impact for the frontend, but Express routing, HTTP-only cookies, uploads, and Prisma connection management would need a larger rewrite. It is not justified for the pilot.

## Architecture

```text
Private team browser
        |
        | HTTPS, same-origin cookies
        v
Render free web service
  React static assets + Express API
        |
        +---- Supavisor session pooler ----> Supabase PostgreSQL
        |
        +---- Supabase server SDK ---------> Supabase Auth
        |
        +---- authorized object access ----> Private Storage bucket
```

The browser and API use the same Render origin. This keeps cookie and CORS behavior simple and avoids exposing Supabase server credentials to the browser. Express remains the authorization authority for roles, tenant boundaries, and entity access.

## Application Service

Render runs a single Git-backed Node service from `main`:

- runtime: Node.js 22;
- plan: free;
- build: install locked dependencies and build the Prisma client, server, and Vite client;
- start: apply committed Prisma migrations, then start Express;
- health path: `/api/health`;
- auto-deploy: enabled for commits to `main`;
- region: Frankfurt, the closest available Render region to Oman for this pilot.

The server continues to bind to `0.0.0.0` through Express and uses Render's `PORT`. `APP_ORIGIN` resolves from an explicit value first and otherwise from Render's `RENDER_EXTERNAL_URL`.

The health endpoint performs a lightweight PostgreSQL query. It returns `200` only when the process and database are ready, and `503` when the database is unavailable. It never reports credentials or internal connection details.

## PostgreSQL Migration Strategy

Prisma migration SQL is provider-specific, so the current SQLite migration history cannot be executed against PostgreSQL.

The implementation will:

1. change the Prisma datasource provider to `postgresql`;
2. archive the SQLite migration history outside the active `prisma/migrations` path for historical reference;
3. generate and review a new PostgreSQL baseline from the current Prisma data model;
4. replace `applyMigrations` with `prisma migrate deploy` for deployed environments;
5. keep `prisma migrate dev` for reviewed development changes;
6. verify the baseline against an empty PostgreSQL database;
7. initialize the new Supabase database without importing disposable local SQLite demo data.

Application routes and domain contracts remain unchanged. Any provider-specific SQL discovered during implementation must be converted to parameterized PostgreSQL-compatible SQL and covered by tests.

## Development and Test Databases

PostgreSQL becomes the only supported business-data engine. Maintaining separate SQLite and PostgreSQL Prisma clients would create schema drift and false test confidence.

- Local development uses a local PostgreSQL instance, preferably through Docker Compose.
- GitHub Actions uses a PostgreSQL service container.
- Integration and browser tests create a unique PostgreSQL schema for each isolated lifecycle and drop it during cleanup.
- Destructive tests refuse to run against a non-local host unless an explicit test-only override is present.
- Supabase production credentials are never used by the automated test suite.
- Supabase Auth and Storage contract tests remain opt-in and target only a disposable test project.

## Initial Private-Team Bootstrap

The current demo seed deletes data and uses a published shared password, so it is forbidden in the hosted pilot.

A separate idempotent bootstrap command will:

- require an explicit production confirmation value;
- require a private administrator email, name, and strong password from environment variables;
- create or reconcile the Supabase Auth identity through the server-only admin API;
- create the platform organization and linked `SUPER_ADMIN` record only when absent;
- fail safely on conflicting identities, roles, or organizations;
- avoid deleting or resetting existing data;
- redact passwords, tokens, and keys from output.

The command runs once from the trusted local workstation after database migrations and before team invitations. Subsequent users are created through the application's authenticated administration flow. The destructive demo seed remains available only for explicit local/test environments.

## Supabase Configuration

### PostgreSQL

Render uses the Supavisor **session pooler** connection string on port `5432`, which is appropriate for a long-running Express service on an IPv4 network. A dedicated Prisma database role is required instead of the default administrator role.

The Prisma role has the permissions needed for the application schema and migrations. The connection string is stored only as Render's `DATABASE_URL` secret.

### Auth

The existing Supabase Auth integration remains responsible for login, refresh, logout, recovery, and password changes. Render receives:

- `SUPABASE_URL`;
- `SUPABASE_PUBLISHABLE_KEY`;
- `SUPABASE_SECRET_KEY`.

The secret key remains server-only. Production startup fails if Auth is unintentionally disabled or required values are missing.

### Storage

The private `salik-private` bucket and its reviewed tenant/user policies remain in use. `SUPABASE_STORAGE_BUCKET` is explicit in Render. Upload size stays bounded by `MAX_UPLOAD_BYTES`, and the API checks entity access before storage operations.

## Render Blueprint and Environment

The repository will contain `render.yaml` with a single free web service. Non-secret values are committed; secret names use `sync: false`, and `SESSION_SECRET` uses Render-generated entropy.

| Variable | Source | Policy |
| --- | --- | --- |
| `NODE_VERSION` | Blueprint | `22` |
| `NODE_ENV` | Render runtime | `production` |
| `DATABASE_URL` | Render Dashboard | Supavisor session URL, secret |
| `SESSION_SECRET` | Render generated | random 256-bit value |
| `APP_ORIGIN` | `RENDER_EXTERNAL_URL` fallback | no hard-coded preview URL |
| `OMAN_TIMEZONE` | Blueprint | `Asia/Muscat` |
| `SUPABASE_URL` | Render Dashboard | secret configuration |
| `SUPABASE_PUBLISHABLE_KEY` | Render Dashboard | configuration |
| `SUPABASE_SECRET_KEY` | Render Dashboard | server-only secret |
| `SUPABASE_STORAGE_BUCKET` | Blueprint | `salik-private` |
| `SALIK_SUPABASE_DISABLED` | Blueprint | `false` |
| `PAYMENT_WEBHOOK_SECRET` | Render generated | random protection for the non-production payment adapter |
| `MAX_UPLOAD_BYTES` | Blueprint | `5242880` |

Production configuration validation rejects development defaults, weak secrets, missing database/Auth values, non-HTTPS origins, and an enabled local Supabase fallback.

## Request and Data Flow

1. The browser requests the Render URL and receives the compiled React client.
2. React calls `/api/*` on the same origin.
3. Express validates secure HTTP-only cookies through Supabase Auth.
4. Express loads the linked SALIK user from PostgreSQL and applies role, status, tenant, and entity checks.
5. Business transactions use Prisma against Supabase PostgreSQL.
6. Attachment metadata is stored in PostgreSQL; file bytes are stored in the private Supabase bucket.
7. Password recovery returns to the Render origin and completes through the existing server-controlled flow.

## Security

- No secret value is committed to GitHub, `render.yaml`, logs, or documentation.
- Production cookies are `Secure`, `HttpOnly`, and use the existing same-site policy.
- CORS accepts only the deployed application origin.
- The bootstrap command is unavailable through an HTTP endpoint.
- The public health response contains only service readiness metadata.
- Database migrations use committed SQL and never use `db push` in production.
- The demo seed refuses production and non-local database targets.
- Supabase Storage remains private with application checks and RLS defense in depth.
- Known demo passwords are not provisioned in the hosted environment.

## Failure Handling

- A failed migration prevents the web process from starting; Render retains the previous successful deploy when possible.
- A database outage produces a `503` readiness response and sanitized API errors.
- Missing or invalid production configuration fails fast with the names of invalid variables, never their values.
- Supabase Auth or Storage errors keep their existing sanitized application error mapping.
- Bootstrap partial failure is retriable and idempotent. Created Auth identities are reconciled by email rather than duplicated.
- Deployment logs include phase and error identifiers but redact connection strings, keys, tokens, cookies, and passwords.

## Verification Strategy

### Before deployment

- lint and TypeScript checks;
- unit and integration suites against isolated PostgreSQL schemas;
- migration test from an empty PostgreSQL database;
- production build;
- local production-mode smoke test;
- secret scan of tracked files and the Render Blueprint;
- optional Supabase Auth/Storage contract suite against a disposable project.

### After deployment

- verify `/api/health` returns `200` over HTTPS;
- verify the React application loads after a cold start;
- bootstrap the private administrator once;
- verify login, refresh, logout, and password recovery origin;
- create and read one tenant-scoped record;
- upload and download one private attachment;
- verify an unauthorized request is denied;
- restart/redeploy the Render service and confirm PostgreSQL data persists;
- confirm no credential or token appears in logs or client assets.

## Deployment Sequence

1. Implement PostgreSQL compatibility and the new migration baseline.
2. Move local and CI tests to PostgreSQL and pass all quality gates.
3. Implement production configuration validation, readiness, and safe bootstrap.
4. Add and validate `render.yaml` and deployment documentation.
5. Apply the Supabase SQL policies and create the dedicated Prisma role.
6. Add Render secrets and create the Blueprint service from GitHub.
7. Deploy and monitor migrations, build, and readiness.
8. Run the private bootstrap command from the trusted workstation.
9. Execute the post-deployment verification checklist.

## Rollback and Recovery

- Application rollback uses Render's previous successful deploys.
- Database migrations are forward-only. Destructive schema changes require an explicit data migration and pre-change export.
- Before the pilot contains important data, export PostgreSQL regularly because the Supabase free plan has no automatic backups.
- If Render is unavailable, the same Node build can move to another host using the existing environment contract.
- If the free Supabase project pauses, resume it in the dashboard and allow the Render health check to recover.

## Free-Tier Constraints

- Render sleeps after 15 minutes without inbound traffic and can take about a minute to wake.
- Render's filesystem is ephemeral; no business data or attachments are stored locally.
- Supabase free projects can pause after one week of inactivity.
- The Supabase free database quota is 500 MB and Storage quota is 1 GB.
- Free tiers provide no production uptime guarantee or automatic database backups.

## Acceptance Criteria

The deployment is accepted when:

- `main` contains the reviewed PostgreSQL migrations and Render Blueprint;
- all required quality gates pass against PostgreSQL;
- Render reports a healthy free web service;
- the private administrator can authenticate through Supabase;
- PostgreSQL data and private Storage objects survive a Render restart;
- a tenant-isolation negative check succeeds;
- no secret is present in GitHub or public client assets;
- the operating and recovery steps are documented.

## References

- [Render free service limitations](https://render.com/docs/free)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render default environment variables](https://render.com/docs/environment-variables)
- [Supabase Prisma guidance](https://supabase.com/docs/guides/database/prisma)
- [Supabase database connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Prisma provider migration limitation](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues)
- [Supabase free plan](https://supabase.com/pricing)
