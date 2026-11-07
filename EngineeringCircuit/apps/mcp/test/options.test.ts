import { expect, test } from "vitest"
import { DEFAULT_OPTIONS, optionsFromEnvironment } from "../src/options"

test("defaults apply when nothing is set", () => {
	expect(optionsFromEnvironment({}, "/work")).toEqual({ ...DEFAULT_OPTIONS, workspaceDirectory: "/work" })
})

test("environment overrides limits and the workspace folder", () => {
	expect(
		optionsFromEnvironment({ EC_HISTORY_LIMIT: "50", EC_MAX_FILE_BYTES: "1024", EC_WORKSPACE_DIR: "/circuits" }, "/work"),
	).toMatchObject({ historyLimit: 50, maxFileBytes: 1024, workspaceDirectory: "/circuits" })
})

test("pnpm's launch folder is used when no workspace is set", () => {
	expect(optionsFromEnvironment({ INIT_CWD: "/launched-here" }, "/work").workspaceDirectory).toBe("/launched-here")
})

test("invalid numbers fall back to defaults", () => {
	const options = optionsFromEnvironment({ EC_HISTORY_LIMIT: "-3", EC_MAX_FILE_BYTES: "lots" }, "/work")
	expect(options.historyLimit).toBe(DEFAULT_OPTIONS.historyLimit)
	expect(options.maxFileBytes).toBe(DEFAULT_OPTIONS.maxFileBytes)
})

test("the live link defaults to any free port and the local app", () => {
	expect(optionsFromEnvironment({}, "/work").live).toEqual({
		port: 0,
		appUrl: "http://localhost:4200/",
		allowedOrigins: ["http://localhost:4200"],
	})
})

test("the live link port, app address and extra origins come from the environment", () => {
	const { live } = optionsFromEnvironment(
		{ EC_LIVE_PORT: "4380", EC_APP_URL: "http://localhost:4310", EC_LIVE_ORIGINS: "http://127.0.0.1:4310, https://app.example" },
		"/work",
	)
	expect(live).toEqual({
		port: 4380,
		appUrl: "http://localhost:4310/",
		allowedOrigins: ["http://localhost:4310", "http://127.0.0.1:4310", "https://app.example"],
	})
})
