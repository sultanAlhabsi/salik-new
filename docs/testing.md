# Test infrastructure

Start the dedicated local PostgreSQL service before running database-backed
tests:

```bash
docker compose up -d --wait postgres
export TEST_DATABASE_URL='postgresql://salik:salik_local_only@127.0.0.1:54329/salik'
```

Integration tests use `useTestApp()` or `withTestDatabase()` from
`tests/integration/helpers.ts`. Each invocation creates a uniquely named,
migrated PostgreSQL schema and drops it afterward. A seeded context exposes
factories plus `actors.loginAs(role)` for all six roles.
Each role and `actors.anonymous` own a separate Supertest cookie jar. The
returned requests also provide `expectUnauthorized()`, `expectForbidden()`, and
`expectNotFound()` status assertions. Login errors intentionally report only
the email and status, never the submitted password.

Deterministic asynchronous controls live in
`tests/helpers/async-controls.ts`:

- `withFrozenTime(instant, callback)` scopes Vitest fake timers and always
  restores real timers.
- `createBarrier(parties)` synchronizes concurrent promises without sleeps.
- `createFailureController<Point>()` fails the next named adapter operation
  exactly once, then permits retries. The Supabase test double uses this same
  controller; payment or other provider fakes can share it.

Playwright never reads or resets the development or production schema. Its
configuration creates a dedicated `salik_e2e_<run-id>` schema using
`TEST_DATABASE_URL`, uses ports 3300 and 5273 by default, and refuses the
development ports. Global setup applies all committed migrations and seeds
once; the automatic browser fixture reseeds before every test. Global teardown
drops the schema. Override ports with `SALIK_E2E_API_PORT` and
`SALIK_E2E_WEB_PORT` when necessary.

Destructive test helpers accept localhost PostgreSQL by default. A disposable
remote test database requires the exact explicit confirmation
`SALIK_ALLOW_REMOTE_TEST_DATABASE=I_UNDERSTAND_THIS_DESTROYS_TEST_DATA`.
Production Supabase credentials must never be combined with that override.

Browser journeys import `test`, `expect`, and `expectPortal` from
`tests/e2e/fixtures.ts`. The named `loggedInAdmin`, `loggedInSupplier`,
`loggedInStore`, and `loggedInDriver` fixtures create independent browser
contexts and local session cookies without submitting or tracing passwords.
`expectPortal(page, portal)` verifies both the visible portal heading and the
role returned by `/api/auth/me`. Use `portalFactory(portal)` when a test needs
multiple isolated roles or must alter an account before opening its portal.

## Browser UI/UX checks

The browser suite uses a risk-based split. Chromium at 1440, 430, and 320 is
the pull-request gate. The scheduled matrix repeats layout checks in Chromium,
Firefox, and WebKit at 1440×900, 1024×768, 760×900, 430×932, and 320×800.

```bash
npm run test:e2e:ui:pr
npm run test:e2e:a11y
npm run test:e2e:visual
npm run test:e2e:ui:matrix
```

Tests tagged `@a11y` attach axe results and fail on critical or serious WCAG
A/AA violations. Tests tagged `@visual` compare reviewed Chromium baselines;
never use `--update-snapshots` without visually reviewing every changed image.
Tests tagged `@matrix` reject page-level horizontal overflow and unreachable
primary actions. Tables may scroll inside `.table-wrap`.

### Chrome DevTools MCP review

Chrome DevTools MCP complements Playwright during release review and failure
diagnosis; it is not a CI dependency. Use an isolated E2E server and a separate
browser context for each portal. For each critical journey:

1. Take an accessibility-tree snapshot before interaction and after changing
   tabs or UI state.
2. Check Console for JavaScript, React, and unhandled promise errors.
3. Check Network for unexpected 4xx/5xx responses, duplicate mutations, and
   missing assets.
4. Emulate 1440, 1024, 760, 430, and 320 widths. Repeat the mobile journey with
   Fast 3G, 4× CPU throttling, and an offline/recovery transition.
5. Run Lighthouse in desktop and mobile modes on login and each portal landing
   page. Record a performance trace for login, marketplace, checkout, and the
   driver route.
6. Save screenshots, Lighthouse reports, and traces under
   `output/devtools/<run-id>/`. Do not place credentials or session tokens in
   filenames, notes, screenshots, or traces.

The normal laboratory targets are LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1.
Throttled results are diagnostic comparisons rather than merge gates. Record
the role, viewport, steps, expected and actual behavior, evidence path,
severity, recommendation, and status for every finding.

- P0: prevents task completion, causes data loss, or exposes sensitive data.
- P1: blocks a critical journey or creates a serious accessibility barrier.
- P2: clear usability friction with a workable alternative.
- P3: visual or copy polish.

Create Beads issues for actionable findings. Releases require no open P0 or P1
UI/UX findings; P2 and P3 findings must have an owner and acceptance criteria.
