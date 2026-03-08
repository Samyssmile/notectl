import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	type ElementRef,
	type ModelSignal,
	afterNextRender,
	computed,
	effect,
	forwardRef,
	inject,
	input,
	model,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type {
	Document,
	EditorSelection,
	EditorState,
	NotectlEditorConfig,
	PaperSize,
	Plugin,
	PluginConfig,
	StateChangeEvent,
	Theme,
	Transaction,
} from '@notectl/core';
import { NotectlEditor, ThemePreset } from '@notectl/core';
import type { Locale } from '@notectl/core';
import type { TextFormattingConfig } from '@notectl/core/plugins/text-formatting';

import { EditorValueController } from './EditorValueController';
import { type ContentFormat, NOTECTL_CONTENT_FORMAT, NOTECTL_DEFAULT_CONFIG } from './tokens';
import type { NotectlValue, SelectionChangeEvent } from './types';

interface InitConfigSnapshot {
	readonly autofocus: boolean;
	readonly features: Partial<TextFormattingConfig> | undefined;
	readonly locale: Locale | undefined;
	readonly maxHistoryDepth: number | undefined;
	readonly plugins: readonly Plugin[];
	readonly styleNonce: string | undefined;
	readonly toolbar: NotectlEditorConfig['toolbar'];
}

function initConfigEquals(a: InitConfigSnapshot, b: InitConfigSnapshot): boolean {
	return (
		a.plugins === b.plugins &&
		a.toolbar === b.toolbar &&
		a.features === b.features &&
		a.autofocus === b.autofocus &&
		a.maxHistoryDepth === b.maxHistoryDepth &&
		a.locale === b.locale &&
		a.styleNonce === b.styleNonce
	);
}

@Component({
	selector: 'ntl-editor',
	standalone: true,
	template: '<div #host></div>',
	styles: ':host { display: block; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => NotectlEditorComponent),
			multi: true,
		},
	],
	host: {
		'[attr.aria-disabled]': 'effectiveReadonly() ? "true" : null',
		'[class.ntl-editor-disabled]': 'effectiveReadonly()',
	},
})
export class NotectlEditorComponent implements ControlValueAccessor {
	private readonly destroyRef: DestroyRef = inject(DestroyRef);
	private readonly defaultConfig: Partial<NotectlEditorConfig> | null = inject(
		NOTECTL_DEFAULT_CONFIG,
		{ optional: true },
	);
	private readonly contentFormat: ContentFormat =
		inject(NOTECTL_CONTENT_FORMAT, { optional: true }) ?? 'json';

	readonly plugins = input<readonly Plugin[] | undefined>(undefined);
	readonly toolbar = input<NotectlEditorConfig['toolbar']>(undefined);
	readonly features = input<Partial<TextFormattingConfig> | undefined>(undefined);
	readonly placeholder = input<string | undefined>(undefined);
	readonly readonlyMode = input<boolean | undefined>(undefined);
	readonly autofocus = input<boolean | undefined>(undefined);
	readonly maxHistoryDepth = input<number | undefined>(undefined);
	readonly theme = input<ThemePreset | Theme | undefined>(undefined);
	readonly paperSize = input<PaperSize | undefined>(undefined);
	readonly dir = input<'ltr' | 'rtl' | undefined>(undefined);
	readonly locale = input<Locale | undefined>(undefined);
	readonly styleNonce = input<string | undefined>(undefined);

	readonly content: ModelSignal<Document | undefined> = model<Document | undefined>(undefined);

	readonly stateChange = output<StateChangeEvent>();
	readonly selectionChange = output<SelectionChangeEvent>();
	readonly editorFocus = output<void>();
	readonly editorBlur = output<void>();
	readonly ready = output<void>();

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

