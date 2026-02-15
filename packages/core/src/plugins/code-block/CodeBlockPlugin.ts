/**
 * CodeBlockPlugin: registers a code block type with NodeSpec, custom NodeView,
 * keyboard handling (Enter → newline, Tab → indent, Escape → exit),
 * input rules (``` → code block), mark prevention middleware,
 * toolbar button, and a typed service API.
 */

import type { DecorationSet } from '../../decorations/Decoration.js';
import { inline as inlineDecoration } from '../../decorations/Decoration.js';
import { DecorationSet as DecorationSetClass } from '../../decorations/Decoration.js';
import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import {
	generateBlockId,
	getBlockLength,
	getBlockText,
	getInlineChildren,
	isTextNode,
} from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import { findNodePath } from '../../model/NodeResolver.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import { createCollapsedSelection, isCollapsed, isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { ServiceKey } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import { createCodeBlockNodeViewFactory } from './CodeBlockNodeView.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		code_block: {
			language: string;
			backgroundColor: string;
		};
	}
}

// --- Syntax Highlighting Types ---

export interface SyntaxToken {
	readonly from: number;
	readonly to: number;
	readonly type: string;
}

export interface SyntaxHighlighter {
	tokenize(code: string, language: string): readonly SyntaxToken[];
	getSupportedLanguages(): readonly string[];
}

// --- Configuration ---

export interface CodeBlockConfig {
	readonly highlighter?: SyntaxHighlighter;
	readonly defaultLanguage?: string;
	readonly useSpaces?: boolean;
	readonly spaceCount?: number;
	readonly showCopyButton?: boolean;
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: CodeBlockConfig = {
	defaultLanguage: '',
	useSpaces: false,
	spaceCount: 2,
	showCopyButton: true,
};

// --- Service Types ---

export interface CodeBlockService {
	setLanguage(blockId: BlockId, language: string): void;
	getLanguage(blockId: BlockId): string;
	setBackground(blockId: BlockId, color: string): void;
	getBackground(blockId: BlockId): string;
	isCodeBlock(blockId: BlockId): boolean;
	getSupportedLanguages(): readonly string[];
}

export const CODE_BLOCK_SERVICE_KEY = new ServiceKey<CodeBlockService>('codeBlock');

// --- SVG Icon ---

const CODE_BLOCK_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>';

// --- Plugin ---

export class CodeBlockPlugin implements Plugin {
	readonly id = 'code-block';
	readonly name = 'Code Block';
	readonly priority = 36;

	private readonly config: CodeBlockConfig;
	private context: PluginContext | null = null;

	constructor(config?: Partial<CodeBlockConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.context = context;
		this.registerNodeSpec(context);
		this.registerNodeView(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerInputRule(context);
		this.registerToolbarItem(context);
		this.registerMiddleware(context);
		this.registerService(context);
		this.patchTableCellContent(context);
	}

	destroy(): void {
		this.context = null;
	}

	decorations(state: EditorState): DecorationSet {
		if (!this.config.highlighter) return DecorationSetClass.empty;

		const decorations: ReturnType<typeof inlineDecoration>[] = [];
		const highlighter = this.config.highlighter;

		for (const bid of state.getBlockOrder()) {
			const block: BlockNode | undefined = state.getBlock(bid);
			if (!block || block.type !== 'code_block') continue;

			const lang: string = (block.attrs?.language as string) ?? '';
			if (!lang) continue;

			const text: string = getBlockText(block);
			if (!text) continue;

			const tokens: readonly SyntaxToken[] = highlighter.tokenize(text, lang);
			for (const token of tokens) {
				decorations.push(
					inlineDecoration(bid, token.from, token.to, {
						class: `notectl-token--${token.type}`,
					}),
				);
			}
		}

		return DecorationSetClass.create(decorations);
	}

	// --- NodeSpec ---

	private registerNodeSpec(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'code_block',
			group: 'block',
			content: { allow: ['text'] },
			selectable: true,
			attrs: {
				language: { default: '' },
				backgroundColor: { default: '' },
			},
			toDOM(node) {
				const pre: HTMLElement = createBlockElement('pre', node.id);
				pre.className = 'notectl-code-block';
				const code: HTMLElement = document.createElement('code');
				code.className = 'notectl-code-block__content';
				pre.appendChild(code);
				return pre;
			},
			toHTML(node, content) {
				const lang: string = escapeHTML((node.attrs?.language as string) ?? '');
				const bg: string = escapeHTML((node.attrs?.backgroundColor as string) ?? '');
				const langAttr: string = lang ? ` data-language="${lang}"` : '';
				const bgStyle: string = bg ? ` style="background-color: ${bg}"` : '';
				return `<pre${bgStyle}><code${langAttr}>${content || ''}</code></pre>`;
			},
			parseHTML: [
				{
					tag: 'pre',
					getAttrs(el: HTMLElement) {
						const code: HTMLElement | null = el.querySelector('code');
						const langClass: string = code?.className.match(/language-(\S+)/)?.[1] ?? '';
						const dataLang: string = code?.getAttribute('data-language') ?? '';
						return { language: dataLang || langClass };
					},
				},
			],
			sanitize: {
				tags: ['pre', 'code'],
				attrs: ['data-language', 'class', 'style'],
			},
		});
	}

