import { test } from "vitest"
import { solveDc } from "../../src/dc/solve-dc"
import { circuitOf, expectClose } from "../support/circuit-of"

// Expected values: `ngspice -b test/golden/ngspice/wheatstone-bridge.cir` (ngspice 47),
// matching the hand solution V(a) = 480/77, V(b) = 230/77.
test("unbalanced Wheatstone bridge matches ngspice", () => {
	const result = solveDc(
		circuitOf(
			[
				{ id: "V1", type: "voltage-source", params: { voltage: 10 } },
				{ id: "R1", type: "resistor", params: { resistance: 1000 } },
				{ id: "R2", type: "resistor", params: { resistance: 2000 } },
				{ id: "R3", type: "resistor", params: { resistance: 3000 } },
				{ id: "R4", type: "resistor", params: { resistance: 1000 } },
				{ id: "R5", type: "resistor", params: { resistance: 5000 } },
				{ id: "GND", type: "ground", params: {} },
			],
			[
				["V1.positive", "R1.a"],
				["V1.positive", "R3.a"],
				["R1.b", "R2.a"],
				["R3.b", "R4.a"],
				["R1.b", "R5.a"],
				["R3.b", "R5.b"],
				["R2.b", "GND.terminal"],
				["R4.b", "GND.terminal"],
				["V1.negative", "GND.terminal"],
			],
		),
	)
	if (!result.ok) throw new Error(JSON.stringify(result.errors))
	const { pinVoltages, readings } = result.solution

	expectClose(pinVoltages["R5:a"], 6.233766, 1e-6)
	expectClose(pinVoltages["R5:b"], 2.987013, 1e-6)
	expectClose(readings.R5?.current, 6.493506e-4, 1e-6)
	expectClose(readings.V1?.current, -6.1039e-3, 1e-5)
})
