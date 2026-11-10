import { Injectable, inject, signal } from "@angular/core"
import { type Circuit, parseCircuitJson, serializeCircuit } from "@ohmwork/format"
import { UI_CONFIG } from "../circuit/ui-config"
import type { FileResult } from "./circuit-files"

export type LibraryEntry = { id: string; name: string; savedAt: number }
type StoredCircuit = LibraryEntry & { json: string }

const DATABASE = "engineering-circuit"
const VERSION = 1
const CIRCUITS = "circuits"
const WORKSPACE = "workspace"
/** The workspace slot for the learner's own circuit; a live session keeps its copy under `liveWorkspaceSlot`. */
export const CURRENT_WORKSPACE = "current"
/** A kept circuit that no longer opens is moved here (the latest one), so autosave never overwrites it unseen. */
const DAMAGED = "damaged"

export type WorkspaceLoad = { kind: "none" } | { kind: "found"; circuit: Circuit } | { kind: "damaged"; reason: string }
const BY_SAVED_AT = "savedAt"

const done = <Value>(request: IDBRequest<Value>) =>
	new Promise<Value>((resolve, reject) => {
		request.addEventListener("success", () => resolve(request.result))
		request.addEventListener("error", () => reject(request.error))
	})

const finished = (transaction: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		transaction.addEventListener("complete", () => resolve())
		transaction.addEventListener("error", () => reject(transaction.error))
		transaction.addEventListener("abort", () => reject(transaction.error))
	})

/**
 * Circuits kept in this browser (IndexedDB): a named library, plus the circuit being edited so a reload loses
 * nothing. Stored as the same JSON as files, so opening one runs the format's checks and migrations.
 */
@Injectable({ providedIn: "root" })
export class CircuitLibrary {
	private readonly config = inject(UI_CONFIG)
	private connection: Promise<IDBDatabase> | undefined
	/** Newest first, at most `library.maxEntries`. */
	readonly entries = signal<LibraryEntry[]>([])
	/** Why the circuit being edited isn't being kept, if it isn't (shown in the status bar). */
	readonly problem = signal<string | undefined>(undefined)
	/** A kept circuit that no longer opened, set aside for the learner to download, and why it didn't open. */
	readonly damaged = signal<{ json: string; reason: string } | undefined>(undefined)

	get available(): boolean {
		return typeof indexedDB !== "undefined"
	}

	async refresh(): Promise<void> {
		const database = await this.database()
		const index = database.transaction(CIRCUITS).objectStore(CIRCUITS).index(BY_SAVED_AT)
		const entries: LibraryEntry[] = []
		await new Promise<void>((resolve, reject) => {
			const cursor = index.openCursor(null, "prev")
			cursor.addEventListener("error", () => reject(cursor.error))
			cursor.addEventListener("success", () => {
				const current = cursor.result
				if (!current || entries.length >= this.config.library.maxEntries) return resolve()
				const { id, name, savedAt } = current.value as StoredCircuit
				entries.push({ id, name, savedAt })
				current.continue()
			})
		})
		this.entries.set(entries)
	}

	/** Saves under the circuit's name; saving again under the same name updates that entry. */
	async save(circuit: Circuit): Promise<void> {
		const existing = this.entries().find((entry) => entry.name === circuit.name)
		const record: StoredCircuit = {
			id: existing?.id ?? crypto.randomUUID(),
			name: circuit.name,
			savedAt: Date.now(),
			json: serializeCircuit(circuit),
		}
		const transaction = (await this.database()).transaction(CIRCUITS, "readwrite")
		transaction.objectStore(CIRCUITS).put(record)
		await finished(transaction)
		await this.refresh()
	}

	async open(id: string): Promise<FileResult> {
		const record = (await done((await this.database()).transaction(CIRCUITS).objectStore(CIRCUITS).get(id))) as
			| StoredCircuit
			| undefined
		if (!record) return { ok: false, message: "That circuit is no longer in the library." }
		const parsed = parseCircuitJson(record.json)
		return parsed.ok ? parsed : { ok: false, message: parsed.errors.map((error) => error.message).join("\n") }
	}

	async remove(id: string): Promise<void> {
		const transaction = (await this.database()).transaction(CIRCUITS, "readwrite")
		transaction.objectStore(CIRCUITS).delete(id)
		await finished(transaction)
		await this.refresh()
	}

	async saveWorkspace(circuit: Circuit, slot = CURRENT_WORKSPACE): Promise<void> {
		const transaction = (await this.database()).transaction(WORKSPACE, "readwrite")
		transaction.objectStore(WORKSPACE).put(serializeCircuit(circuit), slot)
		await finished(transaction)
	}

	/**
	 * The circuit from the last session. One that no longer opens (a damaged or newer file) is set aside, kept in
	 * `damaged`, and reported with the reason, rather than dropped and later overwritten by autosave.
	 */
	async loadWorkspace(slot = CURRENT_WORKSPACE): Promise<WorkspaceLoad> {
		const database = await this.database()
		const json = (await done(database.transaction(WORKSPACE).objectStore(WORKSPACE).get(slot))) as string | undefined
		if (json === undefined) return { kind: "none" }
		const parsed = parseCircuitJson(json)
		if (parsed.ok) return { kind: "found", circuit: parsed.circuit }
		const transaction = database.transaction(WORKSPACE, "readwrite")
		transaction.objectStore(WORKSPACE).put(json, DAMAGED)
		await finished(transaction)
		const reason = parsed.errors.map((error) => error.message).join("; ")
		this.damaged.set({ json, reason })
		return { kind: "damaged", reason }
	}

	/** Brings back the notice for a copy set aside in an earlier session and not yet downloaded. */
	async loadDamaged(): Promise<void> {
		const json = (await done((await this.database()).transaction(WORKSPACE).objectStore(WORKSPACE).get(DAMAGED))) as
			| string
			| undefined
		if (json !== undefined) this.damaged.set({ json, reason: reasonOf(json) ?? "" })
	}

	/** The learner has the damaged copy now; forget it. */
	async discardDamaged(): Promise<void> {
		this.damaged.set(undefined)
		const transaction = (await this.database()).transaction(WORKSPACE, "readwrite")
		transaction.objectStore(WORKSPACE).delete(DAMAGED)
		await finished(transaction)
	}

	private database(): Promise<IDBDatabase> {
		if (!this.available) return Promise.reject(new Error("This browser can't keep circuits (no IndexedDB)."))
		this.connection ??= new Promise((resolve, reject) => {
			const request = indexedDB.open(DATABASE, VERSION)
			request.addEventListener("upgradeneeded", () => {
				const database = request.result
				database.createObjectStore(CIRCUITS, { keyPath: "id" }).createIndex(BY_SAVED_AT, "savedAt")
				database.createObjectStore(WORKSPACE)
			})
			request.addEventListener("success", () => resolve(request.result))
			request.addEventListener("error", () => reject(request.error))
		})
		return this.connection
	}
}

/** A live session's own slot, named by the server's address without the session token (which is never stored). */
export function liveWorkspaceSlot(socketUrl: string): string {
	const url = new URL(socketUrl)
	url.search = ""
	return `live:${url.href}`
}

/** Why a kept circuit doesn't open, or undefined if it does. */
function reasonOf(json: string): string | undefined {
	const parsed = parseCircuitJson(json)
	return parsed.ok ? undefined : parsed.errors.map((error) => error.message).join("; ")
}
