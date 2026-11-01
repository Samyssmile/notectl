import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NotectlEditorComponent } from '@notectl/angular';
import { FontSizePlugin } from '@notectl/core/plugins/font-size';
import { LinkPlugin } from '@notectl/core/plugins/link';
import { type EditorAction, type EditorUIService, EditorUIServiceKey } from '@notectl/core/ui';

@Component({
	selector: 'app-root',
	imports: [NotectlEditorComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<h1>External Angular editor controls</h1>
		<div #controls class="controls" role="group" aria-label="Editor actions">
			@for (action of actions(); track action.id) {
				<button #trigger type="button" [attr.data-action]="action.id"
					[disabled]="!action.enabled" [attr.aria-pressed]="action.active"
					[attr.aria-haspopup]="action.popupType ? 'true' : null"
					[title]="action.tooltip" (click)="activate(action, trigger)">
					{{ action.value ? action.label + ': ' + action.value : action.label }}
				</button>
			}
			<label>External text field <input /></label>
			<button type="button" (click)="ui?.focusEditor()">Return to selection</button>
		</div>
		<ntl-editor #editor [plugins]="plugins" (ready)="connect(editor, controls)" />
		<output aria-label="Selection geometry">{{ selection() }}</output>
	`,
	styles: `
		:host { display: block; max-width: 50rem; margin: 2rem auto; font-family: system-ui; }
		.controls { background: var(--notectl-toolbar-bg, #f5f5f5); padding: 8px; }
		button { margin: 2px; }
		button[aria-pressed="true"] { outline: 2px solid var(--notectl-primary, #2762bd); }
		output { display: block; overflow-wrap: anywhere; font-size: 12px; }
	`,
})
export class CustomUIExample {
	protected readonly plugins = [new LinkPlugin(), new FontSizePlugin()];
	protected readonly actions = signal<readonly EditorAction[]>([]);
	protected readonly selection = signal('');
	protected ui: EditorUIService | undefined;
	private cleanups: (() => void)[] = [];

	constructor() {
		inject(DestroyRef).onDestroy(() => this.disconnect());
	}

	protected connect(editor: NotectlEditorComponent, controls: HTMLElement): void {
		this.disconnect();
		const ui = editor.getService(EditorUIServiceKey);
		if (!ui) return;
		this.ui = ui;
		editor.setText('Select these words and use the Angular controls.');
		this.cleanups = [
			ui.registerInteraction(controls),
			ui.subscribeActions((actions) => this.actions.set(actions)),
			ui.subscribeSelection((selection) => this.selection.set(JSON.stringify(selection))),
		];
	}

	protected activate(action: EditorAction, trigger: HTMLElement): void {
		if (action.popupType) this.ui?.openAction(action.id, { trigger });
		else this.ui?.executeAction(action.id);
	}

	private disconnect(): void {
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups = [];
		this.ui = undefined;
	}
}
