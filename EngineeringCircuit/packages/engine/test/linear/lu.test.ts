import { expect, test } from "vitest"
import { DenseMatrix } from "../../src/linear/dense-matrix"
import { factorLu, solveLinear } from "../../src/linear/lu"
import { expectClose } from "../support/circuit-of"

const expectSolution = (actual: number[] | null, expected: number[]) => {
	expect(actual).toHaveLength(expected.length)
	expected.forEach((value, index) => expectClose(actual?.[index], value))
}

test("solves a 3x3 system", () => {
	const matrix = DenseMatrix.fromRows([
		[2, 1, -1],
		[-3, -1, 2],
		[-2, 1, 2],
	])

	expectSolution(solveLinear(matrix, [8, -11, -3]), [2, 3, -1])
})

test("pivots when the first diagonal entry is zero", () => {
	const matrix = DenseMatrix.fromRows([
		[0, 1],
		[1, 0],
	])

	expectSolution(solveLinear(matrix, [5, 7]), [7, 5])
})

test("one factorisation solves several right-hand sides", () => {
	const lu = factorLu(
		DenseMatrix.fromRows([
			[4, 3],
			[6, 3],
		]),
	)
	if (!lu) throw new Error("expected a factorisation")

	expectSolution(lu.solve([10, 12]), [1, 2])
	expectSolution(lu.solve([7, 9]), [1, 1])
})

test("factorising does not change the input matrix", () => {
	const matrix = DenseMatrix.fromRows([
		[0, 1],
		[1, 0],
	])
	factorLu(matrix)

	expect(matrix.get(0, 0)).toBe(0)
	expect(matrix.get(1, 0)).toBe(1)
})

test("reports a singular matrix as null", () => {
	const matrix = DenseMatrix.fromRows([
		[1, 2],
		[2, 4],
	])

	expect(solveLinear(matrix, [1, 2])).toBeNull()
})

test("an empty system has an empty solution", () => {
	expect(solveLinear(new DenseMatrix(0), [])).toEqual([])
})
