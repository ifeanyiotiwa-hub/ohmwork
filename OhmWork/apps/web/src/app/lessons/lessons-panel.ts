import { Component, type ElementRef, inject, viewChild } from "@angular/core"
import { createCircuit } from "@ohmwork/format"
import { LESSONS, type Lesson } from "@ohmwork/lessons"
import { CircuitStore } from "../circuit/circuit-store"

/** Picks a starter lesson; starting one opens a fresh circuit for it (undo brings the old one back). */
@Component({
	selector: "app-lessons-panel",
	templateUrl: "./lessons-panel.html",
	styleUrl: "../library/library-panel.scss",
})
export class LessonsPanel {
	private readonly store = inject(CircuitStore)
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
	protected readonly lessons = LESSONS

	show(): void {
		this.dialog().nativeElement.showModal()
	}

	protected close(): void {
		this.dialog().nativeElement.close()
	}

	protected start(lesson: Lesson): void {
		this.store.replace({ ...createCircuit(lesson.title), description: lesson.goal, lesson: lesson.id }, `Started lesson "${lesson.title}"`)
		this.close()
	}
}
