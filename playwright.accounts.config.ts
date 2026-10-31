import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export default defineConfig({
    testDir: "./pwa/account-e2e",
    timeout: 90_000,
    expect: { timeout: 15_000 },
    workers: 1,
    use: {
        actionTimeout: 10_000,
        baseURL: "http://127.0.0.1:1433",
        channel: process.env.CI ? undefined : "chrome",
        ...devices["Desktop Chrome"],
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    webServer: {
        command: "node server-dist/serve-pwa.mjs",
        url: "http://127.0.0.1:1433",
        reuseExistingServer: false,
        timeout: 30_000,
        env: {
            CHESSPRATICA_PORT: "1433",
            CHESSPRATICA_DATA_DIR: resolve("test-results", "auth-server-" + randomUUID()),
        },
    },
});
