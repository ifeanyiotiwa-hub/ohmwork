import { DOCUMENT, InjectionToken, inject } from "@angular/core"

/** What is being saved or opened, for the system's file dialogs. */
export type FileType = { description: string; extension: string; mimeType: string }

export const CIRCUIT_FILE: FileType = { description: "Circuit", extension: "json", mimeType: "application/json" }
export const SVG_PICTURE: FileType = { description: "SVG picture", extension: "svg", mimeType: "image/svg+xml" }
export const PNG_PICTURE: FileType = { description: "PNG picture", extension: "png", mimeType: "image/png" }

/** A file the learner chose once, which can be written again without asking. */
export type DiskFile = { readonly name: string; write(data: Blob): Promise<void> }

/** A file chosen to open: its contents, and where to save it back. */
export type OpenedFile = { file: Pick<File, "name" | "size" | "text">; target: DiskFile }

/** The system's file dialogs. Both resolve to undefined when the learner closes the dialog without choosing. */
export type FilePickers = {
	/** Asks where to save, writes the data there, and returns the file for saving again. */
	saveAs(data: Blob, suggestedName: string, type: FileType): Promise<DiskFile | undefined>
	open(type: FileType): Promise<OpenedFile | undefined>
}

/** The parts of the File System Access API used here (Chrome and Edge; not in the DOM typings). */
export type PickedFileHandle = {
	readonly name: string
	getFile(): Promise<File>
	createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>
}
type PickerTypes = { description: string; accept: Record<string, string[]> }[]
export type FileSystemAccess = {
	showSaveFilePicker(options: { suggestedName: string; types: PickerTypes }): Promise<PickedFileHandle>
	showOpenFilePicker(options: { types: PickerTypes }): Promise<PickedFileHandle[]>
}

/**
 * The file dialogs where they exist: the desktop app's, else the browser's File System Access API. Undefined in
 * other browsers (Firefox, Safari), which download files and open them through a file input instead.
 */
export const FILE_PICKERS = new InjectionToken<FilePickers | undefined>("FILE_PICKERS", {
	providedIn: "root",
	factory: () => {
		const view = inject(DOCUMENT).defaultView
		return view ? pickersFor(view) : undefined
	},
})

export function pickersFor(scope: object): FilePickers | undefined {
	if ("isTauri" in scope && scope.isTauri === true) return tauriPickers()
	if (hasFileSystemAccess(scope)) return fileSystemAccessPickers(scope)
	return undefined
}

function hasFileSystemAccess(scope: object): scope is FileSystemAccess {
	return "showSaveFilePicker" in scope && "showOpenFilePicker" in scope
}

export function fileSystemAccessPickers(browser: FileSystemAccess): FilePickers {
	const types = (type: FileType): PickerTypes => [{ description: type.description, accept: { [type.mimeType]: [`.${type.extension}`] } }]
	return {
		saveAs: (data, suggestedName, type) =>
			unlessCancelled(async () => {
				const target = handleFile(await browser.showSaveFilePicker({ suggestedName, types: types(type) }))
				await target.write(data)
				return target
			}),
		open: (type) =>
			unlessCancelled(async () => {
				const [handle] = await browser.showOpenFilePicker({ types: types(type) })
				if (!handle) return undefined
				return { file: await handle.getFile(), target: handleFile(handle) }
			}),
	}
}

function handleFile(handle: PickedFileHandle): DiskFile {
	return {
		name: handle.name,
		async write(data) {
			const writable = await handle.createWritable()
			await writable.write(data)
			await writable.close()
		},
	}
}

/** The browser rejects with an AbortError when the learner closes its dialog. */
async function unlessCancelled<T>(action: () => Promise<T>): Promise<T | undefined> {
	try {
		return await action()
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return undefined
		throw error
	}
}

/** The desktop app's dialogs and file access (Tauri plugins), loaded only when running there. */
export function tauriPickers(): FilePickers {
	const filters = (type: FileType) => [{ name: type.description, extensions: [type.extension] }]
	return {
		async saveAs(data, suggestedName, type) {
			const { save } = await import("@tauri-apps/plugin-dialog")
			const path = await save({ defaultPath: suggestedName, filters: filters(type) })
			if (!path) return undefined
			const target = pathFile(path, suggestedName)
			await target.write(data)
			return target
		},
		async open(type) {
			const { open } = await import("@tauri-apps/plugin-dialog")
			const path = await open({ multiple: false, directory: false, filters: filters(type) })
			if (!path) return undefined
			const { readTextFile, stat } = await import("@tauri-apps/plugin-fs")
			const { size } = await stat(path)
			const target = pathFile(path, CHOSEN_FILE)
			return { file: { name: target.name, size, text: () => readTextFile(path) }, target }
		},
	}
}

const CHOSEN_FILE = "the chosen file"

/**
 * The last part of a path. An Android content URI may end in the encoded path (external storage) or only in a
 * document number (Downloads), which is no name to show: then `fallback` is used.
 */
function fileNameOf(path: string, fallback: string): string {
	if (!path.startsWith("content://")) return path.split(/[\\/]/).at(-1) || path
	const last = decodeURIComponent(path).split(/[\\/]/).at(-1) ?? ""
	return last.includes(".") ? last : fallback
}

function pathFile(path: string, fallbackName: string): DiskFile {
	return {
		name: fileNameOf(path, fallbackName),
		async write(data) {
			const { writeFile } = await import("@tauri-apps/plugin-fs")
			await writeFile(path, new Uint8Array(await data.arrayBuffer()))
		},
	}
}
