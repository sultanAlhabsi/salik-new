# Rich Demo Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one deterministic medium-sized Omani distribution dataset for local seeding and the guarded hosted demo bootstrap, then deploy and verify it publicly.

**Architecture:** A pure fixture module owns stable `hosted-demo-*` records and validates relationships and totals without Prisma. A shared persistence service upserts those fixtures in foreign-key order; the local seed clears a confirmed local database before calling it, while the hosted bootstrap validates reserved identities, provisions exactly four Supabase Auth accounts, and calls the same writer without deleting unrelated records.

**Tech Stack:** TypeScript 5.9, Prisma 6, PostgreSQL/Supabase, Vitest, Express, React/Vite, Render CLI.

## Global Constraints

- Keep exactly four prepared login identities: `demo-admin@salik.om`, `supplier@fresh.om`, `store@alnoor.om`, and `driver@fresh.om`.
- Create exactly 4 suppliers, 6 stores, 40 products, 6 drivers, 20 orders, 5 warehouses, and 4 subscriptions.
- Product status distribution is exactly 32 `PUBLISHED`, 4 `DRAFT`, 2 `HIDDEN`, and 2 `ARCHIVED`.
- Orders cover every supported non-draft lifecycle status and keep subtotal, tax, and total values internally consistent.
- All shared fixture identifiers and idempotency keys begin with `hosted-demo-`.
- Hosted writes are additive/idempotent and never modify `admin@salik.om` or unrelated records.
- Local destructive seeding remains restricted to localhost PostgreSQL URLs; tests must use `TEST_DATABASE_URL=postgresql://salik:salik_local_only@127.0.0.1:54329/salik`.
- Use test-first RED/GREEN cycles and commit only intended fixture, persistence, test, and documentation files.

---

### Task 1: Canonical fixture catalog and validation

**Files:**

- Create: `src/server/services/demo-fixtures.ts`
- Create: `tests/config/demo-fixtures.test.ts`

**Interfaces:**

- Produces: `demoFixtures`, `demoFixtureCounts`, `preparedDemoAccounts`, `validateDemoFixtures(fixtures): void`, and exported fixture types.
- Consumes: Prisma enum types only; it must not import or call `PrismaClient`.

- [ ] **Step 1: Write the failing fixture contract test**

```ts
expect(demoFixtureCounts).toEqual({
  suppliers: 4,
  stores: 6,
  products: 40,
  drivers: 6,
  orders: 20,
  warehouses: 5,
  subscriptions: 4,
});
expect(countBy(demoFixtures.products, "status")).toEqual({
  PUBLISHED: 32,
  DRAFT: 4,
  HIDDEN: 2,
  ARCHIVED: 2,
});
expect(new Set(demoFixtures.orders.map(({ status }) => status))).toEqual(
  new Set([
    "SUBMITTED",
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "REJECTED",
    "CANCELLED",
  ]),
);
expect(() => validateDemoFixtures(demoFixtures)).not.toThrow();
```

- [ ] **Step 2: Run the test and observe the missing-module failure**

Run: `npm test -- tests/config/demo-fixtures.test.ts`
Expected: FAIL because `demo-fixtures.ts` does not exist.

- [ ] **Step 3: Implement deterministic fixture generation and validation**

Create stable definitions for organizations, addresses, users, warehouses, plans, subscriptions, categories, products, stocks, carts, recurring orders, orders/items/events, inventory movements, invoices, payment attempts, deliveries/events, notifications, support tickets, audit logs, and platform settings. `validateDemoFixtures` must throw precise errors for duplicate IDs/emails, duplicate supplier SKU pairs, invalid references, missing stock, inconsistent order totals, and missing status-dependent records.

- [ ] **Step 4: Run the fixture test until green**

Run: `npm test -- tests/config/demo-fixtures.test.ts`
Expected: PASS with exact counts and invariant coverage.

### Task 2: Shared Prisma persistence

**Files:**

- Create: `src/server/services/demo-dataset.ts`
- Create: `tests/integration/demo-dataset.test.ts`
- Modify: `src/server/services/seed.ts`

**Interfaces:**

- Consumes: `demoFixtures`, `preparedDemoAccounts`, and optional prepared Auth IDs.
- Produces: `persistDemoDataset(prisma, options): Promise<DemoDatasetResult>` and keeps the existing `seedDatabase(prisma)` return keys (`organizations.platform`, `organizations.freshSupplier`, `organizations.beverageSupplier`, `organizations.alNoorStore`, and existing user aliases).

- [ ] **Step 1: Write a failing local persistence test**

```ts
const seed = await seedDatabase(database.prisma);
expect(
  await database.prisma.organization.count({
    where: { id: { startsWith: "hosted-demo-" }, type: "SUPPLIER" },
  }),
).toBe(4);
expect(
  await database.prisma.organization.count({
    where: { id: { startsWith: "hosted-demo-" }, type: "STORE" },
  }),
).toBe(6);
expect(
  await database.prisma.product.count({
    where: { id: { startsWith: "hosted-demo-" } },
  }),
).toBe(40);
expect(
  await database.prisma.order.count({
    where: { id: { startsWith: "hosted-demo-" } },
  }),
).toBe(20);
expect(seed.users.storeAdmin.email).toBe("store@alnoor.om");
```

- [ ] **Step 2: Run the test and observe the old small seed counts**

Run: `TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm test -- tests/integration/demo-dataset.test.ts`
Expected: FAIL because the current seed has fewer organizations, products, and orders.

