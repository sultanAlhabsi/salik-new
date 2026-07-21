import { defineConfig, devices } from '@playwright/test';
import { installE2EEnvironment } from './tests/e2e/environment';

const e2e = installE2EEnvironment();

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '760', width: 760, height: 900 },
  { name: '430', width: 430, height: 932 },
  { name: '320', width: 320, height: 800 }
] as const;

const browsers = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  { name: 'firefox', device: devices['Desktop Firefox'] },
  { name: 'webkit', device: devices['Desktop Safari'] }
] as const;

const prProjects = new Set(['chromium-1440', 'chromium-430', 'chromium-320']);

const projects = browsers.flatMap((browser) =>
  viewports.map((viewport) => {
    const name = `${browser.name}-${viewport.name}`;
    return {
      name,
      grep: prProjects.has(name) ? undefined : /@matrix/,
      use: {
        ...browser.device,
        viewport: { width: viewport.width, height: viewport.height },
        screen: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        hasTouch: viewport.width <= 430,
        reducedMotion: 'reduce' as const
      }
    };
  })
);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001
    }
  },
  use: {
    baseURL: e2e.webOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'en-OM',
    timezoneId: 'Asia/Muscat',
    colorScheme: 'light'
  },
  webServer: [
    {
      command: 'npx tsx src/server/index.ts',
      url: `${e2e.apiOrigin}/api/health`,
      env: {
        DATABASE_URL: e2e.databaseUrl,
        PORT: new URL(e2e.apiOrigin).port,
        APP_ORIGIN: e2e.webOrigin,
        SALIK_SUPABASE_DISABLED: 'true',
        PAYMENT_WEBHOOK_SECRET: 'playwright-payment-secret'
      },
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command: `npm run dev:web -- --port ${new URL(e2e.webOrigin).port} --strictPort`,
      url: e2e.webOrigin,
      env: {
        SALIK_API_ORIGIN: e2e.apiOrigin
      },
      reuseExistingServer: false,
      timeout: 120000
    }
  ],
  projects
});