	// --- NodeView ---

	private registerNodeView(context: PluginContext): void {
		context.registerNodeView('code_block', createCodeBlockNodeViewFactory(this.config));
	}

	// --- Commands ---

	private registerCommands(context: PluginContext): void {
		context.registerCommand('toggleCodeBlock', () => {
			return this.toggleCodeBlock(context);
		});

		context.registerCommand('insertCodeBlock', () => {
			return this.insertCodeBlock(context);
		});

		context.registerCommand('setCodeBlockLanguage', () => {
			return false;
		});

		context.registerCommand('setCodeBlockBackground', () => {
			return false;
		});

		context.registerCommand('exitCodeBlock', () => {
			return this.handleEscape(context);
		});
	}

	// --- Keymaps ---

	private registerKeymaps(context: PluginContext): void {
		context.registerKeymap({
			Enter: () => this.handleEnter(context),
			Backspace: () => this.handleBackspace(context),
			Tab: () => this.handleTab(context),
			'Shift-Tab': () => this.handleShiftTab(context),
			Escape: () => this.handleEscape(context),
			ArrowDown: () => this.handleArrowDown(context),
			ArrowUp: () => this.handleArrowUp(context),
			'Mod-Shift-M': () => context.executeCommand('toggleCodeBlock'),
		});
	}

	// --- Input Rule ---

