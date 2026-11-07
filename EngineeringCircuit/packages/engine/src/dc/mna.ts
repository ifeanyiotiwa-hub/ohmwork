// Modified nodal analysis; stamp conventions follow CircuitJS1 (Paul Falstad, GPL-2.0) SimulationManager.stamp*.
import { DenseMatrix } from "../linear/dense-matrix"
import { solveLinear } from "../linear/lu"
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
		.filter((branch) => branch.kind === "voltage")
		.forEach((branch) => rowOfSource.set(branch, rowOfNet.size + rowOfSource.size))

	const size = rowOfNet.size + rowOfSource.size
	const matrix = new DenseMatrix(size)
	const rightSide = new Array<number>(size).fill(0)

	const add = (row: number | undefined, column: number | undefined, amount: number) => {
		if (row !== undefined && column !== undefined) matrix.add(row, column, amount)
	}
	const addRight = (row: number | undefined, amount: number) => {
		if (row !== undefined) rightSide[row] = (rightSide[row] ?? 0) + amount
	}

	for (const branch of branches) {
		const first = rowOfNet.get(branch.nets[0])
		const second = rowOfNet.get(branch.nets[1])
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
				add(first, source, 1)
				add(second, source, -1)
				add(source, first, 1)
				add(source, second, -1)
				addRight(source, branch.voltage)
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

	const branchCurrents = branches.map((branch) => {
		switch (branch.kind) {
			case "resistor":
				return voltageAcross(branch) / branch.resistance
			case "current":
				return -branch.current
			case "voltage":
				return solution[rowOfSource.get(branch) ?? -1] ?? 0
		}
	})

	return { netVoltages, branchCurrents }
}
