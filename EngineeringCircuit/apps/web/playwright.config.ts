import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env["E2E_PORT"] ?? 4310)

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	retries: process.env["CI"] ? 2 : 0,
	use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: `npx ng serve --port ${port}`,
		url: `http://localhost:${port}`,
		reuseExistingServer: !process.env["CI"],
		timeout: 120_000,
	},
})
