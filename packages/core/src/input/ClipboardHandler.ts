/**
 * Clipboard handler: intercepts copy and cut events, serializes the current
 * selection to clipboard data. Works with both NodeSelection (void blocks)
 * and text selections.
 */

import { deleteNodeSelection, deleteSelectionCommand } from '../commands/Commands.js';
import type { BlockNode, Mark } from '../model/Document.js';
import {
	getBlockLength,
	getBlockText,
	getInlineChildren,
	isInlineNode,
	isTextNode,
} from '../model/Document.js';
import { escapeHTML } from '../model/HTMLUtils.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
	selectionRange,
} from '../model/Selection.js';
import type { EditorState } from '../state/EditorState.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { setRichClipboard } from './InternalClipboard.js';

export interface ClipboardHandlerOptions {
	readonly getState: GetStateFn;
	readonly dispatch: DispatchFn;
	readonly schemaRegistry?: SchemaRegistry;
	/** Force-sync DOM selection to state (selectionchange may fire async). */
	readonly syncSelection?: () => void;
	readonly isReadOnly?: () => boolean;
}

/** Custom MIME type for internal block copy/paste round-trips (void/NodeSelection). */
const BLOCK_MIME = 'application/x-notectl-block';

export class ClipboardHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly syncSelection?: () => void;
	private readonly isReadOnly: () => boolean;
	private readonly handleCopy: (e: ClipboardEvent) => void;
	private readonly handleCut: (e: ClipboardEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: ClipboardHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.schemaRegistry = options.schemaRegistry;
		this.syncSelection = options.syncSelection;
		this.isReadOnly = options.isReadOnly ?? (() => false);

		this.handleCopy = this.onCopy.bind(this);
		this.handleCut = this.onCut.bind(this);
		element.addEventListener('copy', this.handleCopy);
		element.addEventListener('cut', this.handleCut);
	}

	private onCopy(e: ClipboardEvent): void {
		// Sync DOM selection → state first; selectionchange may lag behind
		this.syncSelection?.();

		const state = this.getState();
		const sel = state.selection;

		// GapCursor: nothing to copy
		if (isGapCursor(sel)) return;

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
		if (this.isReadOnly()) return;

		// Sync DOM selection → state first; selectionchange may lag behind
		this.syncSelection?.();

		const state = this.getState();
		const sel = state.selection;

		// GapCursor: nothing to cut
		if (isGapCursor(sel)) return;

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
		if (isGapCursor(sel)) return;
		if (isCollapsed(sel)) return;

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const fromIdx = blockOrder.indexOf(range.from.blockId);
		const toIdx = blockOrder.indexOf(range.to.blockId);

		const lines: string[] = [];
		const richBlocks: Array<{
			type: string;
			text: string;
			attrs?: Record<string, unknown>;
		}> = [];

		for (let i = fromIdx; i <= toIdx; i++) {
			const bid = blockOrder[i];
			if (!bid) continue;
			const block = state.getBlock(bid);
			if (!block) continue;

			const text = getBlockText(block);
			const blockLen = getBlockLength(block);
			const start = i === fromIdx ? range.from.offset : 0;
			const end = i === toIdx ? range.to.offset : blockLen;
			const sliced: string = text.slice(start, end);
			lines.push(sliced);

			richBlocks.push({
				type: block.type,
				text: sliced,
				...(block.attrs ? { attrs: { ...block.attrs } } : {}),
			});
		}

		const plainText: string = lines.join('\n');
		clipboardData.setData('text/plain', plainText);

		// Write text/html with inline marks so paste preserves formatting
		if (this.schemaRegistry) {
			const htmlParts: string[] = [];
			for (let i = fromIdx; i <= toIdx; i++) {
				const bid = blockOrder[i];
				if (!bid) continue;
				const block = state.getBlock(bid);
				if (!block) continue;

				const start = i === fromIdx ? range.from.offset : 0;
				const end = i === toIdx ? range.to.offset : getBlockLength(block);
				htmlParts.push(this.serializeBlockRangeToHTML(block, start, end));
			}
			clipboardData.setData('text/html', htmlParts.join(''));
		}

		// Store rich block data in memory — system clipboard strips custom MIME
		// types and rewrites text/html, so we use an in-memory store keyed by
		// the plain-text fingerprint to verify origin on paste.
		setRichClipboard(plainText, richBlocks);
	}

	/** Serializes a range of inline content within a block to an HTML string. */
	private serializeBlockRangeToHTML(block: BlockNode, start: number, end: number): string {
		const children = getInlineChildren(block);
		const parts: string[] = [];
		let pos = 0;

		for (const child of children) {
			const width: number = isInlineNode(child) ? 1 : child.text.length;
			const childEnd: number = pos + width;

			if (childEnd <= start || pos >= end) {
				pos = childEnd;
				continue;
			}

			if (isTextNode(child)) {
				const sliceFrom: number = Math.max(0, start - pos);
				const sliceTo: number = Math.min(child.text.length, end - pos);
				const text: string = child.text.slice(sliceFrom, sliceTo);
				if (text.length > 0) {
					parts.push(this.serializeTextWithMarks(text, child.marks));
				}
			}
			// InlineNodes are skipped for text/html serialization (same as plain text)

			pos = childEnd;
		}

		return parts.join('');
	}

	/** Wraps escaped text in mark HTML tags using MarkSpec.toHTMLString when available. */
	private serializeTextWithMarks(text: string, marks: readonly Mark[]): string {
		if (marks.length === 0 || !this.schemaRegistry) {
			return escapeHTML(text);
		}

		// Sort marks by rank (lowest rank = closest to text content = applied first)
		const sorted: readonly Mark[] = [...marks].sort((a, b) => {
			const specA: MarkSpec | undefined = this.schemaRegistry?.getMarkSpec(a.type);
			const specB: MarkSpec | undefined = this.schemaRegistry?.getMarkSpec(b.type);
			return (specA?.rank ?? 100) - (specB?.rank ?? 100);
		});

		let html: string = escapeHTML(text);
		// Apply marks from innermost (lowest rank) to outermost (highest rank)
		for (const mark of sorted) {
			const spec: MarkSpec | undefined = this.schemaRegistry?.getMarkSpec(mark.type);
			if (spec?.toHTMLString) {
				html = spec.toHTMLString(mark, html);
			}
		}
		return html;
	}

	destroy(): void {
		this.element.removeEventListener('copy', this.handleCopy);
		this.element.removeEventListener('cut', this.handleCut);
	}
}
