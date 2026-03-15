import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Each spec file gets its own isolated team via the test fixture,
  // so parallel execution is now safe — no shared data interference.
  // fullyParallel is false because serial describe blocks (budgets, checkpoints)
  // share a browser context across tests within the same file.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // Spec files run in parallel — each has its own isolated team.
  workers: 3,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Auth is handled per-test via the isolated fixture (tests/e2e/fixtures.ts).
      // No global setup or shared storageState needed.
      testIgnore: /global-setup\.ts/,
    },
  ],

  webServer: {
    // Starts the app on port 3001 using the test database (db-test, electric-test).
    // Completely isolated from dev data on port 3000.
    command: "npm run dev:test",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
  },
});
