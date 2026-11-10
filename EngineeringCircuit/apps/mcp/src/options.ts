export type LiveOptions = {
	port: number
	appUrl: string
	allowedOrigins: string[]
	/** A fixed session token, so a restarted server is found at the same link (with a fixed port). Else random. */
	token?: string
}

export type ServerOptions = {
	historyLimit: number
	maxFileBytes: number
	/** The most time steps one simulate_over_time call may run. */
	maxTransientSteps: number
	workspaceDirectory: string
	live: LiveOptions
}

const ANY_FREE_PORT = 0
const DEFAULT_APP_URL = "http://localhost:4200"
/** The link is the only secret between this computer's programs and the circuit, so a fixed one must be hard to guess. */
const MIN_TOKEN_LENGTH = 16

export const DEFAULT_OPTIONS: Omit<ServerOptions, "workspaceDirectory"> = {
	historyLimit: 200,
	maxFileBytes: 5 * 1024 * 1024,
	maxTransientSteps: 200_000,
	live: liveOptions(ANY_FREE_PORT, DEFAULT_APP_URL, []),
}

export function optionsFromEnvironment(environment: NodeJS.ProcessEnv, currentDirectory: string): ServerOptions {
	return {
		historyLimit: positiveInteger(environment.OHMWORK_HISTORY_LIMIT) ?? DEFAULT_OPTIONS.historyLimit,
		maxFileBytes: positiveInteger(environment.OHMWORK_MAX_FILE_BYTES) ?? DEFAULT_OPTIONS.maxFileBytes,
		maxTransientSteps: positiveInteger(environment.OHMWORK_MAX_TRANSIENT_STEPS) ?? DEFAULT_OPTIONS.maxTransientSteps,
		workspaceDirectory: environment.OHMWORK_WORKSPACE_DIR || environment.INIT_CWD || currentDirectory,
		live: {
			...liveOptions(
				positiveInteger(environment.OHMWORK_LIVE_PORT) ?? ANY_FREE_PORT,
				environment.OHMWORK_APP_URL || DEFAULT_APP_URL,
				(environment.OHMWORK_LIVE_ORIGINS ?? "").split(","),
			),
			...(environment.OHMWORK_LIVE_TOKEN ? { token: fixedToken(environment.OHMWORK_LIVE_TOKEN) } : {}),
		},
	}
}

function liveOptions(port: number, appUrl: string, extraOrigins: string[]): LiveOptions {
	const app = new URL(appUrl)
	const origins = [app.origin, ...extraOrigins.map((origin) => origin.trim()).filter(Boolean)]
	return { port, appUrl: app.href, allowedOrigins: [...new Set(origins)] }
}

function fixedToken(token: string): string {
	if (token.length < MIN_TOKEN_LENGTH) throw new Error(`OHMWORK_LIVE_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`)
	return token
}

function positiveInteger(text: string | undefined): number | undefined {
	const value = Number(text)
	return Number.isInteger(value) && value > 0 ? value : undefined
}
