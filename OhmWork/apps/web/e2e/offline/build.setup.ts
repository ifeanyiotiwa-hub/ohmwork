import { execSync } from "node:child_process"

/** The service worker is only in production builds, so build once before the offline test. */
export default function buildForOffline(): void {
	execSync("npx ng build", { stdio: "inherit" })
}