- [ ] **Step 3: Implement ordered upserts and adapt local seed**

`persistDemoDataset` validates first, hashes the shared password once, writes parent tables before child tables in bounded transactions, and returns resolved prepared records. Replace the hand-built local sample with `clearDatabase` plus this writer, and construct compatibility aliases from stable fixture IDs. Keep `admin@salik.om` as the local private admin in addition to the four prepared accounts.

- [ ] **Step 4: Verify local counts, totals, access relationships, and compatibility**

Run: `TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm test -- tests/integration/demo-dataset.test.ts tests/integration/local-auth.test.ts`
Expected: PASS; the prepared store has orders from four suppliers, the prepared supplier has multiple stores, and every persisted order satisfies `subtotalBaisa + taxBaisa === totalBaisa`.

### Task 3: Hosted identity reconciliation and idempotence

**Files:**

- Modify: `src/server/services/hosted-demo.ts`
- Modify: `prisma/seed.ts`
- Modify: `tests/integration/hosted-demo-bootstrap.test.ts`

**Interfaces:**

- Consumes: `persistDemoDataset` and `preparedDemoAccounts`.
- Preserves: `bootstrapHostedDemo(prisma, provision)` return shape and `hostedDemoAccounts` public export.

- [ ] **Step 1: Update the hosted test to expect the full catalog**

```ts
expect(await countReserved("organization", "SUPPLIER")).toBe(4);
expect(await countReserved("organization", "STORE")).toBe(6);
expect(await countReserved("product")).toBe(40);
expect(await countReserved("order")).toBe(20);
expect(provisioned).toHaveLength(8); // four accounts on each of two runs
expect(privateAdmin.passwordHash).toBe("private-password-hash");
```

- [ ] **Step 2: Run the hosted test and observe old-count failures**

Run: `TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm test -- tests/integration/hosted-demo-bootstrap.test.ts`
Expected: FAIL because the old bootstrap creates only two organizations, two products, and one order.

- [ ] **Step 3: Delegate business data to the shared writer**

Keep production confirmation checks and collision errors. Validate every reserved ID and email, provision only the four prepared accounts, pass their resolved Auth IDs to `persistDemoDataset`, and remove the duplicated hard-coded business writer. Update `prisma/seed.ts` so Supabase reconciliation never provisions background users.

- [ ] **Step 4: Run hosted tests twice and confirm unrelated records survive**

Run: `TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm test -- tests/integration/hosted-demo-bootstrap.test.ts`
Expected: PASS with first result `{ createdUsers: 4, reconciledUsers: 0 }`, second result `{ createdUsers: 0, reconciledUsers: 4 }`, exact reserved counts, and unchanged private data.

### Task 4: Regression and production gates

**Files:**

- Modify only files required by failures attributable to the richer fixture.

**Interfaces:**

- Consumes the completed catalog, persistence layer, local seed, and hosted bootstrap.
- Produces a release candidate with no lint, type, test, or build errors.

- [ ] **Step 1: Run focused tests**

Run: `TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm test -- tests/config/demo-fixtures.test.ts tests/integration/demo-dataset.test.ts tests/integration/hosted-demo-bootstrap.test.ts tests/integration/local-auth.test.ts`
Expected: PASS.

- [ ] **Step 2: Run all quality gates**

Run: `npm run lint && npm run type-check && TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik' npm test && npm run build`
Expected: all commands exit 0.

- [ ] **Step 3: Review the intended diff and commit**

Run: `git diff --check && git status --short`
Stage only `src/server/services/demo-fixtures.ts`, `src/server/services/demo-dataset.ts`, `src/server/services/seed.ts`, `src/server/services/hosted-demo.ts`, `prisma/seed.ts`, relevant tests, this plan, and the approved design spec. Commit message: `feat: expand demo distribution dataset`.

### Task 5: GitHub, Render, Supabase bootstrap, and public verification

**Files:**

- No source edits expected.

**Interfaces:**

- Consumes the verified commit on `main`.
- Produces a live Render deployment whose reserved Supabase records match the fixture catalog.

- [ ] **Step 1: Push the authorized commit**

Run: `git push origin main`
Expected: the new commit appears on GitHub.

- [ ] **Step 2: Wait for the exact commit to become live on Render**

Run: `render deploys create srv-d9fqbktaeets73cket30 --commit <full-commit-sha> --wait --confirm -o json`
Expected: deploy status `live` for the pushed SHA.

- [ ] **Step 3: Run the guarded hosted bootstrap**

Run: `NODE_ENV=production APP_ORIGIN='https://salik-new.onrender.com' SALIK_SUPABASE_DISABLED=false HOSTED_DEMO_CONFIRM=SALIK_HOSTED_DEMO npm run db:bootstrap:hosted-demo`
Expected: the command reconciles exactly four prepared Auth identities and completes without deleting unrelated records.

- [ ] **Step 4: Verify health and all four public portals**

Check `https://salik-new.onrender.com/api/health`, sign in through the Admin, Supplier, Store, and Driver prepared buttons, and confirm the richer organization, catalog, order, and route data is visible. Expected: health 200, all logins 200, and representative pages load without console/server errors.

- [ ] **Step 5: Close the Beads issue**

Run: `bd close salik-new-5a4 --reason='Expanded, tested, deployed, bootstrapped, and publicly verified the shared demo dataset'`
Expected: issue status `CLOSED`.
