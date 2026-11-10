import { expect, test } from "vitest"
import { createCircuit } from "../../src/schema/circuit"
import { voltageDivider } from "../fixtures/voltage-divider"
import { buildNets, namedPins, pinKey } from "../../src/topology/nets"

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

const at = { position: { x: 0, y: 0 }, rotation: 0 } as const
const label = (id: string, name: string) => ({ id, type: "net-label" as const, ...at, params: { name } })
const resistor = (id: string) => ({ id, type: "resistor" as const, ...at, params: { resistance: 1, powerRating: 0.25 } })

test("net labels with the same name are one net, though no wire joins them; spaces and case don't matter", () => {
	const circuit = createCircuit("Labels")
	circuit.components.push(resistor("R1"), resistor("R2"), label("NL1", "VCC"), label("NL2", " vcc "), label("NL3", "OUT"))
	circuit.wires.push(
		{ id: "w1", from: { componentId: "R1", pin: "a" }, to: { componentId: "NL1", pin: "terminal" }, bends: [] },
		{ id: "w2", from: { componentId: "R2", pin: "a" }, to: { componentId: "NL2", pin: "terminal" }, bends: [] },
		{ id: "w3", from: { componentId: "R2", pin: "b" }, to: { componentId: "NL3", pin: "terminal" }, bends: [] },
	)
	const nets = netKeys(circuit).map((net) => [...net.pins].sort())
	expect(nets).toContainEqual(["NL1:terminal", "NL2:terminal", "R1:a", "R2:a"])
	expect(nets).toContainEqual(["NL3:terminal", "R2:b"])
	expect(nets).toContainEqual(["R1:b"])
})

const bus = (id: string, type: "bus-4" | "bus-8", name: string) => ({ id, type, ...at, params: { name } })

test("bus connectors of one name join pin by pin, and a net label named after a member taps it", () => {
	const circuit = createCircuit("Bus")
	circuit.components.push(bus("BUS1", "bus-8", "D"), bus("BUS2", "bus-8", "d"), bus("BUS3", "bus-4", "D"), label("NL1", "D3"))
	const nets = netKeys(circuit).map((net) => [...net.pins].sort())
	expect(nets).toContainEqual(["BUS1:d0", "BUS2:d0", "BUS3:d0"])
	expect(nets).toContainEqual(["BUS1:d3", "BUS2:d3", "BUS3:d3", "NL1:terminal"])
	expect(nets).toContainEqual(["BUS1:d7", "BUS2:d7"])
	expect(nets.filter((net) => net.some((pin) => pin.startsWith("BUS1:")))).toHaveLength(8)
})

test("named pins: each label, and each bus member as its bus name and number", () => {
	const circuit = createCircuit("Named")
	circuit.components.push(label("NL1", " Vcc "), bus("BUS1", "bus-4", "DATA"))
	expect(namedPins(circuit).map(({ ref, key }) => `${pinKey(ref)}=${key}`)).toEqual([
		"NL1:terminal=label:vcc",
		"BUS1:d0=label:data0",
		"BUS1:d1=label:data1",
		"BUS1:d2=label:data2",
		"BUS1:d3=label:data3",
	])
})
