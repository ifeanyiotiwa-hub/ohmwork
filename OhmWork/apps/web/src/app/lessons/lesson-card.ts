import { Component, inject } from "@angular/core"
import { LessonProgress } from "./lesson-progress"

/** The lesson this circuit is for: goal, steps with hints held back, and a check of the learner's circuit. */
@Component({
	selector: "app-lesson-card",
	templateUrl: "./lesson-card.html",
	styleUrl: "./lesson-card.scss",
})
export class LessonCard {
	protected readonly progress = inject(LessonProgress)
}
