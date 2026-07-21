import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "@playwright/test";
import { PrismaClient, type UserRole } from "@prisma/client";
import {
  createSessionToken,
  hashToken,
  sessionCookieName,
} from "../../src/server/middleware/auth";
import type { Portal } from "../../src/client/types";
import { expect, test as databaseTest } from "./test";

const accounts = {
  admin: {
    email: "admin@salik.om",
    role: "SUPER_ADMIN",
    heading: "Platform portal",
  },
  supplier: {
    email: "supplier@fresh.om",
    role: "SUPPLIER_ADMIN",
    heading: "Supply portal",
  },
  store: {
    email: "store@alnoor.om",
    role: "STORE_ADMIN",
    heading: "Store portal",
  },
  driver: {
    email: "driver@fresh.om",
    role: "DRIVER",
    heading: "Driver portal",
  },
} as const satisfies Record<
  Portal,
  { email: string; role: UserRole; heading: string }
>;

export type PortalFactory = (portal: Portal) => Promise<Page>;

type PortalFixtures = {
  portalFactory: PortalFactory;
  loggedInAdmin: Page;
  loggedInSupplier: Page;
  loggedInStore: Page;
  loggedInDriver: Page;
};

export async function expectPortal(
  page: Page,
  portal: Portal,
  options: { timeout?: number } = {},
) {
  await expect(
    page.getByRole("heading", { name: accounts[portal].heading }),
  ).toBeVisible(options);
  const session = await page.context().request.get("/api/auth/me");
  expect(session.ok()).toBe(true);
  expect((await session.json()).user.role).toBe(accounts[portal].role);
}

async function createAuthenticatedPortalPage(input: {
  browser: Browser;
  contextOptions: BrowserContextOptions;
  baseURL: string;
  portal: Portal;
  contexts: BrowserContext[];
}) {
  const account = accounts[input.portal];
  const prisma = new PrismaClient();
  const rawToken = createSessionToken();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1_000);
  try {
    const user = await prisma.user.findUnique({
      where: { email: account.email },
      include: { organization: true },
    });
    if (
      !user ||
      user.role !== account.role ||
      user.status !== "ACTIVE" ||
      (user.organization && user.organization.status !== "ACTIVE")
    ) {
      throw new Error(
        `Portal test account ${account.email} is missing, has the wrong role, or is not active`,
      );
    }
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  const context = await input.browser.newContext({
    ...input.contextOptions,
    baseURL: input.baseURL,
    storageState: undefined,
  });
  input.contexts.push(context);
  await context.addCookies([
    {
      name: sessionCookieName,
      value: rawToken,
      url: input.baseURL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(expiresAt.getTime() / 1_000),
    },
  ]);
  const page = await context.newPage();
  await page.goto("/");
  await expectPortal(page, input.portal);
  return page;
}

export const test = databaseTest.extend<PortalFixtures>({
  portalFactory: async (
    { browser, baseURL, contextOptions },
    provide,
  ) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const contexts: BrowserContext[] = [];
    await provide((portal) =>
      createAuthenticatedPortalPage({
        browser,
        contextOptions,
        baseURL,
        portal,
        contexts,
      }),
    );
    await Promise.all(contexts.map((context) => context.close()));
  },
  loggedInAdmin: async ({ portalFactory }, provide) => {
    await provide(await portalFactory("admin"));
  },
  loggedInSupplier: async ({ portalFactory }, provide) => {
    await provide(await portalFactory("supplier"));
  },
  loggedInStore: async ({ portalFactory }, provide) => {
    await provide(await portalFactory("store"));
  },
  loggedInDriver: async ({ portalFactory }, provide) => {
    await provide(await portalFactory("driver"));
  },
});

export { expect };
