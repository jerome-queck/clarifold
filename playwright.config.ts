import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results/playwright-artifacts",
  timeout: 60_000,
  workers: 1,
  reporter: "line",
  use: {
    trace: "retain-on-failure"
  }
});
