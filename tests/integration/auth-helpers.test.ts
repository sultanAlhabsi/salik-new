import type { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { useTestApp } from "./helpers";

const roles: UserRole[] = [
  "SUPER_ADMIN",
  "SUPPLIER_ADMIN",
  "SUPPLIER_STAFF",
  "STORE_ADMIN",
  "STORE_BUYER",
  "DRIVER",
];

describe("role and session test actors", () => {
  const context = useTestApp();

  it("provides an isolated authenticated agent for every application role", async () => {
    for (const role of roles) {
      const actor = await context.actors.loginAs(role);
      const response = await actor.agent.get("/api/auth/me");

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({ role, email: actor.user.email });
    }
  });

  it("keeps cookie jars isolated and logout affects only its own actor", async () => {
    await context.actors.loginAs("SUPER_ADMIN");
    await context.actors.loginAs("STORE_ADMIN");

    await context.actors.anonymous
      .get("/api/auth/me")
      .expectUnauthorized();
    await context.actors.for("SUPER_ADMIN").agent
      .post("/api/auth/logout")
      .expect(200);
    await context.actors.for("SUPER_ADMIN").agent
      .get("/api/auth/me")
      .expectUnauthorized();
    await context.actors.for("STORE_ADMIN").agent
      .get("/api/auth/me")
      .expect(200);
  });

  it("can expire or revoke a role session deterministically", async () => {
    await context.actors.loginAs("SUPPLIER_STAFF");
    await context.actors.expireSessions("SUPPLIER_STAFF");
    await context.actors.for("SUPPLIER_STAFF").agent
      .get("/api/auth/me")
      .expectUnauthorized();

    await context.actors.loginAs("STORE_BUYER");
    await context.actors.revokeSessions("STORE_BUYER");
    await context.actors.for("STORE_BUYER").agent
      .get("/api/auth/me")
      .expectUnauthorized();
  });

  it("rejects bad credentials and suspended accounts without exposing passwords", async () => {
    const password = "never-print-this-password";
    let failure: unknown;
    try {
      await context.actors.loginAs("DRIVER", { password });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(password);

    const actor = context.actors.for("DRIVER");
    await context.prisma.user.update({
      where: { id: actor.user.id },
      data: { status: "SUSPENDED" },
    });
    await expect(context.actors.loginAs("DRIVER")).rejects.toThrow(
      /login failed.*401/i,
    );
  });

  it("provides unified authorization status assertions", async () => {
    await context.actors.anonymous
      .get("/api/store/cart")
      .expectUnauthorized();

    const driver = await context.actors.loginAs("DRIVER");
    await driver.agent.get("/api/admin/overview").expectForbidden();
    await driver.agent.get("/api/not-a-real-route").expectNotFound();
  });
});
