import { expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { circuitOf } from "../support/circuit-of"

type Parts = Parameters<typeof circuitOf>[0]
type Wires = Parameters<typeof circuitOf>[1]

const input = (id: string, high: boolean) => ({ id, type: "logic-input", params: { high } }) as const
const buffer = (id: string) => ({ id, type: "tri-state-buffer", params: {} }) as const
const GROUND = { id: "GND", type: "ground", params: {} } as const
const load = (id: string, resistance: number) => ({ id, type: "resistor", params: { resistance } }) as const

function solved(parts: Parts, wires: Wires) {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return result.solution
}

/** A buffer with its input and enable set, into a 1 kΩ load. */
function driving(level: boolean, enabled: boolean) {
	return solved(
		[input("IN", level), input("EN", enabled), buffer("TRI1"), load("RL", 1000), GROUND],
		[["IN.out", "TRI1.in"], ["EN.out", "TRI1.enable"], ["TRI1.out", "RL.a"], ["RL.b", "GND.terminal"]],
	)
}

test("enabled, it drives its input's level through its 30 Ω output (SN74HC125)", () => {
	expect(driving(true, true).pinVoltages["TRI1:out"]).toBeCloseTo((5 * 1000) / 1030, 6)
	expect(driving(false, true).pinVoltages["TRI1:out"]).toBeCloseTo(0, 9)
	expect(driving(true, true).warnings).toEqual([])
})

test("disabled, it lets go of the line: a pull-up holds it high, a load alone low", () => {
	expect(driving(true, false).pinVoltages["TRI1:out"]).toBeCloseTo(0, 6)
	const pulledUp = solved(
		[input("IN", false), input("EN", false), buffer("TRI1"), { id: "VR1", type: "voltage-rail", params: { voltage: 5 } }, load("RP", 10e3)],
		[["IN.out", "TRI1.in"], ["EN.out", "TRI1.enable"], ["VR1.terminal", "RP.a"], ["RP.b", "TRI1.out"]],
	)
	// Only its leakage (0.01 µA at 6 V: 600 MΩ) pulls against the 10 kΩ.
	expect(pulledUp.pinVoltages["TRI1:out"]).toBeGreaterThan(4.999)
	expect(pulledUp.warnings).toEqual([])
})

/** Two buffers on one bus line, A trying to send 1 and B 0, with a 10 kΩ load on the line. */
function bus(enableA: boolean, enableB: boolean) {
	return solved(
		[input("A", true), input("B", false), input("ENA", enableA), input("ENB", enableB), buffer("TRI1"), buffer("TRI2"), load("RL", 10e3), GROUND],
		[
			["A.out", "TRI1.in"],
			["B.out", "TRI2.in"],
			["ENA.out", "TRI1.enable"],
			["ENB.out", "TRI2.enable"],
			["TRI1.out", "TRI2.out"],
			["TRI2.out", "RL.a"],
			["RL.b", "GND.terminal"],
		],
	)
}

test("on a shared bus the line follows whichever buffer is enabled", () => {
	expect(bus(true, false).pinVoltages["RL:a"]).toBeGreaterThan(4.9)
	expect(bus(false, true).pinVoltages["RL:a"]).toBeLessThan(0.1)
	expect(bus(true, false).warnings).toEqual([])
	expect(bus(false, true).warnings).toEqual([])
})

test("two enabled buffers fighting over the bus pass more than their 35 mA: both would burn out", () => {
	const fight = bus(true, true)
	// 5 V across two 30 Ω outputs (and the load): about 83 mA, the line half-way.
	expect(fight.pinVoltages["RL:a"]).toBeCloseTo(2.5, 1)
	const burning = fight.warnings.filter((warning) => warning.kind === "burn-out")
	expect(burning.flatMap((warning) => warning.componentIds).sort()).toEqual(["TRI1", "TRI2"])
	expect(burning[0]?.message).toContain("83")
	expect(burning[0]?.message).toContain("only one")
})
