import { hashToken, sessionCookieName } from "../../src/server/middleware/auth";
import { describe, expect, it } from "vitest";
import { testRoles } from "./auth-helpers";
import { useTestApp } from "./helpers";

function cookiesOf(response: { headers: Record<string, unknown> }) {
  const value = response.headers["set-cookie"];
  return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
}

describe("local authentication and sessions", () => {
  const context = useTestApp();

  it("logs in every active role with the correct portal", async () => {
    const expectedPortal = {
      SUPER_ADMIN: "admin",
      SUPPLIER_ADMIN: "supplier",
      SUPPLIER_STAFF: "supplier",
      STORE_ADMIN: "store",
      STORE_BUYER: "store",
      DRIVER: "driver",
    } as const;

    for (const role of testRoles) {
      const actor = context.actors.for(role);
      const response = await actor.agent.post("/api/auth/login").send({
        email: actor.user.email.toUpperCase(),
        password: context.seed.password,
      });
      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        role,
        portal: expectedPortal[role],
      });
    }
  });

  it("sets a hardened cookie and stores only its hash", async () => {
    const response = await context.agent.post("/api/auth/login").send({
      email: "store@alnoor.om",
      password: context.seed.password,
    });
    const sessionCookie = cookiesOf(response).find((cookie) =>
      cookie.startsWith(`${sessionCookieName}=`),
    );
    expect(response.status).toBe(200);
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).not.toMatch(/;\s*Secure/i);

    const rawToken = sessionCookie!.split(";", 1)[0].split("=", 2)[1];
    const stored = await context.prisma.session.findFirstOrThrow({
      where: { userId: context.seed.users.storeAdmin.id },
    });
    expect(stored.tokenHash).toBe(hashToken(rawToken));
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(response.body)).not.toContain(rawToken);
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("returns the same generic denial for bad email, password, and account status", async () => {
    const unknown = await context.agent.post("/api/auth/login").send({
      email: "unknown@example.test",
      password: "WrongPassword!",
    });
    const wrongPassword = await context.agent.post("/api/auth/login").send({
      email: "store@alnoor.om",
      password: "WrongPassword!",
    });
    await context.prisma.user.update({
      where: { id: context.seed.users.storeAdmin.id },
      data: { status: "REVOKED" },
    });
    const revoked = await context.agent.post("/api/auth/login").send({
      email: "store@alnoor.om",
      password: context.seed.password,
    });

    for (const response of [unknown, wrongPassword, revoked]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }
  });

  it("expires, revokes, and invalidates suspended organization sessions", async () => {
    for (const mode of ["expired", "revoked", "organization"] as const) {
      const actor = await context.actors.loginAs("SUPPLIER_ADMIN");
      if (mode === "expired") await context.actors.expireSessions(actor.role);
      if (mode === "revoked") await context.actors.revokeSessions(actor.role);
      if (mode === "organization") {
        await context.prisma.organization.update({
          where: { id: actor.user.organizationId! },
          data: { status: "SUSPENDED" },
        });
      }
      await actor.agent.get("/api/auth/me").expectUnauthorized();
      await context.prisma.organization.updateMany({
        where: { id: actor.user.organizationId! },
        data: { status: "ACTIVE" },
      });
    }
  });

  it("revokes the current session on logout and clears the cookie", async () => {
    await context.login("store@alnoor.om");
    const logout = await context.agent.post("/api/auth/logout");

    expect(logout.status).toBe(200);
    expect(cookiesOf(logout).join(";")).toMatch(
      /salik_session=;.*Expires=Thu, 01 Jan 1970/i,
    );
    expect(
      await context.prisma.session.count({ where: { revokedAt: null } }),
    ).toBe(0);
    expect((await context.agent.get("/api/auth/me")).status).toBe(401);
    expect((await context.agent.post("/api/auth/logout")).status).toBe(200);
  });

  it("writes a login audit without credential or token material", async () => {
    await context.login("driver@fresh.om");
    const audit = await context.prisma.auditLog.findFirstOrThrow({
      where: { action: "AUTH_LOGIN" },
      orderBy: { createdAt: "desc" },
    });

    expect(audit).toMatchObject({
      actorId: context.seed.users.freshDriver.id,
      organizationId: context.seed.organizations.freshSupplier.id,
      entityType: "user",
      entityId: context.seed.users.freshDriver.id,
    });
    expect(JSON.stringify(audit)).not.toMatch(/Password123|salik_session/i);
  });
});
