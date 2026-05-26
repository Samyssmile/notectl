/**
 * Regression tests for issue #128: undo of `addMark` / `removeMark` over a
 * range that is only partially covered by the mark must restore the exact
 * pre-existing mark distribution. The fix lives in `TransactionBuilder.ts`,
 * which now plans steps from the working document so each emitted step
 * accurately reflects what it changed.
 */

import { describe, expect, it } from 'vitest';
import {
	type InlineNode,
	type Mark,
	type TextNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { HistoryManager } from './History.js';

const bold: Mark = { type: markType('bold') };
const italic: Mark = { type: markType('italic') };

interface CharMarks {
	readonly ch: string;
	readonly marks: readonly string[];
}

function readChars(state: EditorState): CharMarks[] {
	const result: CharMarks[] = [];
	const block = state.doc.children[0];
	if (!block) return result;
	for (const child of block.children) {
		if ('text' in child) {
			const t = child as TextNode;
			const marks: readonly string[] = t.marks.map((m) => m.type);
			for (const ch of t.text) result.push({ ch, marks });
		}
	}
	return result;
}

function findMarkAttrs(
	state: EditorState,
	textChar: string,
	type: string,
): Record<string, unknown> | undefined {
	const block = state.doc.children[0];
	if (!block) return undefined;
	for (const child of block.children) {
		if ('text' in child) {
			const t = child as TextNode;
			if (t.text.includes(textChar)) {
				const found = t.marks.find((m) => m.type === type);
				return found?.attrs as Record<string, unknown> | undefined;
			}
		}
	}
	return undefined;
}

function makeStateFromInlines(
	children: readonly (TextNode | InlineNode)[],
	from: number,
	to: number,
	markTypes: readonly string[] = ['bold', 'italic', 'link'],
): EditorState {
	const block = createBlockNode(nodeType('paragraph'), children, blockId('b1'));
	return EditorState.create({
		doc: createDocument([block]),
		selection: createSelection(
			{ blockId: blockId('b1'), offset: from },
			{ blockId: blockId('b1'), offset: to },
		),
		schema: { nodeTypes: ['paragraph'], markTypes: markTypes as string[] },
	});
}

describe('Mark undo over partially-marked ranges (#128)', () => {
	describe('addMark', () => {
		it('preserves a pre-existing mark on a left sub-range after undo', () => {
			// A (bold) | B (plain) — user bolds [0,2], undo must leave A bold and B plain.
			const initial = makeStateFromInlines(
				[createTextNode('A', [bold]), createTextNode('B', [])],
				0,
				2,
			);

			const history = new HistoryManager();
			const tr = initial
				.transaction('command')
				.addMark(blockId('b1'), 0, 2, bold)
				.setSelection(createCollapsedSelection(blockId('b1'), 2))
				.build();
			const after = initial.apply(tr);
			history.push(tr);

			expect(readChars(after)).toEqual([
				{ ch: 'A', marks: ['bold'] },
				{ ch: 'B', marks: ['bold'] },
			]);

			const undone = history.undo(after)?.state ?? after;
			expect(readChars(undone)).toEqual([
				{ ch: 'A', marks: ['bold'] },
				{ ch: 'B', marks: [] },
			]);
		});

		it('preserves a pre-existing mark on a right sub-range after undo', () => {
			// A (plain) | B (bold) — user bolds [0,2], undo restores A plain, B bold.
			const initial = makeStateFromInlines(
				[createTextNode('A', []), createTextNode('B', [bold])],
				0,
				2,
			);
			const history = new HistoryManager();
			const tr = initial.transaction('command').addMark(blockId('b1'), 0, 2, bold).build();
			const after = initial.apply(tr);
			history.push(tr);

			const undone = history.undo(after)?.state ?? after;
			expect(readChars(undone)).toEqual([
				{ ch: 'A', marks: [] },
				{ ch: 'B', marks: ['bold'] },
			]);
		});

		it('preserves alternating pre-existing marks after undo', () => {
			// A(bold) | B(plain) | C(bold) | D(plain) — bold all, undo restores original
			const initial = makeStateFromInlines(
				[
					createTextNode('A', [bold]),
					createTextNode('B', []),
					createTextNode('C', [bold]),
					createTextNode('D', []),
				],
				0,
				4,
			);
			const history = new HistoryManager();
			const tr = initial.transaction('command').addMark(blockId('b1'), 0, 4, bold).build();
			const after = initial.apply(tr);
			history.push(tr);

			const undone = history.undo(after)?.state ?? after;
			expect(readChars(undone)).toEqual([
				{ ch: 'A', marks: ['bold'] },
				{ ch: 'B', marks: [] },
				{ ch: 'C', marks: ['bold'] },
				{ ch: 'D', marks: [] },
			]);
		});

		it('redo reproduces the fully-marked range after undo', () => {
			const initial = makeStateFromInlines(
				[createTextNode('A', [bold]), createTextNode('B', [])],
				0,
				2,
			);
			const history = new HistoryManager();
			const tr = initial.transaction('command').addMark(blockId('b1'), 0, 2, bold).build();
			const after = initial.apply(tr);
			history.push(tr);

			const undone = history.undo(after)?.state ?? after;
			const redone = history.redo(undone)?.state ?? undone;
			expect(readChars(redone)).toEqual([
				{ ch: 'A', marks: ['bold'] },
				{ ch: 'B', marks: ['bold'] },
			]);
		});

		it('emits no steps when the mark already covers the entire range', () => {
			const initial = makeStateFromInlines([createTextNode('AB', [bold])], 0, 2);
			const tr = initial.transaction('command').addMark(blockId('b1'), 0, 2, bold).build();
			expect(tr.steps).toHaveLength(0);
		});

		it('coalesces across InlineNodes when planning ranges', () => {
			const emoji: InlineNode = createInlineNode(inlineType('emoji'), { name: 'smile' });
			const initial = makeStateFromInlines([createTextNode('A'), emoji, createTextNode('B')], 0, 3);
			const tr = initial.transaction('command').addMark(blockId('b1'), 0, 3, bold).build();
			// Should be a single coalesced step covering [0,3) – inline is inert.
			expect(tr.steps).toHaveLength(1);
			expect(tr.steps[0]).toMatchObject({ type: 'addMark', from: 0, to: 3 });
		});
	});

	describe('removeMark', () => {
		it('restores only the originally-marked sub-ranges after undo', () => {
			// A(bold) | B(plain) | C(bold) — user removes bold over [0,3], undo restores
			// bold on A and C only.
			const initial = makeStateFromInlines(
				[createTextNode('A', [bold]), createTextNode('B', []), createTextNode('C', [bold])],
				0,
				3,
			);
			const history = new HistoryManager();
			const tr = initial.transaction('command').removeMark(blockId('b1'), 0, 3, bold).build();
			const after = initial.apply(tr);
			history.push(tr);

			expect(readChars(after)).toEqual([
				{ ch: 'A', marks: [] },
				{ ch: 'B', marks: [] },
				{ ch: 'C', marks: [] },
			]);

			const undone = history.undo(after)?.state ?? after;
			expect(readChars(undone)).toEqual([
				{ ch: 'A', marks: ['bold'] },
				{ ch: 'B', marks: [] },
				{ ch: 'C', marks: ['bold'] },
			]);
		});

		it('preserves mark attributes through undo', () => {
			const link: Mark = {
				type: markType('link'),
				attrs: { href: 'https://example.com' },
			};
			const initial = makeStateFromInlines(
				[createTextNode('A', [link]), createTextNode('B', [])],
				0,
				2,
			);
			const history = new HistoryManager();
			// User requests removeMark with a bare-type mark; the builder must look
			// up the actual mark (with attrs) from the document.
			const tr = initial
				.transaction('command')
				.removeMark(blockId('b1'), 0, 2, { type: markType('link') })
				.build();
			const after = initial.apply(tr);
			history.push(tr);

			const undone = history.undo(after)?.state ?? after;
			expect(findMarkAttrs(undone, 'A', 'link')).toEqual({ href: 'https://example.com' });
		});

		it('emits no steps when the mark is absent over the entire range', () => {
			const initial = makeStateFromInlines([createTextNode('AB', [])], 0, 2);
			const tr = initial.transaction('command').removeMark(blockId('b1'), 0, 2, bold).build();
			expect(tr.steps).toHaveLength(0);
		});
	});

	describe('mixed mark types', () => {
		it('adding bold does not affect a co-located italic on undo', () => {
			// "A"(italic) | "B"(italic+bold) — addMark bold over [0,2].
			const initial = makeStateFromInlines(
				[createTextNode('A', [italic]), createTextNode('B', [italic, bold])],
				0,
				2,
			);
			const history = new HistoryManager();
			const tr = initial.transaction('command').addMark(blockId('b1'), 0, 2, bold).build();
			const after = initial.apply(tr);
			history.push(tr);

			const undone = history.undo(after)?.state ?? after;
			expect(readChars(undone)).toEqual([
				{ ch: 'A', marks: ['italic'] },
				{ ch: 'B', marks: ['italic', 'bold'] },
			]);
		});
	});
});
