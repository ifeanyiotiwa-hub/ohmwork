import { randomBytes, timingSafeEqual } from "node:crypto"
import { type IncomingMessage, type Server, createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { Duplex } from "node:stream"
import {
	type CircuitDocument,
	type ClientMessage,
	type DocumentChange,
	LIVE_ADDRESS_PARAM,
	LIVE_TOKEN_PARAM,
	type ServerMessage,
	clientMessageSchema,
} from "@ohmwork/editing"
import { parseCircuit } from "@ohmwork/format"
import { type RawData, type WebSocket, WebSocketServer } from "ws"
import type { LiveOptions } from "../options"

/** Only this machine can connect; the link is for the learner's own browser. */
const LOOPBACK_HOST = "127.0.0.1"
const TOKEN_BYTES = 24
const FORBIDDEN = "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"

export type LiveServerOptions = LiveOptions & { maxMessageBytes: number }

/** Shares one CircuitDocument with the web app over a WebSocket: the app sends edits, everyone gets the new state. */
export class LiveServer {
	private readonly unsubscribe: () => void

	private constructor(
		private readonly document: CircuitDocument,
		private readonly http: Server,
		private readonly sockets: WebSocketServer,
		private readonly token: string,
		private readonly appUrl: string,
	) {
		this.unsubscribe = document.subscribe((change) => this.broadcast(change))
		sockets.on("connection", (socket) => this.welcome(socket))
	}

	static start(document: CircuitDocument, options: LiveServerOptions): Promise<LiveServer> {
		const token = options.token ?? randomBytes(TOKEN_BYTES).toString("base64url")
		const sockets = new WebSocketServer({ noServer: true, maxPayload: options.maxMessageBytes })
		const http = createServer((_request, response) => response.writeHead(426).end("WebSocket only"))
		http.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			if (!isAllowed(request, token, options.allowedOrigins)) {
				socket.end(FORBIDDEN)
				return
			}
			sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request))
		})
		return new Promise((resolve, reject) => {
			http.once("error", reject)
			http.listen(options.port, LOOPBACK_HOST, () => {
				http.off("error", reject)
				resolve(new LiveServer(document, http, sockets, token, options.appUrl))
			})
		})
	}

	get address(): string {
		const { port } = this.http.address() as AddressInfo
		return `ws://${LOOPBACK_HOST}:${port}/`
	}

	/** The app address with where to connect and the session token, for the learner to open. */
	get link(): string {
		const url = new URL(this.appUrl)
		url.searchParams.set(LIVE_ADDRESS_PARAM, this.address)
		url.searchParams.set(LIVE_TOKEN_PARAM, this.token)
		return url.href
	}

	async close(): Promise<void> {
		this.unsubscribe()
		for (const client of this.sockets.clients) client.terminate()
		await new Promise<void>((resolve) => this.sockets.close(() => resolve()))
		await new Promise<void>((resolve, reject) => this.http.close((error) => (error ? reject(error) : resolve())))
	}

	private welcome(socket: WebSocket): void {
		socket.on("error", () => socket.terminate())
		socket.on("message", (data) => {
			const problem = this.handle(data)
			if (problem) send(socket, { type: "rejected", message: problem })
		})
		send(socket, this.state())
	}

	/** Applies one message from the app; returns why it was refused, if it was. */
	private handle(data: RawData): string | undefined {
		let json: unknown
		try {
			json = JSON.parse(String(data))
		} catch {
			return "Messages must be JSON"
		}
		const parsed = clientMessageSchema.safeParse(json)
		if (!parsed.success) return parsed.error.issues.map((issue) => issue.message).join("\n")
		return this.perform(parsed.data)
	}

	private perform(message: ClientMessage): string | undefined {
		switch (message.type) {
			case "edit": {
				const result = this.document.apply(message.command, "learner", message.gesture ? { gesture: message.gesture } : {})
				return result.ok ? undefined : result.errors.map((error) => error.message).join("\n")
			}
			case "undo": {
				const result = this.document.undo("learner")
				return result.ok ? undefined : result.message
			}
			case "redo": {
				const result = this.document.redo("learner")
				return result.ok ? undefined : result.message
			}
			case "replace": {
				const parsed = parseCircuit(message.circuit)
				if (!parsed.ok) return parsed.errors.map((error) => `${error.path}: ${error.message}`).join("\n")
				this.document.replace(parsed.circuit, "learner", message.summary)
				return undefined
			}
		}
	}

	private state(change?: DocumentChange): ServerMessage {
		const { revision, circuit, history } = this.document
		return change ? { type: "state", revision, circuit, history, change } : { type: "state", revision, circuit, history }
	}

	private broadcast(change: DocumentChange): void {
		const message = this.state(change)
		for (const client of this.sockets.clients) send(client, message)
	}
}

function send(socket: WebSocket, message: ServerMessage): void {
	if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

function isAllowed(request: IncomingMessage, token: string, allowedOrigins: readonly string[]): boolean {
	const origin = request.headers.origin
	if (!origin || !allowedOrigins.includes(origin)) return false
	const given = new URL(request.url ?? "/", "ws://localhost").searchParams.get(LIVE_TOKEN_PARAM) ?? ""
	const expected = Buffer.from(token)
	const actual = Buffer.from(given)
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}
