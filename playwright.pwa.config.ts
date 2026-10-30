import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./pwa/e2e",
    timeout: 90_000,
    expect: { timeout: 20_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: "http://127.0.0.1:1432",
        channel: process.env.CI ? undefined : "chrome",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        ...devices["Desktop Chrome"],
    },
    webServer: {
        command:
            "node node_modules/vite/bin/vite.js preview --config vite.pwa.config.ts --port 1432",
        url: "http://127.0.0.1:1432",
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
