import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./dist-tests",
  timeout: 60000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4175/photo-culler-static/",
    channel: process.env.PW_CHANNEL ?? "chrome",
    headless: true,
  },
  webServer: {
    command: "node scripts/dist-test-server.mjs",
    url: "http://127.0.0.1:4175/photo-culler-static/",
    reuseExistingServer: !process.env.CI,
  },
});
