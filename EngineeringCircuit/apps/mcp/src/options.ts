export type ServerOptions = {
	historyLimit: number
	maxFileBytes: number
	workspaceDirectory: string
}

export const DEFAULT_OPTIONS: Omit<ServerOptions, "workspaceDirectory"> = {
	historyLimit: 200,
	maxFileBytes: 5 * 1024 * 1024,
}

export function optionsFromEnvironment(environment: NodeJS.ProcessEnv, currentDirectory: string): ServerOptions {
	return {
		historyLimit: positiveInteger(environment.EC_HISTORY_LIMIT) ?? DEFAULT_OPTIONS.historyLimit,
		maxFileBytes: positiveInteger(environment.EC_MAX_FILE_BYTES) ?? DEFAULT_OPTIONS.maxFileBytes,
		workspaceDirectory: environment.EC_WORKSPACE_DIR || environment.INIT_CWD || currentDirectory,
	}
}

function positiveInteger(text: string | undefined): number | undefined {
	const value = Number(text)
	return Number.isInteger(value) && value > 0 ? value : undefined
}
