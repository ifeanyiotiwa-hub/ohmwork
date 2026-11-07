import { expect, test } from "vitest"
import { DEFAULT_OPTIONS, optionsFromEnvironment } from "../src/options"

test("defaults apply when nothing is set", () => {
	expect(optionsFromEnvironment({}, "/work")).toEqual({ ...DEFAULT_OPTIONS, workspaceDirectory: "/work" })
})

test("environment overrides limits and the workspace folder", () => {
	expect(
		optionsFromEnvironment({ EC_HISTORY_LIMIT: "50", EC_MAX_FILE_BYTES: "1024", EC_WORKSPACE_DIR: "/circuits" }, "/work"),
	).toEqual({ historyLimit: 50, maxFileBytes: 1024, workspaceDirectory: "/circuits" })
})

test("pnpm's launch folder is used when no workspace is set", () => {
	expect(optionsFromEnvironment({ INIT_CWD: "/launched-here" }, "/work").workspaceDirectory).toBe("/launched-here")
})

test("invalid numbers fall back to defaults", () => {
	const options = optionsFromEnvironment({ EC_HISTORY_LIMIT: "-3", EC_MAX_FILE_BYTES: "lots" }, "/work")
	expect(options.historyLimit).toBe(DEFAULT_OPTIONS.historyLimit)
	expect(options.maxFileBytes).toBe(DEFAULT_OPTIONS.maxFileBytes)
})
