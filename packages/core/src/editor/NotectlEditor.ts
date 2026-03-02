/**
 * NotectlEditor Web Component — the public-facing editor element.
 */

import { selectAll } from '../commands/Commands.js';
import { DecorationSet } from '../decorations/Decoration.js';
import type { Locale } from '../i18n/Locale.js';
import { LocaleService, LocaleServiceKey } from '../i18n/LocaleService.js';
import { InputManager } from '../input/InputManager.js';
import type { Document } from '../model/Document.js';
import { isMarkAllowed, schemaFromRegistry } from '../model/Schema.js';
import { selectionsEqual } from '../model/Selection.js';
import { getTextDirection } from '../platform/Platform.js';
import type {
	EventKey,
	Plugin,
	PluginConfig,
	PluginEventCallback,
	ServiceKey,
} from '../plugins/Plugin.js';
import { PluginManager } from '../plugins/PluginManager.js';
import { BEFORE_PRINT } from '../plugins/print/PrintTypes.js';
import type { TextFormattingConfig } from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { ToolbarOverflowBehavior } from '../plugins/toolbar/ToolbarOverflowBehavior.js';
import type {
	ContentCSSResult,
	ContentHTMLOptions,
	SetContentHTMLOptions,
} from '../serialization/ContentHTMLTypes.js';
import { EditorState } from '../state/EditorState.js';
import { isAllowedInReadonly } from '../state/ReadonlyGuard.js';
import type { Transaction } from '../state/Transaction.js';
import { navigateFromGapCursor } from '../view/CaretNavigation.js';
import { EditorView } from '../view/EditorView.js';
import { buildAnnouncement } from './Announcer.js';
import { registerBuiltinSpecs } from './BuiltinSpecs.js';
import {
	getEditorContentHTML,
	getEditorJSON,
	getEditorText,
	isEditorEmpty,
	setEditorContentHTML,
	setEditorJSON,
} from './ContentSerializer.js';
import { EditorConfigController } from './EditorConfigController.js';
import { type EditorDOMElements, createEditorDOM } from './EditorDOM.js';
import { EditorEventEmitter, type EditorEventMap } from './EditorEventEmitter.js';
import { EditorLifecycleCoordinator } from './EditorLifecycleCoordinator.js';
import { EditorStyleCoordinator } from './EditorStyleCoordinator.js';
import { EditorThemeController } from './EditorThemeController.js';
import { PaperLayoutController } from './PaperLayoutController.js';
import type { PaperSize } from './PaperSize.js';
import { ensureEssentialPlugins, processToolbarConfig } from './PluginBootstrapper.js';
import { type Theme, ThemePreset } from './theme/ThemeTokens.js';

/**
 * Expanded toolbar configuration for `createEditor`.
 * Allows specifying both the plugin layout and overflow behavior.
 */
export interface ToolbarConfig {
	/**
	 * Plugin groups defining toolbar layout. Each inner array is a visual group;
	 * separators are rendered between groups. Order = array order.
	 */
	readonly groups: ReadonlyArray<ReadonlyArray<Plugin>>;
	/**
	 * Controls responsive overflow behavior when items exceed available width.
	 * Defaults to `ToolbarOverflowBehavior.BurgerMenu`.
	 */
	readonly overflow?: ToolbarOverflowBehavior;
}

export interface NotectlEditorConfig {
	/** Controls which inline marks are enabled. Used to auto-configure TextFormattingPlugin. */
	features?: Partial<TextFormattingConfig>;
	plugins?: readonly Plugin[];
	/**
	 * Toolbar configuration. Accepts either:
	 * - A shorthand array of plugin groups: `[[BoldPlugin, ItalicPlugin], [HeadingPlugin]]`
	 * - A full config object: `{ groups: [...], overflow: ToolbarOverflowBehavior.Flow }`
	 *
	 * When set, a ToolbarPlugin is created internally — do not add one to `plugins`.
	 */
	toolbar?: ReadonlyArray<ReadonlyArray<Plugin>> | ToolbarConfig;
	placeholder?: string;
	readonly?: boolean;
	autofocus?: boolean;
	maxHistoryDepth?: number;
	/** Theme preset or custom Theme object. Defaults to ThemePreset.Light. */
	theme?: ThemePreset | Theme;
	/** Optional nonce for fallback runtime `<style>` elements when strict mode cannot use adopted sheets. */
	styleNonce?: string;
	/** Paper size for WYSIWYG page layout. When set, content renders at exact paper width. */
	paperSize?: PaperSize;
	/** Document-level text direction. When set, applies `dir` on the content element. */
	dir?: 'ltr' | 'rtl';
	/** Editor locale. Defaults to Locale.BROWSER (auto-detect from navigator.language). */
	locale?: Locale;
}

