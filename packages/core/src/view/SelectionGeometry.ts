/** Model-backed selection measurements. DOM mapping never leaves the view layer. */
import type { EditorSelection } from '../model/Selection.js';
import { isCollapsed, isGapCursor, isNodeSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { isRtlContext } from '../platform/Platform.js';
import { isInlineNodeEl } from './InlineContentDOM.js';
import { statePositionToDOM } from './SelectionSync.js';

/** Immutable CSS pixel rectangle in viewport coordinates. */
export interface ViewportRect {
	readonly x: number;
	readonly y: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
}

export interface SelectionGeometry {
	readonly bounds: ViewportRect;
	readonly rects: readonly ViewportRect[];
	/** Directional endpoints, including backward text selections. */
	readonly anchor: ViewportRect;
	readonly focus: ViewportRect;
}

export interface SelectionView {
	readonly type: 'text' | 'node' | 'gap' | 'cell';
	readonly collapsed: boolean;
	/** Null while hidden, detached, composing, or before the selection can be mapped. */
	readonly geometry: SelectionGeometry | null;
}

export function snapshotRect(rect: ViewportRect): ViewportRect {
	const { x, y, top, right, bottom, left, width, height } = rect;
	return Object.freeze({ x, y, top, right, bottom, left, width, height });
}

function visible(rect: ViewportRect): boolean {
	return Number.isFinite(rect.x) && Number.isFinite(rect.y) && rect.height > 0;
}

function geometry(
	rects: readonly ViewportRect[],
	anchor: ViewportRect | null,
	focus: ViewportRect | null,
): SelectionGeometry | null {
	if (!rects.length || !anchor || !focus) return null;
	const left = Math.min(...rects.map((r) => r.left));
	const top = Math.min(...rects.map((r) => r.top));
	const right = Math.max(...rects.map((r) => r.right));
	const bottom = Math.max(...rects.map((r) => r.bottom));
	return Object.freeze({
		bounds: snapshotRect({
			x: left,
			y: top,
			left,
			top,
			right,
			bottom,
			width: right - left,
			height: bottom - top,
		}),
		rects: Object.freeze(rects.map(snapshotRect)),
		anchor: snapshotRect(anchor),
		focus: snapshotRect(focus),
	});
}

function blockRect(container: HTMLElement, id: BlockId): ViewportRect | null {
	const element = container.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
	const rect = element?.getBoundingClientRect();
	return rect && visible(rect) ? snapshotRect(rect) : null;
}

/** Measure the caret edge of an atom, including atoms wrapped in marks. */
function inlineCaretRect(node: Node | undefined, before: boolean): ViewportRect | null {
	let current: Node | null | undefined = node;
	while (current instanceof Element && !isInlineNodeEl(current)) {
		current = before ? current.firstChild : current.lastChild;
	}
	if (
		!isInlineNodeEl(current) ||
		current.hasAttribute('data-widget') ||
		current instanceof HTMLBRElement
	)
		return null;
	const rect: DOMRect = current.getBoundingClientRect();
	if (!visible(rect)) return null;
	// Atomic inline boxes participate in their parent's text direction, even when
	// their contents (for example MathML) use a different internal direction.
	const rtl: boolean = isRtlContext(current.parentElement ?? current);
	const x: number = before !== rtl ? rect.left : rect.right;
	return snapshotRect(new DOMRect(x, rect.y, 0, rect.height));
}

function caretRect(
	container: HTMLElement,
	point: NonNullable<ReturnType<typeof statePositionToDOM>>,
): ViewportRect | null {
	const range = container.ownerDocument.createRange();
	range.setStart(point.node, point.offset);
	range.collapse(true);
	const rect = Array.from(range.getClientRects()).find(visible);
	if (rect) return snapshotRect(rect);
	// Empty paragraphs and trailing hard breaks use a placeholder BR for the caret line.
	// The model's end-of-block position can map after that BR, where collapsed ranges
	// have no rectangle. Only look behind for the placeholder, not a content hard break.
	if (point.node instanceof Element) {
		const next: ChildNode | undefined = point.node.childNodes[point.offset];
		const previous: ChildNode | undefined = point.node.childNodes[point.offset - 1];
		const placeholder: ChildNode | undefined =
			next ??
			(previous instanceof HTMLBRElement && previous.getAttribute('contenteditable') !== 'false'
				? previous
				: undefined);
		if (placeholder instanceof HTMLBRElement) {
			const brRect = placeholder.getBoundingClientRect();
			if (visible(brRect)) return snapshotRect(brRect);
		}
		return inlineCaretRect(next, true) ?? inlineCaretRect(previous, false);
	}
	return null;
}

export function measureSelection(
	container: HTMLElement,
	selection: EditorSelection,
	cellIds: readonly BlockId[] = [],
	composing = false,
): SelectionView {
	const type = cellIds.length
		? 'cell'
		: isNodeSelection(selection)
			? 'node'
			: isGapCursor(selection)
				? 'gap'
				: 'text';
	const collapsed = type === 'gap' || (type === 'text' && isCollapsed(selection));
	let measured: SelectionGeometry | null = null;
	if (container.isConnected && container.getClientRects().length && !composing) {
		try {
			// Visibility is inherited through ancestors and shadow hosts; unlike
			// display:none, hidden/collapsed elements can still have client rectangles.
			if (getComputedStyle(container).visibility === 'visible') {
				measured = measureGeometry(container, selection, cellIds);
			}
		} catch {
			// DOM can be between renders or have no layout implementation (SSR/tests).
		}
	}
	return Object.freeze({ type, collapsed, geometry: measured });
}

function measureGeometry(
	container: HTMLElement,
	selection: EditorSelection,
	cellIds: readonly BlockId[],
): SelectionGeometry | null {
	if (cellIds.length) {
		const rects = cellIds.map((id) => blockRect(container, id));
		if (rects.some((r) => r === null)) return null;
		const measured = rects.filter((r): r is ViewportRect => r !== null);
		return geometry(measured, measured[0] ?? null, measured.at(-1) ?? null);
	}
	if (isNodeSelection(selection) || isGapCursor(selection)) {
		let rect = blockRect(
			container,
			isNodeSelection(selection) ? selection.nodeId : selection.blockId,
		);
		if (rect && isGapCursor(selection)) {
			const y = selection.side === 'before' ? rect.top : rect.bottom;
			rect = snapshotRect({ ...rect, y, top: y, bottom: y + 1, height: 1 });
		}
		return rect ? geometry([rect], rect, rect) : null;
	}
	const anchor = statePositionToDOM(container, selection.anchor);
	const focus = statePositionToDOM(container, selection.head);
	if (!anchor || !focus) return null;
	const a = container.ownerDocument.createRange();
	a.setStart(anchor.node, anchor.offset);
	a.collapse(true);
	const f = container.ownerDocument.createRange();
	f.setStart(focus.node, focus.offset);
	f.collapse(true);
	const backwards = a.compareBoundaryPoints(Range.START_TO_START, f) > 0;
	const range = container.ownerDocument.createRange();
	const start = backwards ? focus : anchor;
	const end = backwards ? anchor : focus;
	range.setStart(start.node, start.offset);
	range.setEnd(end.node, end.offset);
	const anchorRect = caretRect(container, anchor);
	const focusRect = caretRect(container, focus);
	const rects = Array.from(range.getClientRects()).filter(visible);
	if (!rects.length && anchorRect && isCollapsed(selection))
		rects.push(new DOMRect(anchorRect.x, anchorRect.y, anchorRect.width, anchorRect.height));
	return geometry(rects, anchorRect, focusRect);
}
