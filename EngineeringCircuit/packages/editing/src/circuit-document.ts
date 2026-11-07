import type { Circuit } from "@engineering-circuit/format"
import { type EditResult, applyCommand } from "./apply-command"
import type { EditCommand } from "./edit-command"

export type Author = "learner" | "agent"
export type HistoryItem = { author: Author; summary: string }
export type UndoResult = { ok: true; summary: string } | { ok: false; message: string }
export type DocumentOptions = { historyLimit?: number }
export type DocumentChange = HistoryItem & { revision: number }
export type ChangeListener = (change: DocumentChange) => void

const DEFAULT_HISTORY_LIMIT = 200

type Entry = HistoryItem & { before: Circuit }

export class CircuitDocument {
	private current: Circuit
	private currentRevision = 0
	private readonly entries: Entry[] = []
	private readonly listeners = new Set<ChangeListener>()
	private readonly historyLimit: number

	constructor(circuit: Circuit, { historyLimit = DEFAULT_HISTORY_LIMIT }: DocumentOptions = {}) {
		this.current = circuit
		this.historyLimit = historyLimit
	}

	get circuit(): Circuit {
		return this.current
	}

	get revision(): number {
		return this.currentRevision
	}

	get history(): HistoryItem[] {
		return this.entries.map(({ author, summary }) => ({ author, summary }))
	}

	apply(command: EditCommand, author: Author): EditResult {
		const result = applyCommand(this.current, command)
		if (result.ok) this.record(result.circuit, author, result.summary)
		return result
	}

	replace(circuit: Circuit, author: Author, summary: string): void {
		this.record(circuit, author, summary)
	}

	undo(author: Author): UndoResult {
		const last = this.entries.pop()
		if (!last) return { ok: false, message: "Nothing to undo" }
		this.current = last.before
		const summary = `Undid: ${last.summary} (by ${last.author})`
		this.notify(author, summary)
		return { ok: true, summary }
	}

	subscribe(listener: ChangeListener): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	private record(circuit: Circuit, author: Author, summary: string): void {
		this.entries.push({ author, summary, before: this.current })
		if (this.entries.length > this.historyLimit) this.entries.shift()
		this.current = circuit
		this.notify(author, summary)
	}

	private notify(author: Author, summary: string): void {
		this.currentRevision += 1
		const change = { revision: this.currentRevision, author, summary }
		for (const listener of this.listeners) listener(change)
	}
}
