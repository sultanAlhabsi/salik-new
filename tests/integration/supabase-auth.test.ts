import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseDouble } from "../helpers/supabase";
import { useTestApp } from "./helpers";
import { configureSupabaseForTests } from "../../src/server/services/supabase";

function cookiesOf(response: { headers: Record<string, unknown> }) {
  const value = response.headers["set-cookie"];
  return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
}

describe("Supabase-backed authentication and session refresh", () => {
  const context = useTestApp();
  let double: ReturnType<typeof createSupabaseDouble>;
  let restore: () => void;

  beforeEach(() => {
    double = createSupabaseDouble();
    restore = configureSupabaseForTests({
      authClient: double.authClient,
      adminClient: double.adminClient,
    });
  });

  afterEach(() => restore());

  it("links authUserId by normalized email exactly once and uses the Prisma role", async () => {
    const providerUser = double.seedUser({
      id: "auth-store-user",
      email: "store@alnoor.om",
      password: context.seed.password,
      app_metadata: { salik_role: "SUPER_ADMIN", salik_organization_id: "foreign" },
      user_metadata: { role: "SUPER_ADMIN" },
    });

    const first = await context.agent.post("/api/auth/login").send({
      email: "STORE@ALNOOR.OM",
      password: context.seed.password,
    });
    const second = await context.agent.post("/api/auth/login").send({
      email: "store@alnoor.om",
      password: context.seed.password,
    });

    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({ role: "STORE_ADMIN", portal: "store" });
    expect(second.status).toBe(200);
    expect(
      await context.prisma.user.findUniqueOrThrow({
        where: { id: context.seed.users.storeAdmin.id },
      }),
    ).toMatchObject({ authUserId: providerUser.id, role: "STORE_ADMIN" });
  });

  it("rejects an authUserId and email collision instead of choosing either tenant", async () => {
    await context.prisma.user.update({
      where: { id: context.seed.users.freshAdmin.id },
      data: { authUserId: "provider-collision" },
    });
    double.seedUser({
      id: "provider-collision",
      email: "store@alnoor.om",
      password: context.seed.password,
    });

    const response = await context.agent.post("/api/auth/login").send({
      email: "store@alnoor.om",
      password: context.seed.password,
    });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Invalid email or password");
    expect(
      await context.prisma.user.findUniqueOrThrow({
        where: { id: context.seed.users.storeAdmin.id },
      }),
    ).toMatchObject({ authUserId: null, role: "STORE_ADMIN" });
  });

  it("rotates both cookies after access lookup fails and refresh succeeds", async () => {
    double.seedUser({
      id: "auth-supplier",
      email: "supplier@fresh.om",
      password: context.seed.password,
    });
    const login = await context.agent.post("/api/auth/login").send({
      email: "supplier@fresh.om",
      password: context.seed.password,
    });
    const originalCookies = cookiesOf(login);
    double.failNext("auth.getUser", new Error("expired access token"));

    const me = await context.agent.get("/api/auth/me");
    const rotatedCookies = cookiesOf(me);

    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe("SUPPLIER_ADMIN");
    expect(rotatedCookies.some((cookie) => cookie.startsWith("salik_access_token="))).toBe(true);
    expect(rotatedCookies.some((cookie) => cookie.startsWith("salik_refresh_token="))).toBe(true);
    expect(rotatedCookies).not.toEqual(originalCookies);
  });

  it("does not authenticate when access and refresh validation fail", async () => {
    double.seedUser({
      email: "driver@fresh.om",
      password: context.seed.password,
    });
    await context.agent.post("/api/auth/login").send({
      email: "driver@fresh.om",
      password: context.seed.password,
    });
    double.failNext("auth.getUser", new Error("expired"));
    double.failNext("auth.refreshSession", new Error("reused refresh token"));

    expect((await context.agent.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects unknown, suspended user, and suspended organization mappings", async () => {
    double.seedUser({ email: "stranger@example.test", password: context.seed.password });
    const unknown = await context.agent.post("/api/auth/login").send({
      email: "stranger@example.test",
      password: context.seed.password,
    });
    expect(unknown.status).toBe(401);

    double.seedUser({ email: "store@alnoor.om", password: context.seed.password });
    await context.prisma.user.update({
      where: { id: context.seed.users.storeAdmin.id },
      data: { status: "SUSPENDED" },
    });
    expect(
      (
        await context.agent.post("/api/auth/login").send({
          email: "store@alnoor.om",
          password: context.seed.password,
        })
      ).status,
    ).toBe(401);

    await context.prisma.user.update({
      where: { id: context.seed.users.storeAdmin.id },
      data: { status: "ACTIVE" },
    });
    await context.prisma.organization.update({
      where: { id: context.seed.organizations.alNoorStore.id },
      data: { status: "SUSPENDED" },
    });
    expect(
      (
        await context.agent.post("/api/auth/login").send({
          email: "store@alnoor.om",
          password: context.seed.password,
        })
      ).status,
    ).toBe(401);
  });

  it("checks Prisma status on every request rather than stale provider metadata", async () => {
    double.seedUser({
      email: "supplier@fresh.om",
      password: context.seed.password,
      app_metadata: { salik_role: "SUPER_ADMIN" },
    });
    await context.agent.post("/api/auth/login").send({
      email: "supplier@fresh.om",
      password: context.seed.password,
    });
    await context.prisma.user.update({
      where: { id: context.seed.users.freshAdmin.id },
      data: { status: "SUSPENDED" },
    });

    expect((await context.agent.get("/api/auth/me")).status).toBe(401);
  });

  it("signs out at the provider and clears access and refresh cookies", async () => {
    double.seedUser({ email: "driver@fresh.om", password: context.seed.password });
    await context.agent.post("/api/auth/login").send({
      email: "driver@fresh.om",
      password: context.seed.password,
    });

    const logout = await context.agent.post("/api/auth/logout");

    expect(logout.status).toBe(200);
    expect(double.adminClient.auth.admin.signOut).toHaveBeenCalledTimes(1);
    expect(cookiesOf(logout).join(";")).toMatch(/salik_access_token=;/);
    expect(cookiesOf(logout).join(";")).toMatch(/salik_refresh_token=;/);
    expect((await context.agent.get("/api/auth/me")).status).toBe(401);
  });

  it("maps provider failures to generic authentication errors without secrets", async () => {
    double.failNext("auth.signInWithPassword", new Error("provider detail secret-123"));
    const response = await context.agent.post("/api/auth/login").send({
      email: "store@alnoor.om",
      password: "do-not-print-password",
    });

    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toMatch(/secret-123|do-not-print-password/);
    expect(vi.mocked(double.authClient.auth.signInWithPassword)).toHaveBeenCalledTimes(1);
  });
});
