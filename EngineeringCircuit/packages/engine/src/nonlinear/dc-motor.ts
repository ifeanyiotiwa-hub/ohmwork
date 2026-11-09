// Permanent-magnet DC motor (the usual textbook model, as in CircuitJS1's DCMotorElm):
//   electrical  v = R·i + L·di/dt + Ke·ω
//   mechanical  J·dω/dt = Kt·i − b·ω
// with Ke = Kt in SI units (V·s/rad = N·m/A). It is linear, so it is exact in one Newton iteration; it uses the
// device interface for its state between steps and its small-signal admittance.
// Over a time step h, backward Euler on both: ω = α·i + β with α = (h·Kt/J)/(1 + h·b/J), β = ω_prev/(1 + h·b/J), so
// v = Z·i + E with Z = R + L/h + Ke·α and E = Ke·β − L·i_prev/h: a resistance and a source in series.
// At DC (steady state) ω = Kt·i/b, so Z = R + Ke·Kt/b and E = 0.
import { type Complex, complex, over, plus } from "../linear/complex"
import type { Device, Linearization } from "./device"

export type DcMotorParams = { resistance: number; inductance: number; torqueConstant: number; inertia: number; damping: number }
/** Over time: the step, and the speed (rad/s) and current at the end of the last one. */
export type DcMotorStep = { timeStep: number; previousSpeed: number; previousCurrent: number }

const A = 0
const B = 1

/** Terminals a, b; current from a to b drives it forwards (positive speed). */
export function dcMotorDevice({ resistance, inductance, torqueConstant, inertia, damping }: DcMotorParams, step?: DcMotorStep): Device {
	/** Speed = slope·i + base. */
	const speedSlope = step ? (step.timeStep * torqueConstant) / inertia / (1 + (step.timeStep * damping) / inertia) : torqueConstant / damping
	const speedBase = step ? step.previousSpeed / (1 + (step.timeStep * damping) / inertia) : 0
	const impedance = resistance + (step ? inductance / step.timeStep : 0) + torqueConstant * speedSlope
	const source = torqueConstant * speedBase - (step ? (inductance * step.previousCurrent) / step.timeStep : 0)
	const currentAt = (voltages: readonly number[]) => ((voltages[A] ?? 0) - (voltages[B] ?? 0) - source) / impedance
	const conductance = 1 / impedance

	return {
		terminals: ["a", "b"],
		conducting: [[A, B]],
		initialState: () => [],
		linearize: (): Linearization => ({
			conductance: [
				[conductance, -conductance],
				[-conductance, conductance],
			],
			offset: [-source * conductance, source * conductance],
			state: [],
			settled: true,
		}),
		// The speed (rad/s, in "voltage") and current at the end of this step, for the next one and the speed reading.
		remember: (voltages) => {
			const current = currentAt(voltages)
			return [{ name: "motion", voltage: speedSlope * current + speedBase, current }]
		},
		// Y = 1 / (R + jωL + Ke·Kt / (b + jωJ)).
		acAdmittance: (_voltages, _linearization, omega) => {
			const backEmf = over(complex(torqueConstant * torqueConstant), complex(damping, omega * inertia))
			const y: Complex = over(complex(1), plus(complex(resistance, omega * inductance), backEmf))
			const negative = complex(-y.re, -y.im)
			return [
				[y, negative],
				[negative, y],
			]
		},
	}
}
