import { defineConfig, devices } from "@playwright/test";

/** Port of the static server that serves dist/ during end-to-end runs. */
const E2E_PORT = 8081;

/**
 * Browser channel. Defaults to the locally installed Chrome so no browser download
 * is needed. Set PW_CHANNEL="" to use Playwright's bundled Chromium (for example in CI
 * after `npx playwright install chromium`).
 */
const channel = process.env.PW_CHANNEL === undefined ? "chrome" : process.env.PW_CHANNEL || undefined;

/**
 * End-to-end tests run the built site (dist/) in a real browser.
 * Run `npm run build` first, `npm test` does that for you.
 */
export default defineConfig({
    testDir: "tests/e2e",
    outputDir: "test-results",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: `http://localhost:${E2E_PORT}`,
        trace: "retain-on-failure",
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
        // The phone project runs the core flows, the dialog and the layout checks, the rest is viewport independent.
        { name: "mobile", testMatch: /(practice|layout|dialog|i18n|frontend|languages|learn|pages|consent)\.spec\.ts/, use: { ...devices["Pixel 7"], channel } },
    ],
    webServer: {
        command: `npx http-server dist -p ${E2E_PORT} -c-1 --silent`,
        url: `http://localhost:${E2E_PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
});
