# Decision 0002: Supabase Auth and Storage

## Status

Accepted.

## Context

SALIK needs managed identity, revocable refresh sessions, password recovery delivery, and private attachment storage without exposing provider credentials to the browser.

## Decision

Use Supabase Auth as the hosted identity authority and link each local SALIK user through `authUserId`. Keep authorization, role checks, tenant status, and entity access in the Express API and Prisma domain model. Store access and refresh tokens in HTTP-only cookies and validate the access token with Supabase before loading the SALIK user.

Use a private Supabase Storage bucket for attachments. Object paths include the organization and Supabase user IDs plus a random component. The API checks entity access before upload and download; the bucket also has authenticated folder policies as defense in depth.

## Consequences

The Supabase secret key remains server-only. Automated tests set `SALIK_SUPABASE_DISABLED=true` and exercise the deterministic local adapter. Business data remains on Prisma/SQLite until a Supabase Postgres connection string is supplied and a separate reviewed migration is approved.