	private readonly resolvedPlugins = computed<readonly Plugin[]>(
		() => this.plugins() ?? this.defaultConfig?.plugins ?? [],
	);
	private readonly resolvedToolbar = computed<NotectlEditorConfig['toolbar']>(
		() => this.toolbar() ?? this.defaultConfig?.toolbar,
	);
	private readonly resolvedFeatures = computed<Partial<TextFormattingConfig> | undefined>(
		() => this.features() ?? this.defaultConfig?.features,
	);
	private readonly resolvedPlaceholder = computed<string>(
		() => this.placeholder() ?? this.defaultConfig?.placeholder ?? 'Start typing...',
	);
	private readonly resolvedReadonlyMode = computed<boolean>(
		() => this.readonlyMode() ?? this.defaultConfig?.readonly ?? false,
	);
	private readonly resolvedAutofocus = computed<boolean>(
		() => this.autofocus() ?? this.defaultConfig?.autofocus ?? false,
	);
	private readonly resolvedMaxHistoryDepth = computed<number | undefined>(
		() => this.maxHistoryDepth() ?? this.defaultConfig?.maxHistoryDepth,
	);
	private readonly resolvedTheme = computed<ThemePreset | Theme>(
		() => this.theme() ?? this.defaultConfig?.theme ?? ThemePreset.Light,
	);
	private readonly resolvedPaperSize = computed<PaperSize | undefined>(
		() => this.paperSize() ?? this.defaultConfig?.paperSize,
	);
	private readonly resolvedDir = computed<'ltr' | 'rtl' | undefined>(
		() => this.dir() ?? this.defaultConfig?.dir,
	);
	private readonly resolvedLocale = computed<Locale | undefined>(
		() => this.locale() ?? this.defaultConfig?.locale,
	);
	private readonly resolvedStyleNonce = computed<string | undefined>(
		() => this.styleNonce() ?? this.defaultConfig?.styleNonce,
	);

	readonly effectiveReadonly = computed<boolean>(
		() => this.disabledByForms() || this.resolvedReadonlyMode(),
	);

	private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
	private readonly initialized = signal(false);
	private readonly disabledByForms = signal(false);

	private readonly valueController = new EditorValueController({
		emitControlValue: (value: NotectlValue) => this.onChange(value),
		getEditor: () => this.editorRef,
		getFormat: () => this.contentFormat,
		updateContent: (doc: Document) => this.content.set(doc),
		whenReady: () => this.readyPromise,
	});

	private editorRef: NotectlEditor | null = null;
	private readyResolve: (() => void) | null = null;
	private readyPromise!: Promise<void>;
	private lastInitConfig: InitConfigSnapshot | null = null;
	private queuedInitConfig: InitConfigSnapshot | null = null;
	private reinitializePromise: Promise<void> | null = null;
	private pendingInitialDocument: Document | undefined;
	private onChange: (value: NotectlValue) => void = () => {};
	private onTouched: () => void = () => {};

	constructor() {
		this.resetReadyPromise();

		afterNextRender(() => {
			this.initEditor(this.captureInitConfig());
		});

		effect(() => {
			const editor: NotectlEditor | null = this.editorRef;
			if (!this.initialized() || !editor) return;

			editor.setTheme(this.resolvedTheme());
			editor.configure({
				dir: this.resolvedDir(),
				paperSize: this.resolvedPaperSize(),
				placeholder: this.resolvedPlaceholder(),
				readonly: this.effectiveReadonly(),
			});
		});

		effect(() => {
			const doc: Document | undefined = this.content();
			if (!doc) return;
			this.valueController.syncExternalContent(doc);
		});

		effect(() => {
			this.scheduleReinitialization(this.captureInitConfig());
		});

		this.destroyRef.onDestroy(() => {
			void this.destroyEditor();
		});
	}

	getJSON(): Document {
		return this.requireEditor().getJSON();
	}

	setJSON(doc: Document): void {
		void this.valueController.setDocument(doc);
	}

	async getContentHTML(): Promise<string> {
		return this.requireEditor().getContentHTML();
	}

	async setContentHTML(html: string): Promise<void> {
		await this.valueController.setSerializedValue(html);
	}

	getText(): string {
		return this.requireEditor().getText();
	}

	get commands(): NotectlEditor['commands'] {
		return this.requireEditor().commands;
	}

	can(): ReturnType<NotectlEditor['can']> {
		return this.requireEditor().can();
	}

	executeCommand(name: string): boolean {
		return this.editorRef?.executeCommand(name) ?? false;
	}

	configurePlugin(pluginId: string, config: PluginConfig): void {
		this.editorRef?.configurePlugin(pluginId, config);
	}

	dispatch(tr: Transaction): void {
		this.editorRef?.dispatch(tr);
	}

	getState(): EditorState {
		return this.requireEditor().getState();
	}

	setTheme(theme: ThemePreset | Theme): void {
		this.editorRef?.setTheme(theme);
	}

	getTheme(): ThemePreset | Theme {
		return this.editorRef?.getTheme() ?? this.resolvedTheme();
	}

	setReadonly(readonlyState: boolean): void {
		this.editorRef?.configure({ readonly: readonlyState });
	}

	whenReady(): Promise<void> {
		return this.readyPromise;
	}

	focus(options?: FocusOptions): void {
		const editor: NotectlEditor | null = this.editorRef;
		if (!editor) return;

		const focusTarget =
			editor.shadowRoot?.querySelector<HTMLElement>('[contenteditable]') ?? editor;
		focusTarget.focus(options);
	}

