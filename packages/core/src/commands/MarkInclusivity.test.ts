/**
 * Regression tests for #153: typing immediately after a link (or any
 * non-inclusive mark) must not extend the mark onto the newly typed text.
 */

import { describe, expect, it } from 'vitest';
import type { Mark } from '../model/Document.js';
import {
	getCursorMarks,
	getInlineChildren,
	getTextChildren,
	hasMark,
	isTextNode,
} from '../model/Document.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { Schema } from '../model/Schema.js';
import { markType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { stateBuilder } from '../test/TestUtils.js';
import { insertTextCommand } from './Commands.js';
import { isMarkActive, toggleBold } from './MarkCommands.js';

const linkSpec: MarkSpec = {
	type: 'link',
	inclusive: false,
	toDOM: () => document.createElement('a'),
};
const boldSpec: MarkSpec = {
	type: 'bold',
	toDOM: () => document.createElement('strong'),
};

const getMarkSpec: Schema['getMarkSpec'] = (type) => {
	if (type === 'link') return linkSpec;
	if (type === 'bold') return boldSpec;
	return undefined;
};

const linkMark: Mark = { type: markType('link'), attrs: { href: 'https://example.com' } };
const boldMark: Mark = { type: markType('bold') };

function linkedAtRightEdge(): EditorState {
	return stateBuilder()
		.paragraph('a', 'b1', { marks: [linkMark] })
		.cursor('b1', 1)
		.schema(['paragraph'], ['link', 'bold'], undefined, getMarkSpec)
		.build();
}

describe('#153 mark inclusivity', () => {
	describe('getCursorMarks', () => {
		it('drops a non-inclusive mark at its right boundary', () => {
			const block = linkedAtRightEdge().doc.children[0];
			if (!block) throw new Error('missing block');
			expect(getCursorMarks(block, 1, () => false)).toEqual([]);
		});

		it('keeps an inclusive mark at its right boundary', () => {
			const block = linkedAtRightEdge().doc.children[0];
			if (!block) throw new Error('missing block');
			expect(getCursorMarks(block, 1, () => true)).toEqual([linkMark]);
		});

		it('keeps a non-inclusive mark in the middle of its span', () => {
			const state = stateBuilder()
				.paragraph('ab', 'b1', { marks: [linkMark] })
				.cursor('b1', 1)
				.build();
			const block = state.doc.children[0];
			if (!block) throw new Error('missing block');
			expect(getCursorMarks(block, 1, () => false)).toEqual([linkMark]);
		});
	});

	describe('insertTextCommand', () => {
		it('does not extend a link onto text typed at its right edge', () => {
			const state = linkedAtRightEdge();

			const next = state.apply(insertTextCommand(state, 'b'));
			const block = next.doc.children[0];
			if (!block) throw new Error('missing block');

			const children = getTextChildren(block);
			const linked = children.filter((c) => hasMark(c.marks, markType('link')));
			const linkedText = linked.map((c) => c.text).join('');

			expect(linkedText).toBe('a');
			expect(linkedText).not.toContain('b');
		});

		it('still extends bold (inclusive) onto text typed at its right edge', () => {
			const state = stateBuilder()
				.paragraph('a', 'b1', { marks: [boldMark] })
				.cursor('b1', 1)
				.schema(['paragraph'], ['link', 'bold'], undefined, getMarkSpec)
				.build();

			const next = state.apply(insertTextCommand(state, 'b'));
			const block = next.doc.children[0];
			if (!block) throw new Error('missing block');

			const inline = getInlineChildren(block).filter(isTextNode);
			expect(inline.every((c) => hasMark(c.marks, markType('bold')))).toBe(true);
		});
	});

	describe('toggle-then-type (stored marks seeding)', () => {
		it('toggling bold at a link right edge does not seed the link into stored marks', () => {
			const state = linkedAtRightEdge();

			const tr = toggleBold(state);
			if (!tr) throw new Error('expected a transaction');
			const next = state.apply(tr);

			expect(next.storedMarks).not.toBeNull();
			expect(hasMark(next.storedMarks ?? [], markType('link'))).toBe(false);
			expect(hasMark(next.storedMarks ?? [], markType('bold'))).toBe(true);
		});
	});

	describe('isMarkActive', () => {
		it('reports a non-inclusive mark inactive at its right boundary', () => {
			const state = linkedAtRightEdge();
			expect(isMarkActive(state, markType('link'))).toBe(false);
		});
	});
});
