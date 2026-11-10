// AC (small-signal) analysis, as SPICE's .ac: the circuit is solved for its DC operating point, every part is replaced
// by its linear behaviour there, and the result is solved with phasors at each frequency of a sweep. The AC sources
// are the input (their amplitude and phase); every other source is zero (a voltage source a short, a current source an
// open). Capacitors are admittances jωC, inductors and transformer windings impedances jωL (with their mutual
// coupling), and diodes and transistors their small-signal conductances plus the capacitance of their stored charge.
import { type Circuit, type Component, expandSubcircuits, pinKey } from "@ohmwork/format"
import type { SimIssue } from "../dc/issues"
import { type OperatingPoint, operatingPoint } from "../dc/solve-dc"
import type { NetBranch } from "../dc/topology"
import { initialMemories } from "../digital/advance"
import { type Complex, ComplexMatrix, complex, over, solveComplex, times } from "../linear/complex"

export type AcSweep = { start: number; stop: number; pointsPerDecade: number }
/** Each pin's voltage phasor (volts, radians) at one frequency, keyed like DC pin voltages ("R1:a"). */
export type AcPoint = { frequency: number; pinVoltages: Record<string, Complex> }
export type AcResult = { ok: true; points: AcPoint[]; inputs: string[] } | { ok: false; errors: SimIssue[] }

/** A coupled set of windings (an inductor is one): V(winding i) = Σ jω·L[i][j]·I(j). */
type Windings = { componentId: string; nets: [number, number][]; inductance: number[][]; resistance?: number[] }
type Equations = {
	point: OperatingPoint
	parts: Map<string, Component>
	windings: Windings[]
	/** Capacitances between two nets (a capacitor, a MOSFET's gate). */
	capacitances: { nets: [number, number]; capacitance: number }[]
}

/** Frequencies of a sweep, evenly spaced on a log scale, both ends included (one point when they are the same). */
export function sweepFrequencies({ start, stop, pointsPerDecade }: AcSweep): number[] {
	if (stop <= start) return [start]
	const decades = Math.log10(stop / start)
	const count = Math.max(1, Math.round(decades * pointsPerDecade))
	return Array.from({ length: count + 1 }, (_, index) => start * 10 ** ((decades * index) / count))
}

export function solveAc(given: Circuit, sweep: AcSweep | { frequencies: readonly number[] }): AcResult {
	// Chips are seen as their parts (format expandSubcircuits; cached, so calling it again costs nothing).
	const circuit = expandSubcircuits(given)
	const inputs = circuit.components.filter((component) => component.type === "ac-source").map((component) => component.id)
	if (inputs.length === 0) {
		return { ok: false, errors: [{ componentIds: [], message: "A frequency response needs an AC source as its input." }] }
	}
	const solved = operatingPoint(circuit, { logic: initialMemories(circuit) })
	if (!solved.ok) return solved
	const equations = equationsOf(circuit, solved.point)
	const frequencies = "frequencies" in sweep ? sweep.frequencies : sweepFrequencies(sweep)
	const points: AcPoint[] = []
	for (const frequency of frequencies) {
		const netVoltages = solveAt(equations, 2 * Math.PI * frequency)
		if (!netVoltages) return { ok: false, errors: [{ componentIds: [], message: `At ${frequency} Hz the circuit's equations have no single solution.` }] }
		points.push({ frequency, pinVoltages: pinPhasors(solved.point, netVoltages) })
	}
	return { ok: true, points, inputs }
}

const INDUCTIVE = new Set(["inductor", "transformer", "tapped-transformer"])

