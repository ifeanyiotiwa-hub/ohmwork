// Modified nodal analysis; stamp conventions follow CircuitJS1 (Paul Falstad, GPL-2.0) SimulationManager.stamp*.
import { DenseMatrix } from "../linear/dense-matrix"
import { solveLinear } from "../linear/lu"
import { VOLTAGE_KINDS } from "./branches"
import type { NetBranch } from "./topology"

export type MnaSolution = {
	netVoltages: number[]
	branchCurrents: number[]
}

export function solveMna(
	netCount: number,
	referenceNets: ReadonlySet<number>,
	branches: readonly NetBranch[],
): MnaSolution | null {
	const rowOfNet = new Map<number, number>()
	for (let net = 0; net < netCount; net++) {
		if (!referenceNets.has(net)) rowOfNet.set(net, rowOfNet.size)
	}
	const rowOfSource = new Map<NetBranch, number>()
	branches
		.filter((branch) => VOLTAGE_KINDS.has(branch.kind))
		.forEach((branch) => rowOfSource.set(branch, rowOfNet.size + rowOfSource.size))
	/** The row of the 0 V sense branch a CCVS / CCCS of the same part reads its current from. */
	const senseRowOf = (branch: NetBranch) =>
		rowOfSource.get(
			branches.find((candidate) => candidate.componentId === branch.componentId && candidate.kind === "voltage" && candidate.sense) ??
				branch,
		)

	const size = rowOfNet.size + rowOfSource.size
	const matrix = new DenseMatrix(size)
	const rightSide = new Array<number>(size).fill(0)

	const add = (row: number | undefined, column: number | undefined, amount: number) => {
		if (row !== undefined && column !== undefined) matrix.add(row, column, amount)
	}
	const addRight = (row: number | undefined, amount: number) => {
		if (row !== undefined) rightSide[row] = (rightSide[row] ?? 0) + amount
	}

	/** Injects `factor` × (the column's unknown) into the first net and draws it from the second. */
	const injectFrom = (first: number | undefined, second: number | undefined, column: number | undefined, factor: number) => {
		add(first, column, -factor)
		add(second, column, factor)
	}
	/** The source row's equation V(first) − V(second) = …, with the branch current in both node rows. */
	const voltageRow = (source: number | undefined, first: number | undefined, second: number | undefined) => {
		add(first, source, 1)
		add(second, source, -1)
		add(source, first, 1)
		add(source, second, -1)
	}

	for (const branch of branches) {
		const first = rowOfNet.get(branch.nets[0])
		const second = rowOfNet.get(branch.nets[1])
		const controlFirst = branch.controlNets ? rowOfNet.get(branch.controlNets[0]) : undefined
		const controlSecond = branch.controlNets ? rowOfNet.get(branch.controlNets[1]) : undefined
		switch (branch.kind) {
			case "resistor": {
				const conductance = 1 / branch.resistance
				add(first, first, conductance)
				add(second, second, conductance)
				add(first, second, -conductance)
				add(second, first, -conductance)
				break
			}
			case "current":
				addRight(first, branch.current)
				addRight(second, -branch.current)
				break
			case "voltage": {
				const source = rowOfSource.get(branch)
				voltageRow(source, first, second)
				addRight(source, branch.voltage)
				break
			}
			case "vcvs": {
				const source = rowOfSource.get(branch)
				voltageRow(source, first, second)
				add(source, controlFirst, -branch.gain)
				add(source, controlSecond, branch.gain)
				break
			}
			case "ccvs": {
				const source = rowOfSource.get(branch)
				voltageRow(source, first, second)
				add(source, senseRowOf(branch), -branch.transresistance)
				break
			}
			case "vccs":
				injectFrom(first, second, controlFirst, branch.transconductance)
				injectFrom(first, second, controlSecond, -branch.transconductance)
				break
			case "cccs":
				injectFrom(first, second, senseRowOf(branch), branch.gain)
				break
			case "device": {
				// The device draws I = G·V + offset from each terminal's node.
				const rows = (branch.terminalNets ?? []).map((net) => rowOfNet.get(net))
				const linearization = branch.linearization
				if (!linearization) break
				rows.forEach((row, terminal) => {
					rows.forEach((column, other) => add(row, column, linearization.conductance[terminal]?.[other] ?? 0))
					addRight(row, -(linearization.offset[terminal] ?? 0))
				})
				break
			}
		}
	}

	const solution = solveLinear(matrix, rightSide)
	if (!solution) return null

	const netVoltages = Array.from({ length: netCount }, (_, net) => {
		const row = rowOfNet.get(net)
		return row === undefined ? 0 : (solution[row] ?? 0)
	})
	const voltageAcross = (branch: NetBranch) =>
		(netVoltages[branch.nets[0]] ?? 0) - (netVoltages[branch.nets[1]] ?? 0)

	const voltageAt = (net: number | undefined) => (net === undefined ? 0 : (netVoltages[net] ?? 0))
	const unknown = (row: number | undefined) => (row === undefined ? 0 : (solution[row] ?? 0))

	// Each branch's current into its first pin.
	const branchCurrents = branches.map((branch) => {
		switch (branch.kind) {
			case "resistor":
				return voltageAcross(branch) / branch.resistance
			case "current":
				return -branch.current
			case "voltage":
			case "vcvs":
			case "ccvs":
				return unknown(rowOfSource.get(branch))
			case "vccs":
				return -branch.transconductance * (voltageAt(branch.controlNets?.[0]) - voltageAt(branch.controlNets?.[1]))
			case "cccs":
				return -branch.gain * unknown(senseRowOf(branch))
			case "device":
				return terminalCurrents(branch, netVoltages)[0] ?? 0
		}
	})

	return { netVoltages, branchCurrents }
}

/** A device's current into each terminal at the given net voltages, from its linearization. */
export function terminalCurrents(branch: NetBranch, netVoltages: readonly number[]): number[] {
	const voltages = (branch.terminalNets ?? []).map((net) => netVoltages[net] ?? 0)
	const linearization = branch.linearization
	if (!linearization) return voltages.map(() => 0)
	return voltages.map(
		(_, terminal) =>
			voltages.reduce((sum, voltage, other) => sum + (linearization.conductance[terminal]?.[other] ?? 0) * voltage, 0) +
			(linearization.offset[terminal] ?? 0),
	)
}
