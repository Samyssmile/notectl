/**
 * NotectlEditor Web Component — the public-facing editor element.
 *
 * Thin shell that delegates initialization to EditorInitializer
 * and exposes the public API surface (content, commands, events, state).
 */

import { selectAll } from '../commands/Commands.js';
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
import { type InitResult, initializeEditor } from './EditorInitializer.js';
import {
	EditorInitializationAbortedError,
	EditorLifecycleCoordinator,
} from './EditorLifecycleCoordinator.js';
import { EditorStyleCoordinator } from './EditorStyleCoordinator.js';
import type { EditorThemeController } from './EditorThemeController.js';
import { PaperLayoutController } from './PaperLayoutController.js';
import type { Theme, ThemePreset } from './theme/ThemeTokens.js';

export type { NotectlEditorConfig, ToolbarConfig } from './EditorConfig.js';
export type { StateChangeEvent } from './EditorEventEmitter.js';
export type { EditorEventMap } from './EditorEventEmitter.js';

export class NotectlEditor extends HTMLElement {
	private view: EditorView | null = null;
	private pluginManager: PluginManager | null = null;
	private domElements: EditorDOMElements | null = null;
	private readonly configController = new EditorConfigController();
	private readonly events = new EditorEventEmitter();
	private readonly lifecycle = new EditorLifecycleCoordinator();
	private readonly styleCoordinator = new EditorStyleCoordinator();
	private themeController: EditorThemeController | null = null;
	private paperLayout: PaperLayoutController | null = null;
	private activeInitResult: InitResult | null = null;
	private pendingInitPromise: Promise<void> | null = null;
	private pendingDestroyPromise: Promise<void> | null = null;
	private cancelPendingInit: (() => void) | null = null;
	private autoInitToken = 0;
	private autoInitQueued = false;
	private initVersion = 0;
	private destroyVersion = 0;
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
	 *
	 * A config-less concurrent call joins the active initialization. Configuration
	 * belongs exclusively to the call that starts a generation; supplying config
	 * to a later call is rejected after the active initialization settles. Every
	 * caller joined to a generation rejects with EditorInitializationAbortedError
	 * when destroy() abandons that generation.
	 */
	async init(config?: import('./EditorConfig.js').NotectlEditorConfig): Promise<void> {
		if (isStaticHostReplica(this)) {
			throw createStaticReplicaError();
		}
		this.cancelAutoInit();
		const destroyVersionBeforeTeardown: number = this.destroyVersion;
		const pendingDestroy: Promise<void> | null = this.pendingDestroyPromise;
		if (pendingDestroy) {
			await pendingDestroy;
			// A later destroy request supersedes an init that was queued behind the
			// first teardown. A sibling init starting after the same teardown does
			// not: it becomes the owner that this call joins below.
			if (destroyVersionBeforeTeardown !== this.destroyVersion) {
				throw new EditorInitializationAbortedError();
			}
		}

		const activeInit: Promise<void> | null = this.pendingInitPromise;
		if (activeInit) {
			// The first call owns this initialization generation and its config. A
			// config-less call is an idempotent join. A later config cannot be merged
			// safely once plugin/schema setup has started, so wait for the active call
			// and then reject explicitly instead of silently ignoring it.
			await activeInit;
			if (config) {
				throw new Error(
					'Cannot apply init config while another initialization is in progress. ' +
						'Await the active init, then destroy and initialize a new generation.',
				);
			}
			return;
		}

		if (!this.lifecycle.markInitialized()) {
			if (config) {
				throw new Error(
					'Cannot apply init config after the editor is initialized. ' +
						'Use configure() for runtime options or destroy() before re-initializing.',
				);
			}
			return;
		}
		if (config) this.configController.setConfig(config);
		this.events.setLogger(this.configController.getConfig().logger);

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

		const initResultPromise: Promise<InitResult | null> = initializeEditor({
			shadow,
			config: this.configController.getConfig(),
			hostDir: (this.getAttribute('dir') as 'ltr' | 'rtl' | null) ?? undefined,
			configController: this.configController,
			styleCoordinator: this.styleCoordinator,
			events: this.events,
			preInitPlugins,
			isCancelled: () => cancelled || initVersion !== this.initVersion,
		});
		const initPromise: Promise<void> = this.completeInitialization(
			initResultPromise,
			initVersion,
			() => cancelled || initVersion !== this.initVersion,
			preInitPlugins,
		);
		this.pendingInitPromise = initPromise;
		try {
			await initPromise;
		} finally {
			if (this.pendingInitPromise === initPromise) {
				this.pendingInitPromise = null;
				this.cancelPendingInit = null;
			}
		}
	}