	writeValue(value: NotectlValue): void {
		this.valueController.writeControlValue(value);
	}

	registerOnChange(fn: (value: NotectlValue) => void): void {
		this.onChange = fn;
	}

	registerOnTouched(fn: () => void): void {
		this.onTouched = fn;
	}

	setDisabledState(isDisabled: boolean): void {
		this.disabledByForms.set(isDisabled);
	}

	private resetReadyPromise(): void {
		this.readyPromise = new Promise<void>((resolve) => {
			this.readyResolve = resolve;
		});
	}

	private initEditor(snapshot: InitConfigSnapshot): void {
		const hostElement: HTMLDivElement = this.hostRef().nativeElement;
		const editor = new NotectlEditor();
		this.editorRef = editor;
		this.lastInitConfig = snapshot;
		this.valueController.reset();

		editor.on('stateChange', (event: StateChangeEvent) => {
			this.editorState.set(event.newState);
			this.valueController.handleEditorStateChange(event.newState.doc);
			this.stateChange.emit(event);
		});

		editor.on('selectionChange', (event: { selection: EditorSelection }) => {
			this.selectionChange.emit(event);
		});

		editor.on('focus', () => {
			this.editorFocus.emit();
		});

		editor.on('blur', () => {
			this.onTouched();
			this.editorBlur.emit();
		});

		editor.on('ready', () => {
			this.initialized.set(true);
			this.editorState.set(editor.getState());
			void this.applyInitialContent(editor).finally(() => {
				this.readyResolve?.();
				this.ready.emit();
			});
		});

		editor.init(this.buildConfig());
		hostElement.appendChild(editor);
	}

	private async applyInitialContent(editor: NotectlEditor): Promise<void> {
		const currentContent: Document | undefined = this.content();
		const initialContent = currentContent ?? this.pendingInitialDocument;
		this.pendingInitialDocument = undefined;

		if (!initialContent) return;
		await this.valueController.applyInitialDocument(editor, initialContent);
	}

	private buildConfig(): NotectlEditorConfig {
		const config: NotectlEditorConfig = {
			...this.defaultConfig,
			autofocus: this.resolvedAutofocus(),
			dir: this.resolvedDir(),
			locale: this.resolvedLocale(),
			maxHistoryDepth: this.resolvedMaxHistoryDepth(),
			paperSize: this.resolvedPaperSize(),
			placeholder: this.resolvedPlaceholder(),
			plugins: this.resolvedPlugins(),
			readonly: this.effectiveReadonly(),
			styleNonce: this.resolvedStyleNonce(),
			theme: this.resolvedTheme(),
		};

		const toolbar = this.resolvedToolbar();
		if (toolbar !== undefined) {
			config.toolbar = toolbar;
		}

		const features = this.resolvedFeatures();
		if (features !== undefined) {
			config.features = features;
		}

		return config;
	}

	private captureInitConfig(): InitConfigSnapshot {
		return {
			autofocus: this.resolvedAutofocus(),
			features: this.resolvedFeatures(),
			locale: this.resolvedLocale(),
			maxHistoryDepth: this.resolvedMaxHistoryDepth(),
			plugins: this.resolvedPlugins(),
			styleNonce: this.resolvedStyleNonce(),
			toolbar: this.resolvedToolbar(),
		};
	}

	private scheduleReinitialization(snapshot: InitConfigSnapshot): void {
		if (!this.initialized() || !this.lastInitConfig) return;
		if (initConfigEquals(snapshot, this.lastInitConfig)) return;

		this.queuedInitConfig = snapshot;
		if (this.reinitializePromise) return;

		this.reinitializePromise = (async () => {
			while (this.queuedInitConfig) {
				const nextSnapshot = this.queuedInitConfig;
				this.queuedInitConfig = null;
				this.pendingInitialDocument = this.editorRef?.getJSON();
				this.resetReadyPromise();
				this.initialized.set(false);
				await this.destroyEditor();
				this.initEditor(nextSnapshot);
				await this.readyPromise;
			}
		})().finally(() => {
			this.reinitializePromise = null;
		});
	}

	private async destroyEditor(): Promise<void> {
		const editor: NotectlEditor | null = this.editorRef;
		if (!editor) {
			this.initialized.set(false);
			this.editorState.set(null);
			return;
		}

		this.editorRef = null;
		editor.remove();
		await editor.destroy();
		this.initialized.set(false);
		this.editorState.set(null);
	}

	private requireEditor(): NotectlEditor {
		const editor: NotectlEditor | null = this.editorRef;
		if (!editor || !this.initialized()) {
			throw new Error('NotectlEditor is not initialized. Await whenReady() first.');
		}
		return editor;
	}
}
