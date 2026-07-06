/**
 * NotectlEditor Web Component — the public-facing editor element.
 *
 * Thin shell that delegates initialization to EditorInitializer
 * and exposes the public API surface (content, commands, events, state).
 */

import { selectAll } from '../commands/Commands.js';
import type { InputManager } from '../input/InputManager.js';
import type { Document } from '../model/Document.js';
import type { PaperSize } from '../model/PaperSize.js';
import { isMarkAllowed } from '../model/Schema.js';
import type {
	EventKey,
	Plugin,
	PluginConfig,
	PluginEventCallback,
	ServiceKey,
} from '../plugins/Plugin.js';
import type { PluginManager } from '../plugins/PluginManager.js';
import {
	createStaticReplicaError,
	isStaticHostReplica,
} from '../plugins/print/StaticHostMarker.js';
import type {
	MarkdownParseOptions,
	MarkdownSerializeOptions,
} from '../serialization/MarkdownTypes.js';
import type {
	ContentCSSResult,
	ContentHTMLOptions,
	SetContentHTMLOptions,
} from '../serialization/index.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import type { EditorView } from '../view/EditorView.js';
import {
	getEditorContentHTML,
	getEditorContentMarkdown,
	getEditorJSON,
	getEditorText,
	isEditorEmpty,
	setEditorContentHTML,
	setEditorContentMarkdown,
	setEditorJSON,
	setEditorText,
} from './ContentSerializer.js';
import { EditorConfigController } from './EditorConfigController.js';
import type { EditorDOMElements } from './EditorDOM.js';
import { EditorEventEmitter, type EditorEventMap } from './EditorEventEmitter.js';
import { initializeEditor } from './EditorInitializer.js';
import { EditorLifecycleCoordinator } from './EditorLifecycleCoordinator.js';
import { EditorStyleCoordinator } from './EditorStyleCoordinator.js';
import type { EditorThemeController } from './EditorThemeController.js';
import { PaperLayoutController } from './PaperLayoutController.js';
import type { Theme, ThemePreset } from './theme/ThemeTokens.js';

