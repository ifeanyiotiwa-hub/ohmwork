import { expect, test } from "vitest"
import { createCircuit } from "../../src/schema/circuit"
import { voltageDivider } from "../fixtures/voltage-divider"
import { buildNets, pinKey } from "../../src/topology/nets"

const netKeys = (circuit = voltageDivider()) =>
	buildNets(circuit).map((net) => ({ pins: net.pins.map(pinKey), isGround: net.isGround }))

test("voltage divider has top, middle, and ground nets", () => {
	expect(netKeys()).toEqual([
		{ pins: ["V1:positive", "R1:a"], isGround: false },
		{ pins: ["V1:negative", "R2:b", "GND:terminal"], isGround: true },
		{ pins: ["R1:b", "R2:a"], isGround: false },
	])
})

test("unconnected pins get their own net", () => {
	const circuit = createCircuit("Lonely")
	circuit.components.push({ id: "R1", type: "resistor", position: { x: 0, y: 0 }, rotation: 0, params: { resistance: 1, powerRating: 0.25 } })

	expect(netKeys(circuit)).toEqual([
		{ pins: ["R1:a"], isGround: false },
		{ pins: ["R1:b"], isGround: false },
	])
})

test("net indexes are sequential", () => {
	expect(buildNets(voltageDivider()).map((net) => net.index)).toEqual([0, 1, 2])
})
