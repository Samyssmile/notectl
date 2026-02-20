import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type ElementRef,
	type ModelSignal,
	afterNextRender,
	computed,
	effect,
	inject,
	input,
	model,
	output,
	signal,
	viewChild,
} from '@angular/core';
import type {
	Document,
	EditorSelection,
	EditorState,
	NotectlEditorConfig,
	Plugin,
	PluginConfig,
	StateChangeEvent,
	TextFormattingConfig,
	Theme,
	Transaction,
} from '@notectl/core';
import { NotectlEditor, ThemePreset } from '@notectl/core';

import { NOTECTL_DEFAULT_CONFIG } from './tokens';
import type { SelectionChangeEvent } from './types';

/**
 * Angular standalone component wrapping the `<ntl-editor>` Web Component.
 *
 * Uses `afterNextRender()` for SSR-safe initialization and `effect()` for
 * reactive input tracking — no lifecycle interfaces needed.
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <ntl-editor [toolbar]="toolbar" [plugins]="plugins" />
 *
 * <!-- Two-way content binding -->
 * <ntl-editor [(content)]="myDocument" [toolbar]="toolbar" />
 *
 * <!-- Reactive forms -->
 * <ntl-editor [formControl]="editorControl" [toolbar]="toolbar" />
 * ```
 */
