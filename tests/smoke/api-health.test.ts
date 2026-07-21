import { describe, expect, it } from "vitest";
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
});
