/**
 * A yes/no setting this browser remembers between visits (the sidebar narrowed, the parts panel pinned). A convenience
 * only: with no storage (a private window, blocked site data, prerendering) it reads as false and is not kept.
 */
export function readRememberedFlag(key: string): boolean {
	try {
		return localStorage.getItem(key) === "true"
	} catch {
		return false
	}
}

export function rememberFlag(key: string, value: boolean): void {
	try {
		localStorage.setItem(key, String(value))
	} catch {
		// Not kept: the setting still holds for this visit.
	}
}