export type { NotectlEditorConfig, ToolbarConfig } from './EditorConfig.js';
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
	private pendingInitPromise: Promise<import('./EditorInitializer.js').InitResult | null> | null =
		null;
	private cancelPendingInit: (() => void) | null = null;
	private autoInitToken = 0;
	private autoInitQueued = false;
	private initVersion = 0;
	private releaseInit: (() => void) | null = null;
	private announce: ((text: string) => void) | null = null;
	private markdownImportedMessage = 'Markdown imported';

	static get observedAttributes(): string[] {
		return ['placeholder', 'readonly', 'theme', 'paper-size', 'dir'];
	}

	connectedCallback(): void {
		if (isStaticHostReplica(this)) return;
		if (this.lifecycle.isInitialized()) return;
		this.scheduleAutoInit();
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

	/**
	 * Initializes the editor with the given config. Throws on static print
	 * replicas (`data-notectl-static`): they carry replicated print markup and
	 * must never boot a live editor over it.
	 */
	async init(config?: import('./EditorConfig.js').NotectlEditorConfig): Promise<void> {
		if (isStaticHostReplica(this)) {
			throw createStaticReplicaError();
		}
		this.cancelAutoInit();
		if (!this.lifecycle.markInitialized()) return;
		if (config) this.configController.setConfig(config);

		let shadow: ShadowRoot;
		try {
			shadow = this.ensureFreshShadowRoot();
		} catch (error) {
			this.lifecycle.failReady(error);
			throw error;
		}
		const initVersion = ++this.initVersion;
		let cancelled = false;
		const cancel = (): void => {
			cancelled = true;
		};
		this.cancelPendingInit = cancel;
		const preInitPlugins = this.lifecycle.consumePreInitPlugins();

		const initPromise = initializeEditor({
			shadow,
			config: this.configController.getConfig(),
			hostDir: (this.getAttribute('dir') as 'ltr' | 'rtl' | null) ?? undefined,
			configController: this.configController,
			styleCoordinator: this.styleCoordinator,
			events: this.events,
			preInitPlugins,
			isCancelled: () => cancelled || initVersion !== this.initVersion,
		});
		this.pendingInitPromise = initPromise;
		try {
			const result = await initPromise;
			if (!result) {
				if (cancelled || initVersion !== this.initVersion) return;
				throw new Error('Editor initialization completed without a result.');
			}
			if (initVersion !== this.initVersion) return;

			this.view = result.view;
			this.inputManager = result.inputManager;
			this.pluginManager = result.pluginManager;
			this.domElements = result.domElements;
			this.themeController = result.themeController;
			this.paperLayout = result.paperLayout;
			this.announce = result.announce;
			this.markdownImportedMessage = result.markdownImportedMessage;
			this.releaseInit = result.release;

			this.lifecycle.resolveReady();
			this.events.emit('ready', undefined);
		} catch (error) {
			if (initVersion === this.initVersion) {
				this.lifecycle.restorePreInitPlugins(preInitPlugins);
				this.lifecycle.failReady(error);
			}
			throw error;
		} finally {
			if (this.pendingInitPromise === initPromise) {
				this.pendingInitPromise = null;
				this.cancelPendingInit = null;
			}
		}
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
		this.assertInitialized();
		setEditorJSON(doc, this.pluginManager?.schemaRegistry, (s) => this.replaceState(s));
	}

	/**
	 * Returns sanitized HTML representation of the document.
	 *
	 * By default each block element carries a `data-block-id` attribute. This is
	 * part of the wire format: it lets `setContentHTML(getContentHTML())`
	 * preserve block identity so the caret survives content round-trips driven by
	 * external sync (Angular signal forms, RxJS pipes — see ARCHITECTURE §9.2).
	 *
	 * Pass `{ includeBlockIds: false }` for clean export HTML (database storage,
	 * server-side tag/attribute validation, handoff to another system) with no
	 * `data-block-id`. Round-trips then generate fresh ids and no longer preserve
	 * the caret. Works in both `cssMode: 'inline'` and `cssMode: 'classes'`.
	 */
	async getContentHTML(): Promise<string>;
	async getContentHTML(options: ContentHTMLOptions & { cssMode?: 'inline' }): Promise<string>;
	async getContentHTML(
		options: ContentHTMLOptions & { cssMode: 'classes' },
	): Promise<ContentCSSResult>;
	async getContentHTML(options?: ContentHTMLOptions): Promise<string | ContentCSSResult> {
		if (!this.view) throw new Error('Editor not initialized');
		return getEditorContentHTML(this.view.getState(), this.pluginManager?.schemaRegistry, options);
	}

	/**
	 * Sets content from HTML (sanitized). Accepts optional `styleMap` for
	 * class-based round-trip.
	 *
	 * `data-block-id` attributes are adopted as `BlockId`s when they match
	 * the safe pattern (`[A-Za-z0-9_-]{1,64}`) and don't collide within the
	 * document; otherwise fresh IDs are generated. This makes
	 * `setContentHTML(getContentHTML())` identity-preserving (see
	 * ARCHITECTURE §9.2).
	 */
	async setContentHTML(html: string, options?: SetContentHTMLOptions): Promise<void> {
		this.assertInitialized();
		return setEditorContentHTML(
			html,
			this.pluginManager?.schemaRegistry,
			(s) => this.replaceState(s),
			options,
		);
	}

	/**
	 * Returns a Markdown representation of the document.
	 *
	 * Async and genuinely lazy: unlike {@link getContentHTML} (statically bundled),
	 * the Markdown engine is reached only via dynamic `import()`, so it is
	 * code-split out of the core bundle and builds that never touch Markdown pay
	 * nothing (D13). Standard CommonMark/GFM constructs serialize directly;
	 * superset features emit raw HTML by default (`htmlFallback`), or degrade
	 * gracefully when it is disabled.
	 */
	async getContentMarkdown(options?: MarkdownSerializeOptions): Promise<string> {
		if (!this.view) throw new Error('Editor not initialized');
		return getEditorContentMarkdown(
			this.view.getState(),
			this.pluginManager?.schemaRegistry,
			options,
		);
	}

	/**
	 * Replaces the document content from Markdown (CommonMark + GFM).
	 *
	 * Async and lazy like {@link getContentMarkdown}. Existing top-level block IDs
	 * are reused in document order so `setContentMarkdown(getContentMarkdown())`
	 * preserves block identity and keeps the caret stable for unchanged blocks
	 * (ARCHITECTURE §9.2, D10). Raw HTML embedded in the Markdown is parsed back
	 * via the HTML parser so superset features survive the round-trip.
	 */
	async setContentMarkdown(markdown: string, options?: MarkdownParseOptions): Promise<void> {
		this.assertInitialized();
		if (!this.view) return;
		const syntaxExtensions = this.pluginManager?.markdownSyntaxRegistry.getExtensions();
		const merged: MarkdownParseOptions = {
			...options,
			syntaxExtensions: options?.syntaxExtensions ?? syntaxExtensions,
		};
		await setEditorContentMarkdown(
			markdown,
			this.view.getState(),
			this.pluginManager?.schemaRegistry,
			(s) => this.replaceState(s),
			merged,
		);
		// `replaceState` ran synchronously above and cleared the live region (its
		// api-origin no-step transaction yields no announcement), so this is the
		// surviving message for screen readers.
		this.announce?.(this.markdownImportedMessage);
	}

	/** Returns plain text content. */
	getText(): string {
		if (!this.view) throw new Error('Editor not initialized');
		return getEditorText(this.view.getState());
	}

	/**
	 * Replaces the document content from plain text. Lines (`\n`) become
	 * paragraphs. Existing top-level block IDs are reused in document order
	 * so the caret survives `setText(getText())` round-trips. When the input
	 * matches the current text exactly, this is a no-op.
	 */
	setText(value: string): void {
		this.assertInitialized();
		if (!this.view) return;
		setEditorText(value, this.view.getState(), this.pluginManager?.schemaRegistry, (s) =>
			this.replaceState(s),
		);
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

	/**
	 * Waits for the editor to be ready. Rejects immediately on static print
	 * replicas (`data-notectl-static`): they never boot, so the promise would
	 * otherwise hang forever.
	 */
	whenReady(): Promise<void> {
		if (isStaticHostReplica(this)) {
			return Promise.reject(createStaticReplicaError());
		}
		return this.lifecycle.whenReady();
	}

	/** Updates configuration at runtime. */
	configure(config: Partial<import('./EditorConfig.js').NotectlEditorConfig>): void {
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
		this.cancelAutoInit();
		this.initVersion++;
		this.cancelPendingInit?.();
		this.cancelPendingInit = null;
		const pendingInit =
			this.pendingInitPromise?.then(
				() => undefined,
				() => undefined,
			) ?? Promise.resolve();
		this.pendingInitPromise = null;
		this.releaseInit?.();
		this.releaseInit = null;
		this.announce = null;
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
		return Promise.all([pluginTeardown, pendingInit]).then(() => undefined);
	}

	/**
	 * Returns the shadow root the editor boots into, creating it on first use.
	 * Attaching is deferred out of the constructor: for parser-created elements
	 * the constructor runs before attributes and children exist, so an eagerly
	 * attached (empty) shadow root would block a declarative shadow root in the
	 * markup from attaching — losing replicated print content on pages that
	 * register the component before parsing (script in `<head>`). A leftover
	 * declarative root from unmarked markup is emptied to keep the invariant
	 * that an editor boots from a fresh shadow root; static print replicas
	 * never reach this (init() throws on them first).
	 */
	private ensureFreshShadowRoot(): ShadowRoot {
		const existing: ShadowRoot | null = this.shadowRoot;
		if (!existing) return this.attachShadow({ mode: 'open' });
		existing.replaceChildren();
		return existing;
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

	private scheduleAutoInit(): void {
		const token = ++this.autoInitToken;
		this.autoInitQueued = true;
		queueMicrotask(() => {
			if (!this.isConnected) return;
			if (!this.autoInitQueued || this.autoInitToken !== token) return;
			this.autoInitQueued = false;
			if (this.lifecycle.isInitialized()) return;
			// Errors are surfaced via whenReady() and the 'failed' lifecycle state.
			void this.init().catch(() => undefined);
		});
	}

	private cancelAutoInit(): void {
		this.autoInitToken++;
		this.autoInitQueued = false;
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

	private replaceState(newState: EditorState): void {
		if (!this.view) return;
		this.view.replaceState(newState);
	}

	private assertInitialized(): void {
		if (!this.view) {
			throw new Error('Editor not initialized');
		}
	}
}

// Register custom element (guarded for SSR / non-browser environments)
if (typeof customElements !== 'undefined' && !customElements.get('notectl-editor')) {
	customElements.define('notectl-editor', NotectlEditor);
}

/** Factory function to create and configure a NotectlEditor instance. */
export async function createEditor(
	config?: import('./EditorConfig.js').NotectlEditorConfig,
): Promise<NotectlEditor> {
	const editor = document.createElement('notectl-editor') as NotectlEditor;
	await editor.init(config);
	return editor;
}
