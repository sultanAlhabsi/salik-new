import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import playwrightConfig from "../../playwright.config";
import vitestConfig from "../../vitest.config";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  scripts: Record<string, string>;
};

const ciWorkflow = readFileSync(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

const testingGuide = readFileSync(
  new URL("../../docs/testing.md", import.meta.url),
  "utf8",
);

const uiProjectNames = [
  "chromium-1440",
  "chromium-1024",
  "chromium-760",
  "chromium-430",
  "chromium-320",
  "firefox-1440",
  "firefox-1024",
  "firefox-760",
  "firefox-430",
  "firefox-320",
  "webkit-1440",
  "webkit-1024",
  "webkit-760",
  "webkit-430",
  "webkit-320",
];

describe("test suite taxonomy", () => {
  it("provides independent commands for every documented suite", () => {
    expect(packageJson.scripts).toMatchObject({
      "test:unit": expect.any(String),
      "test:integration": expect.any(String),
      "test:component": expect.any(String),
      "test:contract": expect.any(String),
      "test:smoke": expect.any(String),
      "test:regression": expect.any(String),
      "test:coverage": expect.any(String),
      "test:e2e": expect.any(String),
      "test:e2e:a11y": expect.stringContaining("@a11y"),
      "test:e2e:visual": expect.stringContaining("@visual"),
      "test:e2e:ui:pr": expect.stringContaining("chromium-1440"),
      "test:e2e:ui:matrix": expect.stringContaining("@matrix"),
    });
  });

  it("defines the complete three-browser and five-viewport UI matrix", () => {
    expect(playwrightConfig.projects?.map((project) => project.name)).toEqual(
      uiProjectNames,
    );
    expect(playwrightConfig.use).toMatchObject({
      locale: "en-OM",
      timezoneId: "Asia/Muscat",
      colorScheme: "light",
    });
    expect(
      playwrightConfig.projects?.every(
        (project) =>
          (project.use as { reducedMotion?: string } | undefined)?.reducedMotion ===
          "reduce",
      ),
    ).toBe(true);
  });

  it("uses polling for the Playwright Vite server to avoid host watcher exhaustion", () => {
    const webServers = Array.isArray(playwrightConfig.webServer)
      ? playwrightConfig.webServer
      : [playwrightConfig.webServer];
    const viteServer = webServers.find((server) =>
      server?.command.includes("dev:web"),
    );

    expect(viteServer?.env).toMatchObject({
      CHOKIDAR_USEPOLLING: "true",
    });
  });

  it("runs the Chromium PR gate and schedules the complete browser matrix", () => {
    expect(ciWorkflow).toContain("cron: '0 22 * * *'");
    expect(ciWorkflow).toContain("workflow_dispatch:");
    expect(ciWorkflow).toContain("npm run test:e2e:ui:pr");
    expect(ciWorkflow).toContain("npm run test:e2e:ui:matrix");
    expect(ciWorkflow).toContain("playwright-report");
    expect(ciWorkflow).toContain("test-results");
  });

  it("documents the repeatable Playwright and Chrome DevTools UX workflow", () => {
    expect(testingGuide).toContain("Chrome DevTools MCP");
    expect(testingGuide).toContain("output/devtools/<run-id>/");
    expect(testingGuide).toContain("npm run test:e2e:ui:pr");
    expect(testingGuide).toContain("LCP ≤ 2.5 s");
    expect(testingGuide).toContain("P0");
    expect(testingGuide).toContain("P3");
  });

  it("writes text, JSON and HTML V8 coverage reports outside production output", () => {
    expect(vitestConfig.test?.coverage).toMatchObject({
      provider: "v8",
      reporter: expect.arrayContaining(["text", "json", "html"]),
      reportsDirectory: "coverage",
    });
  });
});
