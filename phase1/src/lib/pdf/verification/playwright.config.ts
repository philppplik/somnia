import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "browser.check.ts",
  workers: 1,
  use: {
    launchOptions: {
      executablePath: "/usr/bin/google-chrome",
      args: ["--no-sandbox"],
    },
    viewport: { width: 1480, height: 980 },
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 1435",
    url: "http://127.0.0.1:1435",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
