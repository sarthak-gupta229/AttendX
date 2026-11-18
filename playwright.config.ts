import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.APP_ORIGIN || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iPhone SE",
      use: { ...devices["iPhone SE"] },
    },
    {
      name: "Android 360x800",
      use: {
        viewport: { width: 360, height: 800 },
        userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "iPhone 14",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "iPhone 14 Landscape",
      use: {
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "320px Edge Case",
      use: {
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
