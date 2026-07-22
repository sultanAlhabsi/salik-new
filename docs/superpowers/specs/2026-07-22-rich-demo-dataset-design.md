# Rich Demo Dataset Design

## Goal

Turn SALIK's local and hosted demos into a believable Omani wholesale distribution network while keeping the login screen limited to the existing four prepared accounts. The same deterministic fixture catalog must drive localhost and Render so demonstrations, screenshots, and tests see the same organizations, products, and operational history.

## Demo network

The fixture catalog contains one platform context plus the following tenant data:

| Entity        | Count | Coverage                                                                                                                  |
| ------------- | ----: | ------------------------------------------------------------------------------------------------------------------------- |
| Suppliers     |     4 | Muscat Fresh Distribution, Nizwa Beverages, Sohar Household Supply, and Dhofar Foods & Cold Chain                         |
| Stores        |     6 | Markets in Muscat, Muttrah, Nizwa, Sohar, Salalah, and Sur                                                                |
| Products      |    40 | Ten products per supplier across dairy, produce, drinks, pantry, bakery, frozen goods, household, and cleaning categories |
| Drivers       |     6 | Drivers distributed across supplier organizations and delivery regions                                                    |
| Orders        |    20 | Cross-supplier and cross-store orders covering the supported lifecycle                                                    |
| Warehouses    |     5 | At least one warehouse per supplier, with a second Muscat facility                                                        |
| Subscriptions |     4 | Active, trial, and past-due examples for administration views                                                             |

The 40 products include 32 published, 4 draft, 2 hidden, and 2 archived records. Inventory includes healthy, low-stock, and zero-stock examples. Prices use Omani baisa, tax rates and minimum quantities vary, and every published product has a realistic description, unit, and image.

The 20 orders cover `SUBMITTED`, `ACCEPTED`, `PREPARING`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `REJECTED`, and `CANCELLED`. Each order has one to four items with internally consistent subtotal, tax, and total values. Relevant orders receive events, reservation or deduction movements, invoices, payment attempts, deliveries, and delivery events. The dataset also includes active carts, recurring orders, notifications, support tickets, audit records, and platform settings so shared pages and reports are populated.

## Access model

The login screen remains unchanged with exactly four prepared buttons:

- `demo-admin@salik.om`
- `supplier@fresh.om`
- `store@alnoor.om`
- `driver@fresh.om`

Only these four identities are reconciled through Supabase Auth by the hosted bootstrap. Additional administrators, buyers, staff, and drivers exist as deterministic background business records with no hosted Auth identity. The primary prepared store participates in orders with every supplier, the primary prepared supplier receives orders from multiple stores, and the primary prepared driver owns deliveries in several states. This makes every prepared portal visibly rich without adding login choices.

The private `admin@salik.om` identity remains outside the fixture catalog and is never updated by demo bootstrap operations.

## Architecture

Create a pure fixture-definition module containing stable IDs and declarative records. It contains no Prisma calls and is responsible only for the canonical organizations, people, catalog, and operational scenarios. A separate persistence service validates the definitions and writes them in foreign-key order.

The local seed clears only a confirmed local PostgreSQL database and then invokes the shared persistence service. The hosted bootstrap performs its existing production and Supabase safety checks, validates ownership of every reserved demo ID and email, provisions the four prepared Auth identities, and invokes the same persistence service with those Auth IDs. Local tests retain the existing `seedDatabase()` result shape required by authorization fixtures.

All hosted records use reserved `hosted-demo-*` IDs and deterministic idempotency keys. Writes use create-or-update semantics, restoring the canonical demo state on each bootstrap without deleting or querying by broad tenant criteria. Non-demo records and private identities remain untouched.

The current monolithic hosted bootstrap is split by responsibility:

- fixture definitions and count invariants;
- user/Auth reconciliation and collision validation;
- organization, catalog, inventory, and subscription persistence;
- commerce, invoicing, payment, and delivery persistence.

## Data integrity and error handling

Before persistence, fixture validation rejects duplicate IDs, duplicate emails, duplicate SKUs within a supplier, invalid foreign keys, missing warehouse stock, inconsistent order totals, and scenarios whose status lacks the required dependent records.

Hosted persistence runs in bounded transactions and fails with a specific conflicting ID or email when an existing non-demo record occupies a reserved identifier. Re-running bootstrap produces the same counts and relationships. It may reset reserved demo records to their canonical state, but it never deletes unrelated records.

The local destructive seed remains restricted to localhost PostgreSQL URLs. No test or local seed may run against the Supabase pooler URL.

## Verification

Testing proceeds in layers:

1. Pure fixture tests assert the exact counts, unique identifiers, valid relationships, product status distribution, and order lifecycle distribution.
2. Local seed integration tests assert database counts, primary prepared-user access, catalog visibility, tenant boundaries, and consistent financial totals.
3. Hosted bootstrap tests run twice to prove idempotence, verify that unrelated records and the private administrator are preserved, and confirm that only the four prepared identities are provisioned.
4. Existing lint, TypeScript, full Vitest, and production build gates must pass.
5. After deployment, public API and browser checks confirm the Admin overview, Store catalog, Supplier orders, and Driver routes contain the richer data.

## Deployment

After verification, commit only the fixture, persistence, test, and documentation changes. Push to `main`, wait for the Render deployment to become live, then run the guarded hosted demo bootstrap once against Supabase. Finally verify public health, prepared login, and representative portal counts. The database password previously exposed in conversation must be rotated independently and updated in both local and Render environments.
