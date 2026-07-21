# SALIK Design

## Product

SALIK is a responsive English-only B2B SaaS web app for Oman-based suppliers, stores, drivers, and platform administrators. The PRD is the source of truth for scope, role boundaries, data integrity, and acceptance scenarios.

## Architecture

The first implementation is a full-stack TypeScript app with React/Vite on the client, Express on the API, Prisma migrations, and SQLite for local development. Business rules live in server services rather than React components so tenant isolation, RBAC, state transitions, inventory reservation, payment idempotency, and delivery proof are enforced server-side.

## Portals

The app provides four role-routed portals: Super Admin, Supplier, Store, and Driver. Each portal uses the same design system and shared components, while navigation and data access are role-specific and backed by real seeded data.

## Data Integrity

Money is stored as Omani Rial baisa integers and displayed as OMR. Inventory is scoped by supplier, product, and warehouse. Multi-supplier checkout creates one checkout reference and one order per supplier inside a transaction. Sensitive transitions create audit logs and user notifications.

## External Integrations

Payment and file handling use replaceable local adapters for development and tests. Browser returns are not trusted for payment status; the API exposes an idempotent webhook endpoint that updates payment, invoice, and order records once.

## Testing

Unit tests cover money/state rules. Integration tests cover tenant isolation, checkout/inventory, delivery assignment/status, and payment webhook idempotency. Playwright covers critical role workflows on desktop and mobile.
