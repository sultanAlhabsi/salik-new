# Admin Demo Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a working Admin demo card in local and hosted SALIK deployments using a dedicated demo identity that does not alter the private administrator.

**Architecture:** Add one shared prepared account to the client, local seed, and hosted bootstrap. Reuse the existing login flow, `SUPER_ADMIN` portal mapping, and demo password; extend the hosted account model to allow a platform user with no organization.

**Tech Stack:** React 19, TypeScript, Express, Prisma/PostgreSQL, Supabase Auth, Vitest, Playwright.

## Global Constraints

- The prepared identity is `demo-admin@salik.om` with role `SUPER_ADMIN` and no organization.
- The private `admin@salik.om` identity and its credentials must remain untouched.
- The hosted bootstrap stays additive and idempotent.
- Do not commit or push under the repository's conservative profile without explicit user authority.

---

### Task 1: Prepared account and local seed

**Files:**
- Modify: `tests/config/prepared-demo-access.test.ts`
- Modify: `tests/integration/local-auth.test.ts`
- Modify: `src/client/demo-access.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/server/services/seed.ts`

**Interfaces:**
- Consumes: `preparedDemoPassword`, `seedDatabase()`, and the existing `portalForRole('SUPER_ADMIN')` behavior.
- Produces: a fourth `preparedDemoAccounts` entry and `seedDatabase(...).users.demoAdmin`.

- [x] **Step 1: Write failing prepared-account and local-login tests**

Extend the exact prepared-account expectation with:

```ts
{
  portal: 'admin',
  label: 'Admin demo',
  email: 'demo-admin@salik.om',
  password: 'Password123!',
  detail: 'Platform operations'
}
```

Add a local-auth assertion that `demo-admin@salik.om` signs in with `context.seed.password`, returns `role: 'SUPER_ADMIN'` and `portal: 'admin'`, and that the seeded private `admin@salik.om` remains a separate user.

- [x] **Step 2: Run tests and verify RED**

Run `npx vitest run tests/config/prepared-demo-access.test.ts tests/integration/local-auth.test.ts`.

Expected: FAIL because the prepared list and local seed do not contain the dedicated demo administrator.

- [x] **Step 3: Implement the minimal client and local-seed changes**

Add the account to `preparedDemoAccounts`, map `admin` to `Building2` in `App.tsx`, and create `users.demoAdmin` in the local seed with `SUPER_ADMIN`, shared password hash, and no organization. Preserve `users.superAdmin` unchanged for existing authorization fixtures and audit ownership.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the same Vitest command. Expected: both files PASS.

### Task 2: Hosted Supabase demo administrator

**Files:**
- Modify: `tests/integration/hosted-demo-bootstrap.test.ts`
- Modify: `src/server/services/hosted-demo.ts`

**Interfaces:**
- Consumes: `HostedDemoProvisioner` and `provisionSupabaseUser()`.
- Produces: `hostedDemoIds.adminUser` and a hosted account whose role type accepts `SUPER_ADMIN` and whose `organizationId` is nullable.

- [x] **Step 1: Extend the hosted-bootstrap test and verify RED**

Expect four created/reconciled users, including:

```ts
{
  email: 'demo-admin@salik.om',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  organizationId: null,
  authUserId: 'auth:demo-admin@salik.om'
}
```

Keep the private administrator assertion unchanged. Run `npx vitest run tests/integration/hosted-demo-bootstrap.test.ts`.

Expected: FAIL because only three hosted identities exist.

- [x] **Step 2: Implement hosted provisioning**

Add `hostedDemoIds.adminUser`, extend `HostedDemoProvisionInput.role` with `SUPER_ADMIN`, change `organizationId` to `string | null`, and add the dedicated admin definition to `hostedDemoAccounts`. Do not add it to tenant business-data relationships.

- [x] **Step 3: Run hosted tests and verify GREEN**

Run the same hosted-bootstrap test. Expected: PASS with four identities and preserved private administrator state.

### Task 3: Regression and visual verification

**Files:**
- Verify: `src/client/App.tsx`
- Verify: `src/client/styles/app.css`
- Verify: all changed tests and services

**Interfaces:**
- Consumes: the four-account prepared list.
- Produces: a verified 2-by-2 desktop demo grid and one-column mobile grid without new CSS.

- [x] **Step 1: Run static and automated checks**

Run `npm run lint`, `npm run type-check`, `npm test`, and `npm run build`.

Expected: all commands PASS.

- [x] **Step 2: Inspect the login screen**

Run the app with a valid database configuration and capture the login screen at desktop and mobile widths. Confirm Admin, Supplier, Store, and Driver cards are visible, keyboard-focusable, and do not overflow.

- [x] **Step 3: Review repository state**

Run `git diff --check` and `git status --short`.

Expected: no whitespace errors; only intended source, test, design, plan, and Beads changes are attributed to this work.
