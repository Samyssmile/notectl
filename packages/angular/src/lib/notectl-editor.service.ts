import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { EditorState, StateChangeEvent, Transaction } from '@notectl/core';
import { type Observable, Subject } from 'rxjs';

import type { NotectlEditorComponent } from './notectl-editor.component';

/**
 * Optional injectable service for programmatic editor access via DI.
 *
 * Useful when a toolbar or other component needs to interact with
 * the editor without a direct template reference.
 *
 * The service must be provided at a shared injector level and
 * connected to the editor component via `register()`.
 *
 * @example
 * ```typescript
 * @Component({
 *   providers: [NotectlEditorService],
 *   template: `
 *     <app-toolbar />
 *     <ntl-editor #editor [plugins]="plugins" />
 *   `,
 * })
 * export class EditorPage {
 *   private readonly editor = viewChild.required<NotectlEditorComponent>('editor');
 *   private readonly service = inject(NotectlEditorService);
 *
 *   constructor() {
 *     afterNextRender(() => {
 *       this.service.register(this.editor());
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class NotectlEditorService {
	private readonly destroyRef: DestroyRef = inject(DestroyRef);
	private readonly editorRef = signal<NotectlEditorComponent | null>(null);
	private readonly stateChangeSubject = new Subject<StateChangeEvent>();

	/** Whether an editor is currently registered with this service. */
	readonly hasEditor = computed<boolean>(() => this.editorRef() !== null);

	/** Observable stream of state change events from the editor. */
	readonly stateChanges$: Observable<StateChangeEvent> = this.stateChangeSubject.asObservable();

	private stateChangeSub: { unsubscribe(): void } | null = null;

	constructor() {
		this.destroyRef.onDestroy(() => {
			this.unregister();
			this.stateChangeSubject.complete();
		});
	}

	/** Registers an editor component with this service. */
	register(editor: NotectlEditorComponent): void {
		this.unregister();
		this.editorRef.set(editor);

		this.stateChangeSub = editor.stateChange.subscribe((event: StateChangeEvent) => {
			this.stateChangeSubject.next(event);
		});
	}

	/** Unregisters the current editor from this service. */
	unregister(): void {
		this.stateChangeSub?.unsubscribe();
		this.stateChangeSub = null;
		this.editorRef.set(null);
	}

	/** Executes a named command on the registered editor. */
	executeCommand(name: string): boolean {
		const editor: NotectlEditorComponent | null = this.editorRef();
		if (!editor) return false;
		return editor.executeCommand(name);
	}

	/** Returns the current editor state, or `null` if no editor is registered. */
	getState(): EditorState | null {
		const editor: NotectlEditorComponent | null = this.editorRef();
		if (!editor) return null;
		try {
			return editor.getState();
		} catch {
			return null;
		}
	}

	/** Dispatches a transaction on the registered editor. */
	dispatch(tr: Transaction): void {
		this.editorRef()?.dispatch(tr);
	}
}
