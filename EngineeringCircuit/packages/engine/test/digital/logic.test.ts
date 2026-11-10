import type { Circuit } from "@ohmwork/format"
import { describe, expect, test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { type TransientState, initialTransientState, stepTransient } from "../../src/transient/step"
import { circuitOf } from "../support/circuit-of"

type Parts = Parameters<typeof circuitOf>[0]
type Wires = Parameters<typeof circuitOf>[1]
const HIGH = 5
const TIME_STEP = 5e-6

const input = (id: string, high: boolean) => ({ id, type: "logic-input", params: { high } }) as const

function levels(parts: Parts, wires: Wires, pins: string[]): boolean[] {
	const result = solveDc(circuitOf(parts, wires))
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	return pins.map((pin) => (result.solution.pinVoltages[pin] ?? 0) > HIGH / 2)
}

const TRUTH: Record<string, (a: boolean, b: boolean) => boolean> = {
	"and-gate": (a, b) => a && b,
	"or-gate": (a, b) => a || b,
	"nand-gate": (a, b) => !(a && b),
	"nor-gate": (a, b) => !(a || b),
	"xor-gate": (a, b) => a !== b,
	"xnor-gate": (a, b) => a === b,
}

describe("gates", () => {
	for (const [type, truth] of Object.entries(TRUTH)) {
		test(`${type} truth table`, () => {
			for (const a of [false, true]) {
				for (const b of [false, true]) {
					const [out] = levels(
						[input("A", a), input("B", b), { id: "G1", type, params: {} } as Parts[number]],
						[["A.out", "G1.a"], ["B.out", "G1.b"]],
						["G1:out"],
					)
					expect(out, `${type}(${a}, ${b})`).toBe(truth(a, b))
				}
			}
		})
	}

	const WIDE: Record<string, (bits: boolean[]) => boolean> = {
		and: (bits) => bits.every(Boolean),
		or: (bits) => bits.some(Boolean),
		nand: (bits) => !bits.every(Boolean),
		nor: (bits) => !bits.some(Boolean),
	}
	for (const [kind, truth] of Object.entries(WIDE)) {
		for (const width of [3, 4]) {
			const type = `${kind}-gate-${width}`
			test(`${type} truth table (all ${2 ** width} input combinations)`, () => {
				const pins = ["a", "b", "c", "d"].slice(0, width)
				for (let code = 0; code < 2 ** width; code++) {
					const bits = pins.map((_pin, index) => ((code >> index) & 1) === 1)
					const [out] = levels(
						[...pins.map((pin, index) => input(`IN_${pin}`, bits[index] ?? false)), { id: "G1", type, params: {} } as Parts[number]],
						pins.map((pin): Wires[number] => [`IN_${pin}.out`, `G1.${pin}`]),
						["G1:out"],
					)
					expect(out, `${type}(${bits.map(Number).join("")})`).toBe(truth(bits))
				}
			})
		}
	}

	test("NOT inverts, and outputs the full logic voltage without any ground symbol placed", () => {
		const result = solveDc(circuitOf([input("A", false), { id: "N1", type: "not-gate", params: {} }], [["A.out", "N1.in"]]))
		expect(result.ok && result.solution.pinVoltages["N1:out"]).toBe(HIGH)
	})
})

test("a half adder from XOR and AND: sum and carry for every input", () => {
	for (const a of [false, true]) {
		for (const b of [false, true]) {
			const [sum, carry] = levels(
				[input("A", a), input("B", b), { id: "X1", type: "xor-gate", params: {} }, { id: "A1", type: "and-gate", params: {} }],
				[["A.out", "X1.a"], ["B.out", "X1.b"], ["A.out", "A1.a"], ["B.out", "A1.b"]],
				["X1:out", "A1:out"],
			)
			expect([sum, carry]).toEqual([a !== b, a && b])
		}
	}
})

test("a full adder from two XORs, two ANDs and an OR adds three bits", () => {
	for (let value = 0; value < 8; value++) {
		const [a, b, carryIn] = [Boolean(value & 1), Boolean(value & 2), Boolean(value & 4)]
		const [sum, carryOut] = levels(
			[
				input("A", a),
				input("B", b),
				input("CIN", carryIn),
				{ id: "X1", type: "xor-gate", params: {} },
				{ id: "X2", type: "xor-gate", params: {} },
				{ id: "A1", type: "and-gate", params: {} },
				{ id: "A2", type: "and-gate", params: {} },
				{ id: "O1", type: "or-gate", params: {} },
			],
			[
				["A.out", "X1.a"],
				["B.out", "X1.b"],
				["X1.out", "X2.a"],
				["CIN.out", "X2.b"],
				["A.out", "A1.a"],
				["B.out", "A1.b"],
				["X1.out", "A2.a"],
				["CIN.out", "A2.b"],
				["A1.out", "O1.a"],
				["A2.out", "O1.b"],
			],
			["X2:out", "O1:out"],
		)
		const total = Number(a) + Number(b) + Number(carryIn)
		expect([sum, carryOut], `${a} + ${b} + ${carryIn}`).toEqual([Boolean(total & 1), total >= 2])
	}
})

function run(circuit: Circuit | ((time: number) => Circuit), seconds: number, from: TransientState = initialTransientState()) {
	let state = from
	let last: ReturnType<typeof stepTransient> | undefined
	const steps = Math.round(seconds / TIME_STEP)
	for (let step = 0; step < steps; step++) {
		const now = typeof circuit === "function" ? circuit(state.time) : circuit
		last = stepTransient(now, state, { timeStep: TIME_STEP })
		if (!last.ok) throw new Error(JSON.stringify(last.errors))
		state = last.state
	}
	if (!last?.ok) throw new Error("nothing ran")
	return { state, voltages: last.solution.pinVoltages }
}
const bit = (voltages: Record<string, number>, pin: string) => (voltages[pin] ?? 0) > HIGH / 2

test("a 4-bit counter counts rising clock edges and clears on reset", () => {
	const counter = (reset: boolean) =>
		circuitOf(
			[
				{ id: "CLK1", type: "clock", params: { frequency: 1000, dutyCycle: 0.5 } },
				input("RST", reset),
				{ id: "CNT1", type: "counter-4bit", params: {} },
			],
			[["CLK1.out", "CNT1.clk"], ["RST.out", "CNT1.reset"]],
		)
	const { state, voltages } = run(counter(false), 10.5e-3)
	// Rising edges at 0, 1, …, 10 ms: eleven of them, 1011 in binary.
	expect(["q0", "q1", "q2", "q3"].map((pin) => bit(voltages, `CNT1:${pin}`))).toEqual([true, true, false, true])
	const cleared = run(counter(true), 2 * TIME_STEP, state)
	expect(["q0", "q1", "q2", "q3"].map((pin) => bit(cleared.voltages, `CNT1:${pin}`))).toEqual([false, false, false, false])
})

test("a D flip-flop copies D on the rising clock edge only", () => {
	const flipFlop = (d: boolean) =>
		circuitOf(
			[{ id: "CLK1", type: "clock", params: { frequency: 1000, dutyCycle: 0.5 } }, input("D", d), { id: "DFF1", type: "d-flip-flop", params: {} }],
			[["CLK1.out", "DFF1.clk"], ["D.out", "DFF1.d"]],
		)
	const first = run(flipFlop(true), 0.2e-3)
	expect([bit(first.voltages, "DFF1:q"), bit(first.voltages, "DFF1:qNot")]).toEqual([true, false])
	// D falls while the clock is still high: Q holds until the next rising edge at 1 ms.
	const held = run(flipFlop(false), 0.6e-3, first.state)
	expect(bit(held.voltages, "DFF1:q")).toBe(true)
	const next = run(flipFlop(false), 0.3e-3, held.state)
	expect(bit(next.voltages, "DFF1:q")).toBe(false)
})

test("T and JK flip-flops toggle on each rising edge when T, or J and K, are 1", () => {
	const circuit = circuitOf(
		[
			{ id: "CLK1", type: "clock", params: { frequency: 1000, dutyCycle: 0.5 } },
			input("ONE", true),
			{ id: "TFF1", type: "t-flip-flop", params: {} },
			{ id: "JK1", type: "jk-flip-flop", params: {} },
		],
		[["CLK1.out", "TFF1.clk"], ["ONE.out", "TFF1.t"], ["CLK1.out", "JK1.clk"], ["ONE.out", "JK1.j"], ["ONE.out", "JK1.k"]],
	)
	// Edges at 0, 1, 2 ms: three toggles from 0 → 1.
	const { voltages } = run(circuit, 2.5e-3)
	expect([bit(voltages, "TFF1:q"), bit(voltages, "JK1:q")]).toEqual([true, true])
})

test("an SR latch made of two NOR gates remembers the last set or reset", () => {
	const latch = (set: boolean, reset: boolean) =>
		circuitOf(
			[input("S", set), input("R", reset), { id: "N1", type: "nor-gate", params: {} }, { id: "N2", type: "nor-gate", params: {} }],
			[["R.out", "N1.a"], ["N2.out", "N1.b"], ["S.out", "N2.a"], ["N1.out", "N2.b"]],
		)
	const set = run(latch(true, false), 0.1e-3)
	expect(bit(set.voltages, "N1:out")).toBe(true)
	const held = run(latch(false, false), 0.1e-3, set.state)
	expect(bit(held.voltages, "N1:out")).toBe(true)
	const reset = run(latch(false, true), 0.1e-3, held.state)
	expect(bit(reset.voltages, "N1:out")).toBe(false)
})

test("the SR latch parts behave like their gate versions", () => {
	const nor = circuitOf([input("S", true), input("R", false), { id: "SR1", type: "sr-latch", params: {} }], [["S.out", "SR1.s"], ["R.out", "SR1.r"]])
	expect(bit(run(nor, 0.1e-3).voltages, "SR1:q")).toBe(true)
	const nand = circuitOf(
		[input("S", false), input("R", true), { id: "SRN1", type: "sr-latch-inverted", params: {} }],
		[["S.out", "SRN1.sNot"], ["R.out", "SRN1.rNot"]],
	)
	expect(bit(run(nand, 0.1e-3).voltages, "SRN1:q")).toBe(true)
})

const ring = () =>
	circuitOf(
		[{ id: "N1", type: "not-gate", params: {} }, { id: "N2", type: "not-gate", params: {} }, { id: "N3", type: "not-gate", params: {} }],
		[["N1.out", "N2.in"], ["N2.out", "N3.in"], ["N3.out", "N1.in"]],
	)

test("three inverters in a ring oscillate over time (one time step of delay per gate)", () => {
	let state = initialTransientState()
	const seen = new Set<boolean>()
	for (let step = 0; step < 12; step++) {
		const result = stepTransient(ring(), state, { timeStep: TIME_STEP })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		state = result.state
		seen.add(bit(result.solution.pinVoltages, "N1:out"))
	}
	expect([...seen].sort()).toEqual([false, true])
})

test("a DC solve of an oscillator says it never settles", () => {
	const result = solveDc(ring())
	expect(result.ok ? "" : result.errors[0]?.message).toContain("keeps changing")
})

test("mixed signal: a gate lights an LED through 220 Ω like a 5 V supply would (ngspice 14.4541 mA)", () => {
	const result = solveDc(
		circuitOf(
			[
				input("A", true),
				{ id: "BUF", type: "and-gate", params: {} },
				{ id: "R1", type: "resistor", params: { resistance: 220 } },
				{ id: "LED1", type: "led", params: { color: "red", saturationCurrent: 93.2e-12, emissionCoefficient: 3.73, seriesResistance: 0.042, maxBrightnessCurrent: 0.01 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[["A.out", "BUF.a"], ["A.out", "BUF.b"], ["BUF.out", "R1.a"], ["R1.b", "LED1.anode"], ["LED1.cathode", "GND.terminal"]],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	expect(result.solution.readings.LED1?.current).toBeCloseTo(14.4541e-3, 4)
})

test("mixed signal: an analog voltage above half the logic level reads as 1", () => {
	const notOf = (top: number, bottom: number) =>
		levels(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 5 } },
				{ id: "RT", type: "resistor", params: { resistance: top } },
				{ id: "RB", type: "resistor", params: { resistance: bottom } },
				{ id: "GND", type: "ground", params: {} },
				{ id: "N1", type: "not-gate", params: {} },
			],
			[["V1.positive", "RT.a"], ["RT.b", "RB.a"], ["RB.b", "GND.terminal"], ["V1.negative", "GND.terminal"], ["RT.b", "N1.in"]],
			["N1:out"],
		)[0]
	expect(notOf(2000, 3000)).toBe(false)
	expect(notOf(3000, 2000)).toBe(true)
})

test("a voltage rail holds its pin at its voltage from ground", () => {
	const result = solveDc(
		circuitOf(
			[{ id: "VR1", type: "voltage-rail", params: { voltage: 9 } }, { id: "R1", type: "resistor", params: { resistance: 1000 } }, { id: "GND", type: "ground", params: {} }],
			[["VR1.terminal", "R1.a"], ["R1.b", "GND.terminal"]],
		),
	)
	expect(result.ok && result.solution.readings.R1?.current).toBeCloseTo(0.009, 12)
})

test("an unconnected logic input reads 0 without a ground warning", () => {
	const result = solveDc(
		circuitOf(
			[input("CLK", false), { id: "CNT1", type: "counter-4bit", params: {} }],
			[["CLK.out", "CNT1.clk"]],
		),
	)
	expect(result.ok && result.solution.warnings).toEqual([])
})

test("a JK flip-flop sets with J, resets with K, and holds with neither, on rising edges; a T flip-flop holds when T is 0", () => {
	const flipFlops = (j: boolean, k: boolean, t: boolean) =>
		circuitOf(
			[
				{ id: "CLK1", type: "clock", params: { frequency: 1000, dutyCycle: 0.5 } },
				input("J", j),
				input("K", k),
				input("T", t),
				{ id: "JK1", type: "jk-flip-flop", params: {} },
				{ id: "TFF1", type: "t-flip-flop", params: {} },
			],
			[["CLK1.out", "JK1.clk"], ["J.out", "JK1.j"], ["K.out", "JK1.k"], ["CLK1.out", "TFF1.clk"], ["T.out", "TFF1.t"]],
		)
	// Rising edges at 0, 1, 2 ms.
	const set = run(flipFlops(true, false, false), 0.5e-3)
	expect([bit(set.voltages, "JK1:q"), bit(set.voltages, "TFF1:q")]).toEqual([true, false])
	const held = run(flipFlops(false, false, false), 1e-3, set.state)
	expect([bit(held.voltages, "JK1:q"), bit(held.voltages, "TFF1:q")]).toEqual([true, false])
	const reset = run(flipFlops(false, true, false), 1e-3, held.state)
	expect([bit(reset.voltages, "JK1:q"), bit(reset.voltages, "JK1:qNot")]).toEqual([false, true])
})

test("the SR latch parts set, hold and reset", () => {
	const nor = (s: boolean, r: boolean) =>
		circuitOf([input("S", s), input("R", r), { id: "SR1", type: "sr-latch", params: {} }], [["S.out", "SR1.s"], ["R.out", "SR1.r"]])
	const set = run(nor(true, false), 0.1e-3)
	const held = run(nor(false, false), 0.1e-3, set.state)
	const reset = run(nor(false, true), 0.1e-3, held.state)
	expect([set, held, reset].map((step) => bit(step.voltages, "SR1:q"))).toEqual([true, true, false])
	expect(bit(reset.voltages, "SR1:qNot")).toBe(true)

	// The inverted latch acts on low inputs: S̄ = 0 sets, R̄ = 0 resets, both 1 holds.
	const nand = (sNot: boolean, rNot: boolean) =>
		circuitOf(
			[input("S", sNot), input("R", rNot), { id: "SRN1", type: "sr-latch-inverted", params: {} }],
			[["S.out", "SRN1.sNot"], ["R.out", "SRN1.rNot"]],
		)
	const setLow = run(nand(false, true), 0.1e-3)
	const heldHigh = run(nand(true, true), 0.1e-3, setLow.state)
	const resetLow = run(nand(true, false), 0.1e-3, heldHigh.state)
	expect([setLow, heldHigh, resetLow].map((step) => bit(step.voltages, "SRN1:q"))).toEqual([true, true, false])
})

test("with a 3.3 V logic level, outputs are 3.3 V and the threshold is 1.65 V: 2 V reads as 1 (it would read as 0 at 5 V)", () => {
	const notOfTwoVolts = (logicHigh: number) => {
		const circuit = circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 2 } },
				{ id: "GND", type: "ground", params: {} },
				{ id: "N1", type: "not-gate", params: {} },
				{ id: "IN1", type: "logic-input", params: { high: true } },
				{ id: "OUT1", type: "logic-output", params: {} },
			],
			[["V1.positive", "N1.in"], ["V1.negative", "GND.terminal"], ["IN1.out", "OUT1.in"]],
		)
		const result = solveDc({ ...circuit, simulation: { ...circuit.simulation, logicHigh } })
		if (!result.ok) throw new Error(JSON.stringify(result.errors))
		return { not: result.solution.pinVoltages["N1:out"], input: result.solution.pinVoltages["IN1:out"] }
	}
	expect(notOfTwoVolts(3.3)).toEqual({ not: 0, input: 3.3 })
	expect(notOfTwoVolts(5)).toEqual({ not: 5, input: 5 })
})
