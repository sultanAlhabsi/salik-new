# SALIK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable SALIK web platform from the PRD with real data, role portals, tenant isolation, business services, and quality commands.

**Architecture:** React/Vite renders the English-only responsive UI. Express exposes authenticated API routes backed by Prisma services and SQLite migrations. Domain services enforce RBAC, tenant isolation, state transitions, inventory reservations, payment idempotency, audit logs, and notifications.

**Tech Stack:** TypeScript, React, Vite, Express, Prisma, SQLite, Vitest, Supertest, Playwright.

## Global Constraints

- English UI text only.
- Oman timezone: `Asia/Muscat`.
- Money stored as integer baisa and displayed as OMR.
- No production route may rely on mock data.
- Server-side authorization and tenant isolation are mandatory for every read/write.
- Quality commands: `lint`, `type-check`, `test`, `build`.

---

### Task 1: Foundation

**Files:** `package.json`, `.env.example`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `prisma/schema.prisma`, `prisma/seed.ts`

**Interfaces:** Produces Prisma client, seed data accounts, and standard npm commands.

- [x] Configure scripts and tooling.
- [x] Define database schema for organizations, users, RBAC, catalog, inventory, cart, orders, deliveries, invoices, payments, notifications, attachments, support, and audit.
- [x] Seed demo accounts for every role.

### Task 2: Domain Services

**Files:** `src/server/domain/*.ts`, `src/server/services/*.ts`, `tests/domain/*.test.ts`, `tests/integration/*.test.ts`

**Interfaces:** Produces service functions for checkout, inventory, payments, deliveries, and access checks.

- [x] Write failing tests for state transitions and money.
- [x] Write failing integration tests for tenant isolation, checkout, payment idempotency, and delivery.
- [x] Implement minimal services until tests pass.

### Task 3: API

**Files:** `src/server/app.ts`, `src/server/routes/*.ts`, `src/server/middleware/*.ts`

**Interfaces:** Produces authenticated JSON API under `/api`.

- [x] Implement session login/logout/me and password reset placeholders with auditable tokens.
- [x] Implement role-specific routes for admin, supplier, store, driver, notifications, invoices, reports, and uploads.
- [x] Enforce server-side RBAC and tenant filters.

### Task 4: UI Portals

**Files:** `src/client/**/*.tsx`, `src/client/styles/*.css`

**Interfaces:** Produces a responsive English-only SPA with four portals.

- [x] Implement shared design system components and layout.
- [x] Implement role dashboards and workflows using live API calls.
- [x] Add loading, empty, error, success, validation, and confirmation states.

### Task 5: Verification

**Files:** `tests/e2e/*.ts`, `README.md`, `docs/decisions/*.md`

**Interfaces:** Produces runnable documentation and acceptance coverage.

- [x] Add Playwright role flow tests.
- [x] Run lint, type-check, tests, build.
- [x] Document setup, commands, accounts, decisions, and open decisions.
