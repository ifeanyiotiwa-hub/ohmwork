// The 555's control logic, as CircuitJS1 TimerElm.startIteration: comparators against the control voltage set or
// reset an internal latch once per step; the analog side (divider, output, discharge) is in dc/branches.ts.
import type { LogicMemory } from "./logic"
import type { Sequential } from "./sequential"

/** Below this many volts above ground, reset forces the output low. */
const RESET_THRESHOLD = 0.7

/** outputs[0]: the latch (output high). state.value: 1 while reset is holding back an active trigger. */
export const TIMER_555: Sequential = {
	// CircuitJS1 starts a 555 with its output high.
	initial: (): LogicMemory => ({ outputs: [true], state: { value: 0, clock: false } }),
	next: (memory, voltageOf) => {
		const ground = voltageOf("ground")
		const control = voltageOf("control")
		let high = memory.outputs[0] ?? true
		if (voltageOf("threshold") > control) high = false
		// The trigger wins over threshold; remember it while reset holds it back (reset tied to trigger).
		const triggered = (control + ground) / 2 > voltageOf("trigger")
		if (triggered || memory.state.value === 1) high = true
		let suppressed = false
		if (voltageOf("reset") < RESET_THRESHOLD + ground) {
			high = false
			suppressed = triggered
		}
		return { outputs: [high], state: { value: suppressed ? 1 : 0, clock: false } }
	},
}
