/**
 * NotectlEditor Web Component — the public-facing editor element.
 */

import DOMPurify from 'dompurify';
import { isMarkActive, selectAll } from '../commands/Commands.js';
import { DecorationSet } from '../decorations/Decoration.js';
import { isMarkOfType, isNodeOfType } from '../model/AttrRegistry.js';
import { registerBuiltinSpecs } from '../model/BuiltinSpecs.js';
import {
	type BlockNode,
	type Document,
	type Mark,
	type TextNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	getTextChildren,
} from '../model/Document.js';
import { schemaFromRegistry } from '../model/Schema.js';
import { isMarkAllowed } from '../model/Schema.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId, nodeType, markType as toMarkType } from '../model/TypeBrands.js';
import type { Plugin, PluginConfig } from '../plugins/Plugin.js';
import { PluginManager } from '../plugins/PluginManager.js';
import { TextFormattingPlugin } from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { TextFormattingConfig } from '../plugins/text-formatting/TextFormattingPlugin.js';
import { ToolbarPlugin } from '../plugins/toolbar/ToolbarPlugin.js';
import type { ToolbarLayoutConfig } from '../plugins/toolbar/ToolbarPlugin.js';
import { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { EditorView } from '../view/EditorView.js';
import { getEditorStyleSheet } from './styles.js';

// --- Config Types ---

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
}

// --- Event Types ---

export interface StateChangeEvent {
	oldState: EditorState;
	newState: EditorState;
	transaction: Transaction;
}

type EventMap = {
	stateChange: StateChangeEvent;
	selectionChange: { selection: import('../model/Selection.js').Selection };
	focus: undefined;
	blur: undefined;
	ready: undefined;
};

type EventCallback<T> = (payload: T) => void;

