import { TestBed } from "@angular/core/testing"
import { createCircuit } from "@engineering-circuit/format"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { DEFAULT_UI_CONFIG } from "../circuit/ui-config"
import { LiveLink, WEBSOCKET_FACTORY } from "./live-link"

/** A stand-in socket the test opens, feeds and closes. */
class FakeSocket extends EventTarget {
	static readonly OPEN = 1
	readyState = 0
	readonly sent: string[] = []
	constructor(readonly url: string) {
		super()
	}
	send(data: string): void {
		this.sent.push(data)
	}
	close(): void {
		this.drop()
	}
	open(): void {
		this.readyState = FakeSocket.OPEN
	}
	receive(data: unknown): void {
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }))
	}
	drop(): void {
		this.readyState = 3
		this.dispatchEvent(new Event("close"))
	}
}

let sockets: FakeSocket[]
let link: LiveLink
const listener = { state: vi.fn(), rejected: vi.fn(), closed: vi.fn() }
const state = { type: "state", revision: 0, circuit: createCircuit("Shared"), history: [] }

beforeEach(() => {
	vi.useFakeTimers()
	sockets = []
	TestBed.configureTestingModule({
		providers: [
			{
				provide: WEBSOCKET_FACTORY,
				useValue: (url: string) => {
					const socket = new FakeSocket(url)
					sockets.push(socket)
					return socket as unknown as WebSocket
				},
			},
		],
	})
	link = TestBed.inject(LiveLink)
	link.connect("ws://127.0.0.1:5000/?token=t", listener)
})

afterEach(() => {
	vi.useRealTimers()
})

test("after a drop the link retries with growing pauses, then is connected again", () => {
	sockets[0]?.receive(state)
	expect(link.status()).toBe("connected")

	sockets[0]?.drop()
	expect(listener.closed).toHaveBeenCalledOnce()
	expect(link.status()).toBe("reconnecting")
	expect(sockets).toHaveLength(1)

	const [first = 0, second = 0] = DEFAULT_UI_CONFIG.live.reconnectDelaysMs
	vi.advanceTimersByTime(first)
	expect(sockets).toHaveLength(2)
	sockets[1]?.drop()
	vi.advanceTimersByTime(first)
	expect(sockets).toHaveLength(2)
	vi.advanceTimersByTime(second - first)
	expect(sockets).toHaveLength(3)

	sockets[2]?.receive(state)
	expect(link.status()).toBe("connected")
	expect(sockets[2]?.url).toBe("ws://127.0.0.1:5000/?token=t")
})

test("after too many tries it gives up and says so", () => {
	sockets[0]?.drop()
	for (let attempt = 0; attempt < DEFAULT_UI_CONFIG.live.maxReconnectAttempts; attempt++) {
		vi.advanceTimersByTime(Math.max(...DEFAULT_UI_CONFIG.live.reconnectDelaysMs))
		sockets.at(-1)?.drop()
	}
	expect(link.status()).toBe("closed")
	const tried = sockets.length
	vi.advanceTimersByTime(60_000)
	expect(sockets).toHaveLength(tried)
})

test("Reconnect tries at once, even after giving up, with a fresh count of tries", () => {
	sockets[0]?.drop()
	for (let attempt = 0; attempt < DEFAULT_UI_CONFIG.live.maxReconnectAttempts; attempt++) {
		vi.advanceTimersByTime(Math.max(...DEFAULT_UI_CONFIG.live.reconnectDelaysMs))
		sockets.at(-1)?.drop()
	}
	expect(link.status()).toBe("closed")
	const tried = sockets.length
	link.reconnectNow()
	expect(link.status()).toBe("connecting")
	expect(sockets).toHaveLength(tried + 1)
	sockets.at(-1)?.receive(state)
	expect(link.status()).toBe("connected")
})

test("Reconnect while a retry is waiting replaces it, without a second socket later", () => {
	sockets[0]?.drop()
	link.reconnectNow()
	expect(sockets).toHaveLength(2)
	vi.advanceTimersByTime(60_000)
	expect(sockets).toHaveLength(2)
	expect(listener.closed).toHaveBeenCalledTimes(1)
})
