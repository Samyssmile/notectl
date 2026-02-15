/**
 * Paste handler: intercepts paste events and converts clipboard content to transactions.
 * Supports file paste via registered FileHandlers, plain text, and HTML.
 */

import DOMPurify from 'dompurify';
import { insertTextCommand } from '../commands/Commands.js';
import { type BlockNode, createBlockNode, isBlockNode } from '../model/Document.js';
import { generateBlockId } from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createNodeSelection, isNodeSelection } from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';

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

		const state = this.getState();

		// Try HTML first, fall back to plain text
		const html = clipboardData.getData('text/html');
		if (html) {
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

			// TODO: Rich-text paste not yet supported — extract plain text for now
			const text = this.extractTextFromHTML(sanitized);
			if (text) {
				const tr = insertTextCommand(state, text, 'paste');
				this.dispatch(tr);
			}
			return;
		}

		const text = clipboardData.getData('text/plain');
		if (text) {
			const tr = insertTextCommand(state, text, 'paste');
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

	private extractTextFromHTML(html: string): string {
		const template = document.createElement('template');
		template.innerHTML = html;
		return template.content.textContent ?? '';
	}

	destroy(): void {
		this.element.removeEventListener('paste', this.handlePaste);
	}
}
