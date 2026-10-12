import { defineConfig, devices } from "@playwright/test";

/** The smoke tests of the site run against the built site, at the base path of GitHub Pages. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: process.env["CI"] === undefined ? "list" : [["list"], ["github"]],
  use: { baseURL: "http://127.0.0.1:4330/vex/" },
  // Each test runs in the three engines of the browsers (docs/QUALITY-PLAN.md §4.4).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "pnpm exec astro preview --port 4330 --host 127.0.0.1",
    url: "http://127.0.0.1:4330/vex/",
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 60_000,
    env: { ASTRO_TELEMETRY_DISABLED: "1" },
  },
});
