import { defineConfig, devices } from "@playwright/test"

/** The offline test serves a production build itself (the service worker is off in development builds). */
export default defineConfig({
	testDir: "e2e/offline",
	globalSetup: "./e2e/offline/build.setup.ts",
	retries: process.env["CI"] ? 2 : 0,
	use: { trace: "retain-on-failure" },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
