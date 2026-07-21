# Decision 0001: Full-Stack TypeScript Foundation

## Status

Accepted.

## Context

The PRD asks for a new, runnable SaaS platform with responsive web portals, real server-side authorization, migrations, seed data, and tests. The first version must remain maintainable without unnecessary platform complexity.

## Decision

Use React/Vite for the browser app, Express for the API, Prisma for database access and migrations, and SQLite for local development and automated tests.

## Consequences

This keeps the project easy to run locally while preserving clear boundaries between UI, API routes, business services, and data access. Production deployment can swap SQLite for a managed relational database through Prisma with a follow-up migration decision.
