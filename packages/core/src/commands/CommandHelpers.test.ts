import { describe, expect, it } from 'vitest';
import { createBlockNode, createEmptyParagraph, createTextNode } from '../model/Document.js';
import type { Schema } from '../model/Schema.js';
import { createSelection, isNodeSelection, isTextSelection } from '../model/Selection.js';
import { type BlockId, nodeType } from '../model/TypeBrands.js';
import { stateBuilder } from '../test/TestUtils.js';
import {
	createSelectionForDocumentBoundary,
	getSiblings,
	resolveInsertPoint,
} from './CommandHelpers.js';

// ---------------------------------------------------------------------------
// getSiblings
// ---------------------------------------------------------------------------

describe('getSiblings', () => {
	it('returns doc.children for an empty parent path', () => {
		const state = stateBuilder()
			.paragraph('aaa', 'b1')
			.paragraph('bbb', 'b2')
			.cursor('b1', 0)
			.build();

		const siblings = getSiblings(state, []);
		expect(siblings).toBe(state.doc.children);
	});

	it('returns children of a nested parent block', () => {
		const inner = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('nested')],
			'inner' as BlockId,
		);
		const wrapper = createBlockNode(nodeType('blockquote'), [inner], 'wrap' as BlockId);
		const state = stateBuilder()
			.nestedBlock(wrapper)
			.cursor('inner', 0)
			.schema(['paragraph', 'blockquote'], [])
			.build();

		const siblings = getSiblings(state, ['wrap' as BlockId]);
		expect(siblings).toHaveLength(1);
	});

	it('returns empty array when parent does not exist', () => {
		const state = stateBuilder().paragraph('aaa', 'b1').cursor('b1', 0).build();

		const siblings = getSiblings(state, ['nonexistent' as BlockId]);
		expect(siblings).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// createEmptyParagraph
// ---------------------------------------------------------------------------

describe('createEmptyParagraph', () => {
	it('creates a paragraph block with a single empty text node', () => {
		const id = 'test-id' as BlockId;
		const block = createEmptyParagraph(id);

		expect(block.id).toBe(id);
		expect(block.type).toBe(nodeType('paragraph'));
		expect(block.children).toHaveLength(1);
		expect(block.children[0]).toEqual(createTextNode(''));
	});
});

// ---------------------------------------------------------------------------
// resolveInsertPoint
// ---------------------------------------------------------------------------

describe('resolveInsertPoint', () => {
	it('returns anchor position for a collapsed selection', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();

		const point = resolveInsertPoint(
			state.selection as {
				anchor: { blockId: BlockId; offset: number };
				head: { blockId: BlockId; offset: number };
			},
			state.getBlockOrder(),
		);
		expect(point.blockId).toBe('b1');
		expect(point.offset).toBe(3);
	});

	it('returns normalized from position for a forward range selection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.selection({ blockId: 'b1', offset: 1 }, { blockId: 'b1', offset: 4 })
			.build();

		const point = resolveInsertPoint(
			state.selection as {
				anchor: { blockId: BlockId; offset: number };
				head: { blockId: BlockId; offset: number };
			},
			state.getBlockOrder(),
		);
		expect(point.blockId).toBe('b1');
		expect(point.offset).toBe(1);
	});

	it('returns normalized from position for a backward range selection', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').paragraph('World', 'b2').build();

		// Create a backward selection (head before anchor)
		const sel = createSelection(
			{ blockId: 'b2' as BlockId, offset: 3 },
			{ blockId: 'b1' as BlockId, offset: 1 },
		);

		const point = resolveInsertPoint(sel, state.getBlockOrder());
		expect(point.blockId).toBe('b1');
		expect(point.offset).toBe(1);
	});

	it('returns from position for a cross-block range selection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.selection({ blockId: 'b1', offset: 2 }, { blockId: 'b2', offset: 3 })
			.build();

		const point = resolveInsertPoint(
			state.selection as {
				anchor: { blockId: BlockId; offset: number };
				head: { blockId: BlockId; offset: number };
			},
			state.getBlockOrder(),
		);
		expect(point.blockId).toBe('b1');
		expect(point.offset).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// createSelectionForDocumentBoundary
// ---------------------------------------------------------------------------

describe('createSelectionForDocumentBoundary', () => {
	const voidSchema: Schema['getNodeSpec'] = (type: string) => {
		if (type === 'horizontal_rule') {
			return {
				type: 'horizontal_rule',
				isVoid: true,
				toDOM: () => document.createElement('hr'),
			} as ReturnType<NonNullable<Schema['getNodeSpec']>>;
		}
		return undefined;
	};

	it('returns a collapsed caret at the start of the first block', () => {
		const state = stateBuilder()
			.paragraph('first', 'b1')
			.paragraph('second', 'b2')
			.cursor('b2', 3)
			.build();

		const sel = createSelectionForDocumentBoundary(state, 'start');

		expect(sel).not.toBeNull();
		if (sel && isTextSelection(sel)) {
			expect(sel.anchor.blockId).toBe('b1');
			expect(sel.anchor.offset).toBe(0);
		}
	});

	it('returns a collapsed caret at the end of the last block', () => {
		const state = stateBuilder()
			.paragraph('first', 'b1')
			.paragraph('second', 'b2')
			.cursor('b1', 0)
			.build();

		const sel = createSelectionForDocumentBoundary(state, 'end');

		expect(sel).not.toBeNull();
		if (sel && isTextSelection(sel)) {
			expect(sel.anchor.blockId).toBe('b2');
			expect(sel.anchor.offset).toBe('second'.length);
		}
	});

	it('skips the excluded block and returns the next candidate', () => {
		const state = stateBuilder()
			.paragraph('first', 'b1')
			.paragraph('second', 'b2')
			.cursor('b1', 0)
			.build();

		const sel = createSelectionForDocumentBoundary(state, 'start', 'b1' as BlockId);

		expect(sel).not.toBeNull();
		if (sel && isTextSelection(sel)) {
			expect(sel.anchor.blockId).toBe('b2');
			expect(sel.anchor.offset).toBe(0);
		}
	});

	it('returns null when the only block is excluded', () => {
		const state = stateBuilder().paragraph('only', 'b1').cursor('b1', 0).build();

		const sel = createSelectionForDocumentBoundary(state, 'start', 'b1' as BlockId);

		expect(sel).toBeNull();
	});

	it('returns a NodeSelection for a void block at the requested boundary', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('after', 'b2')
			.cursor('b2', 0)
			.schema(['paragraph', 'horizontal_rule'], ['bold'], voidSchema)
			.build();

		const sel = createSelectionForDocumentBoundary(state, 'start');

		expect(sel).not.toBeNull();
		if (sel) {
			expect(isNodeSelection(sel)).toBe(true);
			if (isNodeSelection(sel)) {
				expect(sel.nodeId).toBe('hr1');
			}
		}
	});

	it('walks in reverse for boundary "end"', () => {
		const state = stateBuilder()
			.paragraph('alpha', 'b1')
			.paragraph('beta', 'b2')
			.paragraph('gamma', 'b3')
			.cursor('b1', 0)
			.build();

		const sel = createSelectionForDocumentBoundary(state, 'end', 'b3' as BlockId);

		expect(sel).not.toBeNull();
		if (sel && isTextSelection(sel)) {
			expect(sel.anchor.blockId).toBe('b2');
			expect(sel.anchor.offset).toBe('beta'.length);
		}
	});
});
