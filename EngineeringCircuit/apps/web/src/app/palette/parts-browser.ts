import { DOCUMENT, Component, type ElementRef, computed, inject, output, signal, viewChild } from "@angular/core"
import type { ComponentType } from "@engineering-circuit/format"
import { type ListedPart, partRequestPrompt, searchParts } from "./part-search"

/**
 * Every part in one searchable list (the palette shows one category at a time), and for a part the app lacks, a
 * request to give the AI agent, which drafts it from datasheets for review (MCP part_request_guide, save_part_request).
 */
@Component({
	selector: "app-parts-browser",
	templateUrl: "./parts-browser.html",
	styleUrl: "./parts-browser.scss",
})
export class PartsBrowser {
	readonly choose = output<ComponentType>()
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
	private readonly document = inject(DOCUMENT)

	protected readonly query = signal("")
	protected readonly results = computed<ListedPart[]>(() => searchParts(this.query()))
	protected readonly request = signal("")
	protected readonly prompt = computed(() => (this.request().trim() === "" ? undefined : partRequestPrompt(this.request())))
	protected readonly copied = signal(false)

	show(): void {
		this.query.set("")
		this.copied.set(false)
		this.dialog().nativeElement.showModal()
	}

	protected close(): void {
		this.dialog().nativeElement.close()
	}

	protected search(event: Event): void {
		this.query.set((event.target as HTMLInputElement).value)
	}

	protected describe(event: Event): void {
		this.request.set((event.target as HTMLTextAreaElement).value)
		this.copied.set(false)
	}

	protected pick(type: ComponentType): void {
		this.choose.emit(type)
		this.close()
	}

	protected async copyPrompt(): Promise<void> {
		const prompt = this.prompt()
		const clipboard = this.document.defaultView?.navigator.clipboard
		if (!prompt || !clipboard) return
		await clipboard.writeText(prompt)
		this.copied.set(true)
	}
}
