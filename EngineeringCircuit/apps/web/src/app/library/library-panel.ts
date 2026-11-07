import { DOCUMENT, Component, type ElementRef, inject, linkedSignal, signal, viewChild } from "@angular/core"
import { CircuitStore } from "../circuit/circuit-store"
import { UI_CONFIG } from "../circuit/ui-config"
import { downloadCircuit, readCircuitFile } from "./circuit-files"
import { CircuitLibrary } from "./circuit-library"

/** Saving, opening and deleting circuits: the browser library, plus files to move circuits elsewhere. */
@Component({
	selector: "app-library-panel",
	templateUrl: "./library-panel.html",
	styleUrl: "./library-panel.scss",
})
export class LibraryPanel {
	protected readonly store = inject(CircuitStore)
	protected readonly library = inject(CircuitLibrary)
	private readonly config = inject(UI_CONFIG)
	private readonly document = inject(DOCUMENT)
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")

	protected readonly name = linkedSignal(() => this.store.circuit().name)
	protected readonly message = signal<string | undefined>(undefined)
	protected readonly dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

	async show(): Promise<void> {
		this.message.set(undefined)
		this.dialog().nativeElement.showModal()
		await this.attempt(() => this.library.refresh())
	}

	protected rename(event: Event): void {
		this.name.set((event.target as HTMLInputElement).value)
	}

	protected close(): void {
		this.dialog().nativeElement.close()
	}

	protected async save(): Promise<void> {
		const name = this.name().trim()
		if (name !== this.store.circuit().name && !this.store.apply({ type: "rename-circuit", name })) {
			this.message.set(this.store.editError())
			return
		}
		await this.attempt(async () => {
			await this.library.save(this.store.circuit())
			this.message.set(`Saved "${this.store.circuit().name}".`)
		})
	}

	protected async open(id: string): Promise<void> {
		await this.attempt(async () => {
			const result = await this.library.open(id)
			if (!result.ok) return this.message.set(result.message)
			this.store.replace(result.circuit, `Opened "${result.circuit.name}" from the library`)
			this.close()
		})
	}

	protected async remove(id: string): Promise<void> {
		await this.attempt(() => this.library.remove(id))
	}

	protected async openFile(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement
		const file = input.files?.[0]
		input.value = ""
		if (!file) return
		const result = await readCircuitFile(file, this.config.library.maxFileBytes)
		if (!result.ok) return this.message.set(result.message)
		this.store.replace(result.circuit, `Opened ${file.name}`)
		this.close()
	}

	protected download(): void {
		downloadCircuit(this.store.circuit(), this.document)
	}

	private async attempt(action: () => Promise<void>): Promise<void> {
		try {
			await action()
		} catch (error) {
			this.message.set(error instanceof Error ? error.message : String(error))
		}
	}
}
