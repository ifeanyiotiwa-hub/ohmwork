export type LiveOptions = {
	port: number
	appUrl: string
	allowedOrigins: string[]
}

export type ServerOptions = {
	historyLimit: number
	maxFileBytes: number
	workspaceDirectory: string
	live: LiveOptions
}

const ANY_FREE_PORT = 0
const DEFAULT_APP_URL = "http://localhost:4200"

export const DEFAULT_OPTIONS: Omit<ServerOptions, "workspaceDirectory"> = {
	historyLimit: 200,
	maxFileBytes: 5 * 1024 * 1024,
	live: liveOptions(ANY_FREE_PORT, DEFAULT_APP_URL, []),
}

export function optionsFromEnvironment(environment: NodeJS.ProcessEnv, currentDirectory: string): ServerOptions {
	return {
		historyLimit: positiveInteger(environment.EC_HISTORY_LIMIT) ?? DEFAULT_OPTIONS.historyLimit,
		maxFileBytes: positiveInteger(environment.EC_MAX_FILE_BYTES) ?? DEFAULT_OPTIONS.maxFileBytes,
		workspaceDirectory: environment.EC_WORKSPACE_DIR || environment.INIT_CWD || currentDirectory,
		live: liveOptions(
			positiveInteger(environment.EC_LIVE_PORT) ?? ANY_FREE_PORT,
			environment.EC_APP_URL || DEFAULT_APP_URL,
			(environment.EC_LIVE_ORIGINS ?? "").split(","),
		),
	}
}

function liveOptions(port: number, appUrl: string, extraOrigins: string[]): LiveOptions {
	const app = new URL(appUrl)
	const origins = [app.origin, ...extraOrigins.map((origin) => origin.trim()).filter(Boolean)]
	return { port, appUrl: app.href, allowedOrigins: [...new Set(origins)] }
}

function positiveInteger(text: string | undefined): number | undefined {
	const value = Number(text)
	return Number.isInteger(value) && value > 0 ? value : undefined
}