export type { StateChangeEvent } from './EditorEventEmitter.js';
export type { EditorEventMap } from './EditorEventEmitter.js';

export class NotectlEditor extends HTMLElement {
	private view: EditorView | null = null;
	private inputManager: InputManager | null = null;
	private pluginManager: PluginManager | null = null;
	private domElements: EditorDOMElements | null = null;
	private readonly configController = new EditorConfigController();
	private readonly events = new EditorEventEmitter();
	private readonly lifecycle = new EditorLifecycleCoordinator();
	private readonly styleCoordinator = new EditorStyleCoordinator();
	private themeController: EditorThemeController | null = null;
	private paperLayout: PaperLayoutController | null = null;

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	}

	static get observedAttributes(): string[] {
		return ['placeholder', 'readonly', 'theme', 'paper-size', 'dir'];
	}

	connectedCallback(): void {
		if (this.lifecycle.isInitialized()) return;
		this.init();
	}

	disconnectedCallback(): void {
		setTimeout(() => {
			if (!this.isConnected) {
				this.destroy();
			}
		}, 0);
	}

	attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
		this.configController.applyAttribute(name, newValue, this.getConfigDeps());
	}

	/** Registers a plugin before initialization. */
	registerPlugin(plugin: Plugin): void {
		this.lifecycle.registerPreInitPlugin(plugin);
	}

	/** Initializes the editor with the given config. */
	async init(config?: NotectlEditorConfig): Promise<void> {
		if (!this.lifecycle.markInitialized()) return;

		if (config) this.configController.setConfig(config);
		const cfg: NotectlEditorConfig = this.configController.getConfig();

		const shadow = this.shadowRoot;
		if (!shadow) return;

		// Apply theme (default: Light) — must happen before editor stylesheet
		this.themeController = new EditorThemeController(shadow);
		this.styleCoordinator.setup(shadow, cfg.styleNonce, this.themeController);
		this.themeController.apply(cfg.theme ?? ThemePreset.Light);

		// 1. Build DOM structure
		this.domElements = createEditorDOM({
			readonly: cfg.readonly,
			placeholder: cfg.placeholder,
			dir: cfg.dir ?? (this.getAttribute('dir') as 'ltr' | 'rtl' | null) ?? undefined,
		});

		shadow.appendChild(this.domElements.wrapper);

		// Apply paper layout if configured (before plugins, so initial render is correct)
		if (cfg.paperSize) {
			this.paperLayout = new PaperLayoutController(
				this.domElements.wrapper,
				this.domElements.content,
			);
			this.paperLayout.apply(cfg.paperSize);
		}

		// 2. Create PluginManager (SchemaRegistry is available)
		this.pluginManager = new PluginManager();

		// Register global LocaleService before plugins so they can resolve locale
		const localeService = new LocaleService(cfg.locale ?? 'browser');
		this.pluginManager.registerService(LocaleServiceKey, localeService);

		// 3. Register built-in specs on the registry
		registerBuiltinSpecs(this.pluginManager.schemaRegistry);

		// Process declarative toolbar config (registers ToolbarPlugin + toolbar plugins)
		await processToolbarConfig(this.pluginManager, cfg.toolbar);
		if (!this.pluginManager) return;

		// Register plugins from config
		for (const plugin of cfg.plugins ?? []) {
			this.pluginManager.register(plugin);
		}

		// Register plugins from registerPlugin() calls
		for (const plugin of this.lifecycle.consumePreInitPlugins()) {
			this.pluginManager.register(plugin);
		}

		// Auto-register essential plugins if none were explicitly provided
		await ensureEssentialPlugins(this.pluginManager, cfg.features);
		if (!this.pluginManager) return;

		// Set up DOM events before plugin init
		this.domElements.content.addEventListener('focus', () => this.events.emit('focus', undefined));
		this.domElements.content.addEventListener('blur', () => this.events.emit('blur', undefined));

		// 4. Initialize plugins — specs are registered during init().
		//    onBeforeReady fires after all init() but before onReady(),
		//    so the schema is complete and the view renders once.
		const dom: EditorDOMElements = this.domElements;
		const contentEl: HTMLElement = dom.content;
		const pluginMgr: PluginManager = this.pluginManager;
		const topContainer: HTMLElement = dom.topPluginContainer;
		const bottomContainer: HTMLElement = dom.bottomPluginContainer;
		const announcer: HTMLElement = dom.announcer;
		await pluginMgr.init({
			getState: () => {
				if (!this.view) throw new Error('View not initialized');
				return this.view.getState();
			},
			dispatch: (tr) => this.dispatch(tr),
			getContainer: () => contentEl,
			getPluginContainer: (position) => (position === 'top' ? topContainer : bottomContainer),
			announce: (text: string) => {
				if (announcer) announcer.textContent = text;
			},
			hasAnnouncement: () => !!announcer?.textContent,
			onBeforeReady: () => {
				const schema = schemaFromRegistry(pluginMgr.schemaRegistry);
				const state = EditorState.create({ schema });

				// Create InputManager first — uses lazy view refs that resolve at call-time
				this.inputManager = new InputManager(contentEl, {
					getState: () => {
						if (!this.view) throw new Error('View not initialized');
						return this.view.getState();
					},
					dispatch: (tr) => this.dispatch(tr),
					syncSelection: () => this.view?.syncSelection(),
					undo: () => this.view?.undo(),
					redo: () => this.view?.redo(),
					schemaRegistry: pluginMgr.schemaRegistry,
					keymapRegistry: pluginMgr.keymapRegistry,
					inputRuleRegistry: pluginMgr.inputRuleRegistry,
					fileHandlerRegistry: pluginMgr.fileHandlerRegistry,
					isReadOnly: () => this.configController.isReadOnly,
					getTextDirection,
					navigateFromGapCursor,
				});

				this.view = new EditorView(contentEl, {
					state,
					schemaRegistry: pluginMgr.schemaRegistry,
					keymapRegistry: pluginMgr.keymapRegistry,
					fileHandlerRegistry: pluginMgr.fileHandlerRegistry,
					nodeViewRegistry: pluginMgr.nodeViewRegistry,
					maxHistoryDepth: cfg.maxHistoryDepth,
					getDecorations: (s, tr) =>
						this.pluginManager?.collectDecorations(s, tr) ?? DecorationSet.empty,
					onStateChange: (oldState, newState, tr) => {
						this.onStateChange(oldState, newState, tr);
					},
					isReadOnly: () => this.configController.isReadOnly,
					compositionState: this.inputManager.compositionTracker,
				});
				this.updateEmptyState();

				// Inject plugin-registered stylesheets into adopted stylesheets
				const pluginSheets = pluginMgr.getPluginStyleSheets();
				if (pluginSheets.length > 0) {
					this.themeController?.setPluginStyleSheets(pluginSheets);
				}
			},
		});

		// Guard: editor may have been destroyed during async plugin init
		if (!this.pluginManager) return;

		// Notify plugins of initial readonly state
		if (cfg.readonly) {
			this.pluginManager.setReadOnly(true);
		}

		// Register BEFORE_PRINT listener to inject paperSize as fallback
		this.pluginManager.onEvent(BEFORE_PRINT, (event) => {
			if (!event.options.paperSize && this.configController.getPaperSize()) {
				event.options = { ...event.options, paperSize: this.configController.getPaperSize() };
			}
		});

		if (cfg.autofocus) {
			requestAnimationFrame(() => this.domElements?.content.focus());
		}

		this.lifecycle.resolveReady();
		this.events.emit('ready', undefined);
	}

	/** Returns whether the editor is in read-only mode. */
	get isReadOnly(): boolean {
		return this.configController.isReadOnly;
	}

	// --- Content API ---

	/** Returns the document as JSON. */
	getJSON(): Document {
		if (!this.view) throw new Error('Editor not initialized');
		return getEditorJSON(this.view.getState());
	}

	/** Sets the document from JSON. */
	setJSON(doc: Document): void {
		setEditorJSON(doc, this.pluginManager?.schemaRegistry, (s) => this.replaceState(s));
	}

	/** Returns sanitized HTML representation of the document. */
	async getContentHTML(): Promise<string>;
	async getContentHTML(options: { pretty?: boolean }): Promise<string>;
	async getContentHTML(
		options: ContentHTMLOptions & { cssMode: 'classes' },
	): Promise<ContentCSSResult>;
	async getContentHTML(options?: ContentHTMLOptions): Promise<string | ContentCSSResult> {
		if (!this.view) throw new Error('Editor not initialized');
		return getEditorContentHTML(this.view.getState(), this.pluginManager?.schemaRegistry, options);
	}

	/** Sets content from HTML (sanitized). Accepts optional `styleMap` for class-based round-trip. */
	async setContentHTML(html: string, options?: SetContentHTMLOptions): Promise<void> {
		return setEditorContentHTML(
			html,
			this.pluginManager?.schemaRegistry,
			(s) => this.replaceState(s),
			options,
		);
	}

	/** Returns plain text content. */
	getText(): string {
		if (!this.view) throw new Error('Editor not initialized');
		return getEditorText(this.view.getState());
	}

	/** Returns true if the editor is empty (single empty paragraph). */
	isEmpty(): boolean {
		if (!this.view) return true;
		return isEditorEmpty(this.view.getState().doc);
	}

	// --- Command API ---

	readonly commands = {
		toggleBold: () => this.executeCommand('toggleBold'),
		toggleItalic: () => this.executeCommand('toggleItalic'),
		toggleUnderline: () => this.executeCommand('toggleUnderline'),
		undo: () => {
			if (this.configController.isReadOnly) return;
			this.view?.undo();
		},
		redo: () => {
			if (this.configController.isReadOnly) return;
			this.view?.redo();
		},
		selectAll: () => {
			if (!this.view) return;
			const tr = selectAll(this.view.getState());
			this.dispatch(tr);
		},
	};

	/** Checks whether a command can be executed. */
	can(): {
		toggleBold: () => boolean;
		toggleItalic: () => boolean;
		toggleUnderline: () => boolean;
		undo: () => boolean;
		redo: () => boolean;
		selectAll: () => boolean;
	} {
		const schema = this.view?.getState().schema;
		const readonly: boolean = this.configController.isReadOnly;
		return {
			toggleBold: () => !readonly && (schema ? isMarkAllowed(schema, 'bold') : false),
			toggleItalic: () => !readonly && (schema ? isMarkAllowed(schema, 'italic') : false),
			toggleUnderline: () => !readonly && (schema ? isMarkAllowed(schema, 'underline') : false),
			undo: () => !readonly && (this.view?.history.canUndo() ?? false),
			redo: () => !readonly && (this.view?.history.canRedo() ?? false),
			selectAll: () => this.canExecuteCommand('selectAll'),
		};
	}

	/** Returns whether a named command can be executed. */
	canExecuteCommand(name: string): boolean {
		return this.pluginManager?.canExecuteCommand(name) ?? false;
	}

	/** Executes a named command registered by a plugin. */
	executeCommand(name: string): boolean {
		return this.pluginManager?.executeCommand(name) ?? false;
	}

	/** Configures a plugin at runtime. */
	configurePlugin(pluginId: string, config: PluginConfig): void {
		this.pluginManager?.configurePlugin(pluginId, config);
	}

	/** Returns a registered plugin service by typed key. */
	getService<T>(key: ServiceKey<T>): T | undefined {
		return this.pluginManager?.getService(key);
	}

	/** Subscribes to a plugin event. Returns an unsubscribe function. */
	onPluginEvent<T>(key: EventKey<T>, callback: PluginEventCallback<T>): () => void {
		return this.pluginManager?.onEvent(key, callback) ?? (() => {});
	}

	// --- State API ---

	/** Returns the current editor state. */
	getState(): EditorState {
		if (!this.view) throw new Error('Editor not initialized');
		return this.view.getState();
	}

	/** Dispatches a transaction (routed through middleware if any). */
	dispatch(tr: Transaction): void {
		if (!this.view || !this.pluginManager) return;
		if (
			this.configController.isReadOnly &&
			!isAllowedInReadonly(tr) &&
			!this.pluginManager.isReadonlyBypassed()
		) {
			return;
		}
		this.pluginManager.dispatchWithMiddleware(tr, this.view.getState(), (finalTr) =>
			this.view?.dispatch(finalTr),
		);
	}

	// --- Event API ---

	/** Registers an event listener. */
	on<K extends keyof EditorEventMap>(
		event: K,
		callback: (payload: EditorEventMap[K]) => void,
	): void {
		this.events.on(event, callback);
	}

	/** Removes an event listener. */
	off<K extends keyof EditorEventMap>(
		event: K,
		callback: (payload: EditorEventMap[K]) => void,
	): void {
		this.events.off(event, callback);
	}

	// --- Lifecycle ---

	/** Waits for the editor to be ready. */
	whenReady(): Promise<void> {
		return this.lifecycle.whenReady();
	}

	/** Updates configuration at runtime. */
	configure(config: Partial<NotectlEditorConfig>): void {
		this.configController.applyRuntimeConfig(config, this.getConfigDeps());
	}

	// --- Theme API ---

	/** Changes the theme at runtime. */
	setTheme(theme: ThemePreset | Theme): void {
		this.configController.applyTheme(theme, this.themeController);
	}

	/** Returns the current theme setting. */
	getTheme(): ThemePreset | Theme {
		return this.configController.getTheme();
	}

	// --- Paper Size API ---

	/** Returns the currently configured paper size, or undefined if fluid layout. */
	getPaperSize(): PaperSize | undefined {
		return this.configController.getPaperSize();
	}

	/** Cleans up the editor. Awaiting ensures async plugin teardown completes. */
	destroy(): Promise<void> {
		this.paperLayout?.destroy();
		this.paperLayout = null;
		this.styleCoordinator.teardown(this.shadowRoot, this.themeController);
		this.themeController?.destroy();
		this.themeController = null;
		this.inputManager?.destroy();
		this.inputManager = null;
		this.view?.destroy();
		const pluginTeardown = this.pluginManager?.destroy() ?? Promise.resolve();
		this.view = null;
		this.pluginManager = null;
		this.lifecycle.reset();
		this.events.clear();
		this.domElements?.wrapper.remove();
		this.domElements = null;
		return pluginTeardown;
	}

	private getConfigDeps(): import('./EditorConfigController.js').ConfigControllerDeps {
		return {
			contentElement: this.domElements?.content ?? null,
			editorWrapper: this.domElements?.wrapper ?? null,
			pluginManager: this.pluginManager,
			themeController: this.themeController,
			applyPaperSize: (size) => this.applyPaperSize(size),
		};
	}

	private applyPaperSize(paperSize: PaperSize | undefined): void {
		if (!this.domElements) return;

		if (!paperSize) {
			this.paperLayout?.apply(null);
			return;
		}

		if (!this.paperLayout) {
			this.paperLayout = new PaperLayoutController(
				this.domElements.wrapper,
				this.domElements.content,
			);
		}
		this.paperLayout.apply(paperSize);
	}

	private onStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		const announcer: HTMLElement | undefined = this.domElements?.announcer;

		// Clear announcer so plugin announcements can be detected
		if (announcer) announcer.textContent = '';

		// Notify plugins (with transaction) — plugins may call context.announce()
		this.pluginManager?.notifyStateChange(oldState, newState, tr);

		// Update empty state
		this.updateEmptyState();

		// Emit events
		this.events.emit('stateChange', { oldState, newState, transaction: tr });

		if (!selectionsEqual(oldState.selection, newState.selection)) {
			this.events.emit('selectionChange', { selection: newState.selection });
		}

		// Announce state changes for screen readers (skip if a plugin already announced)
		if (!announcer?.textContent) {
			const announcement: string | null = buildAnnouncement(oldState, newState, tr);
			if (announcement && announcer) {
				announcer.textContent = announcement;
			}
		}
	}

	private updateEmptyState(): void {
		this.domElements?.content.classList.toggle('notectl-content--empty', this.isEmpty());
	}

	private replaceState(newState: EditorState): void {
		if (!this.view) return;

		this.view.replaceState(newState);
		this.updateEmptyState();
	}
}

// Register custom element (guarded for SSR / non-browser environments)
if (typeof customElements !== 'undefined' && !customElements.get('notectl-editor')) {
	customElements.define('notectl-editor', NotectlEditor);
}

/** Factory function to create and configure a NotectlEditor instance. */
export async function createEditor(config?: NotectlEditorConfig): Promise<NotectlEditor> {
	const editor = document.createElement('notectl-editor') as NotectlEditor;
	await editor.init(config);
	return editor;
}
