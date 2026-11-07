import { Component } from "@angular/core"
import { solveDc } from "@engineering-circuit/engine"
import { createCircuit } from "@engineering-circuit/format"

@Component({
	selector: "app-root",
	templateUrl: "./app.html",
	styleUrl: "./app.scss",
})
export class App {
	protected readonly ok = solveDc(createCircuit("probe")).ok
}
