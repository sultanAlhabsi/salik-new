import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

export async function expectNoA11yViolations(
  page: Page,
  testInfo: TestInfo,
  attachmentName = "accessibility-scan-results",
) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  await testInfo.attach(attachmentName, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });

  const blockingViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );
  expect(blockingViolations, "critical or serious accessibility violations").toEqual([]);
}
