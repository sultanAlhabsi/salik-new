import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertSafeE2EDatabaseUrl,
  createE2EEnvironment,
  runE2ESetup,
} from "../e2e/environment";

describe("isolated Playwright environment", () => {
  it("creates a dedicated database and non-development server origins", () => {
    const environment = createE2EEnvironment({
      SALIK_E2E_RUN_ID: "safe-run",
      SALIK_E2E_API_PORT: "3301",
      SALIK_E2E_WEB_PORT: "5274",
    });

    expect(environment.databaseUrl).toBe(
      `file:${join(tmpdir(), "salik-playwright", "safe-run", "e2e.db")}`,
    );
    expect(environment.apiOrigin).toBe("http://127.0.0.1:3301");
    expect(environment.webOrigin).toBe("http://127.0.0.1:5274");
    expect(environment.apiOrigin).not.toContain(":3000");
    expect(environment.webOrigin).not.toContain(":5173");
  });

  it("rejects development, relative, and non-SQLite reset targets", () => {
    expect(() => assertSafeE2EDatabaseUrl("file:./prisma/dev.db")).toThrow(
      /refusing.*e2e/i,
    );
    expect(() =>
      assertSafeE2EDatabaseUrl("postgresql://localhost/salik"),
    ).toThrow(/refusing.*e2e/i);
    expect(() =>
      assertSafeE2EDatabaseUrl(`file:${join(tmpdir(), "salik.db")}`),
    ).toThrow(/refusing.*e2e/i);
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
