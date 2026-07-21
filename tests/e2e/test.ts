import { test as base, expect } from "@playwright/test";
import { resetE2EDatabase } from "./environment";

export const test = base.extend<{ resetDatabase: void }>({
  resetDatabase: [
    async ({ browserName }, use) => {
      void browserName;
      await resetE2EDatabase();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