/** The reactive parts' AC models, which the DC netlist has as wires (inductors) or not at all (capacitors). */
function equationsOf(circuit: Circuit, point: OperatingPoint): Equations {
	const parts = new Map(circuit.components.map((part) => [part.id, part]))
	const nets = (id: string, first: string, second: string): [number, number] => [point.netOf(id, first), point.netOf(id, second)]
	const windings: Windings[] = []
	const capacitances: Equations["capacitances"] = []
	for (const part of circuit.components) {
		switch (part.type) {
			case "capacitor":
				capacitances.push({ nets: nets(part.id, "a", "b"), capacitance: part.params.capacitance })
				break
			case "polarized-capacitor":
				capacitances.push({ nets: nets(part.id, "positive", "negative"), capacitance: part.params.capacitance })
				break
			case "n-mosfet":
			case "p-mosfet":
				capacitances.push({ nets: nets(part.id, "gate", "source"), capacitance: part.params.gateSourceCapacitance })
				capacitances.push({ nets: nets(part.id, "gate", "drain"), capacitance: part.params.gateDrainCapacitance })
				break
			case "inductor":
				windings.push({ componentId: part.id, nets: [nets(part.id, "a", "b")], inductance: [[part.params.inductance]] })
				break
			case "transformer": {
				const { primaryInductance: primary, turnsRatio, coupling } = part.params
				windings.push(coupledWindings(part.id, [nets(part.id, "primaryA", "primaryB"), nets(part.id, "secondaryA", "secondaryB")], [primary, primary * turnsRatio ** 2], coupling))
				break
			}
			case "tapped-transformer": {
				const { primaryInductance: primary, turnsRatio, coupling } = part.params
				const half = primary * (turnsRatio / 2) ** 2
				windings.push(
					coupledWindings(
						part.id,
						[nets(part.id, "primaryA", "primaryB"), nets(part.id, "secondaryA", "secondaryTap"), nets(part.id, "secondaryTap", "secondaryB")],
						[primary, half, half],
						coupling,
					),
				)
				break
			}
			case "relay":
				windings.push({
					componentId: part.id,
					nets: [nets(part.id, "coilA", "coilB")],
					inductance: [[part.params.coilInductance]],
					resistance: [part.params.coilResistance],
				})
				break
			default:
				break
		}
	}
	return { point, parts, windings, capacitances }
}

const coupledWindings = (componentId: string, nets: [number, number][], inductances: number[], coupling: number): Windings => ({
	componentId,
	nets,
	inductance: inductances.map((row, i) => inductances.map((column, j) => (i === j ? row : coupling * Math.sqrt(row * column)))),
})

/** The DC branches a reactive part has that its AC model replaces: an inductor's wire, a relay coil's resistor. */
const replacedByWindings = (branch: NetBranch, parts: ReadonlyMap<string, Component>) => {
	const type = parts.get(branch.componentId)?.type
	return (type !== undefined && INDUCTIVE.has(type)) || (type === "relay" && branch.port === "coil")
}