	/** Completes one initialization generation, including host publication and readiness. */
	private async completeInitialization(
		resultPromise: Promise<InitResult | null>,
		generation: number,
		isCancelled: () => boolean,
		preInitPlugins: readonly Plugin[],
	): Promise<void> {
		let publishedResult: InitResult | null = null;
		try {
			const result: InitResult | null = await resultPromise;
			if (!result) {
				if (isCancelled()) throw new EditorInitializationAbortedError();
				throw new Error('Editor initialization completed without a result.');
			}
			if (generation !== this.initVersion) {
				await result.dispose();
				throw new EditorInitializationAbortedError();
			}

			// No asynchronous boundary exists between the generation check and this
			// assignment: ownership moves to the host atomically within this turn.
			this.activeInitResult = result;
			publishedResult = result;
			this.view = result.view;
			this.pluginManager = result.pluginManager;
			this.domElements = result.domElements;
			this.themeController = result.themeController;
			this.paperLayout = result.paperLayout;
			this.announce = result.announce;
			this.markdownImportedMessage = result.markdownImportedMessage;

			this.lifecycle.resolveReady();
			this.events.emit('ready', undefined);
			if (generation !== this.initVersion) throw new EditorInitializationAbortedError();
		} catch (error) {
			if (publishedResult && this.activeInitResult === publishedResult) {
				this.activeInitResult = null;
				this.clearPublishedRuntime();
				await publishedResult.dispose();
			}
			if (generation === this.initVersion) {
				this.lifecycle.restorePreInitPlugins(preInitPlugins);
				this.lifecycle.failReady(error);
			}
			throw error;
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
		const owningView: EditorView | null = this.view;
		const owningPluginManager: PluginManager | null = this.pluginManager;
		const owningAnnounce: ((text: string) => void) | null = this.announce;
		const owningMarkdownImportedMessage: string = this.markdownImportedMessage;
		if (!owningView) return;
		const generation: number = this.initVersion;
		const syntaxExtensions = owningPluginManager?.markdownSyntaxRegistry.getExtensions();
		const merged: MarkdownParseOptions = {
			...options,
			syntaxExtensions: options?.syntaxExtensions ?? syntaxExtensions,
		};
		let committed = false;
		await setEditorContentMarkdown(
			markdown,
			owningView.getState(),
			owningPluginManager?.schemaRegistry,
			(state) => {
				if (
					generation !== this.initVersion ||
					this.view !== owningView ||
					this.pluginManager !== owningPluginManager
				) {
					return;
				}
				owningView.replaceState(state);
				committed = true;
			},
			merged,
		);
		if (
			!committed ||
			generation !== this.initVersion ||
			this.view !== owningView ||
			this.pluginManager !== owningPluginManager ||
			this.announce !== owningAnnounce
		) {
			return;
		}
		// `replaceState` ran synchronously above and cleared the live region (its
		// api-origin no-step transaction yields no announcement), so this is the
		// surviving message for screen readers.
		owningAnnounce?.(owningMarkdownImportedMessage);
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
	 * otherwise hang forever. Rejects with EditorInitializationAbortedError when
	 * destroy() abandons the initialization generation being awaited.
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
		if ('logger' in config) this.events.setLogger(config.logger);
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
		if (this.pendingDestroyPromise) {
			this.destroyVersion++;
			this.initVersion++;
			this.cancelPendingInit?.();
			// A queued init waits on this teardown and owns the fresh readiness
			// generation created by the first destroy. This later destroy supersedes
			// that queued init, so its waiters must be aborted as well.
			this.lifecycle.reset();
			return this.pendingDestroyPromise;
		}
		this.destroyVersion++;
		this.initVersion++;
		this.cancelPendingInit?.();
		this.cancelPendingInit = null;
		const pendingInit =
			this.pendingInitPromise?.then(
				() => undefined,
				() => undefined,
			) ?? Promise.resolve();
		this.pendingInitPromise = null;
		const activeResult: InitResult | null = this.activeInitResult;
		this.activeInitResult = null;
		this.clearPublishedRuntime();
		this.lifecycle.reset();
		this.events.clear();
		// Defer the first teardown callback until the host has synchronously
		// published both the empty runtime and the tracked destruction barrier.
		// Plugin/NodeView destroy hooks can safely re-enter init(): they will join
		// this barrier instead of observing or reviving the retiring generation.
		const completion: Promise<void> = Promise.resolve().then(() => {
			const runtimeTeardown: Promise<void> = activeResult?.dispose() ?? Promise.resolve();
			return Promise.all([runtimeTeardown, pendingInit]).then(() => undefined);
		});
		const trackedCompletion: Promise<void> = completion.finally(() => {
			if (this.pendingDestroyPromise === trackedCompletion) {
				this.pendingDestroyPromise = null;
			}
		});
		this.pendingDestroyPromise = trackedCompletion;
		return trackedCompletion;
	}

	/** Clears host aliases; resource destruction remains owned by InitResult.dispose(). */
	private clearPublishedRuntime(): void {
		this.view = null;
		this.pluginManager = null;
		this.domElements = null;
		this.themeController = null;
		this.paperLayout = null;
		this.announce = null;
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

/** Factory function to create and configure a NotectlEditor instance. */
export async function createEditor(
	config?: import('./EditorConfig.js').NotectlEditorConfig,
): Promise<NotectlEditor> {
	const editor = document.createElement('notectl-editor') as NotectlEditor;
	await editor.init(config);
	return editor;
}
