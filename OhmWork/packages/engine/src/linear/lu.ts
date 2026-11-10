import type { DenseMatrix } from "./dense-matrix"

export type LuFactors = { solve(rightSide: readonly number[]): number[] }

export function factorLu(matrix: DenseMatrix): LuFactors | null {
	const lu = matrix.copy()
	const size = lu.size
	const pivotRows: number[] = []

	for (let pivot = 0; pivot < size; pivot++) {
		const pivotRow = rowWithLargestEntry(lu, pivot)
		if (lu.get(pivotRow, pivot) === 0) return null

		lu.swapRows(pivot, pivotRow)
		pivotRows.push(pivotRow)

		for (let row = pivot + 1; row < size; row++) {
			const factor = lu.get(row, pivot) / lu.get(pivot, pivot)
			lu.set(row, pivot, factor)
			for (let column = pivot + 1; column < size; column++) {
				lu.add(row, column, -factor * lu.get(pivot, column))
			}
		}
	}

	return { solve: (rightSide) => substitute(lu, pivotRows, rightSide) }
}

export function solveLinear(matrix: DenseMatrix, rightSide: readonly number[]): number[] | null {
	const solution = factorLu(matrix)?.solve(rightSide)
	return solution?.every(Number.isFinite) ? solution : null
}

function rowWithLargestEntry(lu: DenseMatrix, column: number): number {
	let best = column
	for (let row = column + 1; row < lu.size; row++) {
		if (Math.abs(lu.get(row, column)) > Math.abs(lu.get(best, column))) best = row
	}
	return best
}

function substitute(lu: DenseMatrix, pivotRows: readonly number[], rightSide: readonly number[]): number[] {
	const x = Array.from({ length: lu.size }, (_, index) => rightSide[index] ?? 0)
	const at = (index: number) => x[index] ?? 0

	pivotRows.forEach((pivotRow, row) => {
		const kept = at(row)
		x[row] = at(pivotRow)
		x[pivotRow] = kept
	})

	for (let row = 0; row < lu.size; row++) {
		for (let column = 0; column < row; column++) x[row] = at(row) - lu.get(row, column) * at(column)
	}
	for (let row = lu.size - 1; row >= 0; row--) {
		for (let column = row + 1; column < lu.size; column++) x[row] = at(row) - lu.get(row, column) * at(column)
		x[row] = at(row) / lu.get(row, row)
	}

	return x
}
