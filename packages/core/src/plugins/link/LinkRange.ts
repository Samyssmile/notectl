/** Model-owned extent of one link, independent of formatting and DOM wrappers. */
import {
	applyAttributedMark,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import { resolveCursorMarks } from '../../commands/CursorMarks.js';
import { getInlineChildren, isTextNode, marksEqual } from '../../model/Document.js';
import type { BlockNode, Mark } from '../../model/Document.js';
import { isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { EditorSelection, Selection } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';

export interface LinkRange {
	readonly selection: Selection;
	readonly mark: Mark;
}

export function resolveLinkRange(state: EditorState): LinkRange | null {
	const sel: EditorSelection = state.selection;
	if (!isTextSelection(sel) || sel.anchor.blockId !== sel.head.blockId) return null;
	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block) return null;
	const from: number = Math.min(sel.anchor.offset, sel.head.offset);
	const to: number = Math.max(sel.anchor.offset, sel.head.offset);
	const active: Mark | undefined = isCollapsed(sel)
		? resolveCursorMarks(state).find((m) => m.type === 'link')
		: undefined;
	if (isCollapsed(sel) && !active) return null;
	let offset = 0;
	let run: LinkRange | null = null;
	const runs: LinkRange[] = [];
	for (const child of getInlineChildren(block)) {
		const end: number = offset + (isTextNode(child) ? child.text.length : 1);
		const mark: Mark | undefined = isTextNode(child)
			? child.marks.find((m) => m.type === 'link')
			: undefined;
		if (mark && run && marksEqual(run.mark, mark)) {
			run = {
				mark,
				selection: { anchor: run.selection.anchor, head: { blockId: block.id, offset: end } },
			};
			runs[runs.length - 1] = run;
		} else {
			run = mark
				? {
						mark,
						selection: {
							anchor: { blockId: block.id, offset },
							head: { blockId: block.id, offset: end },
						},
					}
				: null;
			if (run) runs.push(run);
		}
		offset = end;
	}
	return (
		runs.find(
			(r) =>
				from >= r.selection.anchor.offset &&
				to <= r.selection.head.offset &&
				(isCollapsed(sel)
					? active && marksEqual(r.mark, active)
					: from < r.selection.head.offset && to > r.selection.anchor.offset),
		) ?? null
	);
}

/** One transaction keeps both undo selection and the editing caret intact. */
export function changeLink(
	state: EditorState,
	range: LinkRange,
	href?: string,
): Transaction | null {
	if (href !== undefined && href === range.mark.attrs?.href) return null;
	const selected: EditorState = state.withSelection(range.selection);
	const tr: Transaction | null =
		href === undefined
			? removeAttributedMark(selected, markType('link'))
			: applyAttributedMark(selected, { ...range.mark, attrs: { ...range.mark.attrs, href } });
	return tr
		? {
				...tr,
				selectionBefore: state.selection,
				selectionAfter: state.selection,
				storedMarksAfter: null,
			}
		: null;
}
