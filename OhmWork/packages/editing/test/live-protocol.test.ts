import { createCircuit } from "@ohmwork/format"
import { expect, test } from "vitest"
import { clientMessageSchema, liveSocketUrl, parseServerMessage } from "../src/live-protocol"

test("the socket address comes from the page link, with the token attached", () => {
	expect(liveSocketUrl("http://localhost:4200/?live=ws%3A%2F%2F127.0.0.1%3A5000%2F&token=abc")).toBe(
		"ws://127.0.0.1:5000/?token=abc",
	)
})

test("no live link without both an address and a token", () => {
	expect(liveSocketUrl("http://localhost:4200/")).toBeUndefined()
	expect(liveSocketUrl("http://localhost:4200/?live=ws%3A%2F%2F127.0.0.1%3A5000%2F")).toBeUndefined()
})

test("only this computer is trusted as a live server", () => {
	expect(liveSocketUrl("http://localhost:4200/?live=ws%3A%2F%2Fevil.example%2F&token=abc")).toBeUndefined()
	expect(liveSocketUrl("http://localhost:4200/?live=http%3A%2F%2F127.0.0.1%3A5000%2F&token=abc")).toBeUndefined()
	expect(liveSocketUrl("http://localhost:4200/?live=not-a-url&token=abc")).toBeUndefined()
	expect(liveSocketUrl("http://localhost:4200/?live=ws%3A%2F%2Flocalhost%3A5000%2F&token=abc")).toBe(
		"ws://localhost:5000/?token=abc",
	)
})

test("edits from the app are validated before they reach the document", () => {
	expect(clientMessageSchema.safeParse({ type: "edit", command: { type: "rotate-component", componentId: "R1" } }).success).toBe(true)
	expect(clientMessageSchema.safeParse({ type: "edit", command: { type: "add-component", component: { type: "flux-capacitor" } } }).success).toBe(false)
	expect(clientMessageSchema.safeParse({ type: "edit", command: { type: "disconnect", wireId: "w1", extra: 1 } }).success).toBe(false)
})

test("a state message is checked and its circuit validated", () => {
	const circuit = createCircuit("Shared")
	const change = { revision: 1, author: "agent", summary: "Created" }
	expect(parseServerMessage(JSON.stringify({ type: "state", revision: 1, circuit, history: [], change }))).toEqual({
		type: "state",
		revision: 1,
		circuit,
		history: [],
		change,
	})
	expect(parseServerMessage(JSON.stringify({ type: "state", revision: 1, circuit: { format: "other" }, history: [] }))).toBeUndefined()
	expect(parseServerMessage(JSON.stringify({ type: "rejected", message: "No" }))).toEqual({ type: "rejected", message: "No" })
	expect(parseServerMessage("garbage")).toBeUndefined()
})
