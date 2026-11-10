import { clearMocks, mockIPC } from "@tauri-apps/api/mocks"
import { afterEach, expect, test } from "vitest"
import { CIRCUIT_FILE, type FileSystemAccess, type PickedFileHandle, fileSystemAccessPickers, pickersFor, tauriPickers } from "./disk"

afterEach(() => clearMocks())

/** An in-memory file handle, like the one the browser's file dialog returns. */
function memoryHandle(name: string, content = ""): PickedFileHandle {
	let stored = new Blob([content])
	return {
		name,
		getFile: async () => new File([stored], name),
		createWritable: async () => ({
			write: async (data: Blob) => {
				stored = data
			},
			close: async () => undefined,
		}),
	}
}

const cancelled = () => Promise.reject(new DOMException("The user aborted a request.", "AbortError"))

test("in a browser with file dialogs, Save as writes the chosen file and remembers it for saving again", async () => {
	const handle = memoryHandle("divider.circuit.json")
	let asked: unknown
	const browser: FileSystemAccess = {
		showSaveFilePicker: async (options) => {
			asked = options
			return handle
		},
		showOpenFilePicker: cancelled,
	}
	const pickers = fileSystemAccessPickers(browser)

	const target = await pickers.saveAs(new Blob(["first"]), "divider.circuit.json", CIRCUIT_FILE)
	expect(asked).toEqual({
		suggestedName: "divider.circuit.json",
		types: [{ description: "Circuit", accept: { "application/json": [".json"] } }],
	})
	expect(target?.name).toBe("divider.circuit.json")
	expect(await (await handle.getFile()).text()).toBe("first")

	await target?.write(new Blob(["second"]))
	expect(await (await handle.getFile()).text()).toBe("second")
})

test("in a browser with file dialogs, an opened file can be read and then saved back", async () => {
	const handle = memoryHandle("lamp.circuit.json", '{"a":1}')
	const pickers = fileSystemAccessPickers({ showSaveFilePicker: cancelled, showOpenFilePicker: async () => [handle] })

	const opened = await pickers.open(CIRCUIT_FILE)
	expect(opened?.file.name).toBe("lamp.circuit.json")
	expect(opened?.file.size).toBe(7)
	expect(await opened?.file.text()).toBe('{"a":1}')

	await opened?.target.write(new Blob(['{"a":2}']))
	expect(await (await handle.getFile()).text()).toBe('{"a":2}')
})

test("closing a browser file dialog without choosing is not an error", async () => {
	const pickers = fileSystemAccessPickers({ showSaveFilePicker: cancelled, showOpenFilePicker: cancelled })
	expect(await pickers.saveAs(new Blob(["x"]), "x.svg", CIRCUIT_FILE)).toBeUndefined()
	expect(await pickers.open(CIRCUIT_FILE)).toBeUndefined()
})

test("other failures of a browser file dialog are reported", async () => {
	const denied = () => Promise.reject(new DOMException("Not allowed.", "NotAllowedError"))
	const pickers = fileSystemAccessPickers({ showSaveFilePicker: denied, showOpenFilePicker: denied })
	await expect(pickers.saveAs(new Blob(["x"]), "x.svg", CIRCUIT_FILE)).rejects.toThrow("Not allowed.")
})

test("in the desktop app, Save as asks the system dialog for a path, writes it, and can write it again", async () => {
	const calls: { command: string; args: unknown }[] = []
	mockIPC((command, args) => {
		calls.push({ command, args })
		if (command === "plugin:dialog|save") return "/Users/learner/circuits/divider.circuit.json"
		return null
	})

	const target = await tauriPickers().saveAs(new Blob(["first"]), "divider.circuit.json", CIRCUIT_FILE)
	expect(target?.name).toBe("divider.circuit.json")
	expect(calls[0]).toEqual({
		command: "plugin:dialog|save",
		args: { options: { defaultPath: "divider.circuit.json", filters: [{ name: "Circuit", extensions: ["json"] }] } },
	})
	const writes = calls.filter((call) => call.command === "plugin:fs|write_file")
	expect(writes.map((call) => new TextDecoder().decode(call.args as Uint8Array))).toEqual(["first"])

	await target?.write(new Blob(["second"]))
	const after = calls.filter((call) => call.command === "plugin:fs|write_file")
	expect(after.map((call) => new TextDecoder().decode(call.args as Uint8Array))).toEqual(["first", "second"])
})

test("in the desktop app, Open reads the chosen file and its size, named by its last path part", async () => {
	const path = "C:\\Users\\learner\\lamp.circuit.json"
	mockIPC((command, args) => {
		if (command === "plugin:dialog|open") return path
		if (command === "plugin:fs|stat") return { isFile: true, isDirectory: false, isSymlink: false, size: 7, mtime: null, atime: null, birthtime: null }
		if (command === "plugin:fs|read_text_file") {
			expect(args).toEqual({ path, options: undefined })
			return Array.from(new TextEncoder().encode('{"a":1}'))
		}
		return null
	})

	const opened = await tauriPickers().open(CIRCUIT_FILE)
	expect(opened?.file.name).toBe("lamp.circuit.json")
	expect(opened?.file.size).toBe(7)
	expect(await opened?.file.text()).toBe('{"a":1}')
})

test("closing the desktop dialog without choosing is not an error", async () => {
	mockIPC(() => null)
	expect(await tauriPickers().saveAs(new Blob(["x"]), "x.svg", CIRCUIT_FILE)).toBeUndefined()
	expect(await tauriPickers().open(CIRCUIT_FILE)).toBeUndefined()
})

test("the desktop app uses its own dialogs, a browser with file dialogs uses those, any other browser downloads", () => {
	const browser: FileSystemAccess = { showSaveFilePicker: cancelled, showOpenFilePicker: cancelled }
	expect(pickersFor({ isTauri: true })).toBeDefined()
	expect(pickersFor(browser)).toBeDefined()
	expect(pickersFor({})).toBeUndefined()
})

test("on Android the dialog gives a content URI; the file is still named by its own name", async () => {
	mockIPC((command) => (command === "plugin:dialog|save" ? "content://com.android.externalstorage.documents/document/primary%3ADownload%2Flamp.circuit.json" : null))
	const target = await tauriPickers().saveAs(new Blob(["x"]), "lamp.circuit.json", CIRCUIT_FILE)
	expect(target?.name).toBe("lamp.circuit.json")
})

test("when Android's URI has only a document number, the file is named by the name it was saved as, or opened as the chosen file", async () => {
	mockIPC((command) => {
		if (command === "plugin:dialog|save" || command === "plugin:dialog|open") return "content://com.android.providers.downloads.documents/document/msf%3A2"
		if (command === "plugin:fs|stat") return { isFile: true, isDirectory: false, isSymlink: false, size: 2, mtime: null, atime: null, birthtime: null }
		return null
	})
	expect((await tauriPickers().saveAs(new Blob(["x"]), "lamp.circuit.json", CIRCUIT_FILE))?.name).toBe("lamp.circuit.json")
	expect((await tauriPickers().open(CIRCUIT_FILE))?.target.name).toBe("the chosen file")
})
