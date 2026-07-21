# SALIK API

All routes use JSON unless a file or CSV response is documented. Supabase-backed browser sessions use the HTTP-only `salik_access_token` and `salik_refresh_token` cookies. The legacy `salik_session` cookie is limited to the offline test mode. Protected routes return a structured error:

```json
{ "error": { "code": "FORBIDDEN", "message": "You do not have permission to perform this action" } }
```

## Authentication

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/complete`
- `POST /api/auth/profile/password`

## Organization

- `GET|PATCH /api/organization`
- `GET|POST /api/organization/addresses`, `PATCH /api/organization/addresses/:id`
- `GET|POST /api/organization/users`, `PATCH /api/organization/users/:id`

Organization administrator routes validate that roles match the organization type. Supplier plan limits are enforced for users, warehouses, and products.

## Store

- Marketplace and cart: `/api/store/suppliers`, `/api/store/products`, `/api/store/cart`
- Checkout and orders: `POST /api/store/checkout`, `GET /api/store/orders`
- Card initiation: `POST /api/store/orders/:id/payments`
- Recurring templates: `GET|POST /api/store/recurring-orders`, `PATCH /api/store/recurring-orders/:id`, `POST /api/store/recurring-orders/:id/run`
- Reporting: `GET /api/store/reports/spending.csv`

Checkout creates one order per supplier and requires an idempotency key. A recurring run creates the same normal checkout and order records as an interactive checkout.

## Supplier

- Catalog: `/api/supplier/products`, `/api/supplier/categories`
- Inventory and warehouses: `/api/supplier/inventory`, `/api/supplier/warehouses`
- Orders and delivery: `/api/supplier/orders`, `/api/supplier/drivers`, `/api/supplier/deliveries`
- Rescheduling: `POST /api/supplier/deliveries/:id/reschedule`
- Reporting: `GET /api/supplier/reports/sales.csv`

Every supplier query is scoped by the authenticated organization. Inventory mutation, reservation, release, and deduction use idempotency keys and compare-and-set updates.

## Driver

- `GET /api/driver/dashboard`
- `GET /api/driver/deliveries`
- `POST /api/driver/deliveries/:id/status`

Drivers can only read and mutate deliveries assigned to their user ID.

## Platform administration

- Organizations: `/api/admin/organizations`
- Plans and subscriptions: `/api/admin/plans`, `/api/admin/subscriptions`
- Payments, audit, support, and settings: `/api/admin/payments`, `/api/admin/audit`, `/api/admin/support`, `/api/admin/settings`

## Shared resources

- Notifications: `GET /api/notifications`, `POST /api/notifications/:id/read`
- Invoices: `GET /api/invoices`, `GET /api/invoices/:id/print`
- Files: `POST /api/files`, `GET /api/files/:id`
- Support: `POST /api/support`

File access is checked against the linked product, order, delivery, recurring order, or support ticket on both upload and download.

## Payment webhook

`POST /api/payments/webhook` requires `x-salik-webhook-secret` to match `PAYMENT_WEBHOOK_SECRET`. Events also require an idempotency key, provider reference, order ID, and valid state transition. Production providers should replace the local shared-secret adapter with their signed webhook verification scheme.
