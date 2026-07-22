# Hosted Demo Bootstrap Implementation Plan

> Execution status is tracked in Beads issue `salik-new-eij.9.1` and its child tasks.

**Goal:** Create safe, repeatable hosted demo accounts and linked business data for the supplier, store, and driver portals without changing the private platform administrator.

**Architecture:** A dedicated additive service owns deterministic `hosted-demo-*` records and provisions matching Supabase Auth identities through an injected adapter. A production-only CLI command applies the service after an exact confirmation guard. The client imports a small prepared-demo configuration so card credentials are explicit and independently testable.

**Tech stack:** TypeScript, Prisma/PostgreSQL, Supabase Auth Admin API, React, Vitest.

## Task 1: Hosted demo domain service

Files: create `src/server/services/hosted-demo.ts` and `tests/integration/hosted-demo-bootstrap.test.ts`.

Write failing integration tests proving that the service creates the three correct users and linked organizations, catalog, inventory, cart, order, invoice, and delivery; preserves an existing private administrator; reconciles a second run without duplicates; and rejects conflicting identities. Run the focused test to confirm the expected failure, implement deterministic additive upserts and injected Auth provisioning, then rerun it to green.

## Task 2: Guarded production command

Files: create `prisma/bootstrap-demo.ts`, update `package.json`, and extend configuration safety tests.

Write failing tests for the exact confirmation and production/Supabase requirements. Implement the pure safety guard and CLI entry point, add `db:bootstrap:hosted-demo`, then run focused configuration and integration tests.

## Task 3: Prepared demo login UI

Files: create `src/client/demo-access.ts` and `tests/config/prepared-demo-access.test.ts`; update `src/client/App.tsx`.

Write a failing pure configuration test requiring exactly Supplier, Store, and Driver accounts with the shared demo password and no platform-admin account. Implement the shared configuration, map its roles to icons, and make each card submit both its own email and explicit password.

## Task 4: Verification and hosted execution

Run formatting checks, lint, type checking, the full PostgreSQL-backed test suite, and the production build. Fetch the existing Render environment without printing secrets, execute the new guarded command locally against the hosted database, and verify successful login plus the appropriate dashboard endpoint for all three demo accounts. Record results in Beads and inspect the final diff and worktree status.
