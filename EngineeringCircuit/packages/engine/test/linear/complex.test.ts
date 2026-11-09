import { expect, test } from "vitest"
import { ComplexMatrix, solveComplex } from "../../src/linear/complex"

test("solves a complex system: (1+j)x + 2y = 3+3j, j·x − y = −1 has x = 1, y = 1+j", () => {
	const matrix = new ComplexMatrix(2)
	matrix.add(0, 0, { re: 1, im: 1 })
	matrix.add(0, 1, { re: 2, im: 0 })
	matrix.add(1, 0, { re: 0, im: 1 })
	matrix.add(1, 1, { re: -1, im: 0 })
	const [x, y] = solveComplex(matrix, [
		{ re: 3, im: 3 },
		{ re: -1, im: 0 },
	]) ?? []
	expect(x?.re).toBeCloseTo(1, 12)
	expect(x?.im).toBeCloseTo(0, 12)
	expect(y?.re).toBeCloseTo(1, 12)
	expect(y?.im).toBeCloseTo(1, 12)
})

test("needs a pivot swap when the first diagonal entry is zero", () => {
	const matrix = new ComplexMatrix(2)
	matrix.add(0, 1, { re: 1, im: 0 })
	matrix.add(1, 0, { re: 0, im: 2 })
	const [x, y] = solveComplex(matrix, [
		{ re: 5, im: 0 },
		{ re: 0, im: 4 },
	]) ?? []
	expect(x).toEqual({ re: 2, im: 0 })
	expect(y).toEqual({ re: 5, im: 0 })
})

test("a singular system has no solution", () => {
	const matrix = new ComplexMatrix(2)
	matrix.add(0, 0, { re: 1, im: 1 })
	matrix.add(1, 0, { re: 2, im: 2 })
	expect(solveComplex(matrix, [{ re: 1, im: 0 }, { re: 1, im: 0 }])).toBeNull()
})
