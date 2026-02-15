/**
 * Clipboard handler: intercepts copy and cut events, serializes the current
 * selection to clipboard data. Works with both NodeSelection (void blocks)
 * and text selections.
 */

import { deleteNodeSelection, deleteSelectionCommand } from '../commands/Commands.js';
import { getBlockLength, getBlockText } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	isCollapsed,
	isNodeSelection,
	isTextSelection,
	selectionRange,
} from '../model/Selection.js';
import type { EditorState } from '../state/EditorState.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';

export interface ClipboardHandlerOptions {
	readonly getState: GetStateFn;
	readonly dispatch: DispatchFn;
	readonly schemaRegistry?: SchemaRegistry;
}

/** Custom MIME type for internal block copy/paste round-trips. */
const BLOCK_MIME = 'application/x-notectl-block';

export class ClipboardHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly handleCopy: (e: ClipboardEvent) => void;
	private readonly handleCut: (e: ClipboardEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: ClipboardHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.schemaRegistry = options.schemaRegistry;

		this.handleCopy = this.onCopy.bind(this);
		this.handleCut = this.onCut.bind(this);
		element.addEventListener('copy', this.handleCopy);
		element.addEventListener('cut', this.handleCut);
	}

	private onCopy(e: ClipboardEvent): void {
		const state = this.getState();
		const sel = state.selection;

		// Collapsed selection: let the browser handle it
		if (isTextSelection(sel) && isCollapsed(sel)) return;

		e.preventDefault();
		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		if (isNodeSelection(sel)) {
			this.writeNodeSelectionToClipboard(clipboardData, state);
		} else {
			this.writeTextSelectionToClipboard(clipboardData, state);
		}
	}

	private onCut(e: ClipboardEvent): void {
		const state = this.getState();
		const sel = state.selection;

		// Collapsed selection: nothing to cut
		if (isTextSelection(sel) && isCollapsed(sel)) return;

		e.preventDefault();
		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		// Write to clipboard first
		if (isNodeSelection(sel)) {
			this.writeNodeSelectionToClipboard(clipboardData, state);
			const tr = deleteNodeSelection(state, sel);
			if (tr) this.dispatch(tr);
		} else {
			this.writeTextSelectionToClipboard(clipboardData, state);
			const tr = deleteSelectionCommand(state);
			if (tr) this.dispatch(tr);
		}
	}

	private writeNodeSelectionToClipboard(clipboardData: DataTransfer, state: EditorState): void {
		const sel = state.selection;
		if (!isNodeSelection(sel)) return;

		const block = state.getBlock(sel.nodeId);
		if (!block) return;

		// Internal format: block type + attrs for round-trip paste
		const blockData: { readonly type: string; readonly attrs?: Record<string, unknown> } = {
			type: block.type,
			...(block.attrs ? { attrs: { ...block.attrs } } : {}),
		};
		clipboardData.setData(BLOCK_MIME, JSON.stringify(blockData));

		// HTML representation via NodeSpec.toHTML if available
		const spec = this.schemaRegistry?.getNodeSpec(block.type);
		if (spec?.toHTML) {
			clipboardData.setData('text/html', spec.toHTML(block, ''));
		}

		// Plain text: use alt text for images, empty for other voids
		const attrs = block.attrs as Record<string, unknown> | undefined;
		const altText: string = typeof attrs?.alt === 'string' ? attrs.alt : '';
		clipboardData.setData('text/plain', altText);
	}

	private writeTextSelectionToClipboard(clipboardData: DataTransfer, state: EditorState): void {
		const sel = state.selection;
		if (isNodeSelection(sel)) return;
		if (isCollapsed(sel)) return;

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const fromIdx = blockOrder.indexOf(range.from.blockId);
		const toIdx = blockOrder.indexOf(range.to.blockId);

		const lines: string[] = [];
		for (let i = fromIdx; i <= toIdx; i++) {
			const bid = blockOrder[i];
			if (!bid) continue;
			const block = state.getBlock(bid);
			if (!block) continue;

			const text = getBlockText(block);
			const blockLen = getBlockLength(block);
			const start = i === fromIdx ? range.from.offset : 0;
			const end = i === toIdx ? range.to.offset : blockLen;
			lines.push(text.slice(start, end));
		}

		clipboardData.setData('text/plain', lines.join('\n'));
	}

	destroy(): void {
		this.element.removeEventListener('copy', this.handleCopy);
		this.element.removeEventListener('cut', this.handleCut);
	}
}
