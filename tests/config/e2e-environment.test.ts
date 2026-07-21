import { describe, expect, it, vi } from "vitest";
import {
  createE2EEnvironment,
  runE2ESetup,
} from "../e2e/environment";

describe("isolated Playwright environment", () => {
  it("creates a dedicated database and non-development server origins", () => {
    const environment = createE2EEnvironment({
      SALIK_E2E_RUN_ID: "safe-run",
      SALIK_E2E_API_PORT: "3301",
      SALIK_E2E_WEB_PORT: "5274",
      TEST_DATABASE_URL:
        "postgresql://salik:salik_local_only@127.0.0.1:54329/salik",
    });

    expect(environment.schema).toBe("salik_e2e_safe_run");
    expect(environment.databaseUrl).toContain("schema=salik_e2e_safe_run");
    expect(environment.apiOrigin).toBe("http://127.0.0.1:3301");
    expect(environment.webOrigin).toBe("http://127.0.0.1:5274");
    expect(environment.apiOrigin).not.toContain(":3000");
    expect(environment.webOrigin).not.toContain(":5173");
  });

  it("rejects SQLite and remote reset targets", () => {
    expect(() =>
      createE2EEnvironment({ TEST_DATABASE_URL: "file:./e2e.db" }),
    ).toThrow("DATABASE_URL must use PostgreSQL");
    expect(() =>
      createE2EEnvironment({
        TEST_DATABASE_URL: "postgresql://remote.invalid/postgres",
      }),
    ).toThrow("Refusing destructive tests against a remote PostgreSQL host");
  });

  it("labels migration and seed setup failures precisely", async () => {
    await expect(
      runE2ESetup({
        migrate: vi.fn().mockRejectedValue(new Error("bad SQL")),
        seed: vi.fn(),
      }),
    ).rejects.toThrow("E2E setup failed during migrations: bad SQL");

    await expect(
      runE2ESetup({
        migrate: vi.fn(),
        seed: vi.fn().mockRejectedValue(new Error("bad fixture")),
      }),
    ).rejects.toThrow("E2E setup failed during seed: bad fixture");
  });
});
