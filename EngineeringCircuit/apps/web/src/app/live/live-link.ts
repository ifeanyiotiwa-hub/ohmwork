import { InjectionToken, Injectable, inject, signal } from "@angular/core"
import { type ClientMessage, type LiveState, parseServerMessage } from "@engineering-circuit/editing"
import { UI_CONFIG } from "../circuit/ui-config"

export type LiveStatus = "off" | "connecting" | "connected" | "reconnecting" | "closed"

export type LiveListener = {
	state(state: LiveState): void
	rejected(message: string): void
	closed(): void
}

/** Opens the WebSocket; replaced in tests by a stand-in. */
export const WEBSOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>("WEBSOCKET_FACTORY", {
	providedIn: "root",
	factory: () => (url: string) => new WebSocket(url),
})

/**
 * The WebSocket to the MCP server's live link. Messages are validated; anything malformed is ignored. After a drop it
 * retries the same address with growing pauses (a restarted server with the same port and token is found again),
 * and gives up after `live.maxReconnectAttempts`.
 */
@Injectable({ providedIn: "root" })
export class LiveLink {
	private readonly config = inject(UI_CONFIG)
	private readonly openSocket = inject(WEBSOCKET_FACTORY)
	readonly status = signal<LiveStatus>("off")
	private socket: WebSocket | undefined
	private url: string | undefined
	private listener: LiveListener | undefined
	private attempts = 0
	private retry: ReturnType<typeof setTimeout> | undefined

	connect(url: string, listener: LiveListener): void {
		clearTimeout(this.retry)
		this.socket?.close()
		this.url = url
		this.listener = listener
		this.attempts = 0
		this.status.set("connecting")
		this.open()
	}

	/** Tries again at once, with a fresh count of attempts (the learner pressed Reconnect). */
	reconnectNow(): void {
		if (!this.url || !this.listener || this.status() === "connected") return
		clearTimeout(this.retry)
		// A socket still trying is let go first, so its close is not taken for a drop.
		const pending = this.socket
		this.socket = undefined
		pending?.close()
		this.attempts = 0
		this.status.set("connecting")
		this.open()
	}

	send(message: ClientMessage): void {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
	}

	private open(): void {
		const { url, listener } = this
		if (!url || !listener) return
		const socket = this.openSocket(url)
		this.socket = socket

		socket.addEventListener("message", (event: MessageEvent<unknown>) => {
			if (typeof event.data !== "string") return
			const message = parseServerMessage(event.data)
			if (message?.type === "rejected") listener.rejected(message.message)
			else if (message) {
				this.attempts = 0
				this.status.set("connected")
				const { type: _type, ...state } = message
				listener.state(state)
			}
		})
		socket.addEventListener("close", () => {
			if (this.socket !== socket) return
			this.socket = undefined
			listener.closed()
			this.scheduleRetry()
		})
	}

	private scheduleRetry(): void {
		const { reconnectDelaysMs, maxReconnectAttempts } = this.config.live
		if (this.attempts >= maxReconnectAttempts) {
			this.status.set("closed")
			return
		}
		const delay = reconnectDelaysMs[Math.min(this.attempts, reconnectDelaysMs.length - 1)] ?? 0
		this.attempts += 1
		this.status.set("reconnecting")
		this.retry = setTimeout(() => this.open(), delay)
	}
}
