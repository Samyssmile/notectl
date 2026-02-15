/**
 * Paste handler: intercepts paste events and converts clipboard content to transactions.
 * Supports file paste via registered FileHandlers, plain text, and HTML.
 */

import DOMPurify from 'dompurify';
import { insertTextCommand } from '../commands/Commands.js';
import { pasteSlice } from '../commands/PasteCommand.js';
import {
	type BlockAttrs,
	type BlockNode,
	createBlockNode,
	createTextNode,
	getBlockText,
	isBlockNode,
} from '../model/Document.js';
import { generateBlockId } from '../model/Document.js';
import { HTMLParser } from '../model/HTMLParser.js';
import { findNodePath } from '../model/NodeResolver.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isNodeSelection,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { type RichBlockData, consumeRichClipboard } from './InternalClipboard.js';

export interface PasteHandlerOptions {
	getState: GetStateFn;
	dispatch: DispatchFn;
	schemaRegistry?: SchemaRegistry;
}

export class PasteHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly handlePaste: (e: ClipboardEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: PasteHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.schemaRegistry = options.schemaRegistry;

		this.handlePaste = this.onPaste.bind(this);
		element.addEventListener('paste', this.handlePaste);
	}

	private onPaste(e: ClipboardEvent): void {
		e.preventDefault();

		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		// Check for internal block paste (from ClipboardHandler)
		const blockJson: string = clipboardData.getData('application/x-notectl-block');
		if (blockJson) {
			this.handleBlockPaste(blockJson);
			return;
		}

		// Check for file paste first
		if (this.handleFilePaste(clipboardData)) return;

		// Check in-memory rich clipboard (block structure from our own copy)
		const plainText: string = clipboardData.getData('text/plain');
		if (plainText) {
			const richBlocks: readonly RichBlockData[] | undefined = consumeRichClipboard(plainText);
			if (richBlocks && this.handleRichPaste(richBlocks)) {
				return;
			}
		}

		const state = this.getState();

		// Try HTML first, fall back to plain text
		const html = clipboardData.getData('text/html');
		if (html) {
			// Check for embedded rich block data (from programmatic paste)
			const richJson: string | undefined = this.extractRichData(html);
			if (richJson && this.handleRichPasteFromJson(richJson)) {
				return;
			}

			const allowedTags: string[] = this.schemaRegistry
				? this.schemaRegistry.getAllowedTags()
				: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'div', 'span'];
			const allowedAttrs: string[] = this.schemaRegistry
				? this.schemaRegistry.getAllowedAttrs()
				: [];
			const sanitized = DOMPurify.sanitize(html, {
				ALLOWED_TAGS: allowedTags,
				ALLOWED_ATTR: allowedAttrs,
			});

			if (this.schemaRegistry) {
				const schema = schemaFromRegistry(this.schemaRegistry);
				const parser = new HTMLParser({ schema, schemaRegistry: this.schemaRegistry });
				const template = document.createElement('template');
				template.innerHTML = sanitized;
				const slice = parser.parse(template.content);
				const tr = pasteSlice(state, slice);
				this.dispatch(tr);
			} else {
				const text = this.extractTextFromHTML(sanitized);
				if (text) {
					const tr = insertTextCommand(state, text, 'paste');
					this.dispatch(tr);
				}
			}
			return;
		}

		if (plainText) {
			const tr = insertTextCommand(this.getState(), plainText, 'paste');
			this.dispatch(tr);
		}
	}

	/** Handles paste of an internal block node from ClipboardHandler. */
	private handleBlockPaste(json: string): void {
		let parsed: { type?: string; attrs?: Record<string, unknown> };
		try {
			parsed = JSON.parse(json) as { type?: string; attrs?: Record<string, unknown> };
		} catch {
			return;
		}

		const typeName: string | undefined = parsed.type;
		if (!typeName) return;

		// Validate that this type is known (if we have a registry)
		if (this.schemaRegistry && !this.schemaRegistry.getNodeSpec(typeName)) return;

		const state = this.getState();
		const sel = state.selection;

		// Find anchor block to insert after
		const anchorBlockId: BlockId = isNodeSelection(sel) ? sel.nodeId : sel.anchor.blockId;

		const newBlockId: BlockId = generateBlockId();
		const attrs: Record<string, string | number | boolean> | undefined = parsed.attrs
			? (parsed.attrs as Record<string, string | number | boolean>)
			: undefined;
		const newBlock: BlockNode = createBlockNode(
			nodeType(typeName) as NodeTypeName,
			[],
			newBlockId,
			attrs,
		);

		// Check if we're inside a table cell — insert as child of cell
		const cellId: BlockId | undefined = this.findTableCellAncestor(state, anchorBlockId);
		if (cellId) {
			const cellPath: BlockId[] | undefined = findNodePath(state.doc, cellId) as
				| BlockId[]
				| undefined;
			if (!cellPath) return;

			const cell: BlockNode | undefined = state.getBlock(cellId);
			if (!cell) return;

			const builder = state.transaction('paste');
			builder.insertNode(cellPath, cell.children.length, newBlock);
			builder.setSelection(createNodeSelection(newBlockId, [...cellPath, newBlockId]));
			this.dispatch(builder.build());
			return;
		}

		// Default: insert after the anchor block at the same level
		const path = findNodePath(state.doc, anchorBlockId);
		const parentPath: BlockId[] = path && path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];

		const siblings: readonly (BlockNode | import('../model/Document.js').ChildNode)[] =
			parentPath.length === 0
				? state.doc.children
				: (() => {
						const parent = state.getBlock(parentPath[parentPath.length - 1] as BlockId);
						return parent ? parent.children : [];
					})();

		const index: number = siblings.findIndex((c) => isBlockNode(c) && c.id === anchorBlockId);
		if (index < 0) return;

		const builder = state.transaction('paste');
		builder.insertNode(parentPath, index + 1, newBlock);
		builder.setSelection(createNodeSelection(newBlockId, [...parentPath, newBlockId]));

		this.dispatch(builder.build());
	}

	/** Parses JSON and delegates to handleRichPaste (for HTML-embedded data). */
	private handleRichPasteFromJson(json: string): boolean {
		let blocks: RichBlockData[];
		try {
			blocks = JSON.parse(json) as RichBlockData[];
		} catch {
			return false;
		}
		if (!Array.isArray(blocks) || blocks.length === 0) return false;
		return this.handleRichPaste(blocks);
	}

	/**
	 * Handles paste of rich block data (text selections that carry block structure).
	 * Returns true if the paste was handled, false to fall through to plain-text paste.
	 */
	private handleRichPaste(blocks: readonly RichBlockData[]): boolean {
		if (blocks.length === 0) return false;

		// Only use rich paste for structured blocks (list_item, heading, etc.)
		const hasStructured: boolean = blocks.some(
			(b) => b.type !== undefined && b.type !== 'paragraph',
		);
		if (!hasStructured) return false;

		const state = this.getState();
		const sel = state.selection;
		const anchorBlockId: BlockId = isNodeSelection(sel) ? sel.nodeId : sel.anchor.blockId;

		const cellId: BlockId | undefined = this.findTableCellAncestor(state, anchorBlockId);

		if (cellId) {
			return this.insertRichBlocksIntoCell(blocks, state, anchorBlockId, cellId);
		}
		return this.insertRichBlocksAtRoot(blocks, state, anchorBlockId);
	}

	/** Inserts rich blocks as children of a table cell. */
	private insertRichBlocksIntoCell(
		blocks: readonly RichBlockData[],
		state: EditorState,
		anchorBlockId: BlockId,
		cellId: BlockId,
	): boolean {
		const cellPath: BlockId[] | undefined = findNodePath(state.doc, cellId) as
			| BlockId[]
			| undefined;
		if (!cellPath) return false;

		const cell: BlockNode | undefined = state.getBlock(cellId);
		if (!cell) return false;

		const anchorBlock: BlockNode | undefined = state.getBlock(anchorBlockId);
		const anchorIndex: number = cell.children.findIndex(
			(c) => isBlockNode(c) && c.id === anchorBlockId,
		);
		const isAnchorEmpty: boolean =
			anchorBlock !== undefined &&
			anchorBlock.type === 'paragraph' &&
			getBlockText(anchorBlock) === '';

		let insertIndex: number = anchorIndex >= 0 ? anchorIndex + 1 : cell.children.length;
		const builder = state.transaction('paste');
		let lastBlockId: BlockId | undefined;
		let lastTextLen = 0;

		for (const blockData of blocks) {
			if (!blockData.type) continue;

			const newId: BlockId = generateBlockId();
			const text: string = blockData.text ?? '';
			const children = text ? [createTextNode(text)] : undefined;
			const attrs: BlockAttrs | undefined = blockData.attrs
				? (blockData.attrs as BlockAttrs)
				: undefined;

			const newBlock: BlockNode = createBlockNode(
				nodeType(blockData.type) as NodeTypeName,
				children,
				newId,
				attrs,
			);

			builder.insertNode(cellPath, insertIndex, newBlock);
			insertIndex++;
			lastBlockId = newId;
			lastTextLen = text.length;
		}

		// Remove the empty anchor paragraph (it is still at anchorIndex in the working doc)
		if (isAnchorEmpty && anchorIndex >= 0) {
			builder.removeNode(cellPath, anchorIndex);
		}

		if (lastBlockId) {
			builder.setSelection(createCollapsedSelection(lastBlockId, lastTextLen));
		}

		this.dispatch(builder.build());
		return true;
	}

	/** Inserts rich blocks after the anchor block at the root/parent level. */
	private insertRichBlocksAtRoot(
		blocks: readonly RichBlockData[],
		state: EditorState,
		anchorBlockId: BlockId,
	): boolean {
		const path = findNodePath(state.doc, anchorBlockId);
		const parentPath: BlockId[] = path && path.length > 1 ? (path.slice(0, -1) as BlockId[]) : [];

		const siblings: readonly (BlockNode | import('../model/Document.js').ChildNode)[] =
			parentPath.length === 0
				? state.doc.children
				: (() => {
						const parent = state.getBlock(parentPath[parentPath.length - 1] as BlockId);
						return parent ? parent.children : [];
					})();

		const anchorIndex: number = siblings.findIndex((c) => isBlockNode(c) && c.id === anchorBlockId);
		if (anchorIndex < 0) return false;

		const anchorBlock: BlockNode | undefined = state.getBlock(anchorBlockId);
		const isAnchorEmpty: boolean =
			anchorBlock !== undefined &&
			anchorBlock.type === 'paragraph' &&
			getBlockText(anchorBlock) === '';

		let insertIndex: number = anchorIndex + 1;
		const builder = state.transaction('paste');
		let lastBlockId: BlockId | undefined;
		let lastTextLen = 0;

		for (const blockData of blocks) {
			if (!blockData.type) continue;

			const newId: BlockId = generateBlockId();
			const text: string = blockData.text ?? '';
			const children = text ? [createTextNode(text)] : undefined;
			const attrs: BlockAttrs | undefined = blockData.attrs
				? (blockData.attrs as BlockAttrs)
				: undefined;

			const newBlock: BlockNode = createBlockNode(
				nodeType(blockData.type) as NodeTypeName,
				children,
				newId,
				attrs,
			);

			builder.insertNode(parentPath, insertIndex, newBlock);
			insertIndex++;
			lastBlockId = newId;
			lastTextLen = text.length;
		}

		// Remove the empty anchor paragraph
		if (isAnchorEmpty) {
			builder.removeNode(parentPath, anchorIndex);
		}

		if (lastBlockId) {
			builder.setSelection(createCollapsedSelection(lastBlockId, lastTextLen));
		}

		this.dispatch(builder.build());
		return true;
	}

	/** Finds a table_cell ancestor for the given block (or the block itself). */
	private findTableCellAncestor(state: EditorState, blockId: BlockId): BlockId | undefined {
		const block: BlockNode | undefined = state.getBlock(blockId);
		if (block?.type === 'table_cell') return blockId;

		const path: BlockId[] | undefined = findNodePath(state.doc, blockId) as BlockId[] | undefined;
		if (!path) return undefined;

		for (const id of path) {
			const node: BlockNode | undefined = state.getBlock(id as BlockId);
			if (node?.type === 'table_cell') return id as BlockId;
		}
		return undefined;
	}

	/** Checks for files in clipboard data and delegates to registered handlers. */
	private handleFilePaste(clipboardData: DataTransfer): boolean {
		if (!this.schemaRegistry) return false;

		// Check clipboardData.files first
		const files: File[] = Array.from(clipboardData.files);

		// Also check items for file entries (some browsers use items instead)
		if (files.length === 0) {
			for (let i = 0; i < clipboardData.items.length; i++) {
				const item = clipboardData.items[i];
				if (item && item.kind === 'file') {
					const file = item.getAsFile();
					if (file) files.push(file);
				}
			}
		}

		if (files.length === 0) return false;

		for (const file of files) {
			const handlers = this.schemaRegistry.matchFileHandlers(file.type);
			for (const handler of handlers) {
				const result = handler(files, null);
				if (result === true) return true;
				// If handler returns a Promise, treat as handled
				if (result instanceof Promise) {
					// Fire-and-forget for async handlers
					return true;
				}
			}
		}

		return false;
	}

	/** Extracts embedded rich block JSON from HTML (data-notectl-rich attribute). */
	private extractRichData(html: string): string | undefined {
		const template = document.createElement('template');
		template.innerHTML = html;
		const richEl: Element | null = template.content.querySelector('[data-notectl-rich]');
		if (!richEl) return undefined;
		return richEl.getAttribute('data-notectl-rich') ?? undefined;
	}

	private extractTextFromHTML(html: string): string {
		const template = document.createElement('template');
		template.innerHTML = html;
		return template.content.textContent ?? '';
	}

	destroy(): void {
		this.element.removeEventListener('paste', this.handlePaste);
	}
}