@Component({
	selector: 'ntl-editor',
	template: '<div #host></div>',
	styles: ':host { display: block; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotectlEditorComponent {
	// --- Injected dependencies ---

	private readonly destroyRef: DestroyRef = inject(DestroyRef);
	private readonly defaultConfig: Partial<NotectlEditorConfig> | null = inject(
		NOTECTL_DEFAULT_CONFIG,
		{ optional: true },
	);

	// --- Signal Inputs (1:1 with Web Component config) ---

	readonly plugins = input<Plugin[]>([]);
	readonly toolbar = input<ReadonlyArray<ReadonlyArray<Plugin>>>();
	readonly features = input<Partial<TextFormattingConfig>>();
	readonly placeholder = input<string>('Start typing...');
	readonly readonlyMode = input<boolean>(false);
	readonly autofocus = input<boolean>(false);
	readonly maxHistoryDepth = input<number>();
	readonly theme = input<ThemePreset | Theme>(ThemePreset.Light);

	// --- Two-way content binding via model() ---

	/**
	 * Two-way bindable document content.
	 *
	 * `undefined` means no external content was provided — the editor manages
	 * its own state. Once the editor emits changes, the model updates to the
	 * current `Document`.
	 *
	 * @example
	 * ```html
	 * <ntl-editor [(content)]="myDocument" />
	 * ```
	 */
	readonly content: ModelSignal<Document | undefined> = model<Document>();

	// --- Signal Outputs (events bridged from Web Component) ---

	readonly stateChange = output<StateChangeEvent>();
	readonly selectionChange = output<SelectionChangeEvent>();
	readonly editorFocus = output<void>();
	readonly editorBlur = output<void>();
	readonly ready = output<void>();

	// --- Reactive State ---

	readonly editorState = signal<EditorState | null>(null);

	readonly isEmpty = computed<boolean>(() => {
		const state: EditorState | null = this.editorState();
		if (!state) return true;
		const doc: Document = state.doc;
		if (doc.children.length === 0) return true;
		if (doc.children.length > 1) return false;
		const block = doc.children[0];
		if (!block) return true;
		return block.type === 'paragraph' && block.children.length === 0;
	});

	// --- Internal state ---

	private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
	private editorRef: NotectlEditor | null = null;
	private readyResolve: (() => void) | null = null;
	private readonly readyPromise: Promise<void> = new Promise<void>((resolve) => {
		this.readyResolve = resolve;
	});
	private readonly initialized = signal(false);

	/** Tracks the last document set from within the editor to prevent feedback loops. */
	private lastEditorDoc: Document | null = null;

	constructor() {
		// SSR-safe: only runs in the browser after first render
		afterNextRender(() => {
			this.initEditor();
		});

		// React to input changes via effect() — replaces ngOnChanges
		effect(() => {
			const currentTheme: ThemePreset | Theme = this.theme();
			const currentPlaceholder: string = this.placeholder();
			const currentReadonly: boolean = this.readonlyMode();

			const editor: NotectlEditor | null = this.editorRef;
			if (!this.initialized() || !editor) return;

			editor.setTheme(currentTheme);
			editor.configure({
				placeholder: currentPlaceholder,
				readonly: currentReadonly,
			});
		});

		// Sync external content model changes into the editor.
		// Skips when the document was set by the editor itself (feedback loop prevention).
		effect(() => {
			const doc: Document | undefined = this.content();
			const editor: NotectlEditor | null = this.editorRef;
			if (!this.initialized() || !editor || !doc) return;

			// Skip if this document originated from the editor's own state change
			if (doc === this.lastEditorDoc) return;

			editor.setJSON(doc);
		});

		this.destroyRef.onDestroy(() => {
			this.destroyEditor();
		});
	}

	// --- Public API (proxy to Web Component) ---

	/** Returns the document as JSON. */
	getJSON(): Document {
		return this.requireEditor().getJSON();
	}

	/** Sets the document from JSON. */
	setJSON(doc: Document): void {
		this.requireEditor().setJSON(doc);
	}

	/** Returns sanitized HTML representation of the document. */
	getHTML(): string {
		return this.requireEditor().getHTML();
	}

	/** Sets content from HTML (sanitized). */
	setHTML(html: string): void {
		this.requireEditor().setHTML(html);
	}

	/** Returns plain text content. */
	getText(): string {
		return this.requireEditor().getText();
	}

	/** Proxy to the Web Component's `commands` object. */
	get commands(): NotectlEditor['commands'] {
		return this.requireEditor().commands;
	}

	/** Proxy to the Web Component's `can()` capability checker. */
	can(): ReturnType<NotectlEditor['can']> {
		return this.requireEditor().can();
	}

	/** Executes a named command registered by a plugin. */
	executeCommand(name: string): boolean {
		if (!this.editorRef) return false;
		return this.editorRef.executeCommand(name);
	}

	/** Configures a plugin at runtime. */
	configurePlugin(pluginId: string, config: PluginConfig): void {
		this.editorRef?.configurePlugin(pluginId, config);
	}

	/** Dispatches a transaction. */
	dispatch(tr: Transaction): void {
		this.editorRef?.dispatch(tr);
	}

	/** Returns the current editor state. */
	getState(): EditorState {
		return this.requireEditor().getState();
	}

	/** Changes the theme at runtime. */
	setTheme(theme: ThemePreset | Theme): void {
		this.editorRef?.setTheme(theme);
	}

	/** Returns the current theme setting. */
	getTheme(): ThemePreset | Theme {
		return this.editorRef?.getTheme() ?? this.theme();
	}

	/** Sets the readonly state programmatically (used by ControlValueAccessor). */
	setReadonly(readonlyState: boolean): void {
		this.editorRef?.configure({ readonly: readonlyState });
	}

	/** Resolves when the editor is ready. */
	whenReady(): Promise<void> {
		return this.readyPromise;
	}

	// --- Private ---

	private initEditor(): void {
		const hostElement: HTMLDivElement = this.hostRef().nativeElement;
		const config: NotectlEditorConfig = this.buildConfig();

		const editor: NotectlEditor = new NotectlEditor();
		this.editorRef = editor;

		// Register event listeners BEFORE appending to DOM, because
		// appendChild triggers connectedCallback → init() synchronously.
		editor.on('stateChange', (event: StateChangeEvent) => {
			this.editorState.set(event.newState);
			this.syncContentModel(event.newState.doc);
			this.stateChange.emit(event);
		});

		editor.on('selectionChange', (event: { selection: EditorSelection }) => {
			this.selectionChange.emit(event);
		});

		editor.on('focus', () => {
			this.editorFocus.emit();
		});

		editor.on('blur', () => {
			this.editorBlur.emit();
		});

		editor.on('ready', () => {
			this.initialized.set(true);
			const state: EditorState = editor.getState();
			this.editorState.set(state);

			// Apply initial content model if set before editor was ready
			const initialContent: Document | undefined = this.content();
			if (initialContent) {
				editor.setJSON(initialContent);
			}

			this.readyResolve?.();
			this.ready.emit();
		});

		// Init with config BEFORE appending to DOM. appendChild triggers
		// connectedCallback which calls init() without config — by calling
		// init(config) first, the editor initializes with the full config
		// and connectedCallback's init() becomes a no-op (already initialized).
		editor.init(config);
		hostElement.appendChild(editor);
	}

	private buildConfig(): NotectlEditorConfig {
		const defaults: Partial<NotectlEditorConfig> = this.defaultConfig ?? {};
		const toolbar: ReadonlyArray<ReadonlyArray<Plugin>> | undefined = this.toolbar();
		const features: Partial<TextFormattingConfig> | undefined = this.features();
		const maxHistory: number | undefined = this.maxHistoryDepth();

		const config: NotectlEditorConfig = {
			...defaults,
			plugins: this.plugins(),
			placeholder: this.placeholder(),
			readonly: this.readonlyMode(),
			autofocus: this.autofocus(),
			theme: this.theme(),
		};

		if (toolbar !== undefined) {
			config.toolbar = toolbar;
		}
		if (features !== undefined) {
			config.features = features;
		}
		if (maxHistory !== undefined) {
			config.maxHistoryDepth = maxHistory;
		}

		return config;
	}

	/** Syncs editor document changes to the content model without feedback loops. */
	private syncContentModel(doc: Document): void {
		this.lastEditorDoc = doc;
		this.content.set(doc);
	}

	private destroyEditor(): void {
		if (this.editorRef) {
			this.editorRef.destroy();
			this.editorRef = null;
		}
		this.initialized.set(false);
	}

	private requireEditor(): NotectlEditor {
		const editor: NotectlEditor | null = this.editorRef;
		if (!editor) {
			throw new Error('NotectlEditor is not initialized. Await whenReady() first.');
		}
		return editor;
	}
}
