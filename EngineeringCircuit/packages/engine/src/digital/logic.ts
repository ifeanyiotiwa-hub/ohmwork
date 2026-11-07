import type { ComponentType } from "@engineering-circuit/format"

/** What a logic part remembers: a stored value (latch or flip-flop Q, counter count) and its last clock level. */
export type LogicState = { value: number; clock: boolean }

type Step = (inputs: readonly boolean[], state: LogicState) => { outputs: boolean[]; state: LogicState }

/** A logic part reads its input pins as bits and drives its output pins to 0 V or logic high. */
export type LogicPart = { inputs: readonly string[]; outputs: readonly string[]; step: Step }

const COUNTER_MODULUS = 16

/** Segments a–g lit for each code 0–F (CircuitJS1 SevenSegDecoderElm.symbols). */
const SEVEN_SEGMENT_CODES = [
	"1111110", "0110000", "1101101", "1111001", "0110011", "1011011", "1011111", "1110000",
	"1111111", "1111011", "1110111", "0011111", "1001110", "0111101", "1001111", "1000111",
]

const gate =
	(truth: (a: boolean, b: boolean) => boolean): LogicPart => ({
		inputs: ["a", "b"],
		outputs: ["out"],
		step: ([a = false, b = false], state) => ({ outputs: [truth(a, b)], state }),
	})

const withQ = (value: number, clock: boolean) => ({ outputs: [value === 1, value !== 1], state: { value, clock } })

/** A flip-flop that acts on the clock's rising edge (input 1 is the clock). */
const edgeTriggered =
	(inputs: readonly [string, string, ...string[]], next: (bits: readonly boolean[], value: number) => number): LogicPart => ({
		inputs,
		outputs: ["q", "qNot"],
		step: (bits, state) => {
			const clock = bits[1] ?? false
			const rising = clock && !state.clock
			return withQ(rising ? next(bits, state.value) : state.value, clock)
		},
	})

export type LogicType = Extract<
	ComponentType,
	| "not-gate"
	| "and-gate"
	| "or-gate"
	| "nand-gate"
	| "nor-gate"
	| "xor-gate"
	| "xnor-gate"
	| "sr-latch"
	| "sr-latch-inverted"
	| "d-flip-flop"
	| "t-flip-flop"
	| "jk-flip-flop"
	| "counter-4bit"
	| "bcd-to-seven-segment"
>

export const LOGIC_PARTS: Readonly<Record<LogicType, LogicPart>> = {
	"not-gate": { inputs: ["in"], outputs: ["out"], step: ([input = false], state) => ({ outputs: [!input], state }) },
	"and-gate": gate((a, b) => a && b),
	"or-gate": gate((a, b) => a || b),
	"nand-gate": gate((a, b) => !(a && b)),
	"nor-gate": gate((a, b) => !(a || b)),
	"xor-gate": gate((a, b) => a !== b),
	"xnor-gate": gate((a, b) => a === b),
	// NOR latch: S sets, R resets; both at 1 forces Q and Q̄ to 0 (the "forbidden" state).
	"sr-latch": {
		inputs: ["s", "r"],
		outputs: ["q", "qNot"],
		step: ([set = false, reset = false], state) => {
			if (set && reset) return { outputs: [false, false], state }
			return withQ(set ? 1 : reset ? 0 : state.value, state.clock)
		},
	},
	// NAND latch, active low: S̄ = 0 sets, R̄ = 0 resets; both at 0 forces Q and Q̄ to 1.
	"sr-latch-inverted": {
		inputs: ["sNot", "rNot"],
		outputs: ["q", "qNot"],
		step: ([setNot = true, resetNot = true], state) => {
			if (!setNot && !resetNot) return { outputs: [true, true], state }
			return withQ(!setNot ? 1 : !resetNot ? 0 : state.value, state.clock)
		},
	},
	"d-flip-flop": edgeTriggered(["d", "clk"], ([d = false]) => (d ? 1 : 0)),
	"t-flip-flop": edgeTriggered(["t", "clk"], ([t = false], value) => (t ? 1 - value : value)),
	"jk-flip-flop": edgeTriggered(["j", "clk", "k"], ([j = false, , k = false], value) => {
		if (j && k) return 1 - value
		if (j) return 1
		if (k) return 0
		return value
	}),
	// CircuitJS1 SevenSegDecoderElm: segments a–g for 0–9 and A–F.
	"bcd-to-seven-segment": {
		inputs: ["d0", "d1", "d2", "d3"],
		outputs: ["a", "b", "c", "d", "e", "f", "g"],
		step: (bits, state) => {
			const code = bits.reduce((sum, bit, index) => sum + (bit ? 1 << index : 0), 0)
			const pattern = SEVEN_SEGMENT_CODES[code] ?? "0000000"
			return { outputs: [...pattern].map((segment) => segment === "1"), state }
		},
	},
	// Counts rising clock edges; reset (active high) clears it at once.
	"counter-4bit": {
		inputs: ["clk", "reset"],
		outputs: ["q0", "q1", "q2", "q3"],
		step: ([clock = false, reset = false], state) => {
			const rising = clock && !state.clock
			const value = reset ? 0 : rising ? (state.value + 1) % COUNTER_MODULUS : state.value
			return { outputs: [0, 1, 2, 3].map((bit) => ((value >> bit) & 1) === 1), state: { value, clock } }
		},
	},
}

/** A logic part's outputs and state, carried between solves. */
export type LogicMemory = { state: LogicState; outputs: readonly boolean[] }

const INITIAL_STATE: LogicState = { value: 0, clock: false }

/** Before anything is solved: every input reads 0. */
export function initialMemory(part: LogicPart): LogicMemory {
	const { outputs, state } = part.step(
		part.inputs.map(() => false),
		INITIAL_STATE,
	)
	return { state, outputs }
}

export const logicPartOf = (type: ComponentType): LogicPart | undefined =>
	type in LOGIC_PARTS ? LOGIC_PARTS[type as LogicType] : undefined