// --- Web Component ---

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

	constructor() {
		super();
		this.readyPromise = new Promise((resolve) => {
			this.readyPromiseResolve = resolve;
		});
		this.attachShadow({ mode: 'open' });
	}

	static get observedAttributes(): string[] {
		return ['placeholder', 'readonly'];
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
			this.contentElement.contentEditable = newValue === null ? 'true' : 'false';
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
		shadow.adoptedStyleSheets = [getEditorStyleSheet()];

		// 1. Build DOM structure
		this.editorWrapper = document.createElement('div');
		this.editorWrapper.className = 'notectl-editor';

		this.topPluginContainer = document.createElement('div');
		this.topPluginContainer.className = 'notectl-plugin-container--top';

		this.contentElement = document.createElement('div');
		this.contentElement.className = 'notectl-content';
		this.contentElement.contentEditable = this.config.readonly ? 'false' : 'true';
		this.contentElement.setAttribute('role', 'textbox');
		this.contentElement.setAttribute('aria-multiline', 'true');
		this.contentElement.setAttribute('aria-label', 'Rich text editor');
		this.contentElement.setAttribute(
			'data-placeholder',
			this.config.placeholder ?? 'Start typing...',
		);

		this.bottomPluginContainer = document.createElement('div');
		this.bottomPluginContainer.className = 'notectl-plugin-container--bottom';

		// Screen reader announcer
		this.announcer = document.createElement('div');
		this.announcer.className = 'notectl-sr-only';
		this.announcer.setAttribute('aria-live', 'polite');
		this.announcer.setAttribute('aria-atomic', 'true');

		this.editorWrapper.appendChild(this.topPluginContainer);
		this.editorWrapper.appendChild(this.contentElement);
		this.editorWrapper.appendChild(this.bottomPluginContainer);
		this.editorWrapper.appendChild(this.announcer);

		shadow.appendChild(this.editorWrapper);

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

		await pluginMgr.init({
			getState: () => {
				if (!this.view) throw new Error('View not initialized');
				return this.view.getState();
			},
			dispatch: (tr) => this.dispatch(tr),
			getContainer: () => contentEl,
			getPluginContainer: (position) => (position === 'top' ? topContainer : bottomContainer),
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
			},
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
		const doc = this.view.getState().doc;
		const parts: string[] = [];
		let currentListTag: string | null = null;

		for (const block of doc.children) {
			if (isNodeOfType(block, 'list_item')) {
				const listType = block.attrs.listType;
				const tag = listType === 'ordered' ? 'ol' : 'ul';

				if (currentListTag !== tag) {
					if (currentListTag) parts.push(`</${currentListTag}>`);
					parts.push(`<${tag}>`);
					currentListTag = tag;
				}

				const inner = getTextChildren(block)
					.map((c) => this.textNodeToHTML(c))
					.join('');
				parts.push(`<li>${inner || '<br>'}</li>`);
			} else {
				if (currentListTag) {
					parts.push(`</${currentListTag}>`);
					currentListTag = null;
				}
				parts.push(this.blockToHTML(block));
			}
		}

		if (currentListTag) parts.push(`</${currentListTag}>`);

		return DOMPurify.sanitize(parts.join(''), {
			ALLOWED_TAGS: [
				'p',
				'strong',
				'em',
				'u',
				'b',
				'i',
				'br',
				'div',
				'hr',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'ul',
				'ol',
				'li',
				'a',
				's',
				'span',
				'blockquote',
			],
			ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
		});
	}

	/** Sets content from HTML (sanitized). */
	setHTML(html: string): void {
		const sanitized = DOMPurify.sanitize(html, {
			ALLOWED_TAGS: [
				'p',
				'strong',
				'em',
				'u',
				'b',
				'i',
				'br',
				'div',
				'hr',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'ul',
				'ol',
				'li',
				'a',
				's',
				'span',
				'blockquote',
			],
			ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
		});

		const doc = this.parseHTMLToDocument(sanitized);
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
		}

		this.config = { ...this.config, ...config };
	}

	/** Cleans up the editor. Awaiting ensures async plugin teardown completes. */
	destroy(): Promise<void> {
		this.view?.destroy();
		const pluginTeardown = this.pluginManager?.destroy() ?? Promise.resolve();
		this.view = null;
		this.pluginManager = null;
		this.initialized = false;
		return pluginTeardown;
	}

	// --- Private ---

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

	private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
		const listeners = this.eventListeners.get(event);
		if (listeners) {
			for (const cb of listeners) {
				(cb as EventCallback<EventMap[K]>)(payload);
			}
		}
	}

	private onStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		// Notify plugins (with transaction)
		this.pluginManager?.notifyStateChange(oldState, newState, tr);

		// Update empty state
		this.updateEmptyState();

		// Emit events
		this.emit('stateChange', { oldState, newState, transaction: tr });

		if (
			oldState.selection.anchor.blockId !== newState.selection.anchor.blockId ||
			oldState.selection.anchor.offset !== newState.selection.anchor.offset ||
			oldState.selection.head.blockId !== newState.selection.head.blockId ||
			oldState.selection.head.offset !== newState.selection.head.offset
		) {
			this.emit('selectionChange', { selection: newState.selection });
		}

		// Announce formatting changes for screen readers
		this.announceFormatChange(oldState, newState);
	}

	private updateEmptyState(): void {
		if (!this.contentElement) return;
		this.contentElement.classList.toggle('notectl-content--empty', this.isEmpty());
	}

	private announceFormatChange(oldState: EditorState, newState: EditorState): void {
		if (!this.announcer) return;

		// Announce changes for all mark types in the schema
		const markTypes = newState.schema.markTypes;
		for (const mt of markTypes) {
			const branded = toMarkType(mt);
			const wasActive = isMarkActive(oldState, branded);
			const nowActive = isMarkActive(newState, branded);
			if (wasActive !== nowActive) {
				this.announcer.textContent = `${mt} ${nowActive ? 'on' : 'off'}`;
				return;
			}
		}
	}

	private replaceState(newState: EditorState): void {
		if (!this.view) return;

		this.view.replaceState(newState);
		this.updateEmptyState();
	}

	private blockToHTML(block: BlockNode): string {
		if (block.type === 'horizontal_rule') {
			return '<hr>';
		}

		const inner = getTextChildren(block)
			.map((child) => this.textNodeToHTML(child))
			.join('');
		const content = inner || '<br>';

		const align: string | undefined = (block.attrs as Record<string, unknown>)?.textAlign as
			| string
			| undefined;
		const style: string = align && align !== 'left' ? ` style="text-align: ${align}"` : '';

		if (isNodeOfType(block, 'heading')) {
			const level = block.attrs.level;
			const tag: string = `h${Math.max(1, Math.min(6, level))}`;
			return `<${tag}${style}>${content}</${tag}>`;
		}

		if (block.type === 'blockquote') {
			return `<blockquote${style}>${content}</blockquote>`;
		}

		return `<p${style}>${content}</p>`;
	}

	private textNodeToHTML(node: TextNode): string {
		if (node.text === '') return '';

		let html = this.escapeHTML(node.text);

		// Sort marks by MarkSpec.rank from the schema registry (lower = closer to text)
		const markOrder = this.getMarkOrder();
		const sortedMarks = [...node.marks].sort(
			(a, b) => (markOrder.get(a.type) ?? 99) - (markOrder.get(b.type) ?? 99),
		);

		for (const mark of sortedMarks) {
			if (isMarkOfType(mark, 'bold')) {
				html = `<strong>${html}</strong>`;
			} else if (isMarkOfType(mark, 'italic')) {
				html = `<em>${html}</em>`;
			} else if (isMarkOfType(mark, 'underline')) {
				html = `<u>${html}</u>`;
			} else if (isMarkOfType(mark, 'strikethrough')) {
				html = `<s>${html}</s>`;
			} else if (isMarkOfType(mark, 'textColor')) {
				const color = this.escapeHTML(mark.attrs.color);
				html = `<span style="color: ${color}">${html}</span>`;
			} else if (isMarkOfType(mark, 'font')) {
				const family: string = mark.attrs?.family ?? '';
				if (family) {
					html = `<span style="font-family: ${this.escapeHTML(family)}">${html}</span>`;
				}
			} else if (isMarkOfType(mark, 'link')) {
				const href = this.escapeHTML(mark.attrs.href);
				html = `<a href="${href}">${html}</a>`;
			}
		}

		return html;
	}

	private getMarkOrder(): Map<string, number> {
		const registry = this.pluginManager?.schemaRegistry;
		if (!registry) return new Map();
		const types = registry.getMarkTypes();
		const order = new Map<string, number>();
		for (const t of types) {
			const spec = registry.getMarkSpec(t);
			if (spec) order.set(t, spec.rank ?? 99);
		}
		return order;
	}

	private escapeHTML(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	private parseHTMLToDocument(html: string): Document {
		const template = document.createElement('template');
		template.innerHTML = DOMPurify.sanitize(html);
		const root = template.content;

		const blocks: BlockNode[] = [];

		for (const child of Array.from(root.childNodes)) {
			if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				const tag = el.tagName.toLowerCase();

				// Headings
				const headingMatch = /^h([1-6])$/.exec(tag);
				if (headingMatch) {
					const level = Number(headingMatch[1]);
					const textNodes = this.parseElementToTextNodes(el);
					blocks.push(createBlockNode(nodeType('heading'), textNodes, undefined, { level }));
					continue;
				}

				// Horizontal Rule
				if (tag === 'hr') {
					blocks.push(createBlockNode(nodeType('horizontal_rule')));
					continue;
				}

				// Lists
				if (tag === 'ul' || tag === 'ol') {
					const listType = tag === 'ol' ? 'ordered' : 'bullet';
					for (const li of Array.from(el.querySelectorAll('li'))) {
						const textNodes = this.parseElementToTextNodes(li as HTMLElement);
						blocks.push(
							createBlockNode(nodeType('list_item'), textNodes, undefined, {
								listType,
								indent: 0,
								checked: false,
							}),
						);
					}
					continue;
				}

				// Regular blocks (p, div, etc.)
				const textNodes = this.parseElementToTextNodes(el);
				blocks.push(createBlockNode(nodeType('paragraph'), textNodes));
			} else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
				blocks.push(
					createBlockNode(nodeType('paragraph'), [createTextNode(child.textContent.trim())]),
				);
			}
		}

		if (blocks.length === 0) {
			return createDocument();
		}

		return createDocument(blocks);
	}

	private parseElementToTextNodes(el: HTMLElement): TextNode[] {
		const result: TextNode[] = [];
		this.walkElement(el, [], result);
		return result.length > 0 ? result : [createTextNode('')];
	}

	private walkElement(node: Node, currentMarks: Mark[], result: TextNode[]): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? '';
			if (text) {
				result.push(createTextNode(text, [...currentMarks]));
			}
			return;
		}

		if (node.nodeType !== Node.ELEMENT_NODE) return;

		const el = node as HTMLElement;
		const tag = el.tagName.toLowerCase();

		const marks = [...currentMarks];
		if (tag === 'strong' || tag === 'b') {
			if (!marks.some((m) => m.type === 'bold')) marks.push({ type: toMarkType('bold') });
		}
		if (tag === 'em' || tag === 'i') {
			if (!marks.some((m) => m.type === 'italic')) marks.push({ type: toMarkType('italic') });
		}
		if (tag === 'u') {
			if (!marks.some((m) => m.type === 'underline')) marks.push({ type: toMarkType('underline') });
		}
		if (tag === 's') {
			if (!marks.some((m) => m.type === 'strikethrough'))
				marks.push({ type: toMarkType('strikethrough') });
		}
		if (tag === 'span') {
			const color = el.style.color;
			if (color && !marks.some((m) => m.type === 'textColor')) {
				marks.push({ type: toMarkType('textColor'), attrs: { color } });
			}
			const fontFamily = el.style.fontFamily;
			if (fontFamily && !marks.some((m) => m.type === 'font')) {
				marks.push({ type: toMarkType('font'), attrs: { family: fontFamily } });
			}
		}
		if (tag === 'a') {
			const href = (el as HTMLAnchorElement).getAttribute('href') ?? '';
			if (!marks.some((m) => m.type === 'link'))
				marks.push({ type: toMarkType('link'), attrs: { href } });
		}

		for (const child of Array.from(el.childNodes)) {
			this.walkElement(child, marks, result);
		}
	}
}

// Register custom element
if (!customElements.get('notectl-editor')) {
	customElements.define('notectl-editor', NotectlEditor);
}

/** Factory function to create and configure a NotectlEditor instance. */
export async function createEditor(config?: NotectlEditorConfig): Promise<NotectlEditor> {
	const editor = document.createElement('notectl-editor') as NotectlEditor;
	await editor.init(config);
	return editor;
}
