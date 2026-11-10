import { type Circuit, parseCircuit } from "@ohmwork/format"
import * as z from "zod"
import type { DocumentChange, HistoryItem } from "./circuit-document"
import { editCommandSchema } from "./edit-command"

/** Query parameters of the app link: where the live server is, and the session token it expects. */
export const LIVE_ADDRESS_PARAM = "live"
export const LIVE_TOKEN_PARAM = "token"

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"])

export const clientMessageSchema = z.discriminatedUnion("type", [
	// `gesture`: edits of one continuous action (a value dial) share it and are one undo step (CircuitDocument.apply).
	z.strictObject({ type: z.literal("edit"), command: editCommandSchema, gesture: z.string().min(1).max(64).optional() }),
	z.strictObject({ type: z.literal("undo") }),
	z.strictObject({ type: z.literal("redo") }),
	z.strictObject({ type: z.literal("replace"), circuit: z.unknown(), summary: z.string().min(1) }),
])
export type ClientMessage = z.infer<typeof clientMessageSchema>

export type LiveState = { revision: number; circuit: Circuit; history: HistoryItem[]; change?: DocumentChange }
export type ServerMessage = ({ type: "state" } & LiveState) | { type: "rejected"; message: string }

const authorSchema = z.enum(["learner", "agent"])
const historyItemSchema = z.object({ author: authorSchema, summary: z.string() })
const revisionSchema = z.number().int().nonnegative()

const serverEnvelopeSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("state"),
		revision: revisionSchema,
		circuit: z.unknown(),
		history: z.array(historyItemSchema),
		change: historyItemSchema.extend({ revision: revisionSchema }).optional(),
	}),
	z.object({ type: z.literal("rejected"), message: z.string() }),
])

/** The WebSocket address from an app link, only if it points at this computer. */
export function liveSocketUrl(pageHref: string): string | undefined {
	const params = new URL(pageHref).searchParams
	const address = params.get(LIVE_ADDRESS_PARAM)
	const token = params.get(LIVE_TOKEN_PARAM)
	if (!address || !token || !URL.canParse(address)) return undefined
	const url = new URL(address)
	if (url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname)) return undefined
	url.searchParams.set(LIVE_TOKEN_PARAM, token)
	return url.href
}

/** Reads a message from the live server; anything malformed, including an invalid circuit, is dropped. */
export function parseServerMessage(text: string): ServerMessage | undefined {
	let json: unknown
	try {
		json = JSON.parse(text)
	} catch {
		return undefined
	}
	const envelope = serverEnvelopeSchema.safeParse(json)
	if (!envelope.success) return undefined
	const message = envelope.data
	if (message.type === "rejected") return message

	const parsed = parseCircuit(message.circuit)
	if (!parsed.ok) return undefined
	const { revision, history, change } = message
	const state = { type: "state" as const, revision, circuit: parsed.circuit, history }
	return change ? { ...state, change } : state
}
