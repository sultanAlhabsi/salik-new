import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app";
import { createTestDatabase } from "../integration/helpers";

describe("API smoke", () => {
  it("starts against a migrated empty database and serves health", async () => {
    const testDatabase = await createTestDatabase({ seed: false });
    try {
      const response = await testDatabase.agent.get("/api/health");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ ok: true, service: "salik" });
    } finally {
      await testDatabase.dispose();
    }
  });

  it("returns 503 without leaking the database error", async () => {
    const prisma = {
      $queryRaw: async () => {
        throw new Error("postgresql://secret@host/db");
      },
    } as unknown as PrismaClient;

    const response = await request(createApp({ prisma })).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ ok: false, service: "salik" });
    expect(response.text).not.toContain("secret");
  });
});
