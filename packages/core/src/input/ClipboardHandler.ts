/**
 * Clipboard handler: intercepts copy and cut events, serializes the current
 * selection to clipboard data. Works with both NodeSelection (void blocks)
 * and text selections.
 */

import { deleteNodeSelection, deleteSelectionCommand } from '../commands/Commands.js';
import type { BlockNode, Mark } from '../model/Document.js';
import {
	getBlockLength,
	getInlineChildren,
	isInlineNode,
	isLeafBlock,
	isTextNode,
} from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { Selection } from '../model/Selection.js';
import {
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
	selectionRange,
} from '../model/Selection.js';
import {
	buildMarkOrder,
	serializeDocumentToHTML,
	serializeMarksToHTML,
} from '../serialization/index.js';
import type { EditorState } from '../state/EditorState.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import type { RichBlockData, RichSegment } from './InternalClipboard.js';
import { setRichClipboard } from './InternalClipboard.js';
import { buildSelectionDocument } from './SelectionDocument.js';

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

		// When selection spans composite blocks (tables) or void blocks (images),
		// use full document serialization so HTML round-trips through paste correctly.
		if (this.selectionRequiresDocumentSerializer(state)) {
			this.writeCompositeSelectionToClipboard(clipboardData, state);
			return;
		}

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const fromIdx = blockOrder.indexOf(range.from.blockId);
		const toIdx = blockOrder.indexOf(range.to.blockId);

		const lines: string[] = [];
		const richBlocks: RichBlockData[] = [];
		const blockEntries: { block: BlockNode; start: number; end: number }[] = [];

		for (let i = fromIdx; i <= toIdx; i++) {
			const bid = blockOrder[i];
			if (!bid) continue;
			const block = state.getBlock(bid);
			if (!block) continue;

			const blockLen = getBlockLength(block);
			const start = i === fromIdx ? range.from.offset : 0;
			const end = i === toIdx ? range.to.offset : blockLen;
			const segments: readonly RichSegment[] = this.extractSegmentsForRange(block, start, end);
			const sliced: string = this.plainTextFromSegments(segments);
			lines.push(sliced);
			blockEntries.push({ block, start, end });
			richBlocks.push({
				type: block.type,
				text: sliced,
				...(block.attrs ? { attrs: { ...block.attrs } } : {}),
				...(segments.length > 0 ? { segments } : {}),
			});
		}

		const plainText: string = lines.join('\n');
		clipboardData.setData('text/plain', plainText);

		// Write text/html with inline marks and proper block-level tags.
		if (this.schemaRegistry) {
			const markOrder: Map<string, number> = buildMarkOrder(this.schemaRegistry);
			const multiBlock: boolean = fromIdx !== toIdx;

			if (multiBlock) {
				const html: string = this.serializeBlocksToClipboardHTML(
					blockEntries,
					markOrder,
					richBlocks,
				);
				clipboardData.setData('text/html', html);
			} else {
				const bid = blockOrder[fromIdx];
				const block = bid ? state.getBlock(bid) : undefined;
				if (block) {
					const inlineHTML: string = this.serializeBlockRangeToHTML(
						block,
						range.from.offset,
						range.to.offset,
						markOrder,
					);
					clipboardData.setData('text/html', inlineHTML);
				}
			}
		}

		// Store rich block data in memory — system clipboard strips custom MIME
		// types and rewrites text/html, so we use an in-memory store keyed by
		// the plain-text fingerprint to verify origin on paste.
		setRichClipboard(plainText, richBlocks);
	}

	/**
	 * Checks whether the current selection requires the full document serializer.
	 * Returns true when the selection is within a composite root (e.g. a table)
	 * or spans multiple roots where at least one is composite or void.
	 */
	private selectionRequiresDocumentSerializer(state: EditorState): boolean {
		const sel: Selection | undefined = this.getTextSelection(state);
		if (!sel || isCollapsed(sel)) return false;

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);

		const fromPath = findNodePath(state.doc, range.from.blockId);
		const toPath = findNodePath(state.doc, range.to.blockId);
		if (!fromPath || !toPath) return false;

		// Both endpoints inside the same root — use document serializer for composite roots
		if (fromPath[0] === toPath[0]) {
			const rootBlock = state.doc.children.find((c) => c.id === fromPath[0]);
			if (rootBlock && !isLeafBlock(rootBlock)) return true;
			return false;
		}

		// Different root blocks — check if any root is composite or void
		const fromRootIdx: number = state.doc.children.findIndex((c) => c.id === fromPath[0]);
		const toRootIdx: number = state.doc.children.findIndex((c) => c.id === toPath[0]);
		for (let i = fromRootIdx; i <= toRootIdx; i++) {
			const block = state.doc.children[i];
			if (!block) continue;
			if (!isLeafBlock(block)) return true;
			const spec = this.schemaRegistry?.getNodeSpec(block.type);
			if (spec?.isVoid) return true;
		}

		return false;
	}

	/** Returns the text selection if the state has one, undefined otherwise. */
	private getTextSelection(state: EditorState): Selection | undefined {
		const sel = state.selection;
		if (!isTextSelection(sel)) return undefined;
		return sel;
	}

	/** Extracts plain text for a block range, ignoring InlineNodes in text/plain output. */
	private extractPlainTextForRange(block: BlockNode, start: number, end: number): string {
		return this.plainTextFromSegments(this.extractSegmentsForRange(block, start, end));
	}

	/** Joins rich text segments into the plain-text form stored on the clipboard. */
	private plainTextFromSegments(segments: readonly RichSegment[]): string {
		return segments.map((segment) => segment.text).join('');
	}

	/**
	 * Serializes a selection that includes composite blocks (tables) to clipboard.
	 * Uses serializeDocumentToHTML for HTML to preserve table structure.
	 * Skips rich clipboard since composite blocks can't be represented as flat data.
	 */
	private writeCompositeSelectionToClipboard(
		clipboardData: DataTransfer,
		state: EditorState,
	): void {
		const sel: Selection | undefined = this.getTextSelection(state);
		if (!sel) return;
		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const fromIdx: number = blockOrder.indexOf(range.from.blockId);
		const toIdx: number = blockOrder.indexOf(range.to.blockId);

		// Plain text from leaf blocks
		const lines: string[] = [];
		for (let i = fromIdx; i <= toIdx; i++) {
			const bid = blockOrder[i];
			if (!bid) continue;
			const block = state.getBlock(bid);
			if (!block) continue;
			const start: number = i === fromIdx ? range.from.offset : 0;
			const end: number = i === toIdx ? range.to.offset : getBlockLength(block);
			lines.push(this.extractPlainTextForRange(block, start, end));
		}
		clipboardData.setData('text/plain', lines.join('\n'));

		// Serialize only the selected region while preserving composite ancestors
		if (this.schemaRegistry) {
			const doc = buildSelectionDocument(state, sel);
			if (doc.children.length > 0) {
				const html: string = serializeDocumentToHTML(doc, this.schemaRegistry);
				clipboardData.setData('text/html', html);
			}
		}
	}

	/** Serializes a range of inline content within a block to an HTML string. */
	private serializeBlockRangeToHTML(
		block: BlockNode,
		start: number,
		end: number,
		markOrder?: Map<string, number>,
	): string {
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
				if (text.length > 0 && this.schemaRegistry) {
					parts.push(serializeMarksToHTML(text, child.marks, this.schemaRegistry, markOrder));
				}
			} else if (isInlineNode(child)) {
				const spec = this.schemaRegistry?.getInlineNodeSpec(child.inlineType);
				if (spec?.toHTMLString) {
					parts.push(spec.toHTMLString(child));
				}
			}

			pos = childEnd;
		}

		return parts.join('');
	}

	/** Extracts inline text segments with marks for a block range. */
	private extractSegmentsForRange(
		block: BlockNode,
		start: number,
		end: number,
	): readonly RichSegment[] {
		const children = getInlineChildren(block);
		const segments: RichSegment[] = [];
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
					const marks: RichSegment['marks'] = child.marks.map((m: Mark) => ({
						type: m.type,
						...(m.attrs ? { attrs: { ...m.attrs } } : {}),
					}));
					segments.push({ text, marks });
				}
			}

			pos = childEnd;
		}

		return segments;
	}

	/**
	 * Serializes multi-block content to clipboard HTML using proper block-level tags.
	 * Groups consecutive list_items into <ul>/<ol> wrappers.
	 * Embeds rich block data as a hidden span for reliable round-trip.
	 */
	private serializeBlocksToClipboardHTML(
		entries: readonly { block: BlockNode; start: number; end: number }[],
		markOrder: Map<string, number>,
		richBlocks: readonly RichBlockData[],
	): string {
		const htmlParts: string[] = [];
		let listBuffer: string[] = [];
		let currentListTag: string | undefined;

		const flushList = (): void => {
			if (listBuffer.length > 0 && currentListTag) {
				htmlParts.push(`<${currentListTag}>${listBuffer.join('')}</${currentListTag}>`);
				listBuffer = [];
				currentListTag = undefined;
			}
		};

		for (const entry of entries) {
			const { block, start, end } = entry;
			const inlineHTML: string = this.serializeBlockRangeToHTML(block, start, end, markOrder);
			const spec = this.schemaRegistry?.getNodeSpec(block.type);

			if (spec?.wrapper) {
				const wrapperSpec = spec.wrapper(block as Parameters<typeof spec.wrapper>[0]);
				const tag: string = wrapperSpec.tag;

				if (currentListTag !== tag) {
					flushList();
					currentListTag = tag;
				}

				if (spec.toHTML) {
					listBuffer.push(spec.toHTML(block, inlineHTML));
				} else {
					listBuffer.push(`<li>${inlineHTML}</li>`);
				}
			} else {
				flushList();
				if (spec?.toHTML) {
					htmlParts.push(spec.toHTML(block, inlineHTML));
				} else {
					htmlParts.push(`<p>${inlineHTML}</p>`);
				}
			}
		}

		flushList();

		// Embed rich block data for reliable round-trip
		const richJson: string = JSON.stringify(richBlocks)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/'/g, '&#39;')
			.replace(/"/g, '&quot;');
		htmlParts.push(`<span data-notectl-rich="${richJson}" hidden></span>`);

		return htmlParts.join('');
	}

	destroy(): void {
		this.element.removeEventListener('copy', this.handleCopy);
		this.element.removeEventListener('cut', this.handleCut);
	}
}
