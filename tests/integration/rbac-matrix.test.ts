import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UserRole } from "@prisma/client";
import request, { type Test } from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app";
import { apiRouteMatrix, rbacRoles } from "./rbac-matrix";
import { useTestApp } from "./helpers";

const sourcePrefixes = {
  "auth.ts": "/api/auth",
  "admin.ts": "/api/admin",
  "supplier.ts": "/api/supplier",
  "store.ts": "/api/store",
  "driver.ts": "/api/driver",
  "organization.ts": "/api/organization",
  "shared.ts": "/api",
  "payments.ts": "/api/payments",
} as const;

function key(method: string, path: string) {
  return `${method.toUpperCase()} ${path}`;
}

function registeredRoutes() {
  const routes = [key("GET", "/api/health")];
  for (const [source, prefix] of Object.entries(sourcePrefixes)) {
    const text = readFileSync(join(process.cwd(), "src/server/routes", source), "utf8");
    const pattern = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(pattern)) {
      routes.push(key(match[1], `${prefix}${match[2]}`));
    }
  }
  return routes.sort();
}

function concretePath(path: string) {
  return path.replace(/:[^/]+/g, "missing-test-id");
}

function invoke(agent: ReturnType<typeof request.agent>, method: string, path: string): Test {
  const target = concretePath(path);
  if (method === "GET") return agent.get(target);
  if (method === "POST") return agent.post(target).send({});
  if (method === "PUT") return agent.put(target).send({});
  if (method === "PATCH") return agent.patch(target).send({});
  return agent.delete(target).send({});
}

async function tableCounts(prisma: ReturnType<typeof useTestApp>["prisma"]) {
  const [
    organizations,
    users,
    addresses,
    products,
    orders,
    carts,
    deliveries,
    tickets,
    settings,
    movements,
    payments,
    notifications,
    attachments,
    recurringOrders,
    auditLogs,
  ] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.address.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.cart.count(),
      prisma.delivery.count(),
      prisma.supportTicket.count(),
      prisma.platformSetting.count(),
      prisma.inventoryMovement.count(),
      prisma.paymentAttempt.count(),
      prisma.notification.count(),
      prisma.attachment.count(),
      prisma.recurringOrder.count(),
      prisma.auditLog.count(),
    ]);
  return {
    organizations,
    users,
    addresses,
    products,
    orders,
    carts,
    deliveries,
    tickets,
    settings,
    movements,
    payments,
    notifications,
    attachments,
    recurringOrders,
    auditLogs,
  };
}

describe("complete API RBAC matrix", () => {
  const context = useTestApp();

  it("classifies every one of the 77 registered API routes exactly once", () => {
    const documented = apiRouteMatrix.map((route) => key(route.method, route.path)).sort();
    expect(apiRouteMatrix).toHaveLength(77);
    expect(new Set(documented).size).toBe(documented.length);
    expect(documented).toEqual(registeredRoutes());
  });

  it("returns 401 for anonymous access to every authenticated route", async () => {
    const agent = request.agent(createApp({ prisma: context.prisma }));
    const protectedRoutes = apiRouteMatrix.filter((route) => Array.isArray(route.allowed));

    for (const route of protectedRoutes) {
      const response = await invoke(agent, route.method, route.path);
      expect(response.status, key(route.method, route.path)).toBe(401);
    }
  });

  for (const role of rbacRoles) {
    it(`enforces every denied route for ${role} without database side effects`, async () => {
      const app = createApp({ prisma: context.prisma });
      const agent = request.agent(app);
      const actor = context.actors.for(role);
      const login = await agent.post("/api/auth/login").send({
        email: actor.user.email,
        password: context.seed.password,
      });
      expect(login.status).toBe(200);
      const before = await tableCounts(context.prisma);

      for (const route of apiRouteMatrix) {
        if (!Array.isArray(route.allowed) || route.allowed.includes(role)) continue;
        const response = await invoke(agent, route.method, route.path);
        expect(response.status, `${role}: ${key(route.method, route.path)}`).toBe(403);
      }

      expect(await tableCounts(context.prisma)).toEqual(before);
    });
  }

  it("allows each role through its declared portal and shared read boundaries", async () => {
    const representativeRoutes: Record<UserRole, string[]> = {
      SUPER_ADMIN: ["/api/admin/dashboard", "/api/organization/", "/api/notifications"],
      SUPPLIER_ADMIN: ["/api/supplier/dashboard", "/api/organization/", "/api/invoices"],
      SUPPLIER_STAFF: ["/api/supplier/dashboard", "/api/organization/", "/api/invoices"],
      STORE_ADMIN: ["/api/store/dashboard", "/api/organization/", "/api/invoices"],
      STORE_BUYER: ["/api/store/dashboard", "/api/organization/", "/api/invoices"],
      DRIVER: ["/api/driver/dashboard", "/api/organization/", "/api/notifications"],
    };

    for (const role of rbacRoles) {
      const agent = request.agent(createApp({ prisma: context.prisma }));
      const actor = context.actors.for(role);
      await agent.post("/api/auth/login").send({ email: actor.user.email, password: context.seed.password });
      for (const path of representativeRoutes[role]) {
        expect((await agent.get(path)).status, `${role}: GET ${path}`).toBe(200);
      }
    }
  });

  it("forbids drivers from both listing and printing supplier invoices", async () => {
    const driver = await context.actors.loginAs("DRIVER");
    const invoice = await context.prisma.invoice.findFirstOrThrow({
      where: { supplierId: driver.user.organizationId! },
    });

    await driver.agent.get("/api/invoices").expectForbidden();
    await driver.agent.get(`/api/invoices/${invoice.id}/print`).expectForbidden();
  });
});
