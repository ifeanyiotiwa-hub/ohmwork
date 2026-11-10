import { createCircuit, serializeCircuit } from "@ohmwork/format"
import { expect, test } from "vitest"
import { fileNameFor, readCircuitFile } from "./circuit-files"

test("file names come from the circuit name, made safe for any system", () => {
	expect(fileNameFor({ ...createCircuit("Night light: v2/final") })).toBe("night-light-v2-final.circuit.json")
	expect(fileNameFor(createCircuit("   "))).toBe("circuit.circuit.json")
})

test("a saved file opens again", async () => {
	const circuit = createCircuit("Divider")
	const file = new File([serializeCircuit(circuit)], "divider.circuit.json", { type: "application/json" })
	expect(await readCircuitFile(file, 1024 * 1024)).toEqual({ ok: true, circuit })
})

test("a file that is too big, or not a circuit, is explained rather than opened", async () => {
	const big = new File(["x".repeat(2000)], "big.json")
	expect(await readCircuitFile(big, 1000)).toEqual({ ok: false, message: '"big.json" is 2000 bytes; files up to 1000 bytes open.' })
	const other = new File(['{"hello": 1}'], "other.json")
	const result = await readCircuitFile(other, 1000)
	expect(result.ok).toBe(false)
	expect(result.ok ? "" : result.message).toContain("Not an engineering-circuit file")
})