function solveAt({ point, parts, windings, capacitances }: Equations, omega: number): Complex[] | null {
	const { nets, referenceNets, branches } = point
	const rowOfNet = new Map<number, number>()
	nets.forEach((_, net) => {
		if (!referenceNets.has(net)) rowOfNet.set(net, rowOfNet.size)
	})
	let size = rowOfNet.size
	const extraRow = () => size++
	const kept = branches.filter((branch) => !replacedByWindings(branch, parts))
	const sourceRow = new Map<NetBranch, number>()
	for (const branch of kept) if (branch.kind === "voltage" || branch.kind === "vcvs" || branch.kind === "ccvs") sourceRow.set(branch, extraRow())
	const windingRows = windings.map((set) => set.nets.map(() => extraRow()))
	const senseRowOf = (branch: NetBranch) =>
		sourceRow.get(kept.find((candidate) => candidate.componentId === branch.componentId && candidate.kind === "voltage" && candidate.sense) ?? branch)

	const matrix = new ComplexMatrix(size)
	const right: Complex[] = Array.from({ length: size }, () => complex(0))
	const add = (row: number | undefined, column: number | undefined, amount: Complex) => {
		if (row !== undefined && column !== undefined) matrix.add(row, column, amount)
	}
	const admittance = (first: number | undefined, second: number | undefined, y: Complex) => {
		add(first, first, y)
		add(second, second, y)
		add(first, second, times(complex(-1), y))
		add(second, first, times(complex(-1), y))
	}
	const voltageRow = (row: number | undefined, first: number | undefined, second: number | undefined) => {
		add(first, row, complex(1))
		add(second, row, complex(-1))
		add(row, first, complex(1))
		add(row, second, complex(-1))
	}
	const row = (net: number | undefined) => (net === undefined ? undefined : rowOfNet.get(net))

	for (const branch of kept) {
		const first = row(branch.nets[0])
		const second = row(branch.nets[1])
		const controlFirst = row(branch.controlNets?.[0])
		const controlSecond = row(branch.controlNets?.[1])
		switch (branch.kind) {
			case "resistor":
				admittance(first, second, complex(1 / branch.resistance))
				break
			case "current":
				break
			case "voltage": {
				const source = sourceRow.get(branch)
				voltageRow(source, first, second)
				const part = parts.get(branch.componentId)
				if (part?.type === "ac-source" && source !== undefined) {
					const phase = (part.params.phase * Math.PI) / 180
					right[source] = complex(part.params.amplitude * Math.cos(phase), part.params.amplitude * Math.sin(phase))
				}
				break
			}
			case "vcvs": {
				const source = sourceRow.get(branch)
				voltageRow(source, first, second)
				add(source, controlFirst, complex(-branch.gain))
				add(source, controlSecond, complex(branch.gain))
				break
			}
			case "ccvs": {
				const source = sourceRow.get(branch)
				voltageRow(source, first, second)
				add(source, senseRowOf(branch), complex(-branch.transresistance))
				break
			}
			case "vccs":
				add(first, controlFirst, complex(branch.transconductance))
				add(first, controlSecond, complex(-branch.transconductance))
				add(second, controlFirst, complex(-branch.transconductance))
				add(second, controlSecond, complex(branch.transconductance))
				break
			case "cccs":
				add(first, senseRowOf(branch), complex(branch.gain))
				add(second, senseRowOf(branch), complex(-branch.gain))
				break
			case "device": {
				const terminalNets = branch.terminalNets ?? []
				const rows = terminalNets.map(row)
				const linearization = branch.linearization
				if (!linearization) break
				const voltages = terminalNets.map((net) => point.mna.netVoltages[net] ?? 0)
				const small = branch.device.acAdmittance?.(voltages, linearization, omega) ??
					linearization.conductance.map((line) => line.map((value) => complex(value)))
				rows.forEach((terminalRow, terminal) => rows.forEach((column, other) => add(terminalRow, column, small[terminal]?.[other] ?? complex(0))))
				break
			}
		}
	}
	for (const { nets: [a, b], capacitance } of capacitances) admittance(row(a), row(b), complex(0, omega * capacitance))
	windings.forEach((set, index) => {
		const rows = windingRows[index] ?? []
		set.nets.forEach(([a, b], i) => {
			const current = rows[i]
			voltageRow(current, row(a), row(b))
			set.nets.forEach((_, j) => {
				const z = complex(i === j ? (set.resistance?.[i] ?? 0) : 0, omega * (set.inductance[i]?.[j] ?? 0))
				add(current, rows[j], times(complex(-1), z))
			})
		})
	})

	const solution = solveComplex(matrix, right)
	if (!solution) return null
	return nets.map((_, net) => {
		const at = rowOfNet.get(net)
		return at === undefined ? complex(0) : (solution[at] ?? complex(0))
	})
}

function pinPhasors(point: OperatingPoint, netVoltages: readonly Complex[]): Record<string, Complex> {
	return Object.fromEntries(point.nets.flatMap((net, index) => net.pins.map((pin): [string, Complex] => [pinKey(pin), netVoltages[index] ?? complex(0)])))
}

/** Gain in decibels and phase in radians of `output` relative to `input`. */
export function gainAndPhase(output: Complex, input: Complex): { decibels: number; phase: number } {
	const ratio = over(output, input)
	return { decibels: 20 * Math.log10(Math.hypot(ratio.re, ratio.im)), phase: Math.atan2(ratio.im, ratio.re) }
}
