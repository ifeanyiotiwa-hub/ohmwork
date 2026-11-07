import type { Circuit } from "@engineering-circuit/format"
import { type EditCommand, type EditResult, applyCommand } from "./apply-command"

export type Author = "learner" | "agent"
export type HistoryItem = { author: Author; summary: string }
export type UndoResult = { ok: true; summary: string } | { ok: false; message: string }
export type DocumentOptions = { historyLimit?: number }

const DEFAULT_HISTORY_LIMIT = 200

type Entry = HistoryItem & { before: Circuit }

export class CircuitDocument {
	private current: Circuit
	private readonly entries: Entry[] = []
	private readonly historyLimit: number

	constructor(circuit: Circuit, { historyLimit = DEFAULT_HISTORY_LIMIT }: DocumentOptions = {}) {
		this.current = circuit
		this.historyLimit = historyLimit
	}

	get circuit(): Circuit {
		return this.current
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

	undo(): UndoResult {
		const last = this.entries.pop()
		if (!last) return { ok: false, message: "Nothing to undo" }
		this.current = last.before
		return { ok: true, summary: `Undid: ${last.summary} (by ${last.author})` }
	}

	private record(circuit: Circuit, author: Author, summary: string): void {
		this.entries.push({ author, summary, before: this.current })
		if (this.entries.length > this.historyLimit) this.entries.shift()
		this.current = circuit
	}
}
