import { DOCUMENT, Component, type ElementRef, inject, linkedSignal, signal, viewChild } from "@angular/core"
import { CircuitStore } from "../circuit/circuit-store"
import { UI_CONFIG } from "../circuit/ui-config"
import { circuitBlob, fileNameFor, offerDownload, readCircuitFile } from "./circuit-files"
import { CircuitLibrary } from "./circuit-library"
import { CIRCUIT_FILE, type DiskFile, FILE_PICKERS, type FilePickers, type FileType, type OpenedFile, PNG_PICTURE, SVG_PICTURE } from "./disk"
import { circuitSvg, drawnBoxes, pictureBounds, pictureName, pngBlob, svgBlob } from "./export-picture"

/**
 * Saving, opening and deleting circuits: the browser library, plus files on disk. Where the system has file dialogs
 * (the desktop app, Chrome, Edge), a file once opened or saved can be saved again in place; elsewhere files download.
 */
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
	protected readonly pickers = inject(FILE_PICKERS)
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")

	protected readonly name = linkedSignal(() => this.store.circuit().name)
	protected readonly message = signal<string | undefined>(undefined)
	/** The entry whose Delete was pressed: it asks before deleting, since the library has no undo. */
	protected readonly confirmingDelete = signal<string | undefined>(undefined)
	/** The file on disk the circuit was last opened from or saved to. */
	protected readonly file = signal<DiskFile | undefined>(undefined)
	protected readonly dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

	async show(): Promise<void> {
		this.message.set(undefined)
		this.confirmingDelete.set(undefined)
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
		this.confirmingDelete.set(undefined)
		await this.attempt(() => this.library.remove(id))
	}

	/** Opens through the file input (browsers without file dialogs). */
	protected async openFile(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement
		const file = input.files?.[0]
		input.value = ""
		if (file) await this.openCircuit(file)
	}

	/** Opens through the system's file dialog, remembering the file to save back to. */
	protected async openFromDisk(pickers: FilePickers): Promise<void> {
		await this.attempt(async () => {
			const opened = await pickers.open(CIRCUIT_FILE)
			if (opened) await this.openCircuit(opened.file, opened.target)
		})
	}

	protected async saveToFile(target: DiskFile): Promise<void> {
		await this.attempt(async () => {
			await target.write(circuitBlob(this.store.circuit()))
			this.message.set(`Saved to ${target.name}.`)
		})
	}

	/** Asks where to save the circuit (or downloads it), and remembers the file. */
	protected async saveAs(): Promise<void> {
		const circuit = this.store.circuit()
		const target = await this.saveData(circuitBlob(circuit), fileNameFor(circuit), CIRCUIT_FILE)
		if (!target) return
		this.file.set(target)
		this.message.set(`Saved to ${target.name}.`)
	}

	/** The kept circuit that didn't open, as it was, so nothing is lost; the notice goes once it is downloaded. */
	protected downloadDamaged(json: string): void {
		offerDownload(new Blob([json], { type: "application/json" }), "damaged-circuit.json", this.document)
		void this.attempt(() => this.library.discardDamaged())
	}

	protected async savePicture(kind: "svg" | "png"): Promise<void> {
		const canvas = this.document.querySelector<SVGSVGElement>('svg[aria-label="Circuit canvas"]')
		if (!canvas) return this.message.set("The canvas isn't on screen, so there is nothing to draw.")
		const circuit = this.store.circuit()
		const bounds = pictureBounds(drawnBoxes(canvas), this.config.library.pictureMargin)
		const background = getComputedStyle(this.document.documentElement).getPropertyValue("--canvas-bg").trim()
		const svg = circuitSvg(canvas, bounds, background)
		await this.attempt(async () => {
			const picture = kind === "svg" ? svgBlob(svg) : await pngBlob(svg, bounds, this.config.library.pngScale, this.document)
			const target = await this.saveData(picture, pictureName(circuit, kind), kind === "svg" ? SVG_PICTURE : PNG_PICTURE)
			if (target) this.message.set(`Saved to ${target.name}.`)
		})
	}

	private async openCircuit(file: OpenedFile["file"], target?: DiskFile): Promise<void> {
		const result = await readCircuitFile(file, this.config.library.maxFileBytes)
		if (!result.ok) return this.message.set(result.message)
		this.store.replace(result.circuit, `Opened ${file.name}`)
		this.file.set(target)
		this.close()
	}

	/** Through the file dialog where there is one; else a download, which can't be saved to again. */
	private async saveData(data: Blob, name: string, type: FileType): Promise<DiskFile | undefined> {
		if (this.pickers) return this.pickers.saveAs(data, name, type)
		offerDownload(data, name, this.document)
		return undefined
	}

	private async attempt(action: () => Promise<void>): Promise<void> {
		try {
			await action()
		} catch (error) {
			this.message.set(error instanceof Error ? error.message : String(error))
		}
	}
}