	private registerInputRule(context: PluginContext): void {
		context.registerInputRule({
			pattern: /^```(\w*) $/,
			handler: (state, match, start, _end) => {
				const sel = state.selection;
				if (isNodeSelection(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
				if (!block || block.type !== 'paragraph') return null;

				const language: string = match[1] ?? '';
				const attrs: Record<string, string | number | boolean> = {
					language,
					backgroundColor: '',
				};

				return state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, start, start + match[0].length)
					.setBlockType(sel.anchor.blockId, nodeType('code_block'), attrs)
					.setSelection(createCollapsedSelection(sel.anchor.blockId, 0))
					.build();
			},
		});
	}

	// --- Toolbar ---

	private registerToolbarItem(context: PluginContext): void {
		context.registerToolbarItem({
			id: 'code_block',
			group: 'block',
			icon: CODE_BLOCK_ICON,
			label: 'Code Block',
			tooltip: `Code Block (${formatShortcut('Mod-Shift-M')})`,
			command: 'toggleCodeBlock',
			priority: 56,
			separatorAfter: this.config.separatorAfter,
			isActive: (state) => {
				if (isNodeSelection(state.selection)) return false;
				const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
				return block?.type === 'code_block';
			},
		});
	}

	// --- Middleware (Mark Prevention) ---

	private registerMiddleware(context: PluginContext): void {
		context.registerMiddleware((tr, state, next) => {
			const hasMarkInCodeBlock: boolean = tr.steps.some((step) => {
				if (step.type !== 'addMark') return false;
				const block: BlockNode | undefined = state.getBlock(step.blockId);
				return block?.type === 'code_block';
			});

			if (!hasMarkInCodeBlock) {
				next(tr);
				return;
			}

			const filtered = tr.steps.filter((step) => {
				if (step.type !== 'addMark') return true;
				const block: BlockNode | undefined = state.getBlock(step.blockId);
				return block?.type !== 'code_block';
			});

			next({ ...tr, steps: filtered });
		}, 50);
	}

	// --- Service ---

	private registerService(context: PluginContext): void {
		const plugin = this;

		context.registerService(CODE_BLOCK_SERVICE_KEY, {
			setLanguage(bid: BlockId, language: string): void {
				plugin.setAttr(context, bid, 'language', language);
			},
			getLanguage(bid: BlockId): string {
				const ctx: PluginContext | null = plugin.context;
				if (!ctx) return '';
				const block: BlockNode | undefined = ctx.getState().getBlock(bid);
				if (!block || block.type !== 'code_block') return '';
				return (block.attrs?.language as string) ?? '';
			},
			setBackground(bid: BlockId, color: string): void {
				plugin.setAttr(context, bid, 'backgroundColor', color);
			},
			getBackground(bid: BlockId): string {
				const ctx: PluginContext | null = plugin.context;
				if (!ctx) return '';
				const block: BlockNode | undefined = ctx.getState().getBlock(bid);
				if (!block || block.type !== 'code_block') return '';
				return (block.attrs?.backgroundColor as string) ?? '';
			},
			isCodeBlock(bid: BlockId): boolean {
				const ctx: PluginContext | null = plugin.context;
				if (!ctx) return false;
				const block: BlockNode | undefined = ctx.getState().getBlock(bid);
				return block?.type === 'code_block';
			},
			getSupportedLanguages(): readonly string[] {
				if (plugin.config.highlighter) {
					return plugin.config.highlighter.getSupportedLanguages();
				}
				return [];
			},
		});
	}

	// --- Table Cell Patching ---

	private patchTableCellContent(context: PluginContext): void {
		const registry = context.getSchemaRegistry();
		const cellSpec = registry.getNodeSpec('table_cell');
		if (!cellSpec?.content) return;

		const currentAllow: readonly string[] = cellSpec.content.allow ?? [];
		if (currentAllow.includes('code_block')) return;

		registry.removeNodeSpec('table_cell');
		registry.registerNodeSpec({
			...cellSpec,
			content: {
				...cellSpec.content,
				allow: [...currentAllow, 'code_block'],
			},
		});
	}

	// --- Keyboard Handlers ---

	/**
	 * Handles Backspace at the start of a code block.
	 * Converts the code block back to a paragraph, preserving text.
	 */
	private handleBackspace(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		if (!isCollapsed(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return false;
		if (sel.anchor.offset !== 0) return false;

		const tr: Transaction = state
			.transaction('input')
			.setBlockType(sel.anchor.blockId, nodeType('paragraph'))
			.setSelection(sel)
			.build();
		context.dispatch(tr);
		return true;
	}

	private handleEnter(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		if (!isCollapsed(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return false;

		const text: string = getBlockText(block);
		const offset: number = sel.anchor.offset;

		// Exit heuristic: Enter on empty last line (text ends with \n and cursor at end)
		if (text.endsWith('\n') && offset === text.length) {
			return this.exitOnDoubleEnter(context, sel.anchor.blockId, text);
		}

		// Insert newline character
		const tr: Transaction = state
			.transaction('input')
			.insertText(sel.anchor.blockId, offset, '\n', [])
			.setSelection(createCollapsedSelection(sel.anchor.blockId, offset + 1))
			.build();

		context.dispatch(tr);
		return true;
	}

	private handleTab(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return false;

		const indent: string = this.config.useSpaces ? ' '.repeat(this.config.spaceCount ?? 2) : '\t';
		const offset: number = sel.anchor.offset;

		const tr: Transaction = state
			.transaction('input')
			.insertText(sel.anchor.blockId, offset, indent, [])
			.setSelection(createCollapsedSelection(sel.anchor.blockId, offset + indent.length))
			.build();

		context.dispatch(tr);
		return true;
	}

	private handleShiftTab(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return false;

		const text: string = getBlockText(block);
		const offset: number = sel.anchor.offset;

		// Find start of current line
		const lineStart: number = text.lastIndexOf('\n', offset - 1) + 1;

		if (this.config.useSpaces) {
			const spaceCount: number = this.config.spaceCount ?? 2;
			const linePrefix: string = text.slice(lineStart, lineStart + spaceCount);
			if (linePrefix === ' '.repeat(spaceCount)) {
				const tr: Transaction = state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, lineStart, lineStart + spaceCount)
					.setSelection(
						createCollapsedSelection(sel.anchor.blockId, Math.max(lineStart, offset - spaceCount)),
					)
					.build();
				context.dispatch(tr);
				return true;
			}
		} else if (text[lineStart] === '\t') {
			const tr: Transaction = state
				.transaction('input')
				.deleteTextAt(sel.anchor.blockId, lineStart, lineStart + 1)
				.setSelection(createCollapsedSelection(sel.anchor.blockId, Math.max(lineStart, offset - 1)))
				.build();
			context.dispatch(tr);
			return true;
		}

		return true; // Consume event even if no dedent possible
	}

	private handleEscape(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(sel.anchor.blockId);

		if (idx < blockOrder.length - 1) {
			// Navigate to next block
			const nextId: BlockId = blockOrder[idx + 1] as BlockId;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(nextId, 0))
				.build();
			context.dispatch(tr);
		} else {
			// Create a new paragraph after code block
			this.insertParagraphAfter(context, sel.anchor.blockId);
		}

		return true;
	}

	/**
	 * Handles ArrowDown at the last line of a code block.
	 * Exits to the next block or creates a paragraph below.
	 */
	private handleArrowDown(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		if (!isCollapsed(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return false;

		const text: string = getBlockText(block);
		const offset: number = sel.anchor.offset;

		// Only exit if cursor is on the last line
		const nextNewline: number = text.indexOf('\n', offset);
		if (nextNewline !== -1) return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(sel.anchor.blockId);

		if (idx < blockOrder.length - 1) {
			const nextId: BlockId = blockOrder[idx + 1] as BlockId;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(nextId, 0))
				.build();
			context.dispatch(tr);
		} else {
			this.insertParagraphAfter(context, sel.anchor.blockId);
		}

		return true;
	}

	/**
	 * Handles ArrowUp at the first line of a code block.
	 * Exits to the previous block.
	 */
	private handleArrowUp(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;
		if (!isCollapsed(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return false;

		const text: string = getBlockText(block);
		const offset: number = sel.anchor.offset;

		// Only exit if cursor is on the first line
		const firstNewline: number = text.indexOf('\n');
		if (firstNewline !== -1 && offset > firstNewline) return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(sel.anchor.blockId);

		if (idx > 0) {
			const prevId: BlockId = blockOrder[idx - 1] as BlockId;
			const prevBlock: BlockNode | undefined = state.getBlock(prevId);
			const prevLen: number = prevBlock ? getBlockLength(prevBlock) : 0;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(prevId, prevLen))
				.build();
			context.dispatch(tr);
			return true;
		}

		return false;
	}

	// --- Helpers ---

	private toggleCodeBlock(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		if (isNodeSelection(state.selection)) return false;

		const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
		if (!block) return false;

		if (block.type === 'code_block') {
			const tr: Transaction = state
				.transaction('command')
				.setBlockType(state.selection.anchor.blockId, nodeType('paragraph'))
				.setSelection(state.selection)
				.build();
			context.dispatch(tr);
			return true;
		}

		return this.insertCodeBlock(context);
	}

	private insertCodeBlock(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type === 'code_block') return false;

		const attrs: Record<string, string | number | boolean> = {
			language: this.config.defaultLanguage ?? '',
			backgroundColor: '',
		};

		const builder: TransactionBuilder = state.transaction('command');
		this.stripAllMarks(builder, block);
		builder
			.setBlockType(sel.anchor.blockId, nodeType('code_block'), attrs)
			.setSelection(createCollapsedSelection(sel.anchor.blockId, 0));

		context.dispatch(builder.build());
		return true;
	}

	private exitOnDoubleEnter(context: PluginContext, bid: BlockId, text: string): boolean {
		const state: EditorState = context.getState();

		// Remove trailing newline and convert to paragraph after
		const trimmedLen: number = text.length - 1;

		const newId: BlockId = generateBlockId();

		const tr: Transaction = state
			.transaction('input')
			.deleteTextAt(bid, trimmedLen, text.length)
			.splitBlock(bid, trimmedLen, newId)
			.setBlockType(newId, nodeType('paragraph'))
			.setSelection(createCollapsedSelection(newId, 0))
			.build();

		context.dispatch(tr);
		return true;
	}

	private insertParagraphAfter(context: PluginContext, bid: BlockId): void {
		const state: EditorState = context.getState();
		const blockLength: number = getBlockLength(state.getBlock(bid) as BlockNode);
		const newId: BlockId = generateBlockId();

		const tr: Transaction = state
			.transaction('command')
			.splitBlock(bid, blockLength, newId)
			.setBlockType(newId, nodeType('paragraph'))
			.setSelection(createCollapsedSelection(newId, 0))
			.build();

		context.dispatch(tr);
	}

	private setAttr(context: PluginContext, bid: BlockId, key: string, value: string): void {
		const state: EditorState = context.getState();
		const block: BlockNode | undefined = state.getBlock(bid);
		if (!block || block.type !== 'code_block') return;

		const path: string[] | undefined = findNodePath(state.doc, bid);
		if (!path) return;

		const newAttrs: BlockAttrs = { ...block.attrs, [key]: value };
		const tr: Transaction = state
			.transaction('command')
			.setNodeAttr(path as BlockId[], newAttrs)
			.build();

		context.dispatch(tr);
	}

	/**
	 * Strips all marks from a block's inline content.
	 * Used when converting to code_block so no formatting carries over.
	 */
	private stripAllMarks(builder: TransactionBuilder, block: BlockNode): void {
		const blockLength: number = getBlockLength(block);
		if (blockLength === 0) return;

		const inlineChildren = getInlineChildren(block);
		let offset = 0;

		for (const child of inlineChildren) {
			if (isTextNode(child)) {
				if (child.text.length > 0) {
					for (const mark of child.marks) {
						builder.removeMark(block.id, offset, offset + child.text.length, mark);
					}
				}
				offset += child.text.length;
			} else {
				offset += 1;
			}
		}
	}
}
