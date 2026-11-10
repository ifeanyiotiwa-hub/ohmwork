import { type ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from "@angular/core"
import { provideServiceWorker } from "@angular/service-worker"
import { isTauri } from "@tauri-apps/api/core"

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideServiceWorker("ngsw-worker.js", {
			// The desktop app serves its files from disk already; its webview has no service workers.
			enabled: !isDevMode() && !isTauri(),
			registrationStrategy: "registerWhenStable:30000",
		}),
	],
}
