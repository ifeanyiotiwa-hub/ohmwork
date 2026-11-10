export class DenseMatrix {
	private readonly values: Float64Array

	constructor(readonly size: number) {
		this.values = new Float64Array(size * size)
	}

	static fromRows(rows: readonly (readonly number[])[]): DenseMatrix {
		const matrix = new DenseMatrix(rows.length)
		rows.forEach((row, rowIndex) => row.forEach((value, column) => matrix.set(rowIndex, column, value)))
		return matrix
	}

	get(row: number, column: number): number {
		return this.values[row * this.size + column] ?? 0
	}

	set(row: number, column: number, value: number): void {
		this.values[row * this.size + column] = value
	}

	add(row: number, column: number, amount: number): void {
		this.set(row, column, this.get(row, column) + amount)
	}

	swapRows(first: number, second: number): void {
		for (let column = 0; column < this.size; column++) {
			const kept = this.get(first, column)
			this.set(first, column, this.get(second, column))
			this.set(second, column, kept)
		}
	}

	copy(): DenseMatrix {
		const copied = new DenseMatrix(this.size)
		copied.values.set(this.values)
		return copied
	}
}
