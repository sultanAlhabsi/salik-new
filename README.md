# SALIK

SALIK is an English-language, multi-tenant B2B distribution platform for Oman. It connects platform operators, suppliers, stores, and drivers through separate role-based portals for catalog management, procurement, fulfillment, delivery proof, invoicing, payments, reporting, notifications, and audit history.

## Stack

- React 19 and Vite for the web application
- Express 5 for the API
- Supabase Auth and private Supabase Storage for hosted identity and attachments
- Prisma and SQLite for the current business-data runtime and isolated tests
- Vitest and Supertest for domain and integration tests
- Playwright for desktop and mobile browser journeys

## Local setup

Requirements: Node.js 22+ and npm.

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run db:apply
npm run db:seed
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3000`.

The seed command resets local SALIK data and loads a complete demo workspace. All demo accounts use `Password123!`:

| Portal      | Email                   |
| ----------- | ----------------------- |
| Super Admin | `admin@salik.om`        |
| Supplier    | `supplier@fresh.om`     |
| Supplier    | `supplier@beverages.om` |
| Store       | `store@alnoor.om`       |
| Driver      | `driver@fresh.om`       |
| Driver      | `driver@beverages.om`   |

## Quality checks

```bash
npm run lint
npm run type-check
npm test
npm run test:unit
npm run test:integration
npm run test:component
npm run test:contract
npm run test:smoke
npm run test:coverage
npm run build
npm run test:e2e
npm run test:e2e:smoke
npm run test:regression
```

`npm run quality` runs linting, type checks, the Vitest suite with V8 coverage, and a production build in one command. Coverage is written to `coverage/` as text, JSON, and HTML; CI uploads that directory as the `vitest-coverage` artifact. `test:unit`, `test:integration`, `test:component`, `test:contract`, and `test:smoke` isolate their respective layers. `test:regression` runs coverage followed by the complete Playwright suite. Install the browser once with `npx playwright install chromium` if Playwright reports that Chromium is missing.

The Supabase contract suite is safe-by-default and skips unless `SUPABASE_CONTRACT_TEST=true` is set together with `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY`, `SUPABASE_TEST_SECRET_KEY`, `SUPABASE_TEST_EMAIL`, and `SUPABASE_TEST_PASSWORD`. Point these only at a disposable local Supabase project and optionally set `SUPABASE_TEST_BUCKET`; the suite creates a unique object and removes it in `finally`.

## Supabase

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in `.env`. SALIK then uses Supabase Auth for login, token refresh, logout, password recovery, and password changes. Access and refresh tokens are held only in secure HTTP-only cookies. The secret key is server-only and must never be exposed through Vite variables or client code.

The reviewed migration in `supabase/migrations/` creates the private `salik-private` bucket and tenant/user folder policies. `npm run db:seed` synchronizes the demo identities to Supabase Auth. Set `SALIK_SUPABASE_DISABLED=true` only for isolated local tests or an intentional offline fallback.

## Database

Reviewed SQL migrations are in `prisma/migrations/`. `npm run db:apply` records and applies each pending migration once. `npm run db:seed` clears and rebuilds demo data, so it is intended for local and test environments only.

SQLite is the zero-setup business database for this build. Supabase Auth identities are linked through the unique `User.authUserId` field. Moving Prisma business data to Supabase Postgres still requires a PostgreSQL `DATABASE_URL`; the API and client contracts do not need to change when that connection is supplied.

## Production build

```bash
npm run build
npm start
```

The production server serves the API and the compiled client from `dist/`. Configure `DATABASE_URL`, `APP_ORIGIN`, Supabase credentials, and payment integration values through the deployment environment. See [.env.example](.env.example) for the supported variables.

## Architecture notes

- [Architecture decision](docs/decisions/0001-architecture.md)
- [API reference](docs/API.md)
- [External integrations](docs/integrations.md)
- [Open production decisions](docs/decisions/open-decisions.md)
- [Product design specification](docs/superpowers/specs/2026-07-19-salik-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-19-salik-implementation.md)

Authorization is enforced on the server for every protected route. Supplier and store records are scoped by organization ID, checkout and payment operations use idempotency keys, inventory reservations are transactional, and sensitive actions write audit records.
