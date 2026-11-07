export class DisjointSets {
	private readonly parent: number[]

	constructor(size: number) {
		this.parent = Array.from({ length: size }, (_, index) => index)
	}

	find(item: number): number {
		let root = item
		while (this.parent[root] !== root) root = this.parent[root] ?? root
		this.parent[item] = root
		return root
	}

	union(first: number, second: number): boolean {
		const firstRoot = this.find(first)
		const secondRoot = this.find(second)
		if (firstRoot === secondRoot) return false
		this.parent[firstRoot] = secondRoot
		return true
	}

	connected(first: number, second: number): boolean {
		return this.find(first) === this.find(second)
	}
}
