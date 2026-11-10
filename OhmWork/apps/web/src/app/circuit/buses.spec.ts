import { type Circuit, type Component, createCircuit } from "@ohmwork/format"
import { expect, test } from "vitest"
import { busLines } from "./buses"

const connector = (id: string, name: string, x: number, rotation: Component["rotation"] = 0): Component =>
	({ id, type: "bus-8", params: { name }, position: { x, y: 0 }, rotation }) as Component

const circuitWith = (...components: Component[]): Circuit => ({ ...createCircuit("Buses"), components })
const at = (part: Component) => part.position

test("connectors of one name are joined by one bus line each, in circuit order; a lone connector has none", () => {
	const lines = busLines(circuitWith(connector("A", "D", 0), connector("B", "d", 200), connector("C", "D", 400), connector("E", "OTHER", 600)), at, 20)
	expect(lines.map((line) => [line.from, line.to])).toEqual([
		["A", "B"],
		["B", "C"],
	])
})

test("a line leaves each connector from its bus side, turned with the part", () => {
	// A at 0 faces right: its bus leaves at (20, 0). B at 200 turned 180° faces left: its bus leaves at (180, 0).
	const [line] = busLines(circuitWith(connector("A", "D", 0), connector("B", "D", 200, 180)), at, 20)
	expect(line?.points[0]).toEqual({ x: 20, y: 0 })
	expect(line?.points.at(-1)).toEqual({ x: 180, y: 0 })
})
