/**
 * NotectlEditor Web Component — the public-facing editor element.
 */

import { selectAll } from '../commands/Commands.js';
import { DecorationSet } from '../decorations/Decoration.js';
import { registerBuiltinSpecs } from '../model/BuiltinSpecs.js';
import { type Document, getBlockText } from '../model/Document.js';
import { isMarkAllowed, schemaFromRegistry } from '../model/Schema.js';
import { createCollapsedSelection, selectionsEqual } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import type {
	EventKey,
	Plugin,
	PluginConfig,
	PluginEventCallback,
	ServiceKey,
} from '../plugins/Plugin.js';
import { PluginManager } from '../plugins/PluginManager.js';
import { BEFORE_PRINT } from '../plugins/print/PrintTypes.js';
import { TextFormattingPlugin } from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { TextFormattingConfig } from '../plugins/text-formatting/TextFormattingPlugin.js';
import { ToolbarPlugin } from '../plugins/toolbar/ToolbarPlugin.js';
import type { ToolbarLayoutConfig } from '../plugins/toolbar/ToolbarPlugin.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { EditorView } from '../view/EditorView.js';
import { buildAnnouncement } from './Announcer.js';
import { parseHTMLToDocument } from './DocumentParser.js';
import { serializeDocumentToHTML } from './DocumentSerializer.js';
import { createEditorDOM } from './EditorDOM.js';
import { EditorThemeController } from './EditorThemeController.js';
import { PaperLayoutController } from './PaperLayoutController.js';
import type { PaperSize } from './PaperSize.js';
import { type Theme, ThemePreset } from './theme/ThemeTokens.js';

export interface NotectlEditorConfig {
	/** Controls which inline marks are enabled. Used to auto-configure TextFormattingPlugin. */
	features?: Partial<TextFormattingConfig>;
	plugins?: Plugin[];
	/**
	 * Declarative toolbar layout. Each inner array is a visual group;
	 * separators are rendered between groups. Order = array order.
	 * When set, a ToolbarPlugin is created internally — do not add one to `plugins`.
	 */
	toolbar?: ReadonlyArray<ReadonlyArray<Plugin>>;
	placeholder?: string;
	readonly?: boolean;
	autofocus?: boolean;
	maxHistoryDepth?: number;
	/** Theme preset or custom Theme object. Defaults to ThemePreset.Light. */
	theme?: ThemePreset | Theme;
	/** Paper size for WYSIWYG page layout. When set, content renders at exact paper width. */
	paperSize?: PaperSize;
}

export interface StateChangeEvent {
	oldState: EditorState;
	newState: EditorState;
	transaction: Transaction;
}

type EventMap = {
	stateChange: StateChangeEvent;
	selectionChange: { selection: import('../model/Selection.js').EditorSelection };
	focus: undefined;
	blur: undefined;
	ready: undefined;
};

type EventCallback<T> = (payload: T) => void;

export class NotectlEditor extends HTMLElement {
	private view: EditorView | null = null;
	private pluginManager: PluginManager | null = null;
	private contentElement: HTMLElement | null = null;
	private editorWrapper: HTMLElement | null = null;
	private topPluginContainer: HTMLElement | null = null;
	private bottomPluginContainer: HTMLElement | null = null;
	private announcer: HTMLElement | null = null;
	private config: NotectlEditorConfig = {};
	private eventListeners: Map<string, Set<EventCallback<unknown>>> = new Map();
	private readyPromiseResolve: (() => void) | null = null;
	private readonly readyPromise: Promise<void>;
	private initialized = false;
	private preInitPlugins: Plugin[] = [];
	private themeController: EditorThemeController | null = null;
	private paperLayout: PaperLayoutController | null = null;

	constructor() {
		super();
		this.readyPromise = new Promise((resolve) => {
			this.readyPromiseResolve = resolve;
		});
		this.attachShadow({ mode: 'open' });
	}

	static get observedAttributes(): string[] {
		return ['placeholder', 'readonly', 'theme', 'paper-size'];
	}

	connectedCallback(): void {
		if (this.initialized) return;
		this.init();
	}

	disconnectedCallback(): void {
		this.destroy();
	}

	attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
		if (name === 'placeholder' && this.contentElement) {
			this.contentElement.setAttribute('data-placeholder', newValue ?? '');
		}
		if (name === 'readonly' && this.contentElement) {
			const isReadonly: boolean = newValue !== null;
			this.contentElement.contentEditable = isReadonly ? 'false' : 'true';
			if (isReadonly) {
				this.contentElement.setAttribute('aria-readonly', 'true');
			} else {
				this.contentElement.removeAttribute('aria-readonly');
			}
		}
		if (name === 'theme' && this.themeController) {
			this.themeController.apply((newValue as ThemePreset) ?? ThemePreset.Light);
		}
		if (name === 'paper-size') {
			this.configure({ paperSize: (newValue as PaperSize) ?? undefined });
		}
	}

	/** Registers a plugin before initialization. */
	registerPlugin(plugin: Plugin): void {
		if (this.initialized) {
			throw new Error(
				'Cannot register plugins after initialization. Register before calling init() or adding to DOM.',
			);
		}
		this.preInitPlugins.push(plugin);
	}

	/** Initializes the editor with the given config. */
	async init(config?: NotectlEditorConfig): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;

		if (config) this.config = config;

		const shadow = this.shadowRoot;
		if (!shadow) return;

		// Apply theme (default: Light) — must happen before editor stylesheet
		this.themeController = new EditorThemeController(shadow);
		this.themeController.apply(this.config.theme ?? ThemePreset.Light);

		// 1. Build DOM structure
		const dom = createEditorDOM({
			readonly: this.config.readonly,
			placeholder: this.config.placeholder,
		});
		this.editorWrapper = dom.wrapper;
		this.contentElement = dom.content;
		this.topPluginContainer = dom.topPluginContainer;
		this.bottomPluginContainer = dom.bottomPluginContainer;
		this.announcer = dom.announcer;

		shadow.appendChild(this.editorWrapper);

		// Apply paper layout if configured (before plugins, so initial render is correct)
		if (this.config.paperSize) {
			this.paperLayout = new PaperLayoutController(this.editorWrapper, this.contentElement);
			this.paperLayout.apply(this.config.paperSize);
		}

		// 2. Create PluginManager (SchemaRegistry is available)
		this.pluginManager = new PluginManager();

		// 3. Register built-in specs on the registry
		registerBuiltinSpecs(this.pluginManager.schemaRegistry);

		// Process declarative toolbar config (registers ToolbarPlugin + toolbar plugins)
		this.processToolbarConfig();

		// Register plugins from config
		for (const plugin of this.config.plugins ?? []) {
			this.pluginManager.register(plugin);
		}

		// Register plugins from registerPlugin() calls
		for (const plugin of this.preInitPlugins) {
			this.pluginManager.register(plugin);
		}
		this.preInitPlugins = [];

		// Auto-register TextFormattingPlugin if none was explicitly provided
		this.ensureTextFormattingPlugin();

		// Set up DOM events before plugin init
		this.contentElement.addEventListener('focus', () => this.emit('focus', undefined));
		this.contentElement.addEventListener('blur', () => this.emit('blur', undefined));

		// 4. Initialize plugins — specs are registered during init().
		//    onBeforeReady fires after all init() but before onReady(),
		//    so the schema is complete and the view renders once.
		const contentEl = this.contentElement;
		const pluginMgr = this.pluginManager;
		const topContainer = this.topPluginContainer;
		const bottomContainer = this.bottomPluginContainer;
		if (!contentEl || !pluginMgr || !topContainer || !bottomContainer) return;

		const announcer = this.announcer;
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
			onBeforeReady: () => {
				const schema = schemaFromRegistry(pluginMgr.schemaRegistry);
				const state = EditorState.create({ schema });
				this.view = new EditorView(contentEl, {
					state,
					schemaRegistry: pluginMgr.schemaRegistry,
					maxHistoryDepth: this.config.maxHistoryDepth,
					getDecorations: (s, tr) =>
						this.pluginManager?.collectDecorations(s, tr) ?? DecorationSet.empty,
					onStateChange: (oldState, newState, tr) => {
						this.onStateChange(oldState, newState, tr);
					},
				});
				this.updateEmptyState();

				// Inject plugin-registered stylesheets into adopted stylesheets
				const pluginSheets = pluginMgr.getPluginStyleSheets();
				if (pluginSheets.length > 0) {
					this.themeController?.setPluginStyleSheets(pluginSheets);
				}
			},
		});

		// Register BEFORE_PRINT listener to inject paperSize as fallback
		this.pluginManager.onEvent(BEFORE_PRINT, (event) => {
			if (!event.options.paperSize && this.config.paperSize) {
				event.options = { ...event.options, paperSize: this.config.paperSize };
			}
		});

		if (this.config.autofocus) {
			requestAnimationFrame(() => this.contentElement?.focus());
		}

		this.readyPromiseResolve?.();
		this.emit('ready', undefined);
	}

	// --- Content API ---

	/** Returns the document as JSON. */
	getJSON(): Document {
		if (!this.view) throw new Error('Editor not initialized');
		return this.view.getState().doc;
	}

	/** Sets the document from JSON. */
	setJSON(doc: Document): void {
		const schema = this.pluginManager
			? schemaFromRegistry(this.pluginManager.schemaRegistry)
			: undefined;
		const state = EditorState.create({
			doc,
			schema,
			selection: createCollapsedSelection(doc.children[0]?.id ?? blockId(''), 0),
		});
		this.replaceState(state);
	}

	/** Returns sanitized HTML representation of the document. */
	getHTML(): string {
		if (!this.view) throw new Error('Editor not initialized');
		return serializeDocumentToHTML(this.view.getState().doc, this.pluginManager?.schemaRegistry);
	}

	/** Sets content from HTML (sanitized). */
	setHTML(html: string): void {
		const doc = parseHTMLToDocument(html, this.pluginManager?.schemaRegistry);
		this.setJSON(doc);
	}

	/** Returns plain text content. */
	getText(): string {
		if (!this.view) throw new Error('Editor not initialized');
		const doc = this.view.getState().doc;
		return doc.children.map((b) => getBlockText(b)).join('\n');
	}

	/** Returns true if the editor is empty (single empty paragraph). */
	isEmpty(): boolean {
		if (!this.view) return true;
		const doc = this.view.getState().doc;
		if (doc.children.length === 0) return true;
		if (doc.children.length > 1) return false;
		const block = doc.children[0];
		if (!block) return true;
		return block.type === 'paragraph' && getBlockText(block) === '';
	}

	// --- Command API ---

	readonly commands = {
		toggleBold: () => this.executeCommand('toggleBold'),
		toggleItalic: () => this.executeCommand('toggleItalic'),
		toggleUnderline: () => this.executeCommand('toggleUnderline'),
		undo: () => this.view?.undo(),
		redo: () => this.view?.redo(),
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
	} {
		const schema = this.view?.getState().schema;
		return {
			toggleBold: () => (schema ? isMarkAllowed(schema, 'bold') : false),
			toggleItalic: () => (schema ? isMarkAllowed(schema, 'italic') : false),
			toggleUnderline: () => (schema ? isMarkAllowed(schema, 'underline') : false),
			undo: () => this.view?.history.canUndo() ?? false,
			redo: () => this.view?.history.canRedo() ?? false,
		};
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
	on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, new Set());
		}
		this.eventListeners.get(event)?.add(callback as EventCallback<unknown>);
	}

	/** Removes an event listener. */
	off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
		this.eventListeners.get(event)?.delete(callback as EventCallback<unknown>);
	}

	// --- Lifecycle ---

	/** Waits for the editor to be ready. */
	whenReady(): Promise<void> {
		return this.readyPromise;
	}

	/** Updates configuration at runtime. */
	configure(config: Partial<NotectlEditorConfig>): void {
		if (config.placeholder !== undefined && this.contentElement) {
			this.contentElement.setAttribute('data-placeholder', config.placeholder);
		}

		if (config.readonly !== undefined && this.contentElement) {
			this.contentElement.contentEditable = config.readonly ? 'false' : 'true';
			if (config.readonly) {
				this.contentElement.setAttribute('aria-readonly', 'true');
			} else {
				this.contentElement.removeAttribute('aria-readonly');
			}
		}

		if (config.paperSize !== undefined) {
			this.applyPaperSize(config.paperSize);
		}

		this.config = { ...this.config, ...config };
	}

	// --- Theme API ---

	/** Changes the theme at runtime. */
	setTheme(theme: ThemePreset | Theme): void {
		this.config = { ...this.config, theme };
		this.themeController?.apply(theme);
	}

	/** Returns the current theme setting. */
	getTheme(): ThemePreset | Theme {
		return this.config.theme ?? ThemePreset.Light;
	}

	// --- Paper Size API ---

	/** Returns the currently configured paper size, or undefined if fluid layout. */
	getPaperSize(): PaperSize | undefined {
		return this.config.paperSize;
	}

	/** Cleans up the editor. Awaiting ensures async plugin teardown completes. */
	destroy(): Promise<void> {
		this.paperLayout?.destroy();
		this.paperLayout = null;
		this.themeController?.destroy();
		this.themeController = null;
		this.view?.destroy();
		const pluginTeardown = this.pluginManager?.destroy() ?? Promise.resolve();
		this.view = null;
		this.pluginManager = null;
		this.initialized = false;
		return pluginTeardown;
	}

	/**
	 * Processes the declarative `toolbar` config: registers a ToolbarPlugin
	 * with layout groups, then registers all plugins from the toolbar groups.
	 */
	private processToolbarConfig(): void {
		if (!this.pluginManager || !this.config.toolbar) return;

		const groups: string[][] = [];
		for (const group of this.config.toolbar) {
			const pluginIds: string[] = [];
			for (const plugin of group) {
				pluginIds.push(plugin.id);
				this.pluginManager.register(plugin);
			}
			groups.push(pluginIds);
		}

		const layoutConfig: ToolbarLayoutConfig = { groups };
		this.pluginManager.register(new ToolbarPlugin(layoutConfig));
	}

	/**
	 * Auto-registers TextFormattingPlugin if no plugin with id 'text-formatting'
	 * was explicitly registered. Uses the `features` config to determine which marks to enable.
	 */
	private ensureTextFormattingPlugin(): void {
		if (!this.pluginManager) return;

		const hasTextFormatting = this.pluginManager.get('text-formatting') !== undefined;
		if (hasTextFormatting) return;

		const features: TextFormattingConfig = {
			bold: this.config.features?.bold ?? true,
			italic: this.config.features?.italic ?? true,
			underline: this.config.features?.underline ?? true,
		};

		this.pluginManager.register(new TextFormattingPlugin(features));
	}

	private applyPaperSize(paperSize: PaperSize | undefined): void {
		if (!this.editorWrapper || !this.contentElement) return;

		if (!paperSize) {
			this.paperLayout?.apply(null);
			return;
		}

		if (!this.paperLayout) {
			this.paperLayout = new PaperLayoutController(this.editorWrapper, this.contentElement);
		}
		this.paperLayout.apply(paperSize);
	}

	private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
		const listeners = this.eventListeners.get(event);
		if (listeners) {
			for (const cb of listeners) {
				(cb as EventCallback<EventMap[K]>)(payload);
			}
		}
	}

	private onStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		// Clear announcer so plugin announcements can be detected
		if (this.announcer) this.announcer.textContent = '';

		// Notify plugins (with transaction) — plugins may call context.announce()
		this.pluginManager?.notifyStateChange(oldState, newState, tr);

		// Update empty state
		this.updateEmptyState();

		// Emit events
		this.emit('stateChange', { oldState, newState, transaction: tr });

		if (!selectionsEqual(oldState.selection, newState.selection)) {
			this.emit('selectionChange', { selection: newState.selection });
		}

		// Announce state changes for screen readers (skip if a plugin already announced)
		if (!this.announcer?.textContent) {
			const announcement: string | null = buildAnnouncement(oldState, newState, tr);
			if (announcement && this.announcer) {
				this.announcer.textContent = announcement;
			}
		}
	}

	private updateEmptyState(): void {
		if (!this.contentElement) return;
		this.contentElement.classList.toggle('notectl-content--empty', this.isEmpty());
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
