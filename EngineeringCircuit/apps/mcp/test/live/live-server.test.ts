import { CircuitDocument, LIVE_ADDRESS_PARAM, LIVE_TOKEN_PARAM, type ServerMessage } from "@engineering-circuit/editing"
import { createCircuit } from "@engineering-circuit/format"
import { afterEach, beforeEach, expect, test } from "vitest"
import { WebSocket } from "ws"
import { LiveServer } from "../../src/live/live-server"

const APP_ORIGIN = "http://localhost:4200"
const MAX_MESSAGE_BYTES = 64 * 1024

type Peer = { socket: WebSocket; next: () => Promise<ServerMessage> }

let document: CircuitDocument
let live: LiveServer
const peers: WebSocket[] = []

beforeEach(async () => {
	document = new CircuitDocument(createCircuit("Shared"))
	live = await LiveServer.start(document, {
		port: 0,
		appUrl: `${APP_ORIGIN}/`,
		allowedOrigins: [APP_ORIGIN],
		maxMessageBytes: MAX_MESSAGE_BYTES,
	})
})

afterEach(async () => {
	for (const socket of peers.splice(0)) socket.terminate()
	await live.close()
})

function linkParts(): { address: string; token: string } {
	const url = new URL(live.link)
	return { address: url.searchParams.get(LIVE_ADDRESS_PARAM) ?? "", token: url.searchParams.get(LIVE_TOKEN_PARAM) ?? "" }
}

function open(token = linkParts().token, origin = APP_ORIGIN): WebSocket {
	const url = new URL(linkParts().address)
	url.searchParams.set(LIVE_TOKEN_PARAM, token)
	const socket = new WebSocket(url, { origin })
	socket.on("error", () => undefined) // refused sockets error when torn down; tests assert on the response instead
	peers.push(socket)
	return socket
}

async function join(): Promise<Peer> {
	const socket = open()
	const inbox: ServerMessage[] = []
	const waiting: ((message: ServerMessage) => void)[] = []
	socket.on("message", (data) => {
		const message = JSON.parse(String(data)) as ServerMessage
		const waiter = waiting.shift()
		if (waiter) waiter(message)
		else inbox.push(message)
	})
	const next = () => {
		const queued = inbox.shift()
		return queued ? Promise.resolve(queued) : new Promise<ServerMessage>((resolve) => waiting.push(resolve))
	}
	return { socket, next }
}

function refusal(socket: WebSocket): Promise<number> {
	return new Promise((resolve) => socket.on("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0)))
}

const addResistor = { type: "edit", command: { type: "add-component", component: { type: "resistor" } } }

test("the link points the app at a loopback address with a session token", () => {
	const url = new URL(live.link)
	expect(url.origin).toBe(APP_ORIGIN)
	expect(linkParts().address).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/$/)
	expect(linkParts().token.length).toBeGreaterThanOrEqual(32)
})

test("a new connection receives the current circuit", async () => {
	const peer = await join()
	expect(await peer.next()).toMatchObject({ type: "state", revision: 0, circuit: { name: "Shared" }, history: [] })
})

test("a learner's edit is applied once and shown to everyone, tagged with its author", async () => {
	const first = await join()
	const second = await join()
	await first.next()
	await second.next()

	first.socket.send(JSON.stringify(addResistor))

	for (const peer of [first, second]) {
		expect(await peer.next()).toMatchObject({
			type: "state",
			revision: 1,
			circuit: { components: [{ id: "R1" }] },
			change: { author: "learner", summary: 'Added resistor "R1"' },
		})
	}
	expect(document.history).toEqual([{ author: "learner", summary: 'Added resistor "R1"' }])
})

test("the agent's edits reach the app", async () => {
	const peer = await join()
	await peer.next()

	document.apply({ type: "add-component", component: { type: "ground" } }, "agent")

	expect(await peer.next()).toMatchObject({ change: { author: "agent", summary: 'Added ground "GND1"' } })
})

test("undo and replace from the app go through the shared history", async () => {
	const peer = await join()
	await peer.next()
	peer.socket.send(JSON.stringify(addResistor))
	await peer.next()

	peer.socket.send(JSON.stringify({ type: "undo" }))
	expect(await peer.next()).toMatchObject({ change: { author: "learner", summary: 'Undid: Added resistor "R1" (by learner)' } })

	peer.socket.send(JSON.stringify({ type: "replace", circuit: createCircuit("Fresh"), summary: "New circuit" }))
	expect(await peer.next()).toMatchObject({ circuit: { name: "Fresh" }, change: { summary: "New circuit" } })
})

test("bad messages are rejected with a reason and change nothing", async () => {
	const peer = await join()
	await peer.next()

	peer.socket.send("not json")
	expect(await peer.next()).toEqual({ type: "rejected", message: "Messages must be JSON" })

	peer.socket.send(JSON.stringify({ type: "edit", command: { type: "explode" } }))
	expect(await peer.next()).toMatchObject({ type: "rejected" })

	peer.socket.send(JSON.stringify({ type: "edit", command: { type: "remove-component", componentId: "X9" } }))
	expect(await peer.next()).toEqual({ type: "rejected", message: 'No component with id "X9"' })

	peer.socket.send(JSON.stringify({ type: "replace", circuit: { format: "other" }, summary: "Broken" }))
	expect(await peer.next()).toMatchObject({ type: "rejected" })

	peer.socket.send(JSON.stringify({ type: "undo" }))
	expect(await peer.next()).toEqual({ type: "rejected", message: "Nothing to undo" })

	expect(document.revision).toBe(0)
})

test("a connection without the session token is refused", async () => {
	expect(await refusal(open("wrong-token"))).toBe(403)
})

test("a connection from another website is refused", async () => {
	expect(await refusal(open(undefined, "https://evil.example"))).toBe(403)
})

test("a fixed token (EC_LIVE_TOKEN) lets a restarted server be found at the same link", async () => {
	const token = "the-same-after-a-restart-0123456789"
	const fixed = await LiveServer.start(document, {
		port: 0,
		appUrl: `${APP_ORIGIN}/`,
		allowedOrigins: [APP_ORIGIN],
		maxMessageBytes: MAX_MESSAGE_BYTES,
		token,
	})
	try {
		expect(new URL(fixed.link).searchParams.get(LIVE_TOKEN_PARAM)).toBe(token)
	} finally {
		await fixed.close()
	}
})

test("a connection with no Origin header (not from a browser page) is refused", async () => {
	const url = new URL(linkParts().address)
	url.searchParams.set(LIVE_TOKEN_PARAM, linkParts().token)
	const socket = new WebSocket(url)
	socket.on("error", () => undefined)
	peers.push(socket)
	expect(await refusal(socket)).toBe(403)
})

test("a message larger than the limit closes the connection and changes nothing", async () => {
	const peer = await join()
	await peer.next()
	const closed = new Promise<number>((resolve) => peer.socket.on("close", (code) => resolve(code)))
	peer.socket.send(JSON.stringify({ ...addResistor, padding: "x".repeat(MAX_MESSAGE_BYTES) }))
	// 1009: message too big (RFC 6455).
	expect(await closed).toBe(1009)
	expect(document.revision).toBe(0)
})
