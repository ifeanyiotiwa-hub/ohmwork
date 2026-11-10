/** A complex number (a phasor in AC analysis). */
export type Complex = { re: number; im: number }

export const complex = (re: number, im = 0): Complex => ({ re, im })
export const plus = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im })
export const minus = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im })
export const times = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
export const over = (a: Complex, b: Complex): Complex => {
	const scale = b.re * b.re + b.im * b.im
	return { re: (a.re * b.re + a.im * b.im) / scale, im: (a.im * b.re - a.re * b.im) / scale }
}
export const magnitude = (a: Complex) => Math.hypot(a.re, a.im)

/** A dense square matrix of complex numbers, for the AC circuit equations. */
/** A real matrix as complex numbers. */
export const complexMatrix = (rows: readonly (readonly number[])[]): Complex[][] => rows.map((row) => row.map((value) => complex(value)))

export class ComplexMatrix {
	private readonly re: Float64Array
	private readonly im: Float64Array

	constructor(readonly size: number) {
		this.re = new Float64Array(size * size)
		this.im = new Float64Array(size * size)
	}

	get(row: number, column: number): Complex {
		const index = row * this.size + column
		return { re: this.re[index] ?? 0, im: this.im[index] ?? 0 }
	}

	set(row: number, column: number, value: Complex): void {
		const index = row * this.size + column
		this.re[index] = value.re
		this.im[index] = value.im
	}

	add(row: number, column: number, amount: Complex): void {
		this.set(row, column, plus(this.get(row, column), amount))
	}
}

/** Gaussian elimination with partial pivoting (largest magnitude); null when the system has no single solution. */
export function solveComplex(source: ComplexMatrix, rightSide: readonly Complex[]): Complex[] | null {
	const size = source.size
	const rows = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => source.get(row, column)))
	const right = rightSide.map((value) => ({ ...value }))
	for (let pivot = 0; pivot < size; pivot++) {
		let best = pivot
		for (let row = pivot + 1; row < size; row++) {
			if (magnitude(rows[row]?.[pivot] ?? complex(0)) > magnitude(rows[best]?.[pivot] ?? complex(0))) best = row
		}
		const pivotValue = rows[best]?.[pivot] ?? complex(0)
		if (magnitude(pivotValue) === 0) return null
		;[rows[pivot], rows[best]] = [rows[best] ?? [], rows[pivot] ?? []]
		;[right[pivot], right[best]] = [right[best] ?? complex(0), right[pivot] ?? complex(0)]
		for (let row = pivot + 1; row < size; row++) {
			const factor = over(rows[row]?.[pivot] ?? complex(0), pivotValue)
			if (factor.re === 0 && factor.im === 0) continue
			for (let column = pivot; column < size; column++) {
				const target = rows[row]
				if (target) target[column] = minus(target[column] ?? complex(0), times(factor, rows[pivot]?.[column] ?? complex(0)))
			}
			right[row] = minus(right[row] ?? complex(0), times(factor, right[pivot] ?? complex(0)))
		}
	}
	const solution: Complex[] = Array.from({ length: size }, () => complex(0))
	for (let row = size - 1; row >= 0; row--) {
		let sum = right[row] ?? complex(0)
		for (let column = row + 1; column < size; column++) sum = minus(sum, times(rows[row]?.[column] ?? complex(0), solution[column] ?? complex(0)))
		solution[row] = over(sum, rows[row]?.[row] ?? complex(1))
	}
	return solution.every((value) => Number.isFinite(value.re) && Number.isFinite(value.im)) ? solution : null
}
