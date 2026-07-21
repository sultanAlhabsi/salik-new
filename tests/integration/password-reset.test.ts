import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { createSupabaseDouble } from "../helpers/supabase";
import { hashToken } from "../../src/server/middleware/auth";
import { configureSupabaseForTests } from "../../src/server/services/supabase";
import { useTestApp } from "./helpers";

const requestMessage = "If the account exists, a password reset link has been issued.";

describe("local password recovery", () => {
  const context = useTestApp();

  it("uses the same response for existing, unknown, and suspended accounts", async () => {
    const existing = await context.agent.post("/api/auth/password-reset/request").send({
      email: "store@alnoor.om",
    });
    const unknown = await context.agent.post("/api/auth/password-reset/request").send({
      email: "unknown@example.test",
    });
    await context.prisma.user.update({
      where: { id: context.seed.users.freshAdmin.id },
      data: { status: "SUSPENDED" },
    });
    const suspended = await context.agent.post("/api/auth/password-reset/request").send({
      email: "supplier@fresh.om",
    });

    for (const response of [existing, unknown, suspended]) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: requestMessage });
    }
    expect(await context.prisma.passwordResetToken.count()).toBe(2);
    expect(await context.prisma.auditLog.count({ where: { action: "PASSWORD_RESET_REQUESTED" } })).toBe(2);
  });

  it("never returns or audits reset token material", async () => {
    const response = await context.agent.post("/api/auth/password-reset/request").send({
      email: "store@alnoor.om",
    });
    const record = await context.prisma.passwordResetToken.findFirstOrThrow();
    const audit = await context.prisma.auditLog.findFirstOrThrow({
      where: { action: "PASSWORD_RESET_REQUESTED" },
    });

    expect(JSON.stringify(response.body)).not.toContain(record.tokenHash);
    expect(JSON.stringify(audit)).not.toContain(record.tokenHash);
  });

  it("atomically consumes a valid token, updates the hash, and revokes old sessions", async () => {
    const rawToken = "known-reset-token-123456789";
    await context.login("store@alnoor.om");
    await context.prisma.passwordResetToken.create({
      data: {
        userId: context.seed.users.storeAdmin.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await context.agent.post("/api/auth/password-reset/complete").send({
      token: rawToken,
      newPassword: "NewPassword123!",
    });

    expect(response.status).toBe(200);
    const user = await context.prisma.user.findUniqueOrThrow({
      where: { id: context.seed.users.storeAdmin.id },
    });
    expect(await bcrypt.compare("NewPassword123!", user.passwordHash)).toBe(true);
    expect(await context.prisma.session.count({ where: { revokedAt: null } })).toBe(0);
    expect((await context.agent.get("/api/auth/me")).status).toBe(401);
    expect(
      await context.prisma.auditLog.count({ where: { action: "PASSWORD_RESET_COMPLETED" } }),
    ).toBe(1);
  });

  it("rejects short, expired, and reused tokens while preserving suspended status", async () => {
    const expired = "expired-reset-token-12345";
    const suspended = "suspended-reset-token-123";
    await context.prisma.passwordResetToken.createMany({
      data: [
        {
          userId: context.seed.users.storeAdmin.id,
          tokenHash: hashToken(expired),
          expiresAt: new Date(0),
        },
        {
          userId: context.seed.users.freshAdmin.id,
          tokenHash: hashToken(suspended),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });
    await context.prisma.user.update({
      where: { id: context.seed.users.freshAdmin.id },
      data: { status: "SUSPENDED" },
    });

    const short = await context.agent.post("/api/auth/password-reset/complete").send({
      token: "short",
      newPassword: "NewPassword123!",
    });
    const expiredResponse = await context.agent.post("/api/auth/password-reset/complete").send({
      token: expired,
      newPassword: "NewPassword123!",
    });
    const suspendedResponse = await context.agent.post("/api/auth/password-reset/complete").send({
      token: suspended,
      newPassword: "NewPassword123!",
    });

    expect(short.status).toBe(400);
    expect(expiredResponse.status).toBe(400);
    expect(suspendedResponse.status).toBe(200);
    expect(
      await context.prisma.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash: hashToken(suspended) },
      }),
    ).not.toMatchObject({ usedAt: null });
    expect(
      await context.prisma.user.findUniqueOrThrow({
        where: { id: context.seed.users.freshAdmin.id },
      }),
    ).toMatchObject({ status: "SUSPENDED" });
    expect(
      (
        await context.agent.post("/api/auth/login").send({
          email: "supplier@fresh.om",
          password: "NewPassword123!",
        })
      ).status,
    ).toBe(401);
  });

  it("allows only one of two concurrent completions to consume a token", async () => {
    const rawToken = "concurrent-reset-token-123";
    await context.prisma.passwordResetToken.create({
      data: {
        userId: context.seed.users.storeAdmin.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const complete = () =>
      context.agent.post("/api/auth/password-reset/complete").send({
        token: rawToken,
        newPassword: "ConcurrentPassword123!",
      });

    const responses = await Promise.all([complete(), complete()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(
      await context.prisma.auditLog.count({ where: { action: "PASSWORD_RESET_COMPLETED" } }),
    ).toBe(1);
  });
});

describe("Supabase password recovery contract", () => {
  const context = useTestApp();
  let restore: (() => void) | undefined;

  afterEach(() => restore?.());

  it("requests recovery with the configured redirect and preserves anti-enumeration", async () => {
    const double = createSupabaseDouble();
    double.seedUser({ email: "store@alnoor.om", password: context.seed.password });
    restore = configureSupabaseForTests({ authClient: double.authClient, adminClient: double.adminClient });

    const existing = await context.agent.post("/api/auth/password-reset/request").send({ email: "store@alnoor.om" });
    const unknown = await context.agent.post("/api/auth/password-reset/request").send({ email: "unknown@example.test" });

    expect(existing.body).toEqual({ message: requestMessage });
    expect(unknown.body).toEqual({ message: requestMessage });
    expect(double.resetRequests).toEqual([
      { email: "store@alnoor.om", redirectTo: "http://localhost:5173/?passwordRecovery=1" },
    ]);
  });

  it("completes recovery through provider identity and revokes provider sessions", async () => {
    const double = createSupabaseDouble();
    const providerUser = double.seedUser({
      id: "auth-recovery-user",
      email: "store@alnoor.om",
      password: context.seed.password,
    });
    await context.prisma.user.update({
      where: { id: context.seed.users.storeAdmin.id },
      data: { authUserId: providerUser.id },
    });
    restore = configureSupabaseForTests({ authClient: double.authClient, adminClient: double.adminClient });
    const recoverySession = await double.authClient.auth.signInWithPassword({
      email: "store@alnoor.om",
      password: context.seed.password,
    });

    const response = await context.agent.post("/api/auth/password-reset/complete").send({
      token: recoverySession.data.session!.access_token,
      newPassword: "ProviderPassword123!",
    });

    expect(response.status).toBe(200);
    expect(double.adminClient.auth.admin.updateUserById).toHaveBeenCalledWith(
      providerUser.id,
      { password: "ProviderPassword123!" },
    );
    expect(double.adminClient.auth.admin.signOut).toHaveBeenCalledWith(
      recoverySession.data.session!.access_token,
      "global",
    );
    expect(
      await context.prisma.auditLog.count({ where: { action: "PASSWORD_RESET_COMPLETED" } }),
    ).toBe(1);
  });

  it("rejects invalid recovery identities without reactivating suspended Supabase users", async () => {
    const double = createSupabaseDouble();
    const providerUser = double.seedUser({
      id: "auth-suspended-recovery",
      email: "store@alnoor.om",
      password: context.seed.password,
    });
    await context.prisma.user.update({
      where: { id: context.seed.users.storeAdmin.id },
      data: { authUserId: providerUser.id, status: "SUSPENDED" },
    });
    restore = configureSupabaseForTests({ authClient: double.authClient, adminClient: double.adminClient });
    const recoverySession = await double.authClient.auth.signInWithPassword({
      email: "store@alnoor.om",
      password: context.seed.password,
    });

    const invalid = await context.agent.post("/api/auth/password-reset/complete").send({
      token: "invalid-recovery-token",
      newPassword: "ProviderPassword123!",
    });
    const suspended = await context.agent.post("/api/auth/password-reset/complete").send({
      token: recoverySession.data.session!.access_token,
      newPassword: "ProviderPassword123!",
    });

    expect(invalid.status).toBe(400);
    expect(suspended.status).toBe(200);
    expect(double.adminClient.auth.admin.updateUserById).toHaveBeenCalledWith(
      providerUser.id,
      { password: "ProviderPassword123!" },
    );
    expect(
      await context.prisma.user.findUniqueOrThrow({
        where: { id: context.seed.users.storeAdmin.id },
      }),
    ).toMatchObject({ status: "SUSPENDED" });
    expect(
      await context.prisma.auditLog.count({ where: { action: "PASSWORD_RESET_COMPLETED" } }),
    ).toBe(1);
  });

  it("returns a safe service error and no audit when provider password update fails", async () => {
    const double = createSupabaseDouble();
    const providerUser = double.seedUser({
      id: "auth-update-failure",
      email: "store@alnoor.om",
      password: context.seed.password,
    });
    await context.prisma.user.update({
      where: { id: context.seed.users.storeAdmin.id },
      data: { authUserId: providerUser.id },
    });
    restore = configureSupabaseForTests({ authClient: double.authClient, adminClient: double.adminClient });
    const recoverySession = await double.authClient.auth.signInWithPassword({
      email: "store@alnoor.om",
      password: context.seed.password,
    });
    double.failNext("auth.admin.updateUserById", new Error("provider-secret-detail"));

    const response = await context.agent.post("/api/auth/password-reset/complete").send({
      token: recoverySession.data.session!.access_token,
      newPassword: "ProviderPassword123!",
    });

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("provider-secret-detail");
    expect(
      await context.prisma.auditLog.count({ where: { action: "PASSWORD_RESET_COMPLETED" } }),
    ).toBe(0);
  });

  it("does not audit a failed provider reset request", async () => {
    const double = createSupabaseDouble();
    double.failNext("auth.resetPasswordForEmail", new Error("SMTP unavailable"));
    restore = configureSupabaseForTests({ authClient: double.authClient, adminClient: double.adminClient });

    const response = await context.agent.post("/api/auth/password-reset/request").send({ email: "store@alnoor.om" });

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("SMTP unavailable");
    expect(
      await context.prisma.auditLog.count({ where: { action: "PASSWORD_RESET_REQUESTED" } }),
    ).toBe(0);
  });
});
