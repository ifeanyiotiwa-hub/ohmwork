import { type Circuit, parseCircuitJson, serializeCircuit } from "@engineering-circuit/format"

export type FileResult = { ok: true; circuit: Circuit } | { ok: false; message: string }

const EXTENSION = ".circuit.json"
const FALLBACK_NAME = "circuit"

/** A file name from the circuit's name: lower case letters, digits and dashes only. */
export function fileNameFor(circuit: Circuit): string {
	const slug = circuit.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return `${slug || FALLBACK_NAME}${EXTENSION}`
}

/** Reads a chosen file as a circuit, with the format's own checks and migrations. */
export async function readCircuitFile(file: File, maxBytes: number): Promise<FileResult> {
	if (file.size > maxBytes) return { ok: false, message: `"${file.name}" is ${file.size} bytes; files up to ${maxBytes} bytes open.` }
	const parsed = parseCircuitJson(await file.text())
	if (parsed.ok) return parsed
	const reasons = parsed.errors.map((error) => (error.path ? `${error.path}: ${error.message}` : error.message)).join("\n")
	return { ok: false, message: `Couldn't open "${file.name}":\n${reasons}` }
}

/** Offers the circuit to the browser as a download. */
export function downloadCircuit(circuit: Circuit, document: Document): void {
	offerDownload(new Blob([serializeCircuit(circuit)], { type: "application/json" }), fileNameFor(circuit), document)
}

/** Hands a file to the browser's download. */
export function offerDownload(blob: Blob, name: string, document: Document): void {
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = name
	link.click()
	// Revoke after the click has been handled, or some browsers cancel the download.
	setTimeout(() => URL.revokeObjectURL(url))
}
