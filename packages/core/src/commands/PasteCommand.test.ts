import { describe, expect, it } from 'vitest';
import type { ContentSlice, SliceBlock } from '../model/ContentSlice.js';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockLength,
	getBlockText,
	getTextChildren,
} from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import type { NodeTypeName } from '../model/TypeBrands.js';
import { markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { invertTransaction } from '../state/Transaction.js';
import { pasteSlice } from './PasteCommand.js';

function nt(name: string): NodeTypeName {
	return nodeType(name);
}

function createState(
	blocks: { type: string; text: string; id: string }[],
	cursorBlockId: string,
	cursorOffset: number,
): EditorState {
	const doc = createDocument(
		blocks.map((b) => createBlockNode(nt(b.type), [createTextNode(b.text)], b.id)),
	);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection(cursorBlockId, cursorOffset),
		schema: {
			nodeTypes: ['paragraph', 'heading', 'blockquote', 'list_item', 'horizontal_rule'],
			markTypes: ['bold', 'italic', 'underline', 'strikethrough', 'link'],
		},
	});
}

describe('PasteCommand', () => {
	describe('pasteInline (single paragraph)', () => {
		it('inserts plain text into current block', () => {
			const state = createState([{ type: 'paragraph', text: 'Hello world', id: 'b1' }], 'b1', 5);
			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('paragraph'),
						segments: [{ text: ' beautiful', marks: [] }],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			expect(getBlockText(newState.doc.children[0])).toBe('Hello beautiful world');
			expect(newState.selection.anchor.offset).toBe(15);
		});

		it('inserts text with marks', () => {
			const state = createState([{ type: 'paragraph', text: 'Hello', id: 'b1' }], 'b1', 5);
			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('paragraph'),
						segments: [
							{ text: ' ', marks: [] },
							{ text: 'bold', marks: [{ type: markType('bold') }] },
							{ text: ' text', marks: [] },
						],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			expect(getBlockText(newState.doc.children[0])).toBe('Hello bold text');
			const textChildren = getTextChildren(newState.doc.children[0]);
			expect(textChildren.length).toBe(3);
			expect(textChildren[0]?.text).toBe('Hello ');
			expect(textChildren[1]?.text).toBe('bold');
			expect(textChildren[1]?.marks).toEqual([{ type: 'bold' }]);
			expect(textChildren[2]?.text).toBe(' text');
		});

		it('replaces selected text', () => {
			const state = EditorState.create({
				doc: createDocument([
					createBlockNode(nt('paragraph'), [createTextNode('Hello world')], 'b1'),
				]),
				selection: createSelection({ blockId: 'b1', offset: 5 }, { blockId: 'b1', offset: 11 }),
				schema: {
					nodeTypes: ['paragraph'],
					markTypes: ['bold'],
				},
			});

			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('paragraph'),
						segments: [{ text: '!', marks: [] }],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			expect(getBlockText(newState.doc.children[0])).toBe('Hello!');
		});

		it('inserts into empty block', () => {
			const state = createState([{ type: 'paragraph', text: '', id: 'b1' }], 'b1', 0);
			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('paragraph'),
						segments: [{ text: 'inserted', marks: [] }],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			expect(getBlockText(newState.doc.children[0])).toBe('inserted');
		});
	});

	describe('pasteSingleBlock (non-paragraph)', () => {
		it('changes block type and inserts text', () => {
			const state = createState([{ type: 'paragraph', text: '', id: 'b1' }], 'b1', 0);
			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('heading'),
						attrs: { level: 2 },
						segments: [{ text: 'My Heading', marks: [] }],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			expect(newState.doc.children[0]?.type).toBe('heading');
			expect(newState.doc.children[0]?.attrs).toEqual({ level: 2 });
			expect(getBlockText(newState.doc.children[0])).toBe('My Heading');
		});
	});

	describe('pasteMultiBlock', () => {
		it('splits and inserts multiple blocks', () => {
			const state = createState([{ type: 'paragraph', text: 'Hello world', id: 'b1' }], 'b1', 6);
			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('paragraph'),
						segments: [{ text: 'first', marks: [] }],
					},
					{
						type: nt('paragraph'),
						segments: [{ text: 'second', marks: [] }],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			expect(newState.doc.children.length).toBe(2);
			expect(getBlockText(newState.doc.children[0])).toBe('Hello first');
			expect(getBlockText(newState.doc.children[1])).toContain('second');
		});

		it('handles three blocks with mixed types', () => {
			const state = createState([{ type: 'paragraph', text: 'AB', id: 'b1' }], 'b1', 1);
			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('heading'),
						attrs: { level: 1 },
						segments: [{ text: 'Title', marks: [] }],
					},
					{
						type: nt('paragraph'),
						segments: [{ text: 'middle', marks: [] }],
					},
					{
						type: nt('paragraph'),
						segments: [{ text: 'end', marks: [] }],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			// 3 slice blocks → 3 result blocks (first slice merges into current block)
			expect(newState.doc.children.length).toBe(3);
			expect(newState.doc.children[0]?.type).toBe('heading');
			expect(getBlockText(newState.doc.children[0])).toBe('ATitle');
			expect(newState.doc.children[1]?.type).toBe('paragraph');
			expect(getBlockText(newState.doc.children[1])).toBe('middle');
			expect(getBlockText(newState.doc.children[2])).toBe('endB');
		});
	});

	describe('empty slice', () => {
		it('produces no-op transaction for empty slice', () => {
			const state = createState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 2);
			const slice: ContentSlice = { blocks: [] };

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);

			expect(getBlockText(newState.doc.children[0])).toBe('text');
		});
	});

	describe('undo', () => {
		it('inline paste is invertible', () => {
			const state = createState([{ type: 'paragraph', text: 'Hello', id: 'b1' }], 'b1', 5);
			const slice: ContentSlice = {
				blocks: [
					{
						type: nt('paragraph'),
						segments: [{ text: ' World', marks: [] }],
					},
				],
			};

			const tr = pasteSlice(state, slice);
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('Hello World');

			const undoTr = invertTransaction(tr);
			const undoneState = newState.apply(undoTr);
			expect(getBlockText(undoneState.doc.children[0])).toBe('Hello');
		});
	});
});
