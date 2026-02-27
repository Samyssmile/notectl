import type { ComponentFixture } from '@angular/core/testing';
import type { NotectlEditorComponent } from '@notectl/angular';

/**
 * Test harness for `NotectlEditorComponent` in consumer tests.
 *
 * Wraps a `ComponentFixture` and provides convenience methods
 * for common test operations.
 *
 * @example
 * ```typescript
 * const fixture = TestBed.createComponent(NotectlEditorComponent);
 * const harness = new NotectlTestHarness(fixture);
 * await harness.whenReady();
 * harness.setContentHTML('<p>Hello</p>');
 * expect(harness.getText()).toBe('Hello');
 * ```
 */
export class NotectlTestHarness {
	constructor(private readonly fixture: ComponentFixture<NotectlEditorComponent>) {}

	/** Returns the component instance. */
	get component(): NotectlEditorComponent {
		return this.fixture.componentInstance;
	}

	/** Waits for the editor to be ready and triggers change detection. */
	async whenReady(): Promise<void> {
		await this.component.whenReady();
		this.fixture.detectChanges();
	}

	/** Executes a command and triggers change detection. */
	executeCommand(name: string): boolean {
		const result: boolean = this.component.executeCommand(name);
		this.fixture.detectChanges();
		return result;
	}

	/** Sets HTML content and triggers change detection. */
	setContentHTML(html: string): void {
		this.component.setContentHTML(html);
		this.fixture.detectChanges();
	}

	/** Returns the current HTML content. */
	getContentHTML(): string {
		return this.component.getContentHTML();
	}

	/** Returns the current plain text content. */
	getText(): string {
		return this.component.getText();
	}

	/** Returns whether the editor is empty. */
	get isEmpty(): boolean {
		return this.component.isEmpty();
	}
}
