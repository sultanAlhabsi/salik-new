import type { UserRole } from "@prisma/client";

export type ApiRoutePolicy = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  source: string;
  allowed: readonly UserRole[] | "public" | "integration-secret";
};

const allRoles = [
  "SUPER_ADMIN",
  "SUPPLIER_ADMIN",
  "SUPPLIER_STAFF",
  "STORE_ADMIN",
  "STORE_BUYER",
  "DRIVER",
] as const satisfies readonly UserRole[];
const supplierRoles = ["SUPPLIER_ADMIN", "SUPPLIER_STAFF"] as const;
const storeRoles = ["STORE_ADMIN", "STORE_BUYER"] as const;
const organizationAdminRoles = ["SUPPLIER_ADMIN", "STORE_ADMIN"] as const;
const invoiceRoles = allRoles.filter((role) => role !== "DRIVER");

function group(
  source: string,
  prefix: string,
  allowed: ApiRoutePolicy["allowed"],
  routes: ReadonlyArray<readonly [ApiRoutePolicy["method"], string]>,
) {
  return routes.map(([method, path]) => ({
    method,
    path: `${prefix}${path}`,
    source,
    allowed,
  }));
}

export const apiRouteMatrix: ApiRoutePolicy[] = [
  { method: "GET", path: "/api/health", source: "app.ts", allowed: "public" },
  ...group("auth.ts", "/api/auth", "public", [
    ["POST", "/login"],
    ["POST", "/logout"],
    ["POST", "/password-reset/request"],
    ["POST", "/password-reset/complete"],
  ]),
  ...group("auth.ts", "/api/auth", allRoles, [
    ["GET", "/me"],
    ["POST", "/profile/password"],
  ]),
  ...group("admin.ts", "/api/admin", ["SUPER_ADMIN"], [
    ["GET", "/dashboard"],
    ["GET", "/organizations"],
    ["POST", "/organizations"],
    ["PATCH", "/organizations/:id/status"],
    ["GET", "/plans"],
    ["POST", "/plans"],
    ["PATCH", "/plans/:id"],
    ["GET", "/subscriptions"],
    ["POST", "/subscriptions"],
    ["PATCH", "/subscriptions/:id"],
    ["GET", "/payments"],
    ["GET", "/audit"],
    ["GET", "/support"],
    ["PATCH", "/support/:id"],
    ["GET", "/settings"],
    ["PUT", "/settings/:key"],
  ]),
  ...group("supplier.ts", "/api/supplier", supplierRoles, [
    ["GET", "/dashboard"],
    ["GET", "/products"],
    ["GET", "/products/:id"],
    ["POST", "/products"],
    ["PATCH", "/products/:id"],
    ["GET", "/categories"],
    ["POST", "/categories"],
    ["PATCH", "/categories/:id"],
    ["GET", "/warehouses"],
    ["POST", "/warehouses"],
    ["PATCH", "/warehouses/:id"],
    ["GET", "/inventory"],
    ["POST", "/inventory/adjust"],
    ["GET", "/orders"],
    ["POST", "/orders/:id/transition"],
    ["POST", "/orders/:id/assign-driver"],
    ["GET", "/drivers"],
    ["GET", "/deliveries"],
    ["POST", "/deliveries/:id/reschedule"],
    ["GET", "/reports/sales.csv"],
  ]),
  ...group("store.ts", "/api/store", storeRoles, [
    ["GET", "/dashboard"],
    ["GET", "/suppliers"],
    ["GET", "/addresses"],
    ["GET", "/products"],
    ["GET", "/cart"],
    ["POST", "/cart/items"],
    ["DELETE", "/cart/items/:id"],
    ["POST", "/checkout"],
    ["GET", "/orders"],
    ["POST", "/orders/:id/payments"],
    ["GET", "/recurring-orders"],
    ["POST", "/recurring-orders"],
    ["PATCH", "/recurring-orders/:id"],
    ["POST", "/recurring-orders/:id/run"],
    ["GET", "/reports/spending.csv"],
  ]),
  ...group("driver.ts", "/api/driver", ["DRIVER"], [
    ["GET", "/dashboard"],
    ["GET", "/deliveries"],
    ["POST", "/deliveries/:id/status"],
  ]),
  ...group("organization.ts", "/api/organization", allRoles, [
    ["GET", "/"],
    ["GET", "/addresses"],
  ]),
  ...group("organization.ts", "/api/organization", organizationAdminRoles, [
    ["PATCH", "/"],
    ["POST", "/addresses"],
    ["PATCH", "/addresses/:id"],
    ["GET", "/users"],
    ["POST", "/users"],
    ["PATCH", "/users/:id"],
  ]),
  ...group("shared.ts", "/api", allRoles, [
    ["GET", "/notifications"],
    ["POST", "/notifications/:id/read"],
    ["POST", "/support"],
    ["POST", "/files"],
    ["GET", "/files/:id"],
  ]),
  ...group("shared.ts", "/api", invoiceRoles, [
    ["GET", "/invoices"],
    ["GET", "/invoices/:id/print"],
  ]),
  {
    method: "POST",
    path: "/api/payments/webhook",
    source: "payments.ts",
    allowed: "integration-secret",
  },
];

export const rbacRoles = allRoles;
