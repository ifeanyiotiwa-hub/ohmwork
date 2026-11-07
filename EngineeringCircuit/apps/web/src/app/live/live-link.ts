import { Injectable, signal } from "@angular/core"
import { type ClientMessage, type LiveState, parseServerMessage } from "@engineering-circuit/editing"

export type LiveStatus = "off" | "connecting" | "connected" | "closed"

export type LiveListener = {
	state(state: LiveState): void
	rejected(message: string): void
	closed(): void
}

/** The WebSocket to the MCP server's live link. Messages are validated; anything malformed is ignored. */
@Injectable({ providedIn: "root" })
export class LiveLink {
	readonly status = signal<LiveStatus>("off")
	private socket: WebSocket | undefined

	connect(url: string, listener: LiveListener): void {
		this.socket?.close()
		this.status.set("connecting")
		const socket = new WebSocket(url)
		this.socket = socket

		socket.addEventListener("message", (event: MessageEvent<unknown>) => {
			if (typeof event.data !== "string") return
			const message = parseServerMessage(event.data)
			if (message?.type === "rejected") listener.rejected(message.message)
			else if (message) {
				this.status.set("connected")
				const { type: _type, ...state } = message
				listener.state(state)
			}
		})
		socket.addEventListener("close", () => {
			if (this.socket !== socket) return
			this.socket = undefined
			this.status.set("closed")
			listener.closed()
		})
	}

	send(message: ClientMessage): void {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
	}
}
