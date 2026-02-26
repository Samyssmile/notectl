import { describe, expect, it } from 'vitest';
import { createInlineNode, getBlockLength } from '../model/Document.js';
import { isCollapsed, isNodeSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { inlineType, markType } from '../model/TypeBrands.js';
import { stateBuilder } from '../test/TestUtils.js';
import {
	extendCharacterBackward,
	extendCharacterForward,
	extendToBlockEnd,
	extendToBlockStart,
	extendToDocumentEnd,
	extendToDocumentStart,
	moveCharacterBackward,
	moveCharacterForward,
	moveToBlockEnd,
	moveToBlockStart,
	moveToDocumentEnd,
	moveToDocumentStart,
} from './MovementCommands.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function voidNodeSpec(typeName: string): (t: string) => { isVoid: boolean } | undefined {
	return (t: string) => (t === typeName ? { isVoid: true } : undefined);
}

// ---------------------------------------------------------------------------
// moveCharacterForward
// ---------------------------------------------------------------------------

describe('moveCharacterForward', () => {
	it('moves cursor one character forward', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 1 } }),
		);
	});

	it('crosses block boundary at end of text', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.paragraph('CD', 'b2')
			.cursor('b1', 2)
			.build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b2', offset: 0 } }),
		);
	});

	it('returns null at end of document', () => {
		const state = stateBuilder().paragraph('AB', 'b1').cursor('b1', 2).build();
		expect(moveCharacterForward(state)).toBeNull();
	});

	it('skips InlineNode atomically', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: 'B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 1)
			.build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 2 } }),
		);
	});

	it('collapses range selection to head', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.selection({ blockId: 'b1', offset: 1 }, { blockId: 'b1', offset: 3 })
			.build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(isCollapsed(next.selection)).toBe(true);
	});

	it('creates NodeSelection for void target block', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.cursor('b1', 2)
			.schema(['paragraph', 'horizontal_rule'], [], voidNodeSpec('horizontal_rule'))
			.build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(isNodeSelection(next.selection)).toBe(true);
	});

	it('returns null for NodeSelection', () => {
		const state = stateBuilder().voidBlock('horizontal_rule', 'hr1').nodeSelection('hr1').build();
		expect(moveCharacterForward(state)).toBeNull();
	});

	it('returns null for GapCursor', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.gapCursor('hr1', 'before')
			.build();
		expect(moveCharacterForward(state)).toBeNull();
	});

	it('moves cursor by grapheme cluster over surrogate-pair emoji', () => {
		// Wave emoji (U+1F44B) = 2 code units
		const state = stateBuilder().paragraph('\u{1F44B}hello', 'b1').cursor('b1', 0).build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 2 } }),
		);
	});

	it('moves cursor by grapheme cluster over ZWJ sequence', () => {
		// Family emoji: man + ZWJ + woman + ZWJ + girl = 11 code units
		const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
		const state = stateBuilder().paragraph(`${family}x`, 'b1').cursor('b1', 0).build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: family.length } }),
		);
	});

	it('moves correctly over emoji after InlineNode', () => {
		// Block: [TextNode("A"), InlineNode, TextNode("👋B")]
		// Cursor at offset 2 (after InlineNode, before emoji)
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: '\u{1F44B}B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 2)
			.build();
		const tr = moveCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		// Emoji is 2 code units, so offset should go from 2 to 4
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 4 } }),
		);
	});

	it('clears storedMarks', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], ['bold'])
			.build();
		// Set stored marks first
		const withMarks = state.apply(
			state
				.transaction('command')
				.setStoredMarks([{ type: markType('bold') }], null)
				.build(),
		);
		expect(withMarks.storedMarks).not.toBeNull();
		const tr = moveCharacterForward(withMarks);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = withMarks.apply(tr);
		expect(next.storedMarks).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// moveCharacterBackward
// ---------------------------------------------------------------------------

describe('moveCharacterBackward', () => {
	it('moves cursor one character backward', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();
		const tr = moveCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 2 } }),
		);
	});

	it('crosses block boundary at start of text', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.paragraph('CD', 'b2')
			.cursor('b2', 0)
			.build();
		const tr = moveCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 2 } }),
		);
	});

	it('returns null at start of document', () => {
		const state = stateBuilder().paragraph('AB', 'b1').cursor('b1', 0).build();
		expect(moveCharacterBackward(state)).toBeNull();
	});

	it('moves cursor backward by grapheme cluster over emoji', () => {
		// "a" + wave emoji (2 code units) → cursor at offset 3 (after emoji)
		const state = stateBuilder().paragraph('a\u{1F44B}b', 'b1').cursor('b1', 3).build();
		const tr = moveCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 1 } }),
		);
	});

	it('moves correctly backward over emoji before InlineNode', () => {
		// Block: [TextNode("A👋"), InlineNode, TextNode("B")]
		// Cursor at offset 3 (after emoji, before InlineNode)
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A\u{1F44B}', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: 'B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 3)
			.build();
		const tr = moveCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		// Emoji is 2 code units, so offset should go from 3 to 1
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 1 } }),
		);
	});

	it('creates NodeSelection for void target block when moving backward', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('AB', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', 'horizontal_rule'], [], voidNodeSpec('horizontal_rule'))
			.build();
		const tr = moveCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(isNodeSelection(next.selection)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// moveToBlockStart / moveToBlockEnd
// ---------------------------------------------------------------------------

describe('moveToBlockStart', () => {
	it('moves cursor to offset 0', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();
		const tr = moveToBlockStart(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 0 } }),
		);
	});

	it('returns null when already at start', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		expect(moveToBlockStart(state)).toBeNull();
	});
});

describe('moveToBlockEnd', () => {
	it('moves cursor to end of block', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const tr = moveToBlockEnd(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		const block = next.getBlock('b1' as BlockId);
		if (!block) {
			expect.unreachable('Expected block b1 to exist');
			return;
		}
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: getBlockLength(block) } }),
		);
	});

	it('returns null when already at end', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 5).build();
		expect(moveToBlockEnd(state)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// moveToDocumentStart / moveToDocumentEnd
// ---------------------------------------------------------------------------

describe('moveToDocumentStart', () => {
	it('moves cursor to first block offset 0', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b2', 3)
			.build();
		const tr = moveToDocumentStart(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 0 } }),
		);
	});

	it('creates NodeSelection when first block is void', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('Text', 'b1')
			.cursor('b1', 2)
			.schema(['paragraph', 'horizontal_rule'], [], voidNodeSpec('horizontal_rule'))
			.build();
		const tr = moveToDocumentStart(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(isNodeSelection(next.selection)).toBe(true);
	});
});

describe('moveToDocumentEnd', () => {
	it('moves cursor to end of last block', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b1', 0)
			.build();
		const tr = moveToDocumentEnd(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b2', offset: 6 } }),
		);
	});

	it('creates NodeSelection when last block is void', () => {
		const state = stateBuilder()
			.paragraph('Text', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.cursor('b1', 2)
			.schema(['paragraph', 'horizontal_rule'], [], voidNodeSpec('horizontal_rule'))
			.build();
		const tr = moveToDocumentEnd(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(isNodeSelection(next.selection)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// extendCharacterForward / extendCharacterBackward
// ---------------------------------------------------------------------------

describe('extendCharacterForward', () => {
	it('extends selection one character forward from collapsed cursor', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const tr = extendCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(isCollapsed(next.selection)).toBe(false);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 0 },
				head: { blockId: 'b1', offset: 1 },
			}),
		);
	});

	it('extends across block boundary', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.paragraph('CD', 'b2')
			.cursor('b1', 2)
			.build();
		const tr = extendCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 2 },
				head: { blockId: 'b2', offset: 0 },
			}),
		);
	});

	it('extends by grapheme cluster over emoji', () => {
		const state = stateBuilder().paragraph('\u{1F44B}hello', 'b1').cursor('b1', 0).build();
		const tr = extendCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 0 },
				head: { blockId: 'b1', offset: 2 },
			}),
		);
	});

	it('extends correctly over emoji after InlineNode', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: '\u{1F44B}B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 2)
			.build();
		const tr = extendCharacterForward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 2 },
				head: { blockId: 'b1', offset: 4 },
			}),
		);
	});

	it('returns null at end of document', () => {
		const state = stateBuilder().paragraph('AB', 'b1').cursor('b1', 2).build();
		expect(extendCharacterForward(state)).toBeNull();
	});

	it('returns null for NodeSelection', () => {
		const state = stateBuilder().voidBlock('horizontal_rule', 'hr1').nodeSelection('hr1').build();
		expect(extendCharacterForward(state)).toBeNull();
	});
});

describe('extendCharacterBackward', () => {
	it('extends selection one character backward', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();
		const tr = extendCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 3 },
				head: { blockId: 'b1', offset: 2 },
			}),
		);
	});

	it('extends backward by grapheme cluster over emoji', () => {
		const state = stateBuilder().paragraph('a\u{1F44B}b', 'b1').cursor('b1', 3).build();
		const tr = extendCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 3 },
				head: { blockId: 'b1', offset: 1 },
			}),
		);
	});

	it('extends correctly backward over emoji before InlineNode', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					{ type: 'text' as const, text: 'A\u{1F44B}', marks: [] },
					createInlineNode(inlineType('hard_break')),
					{ type: 'text' as const, text: 'B', marks: [] },
				],
				'b1',
			)
			.cursor('b1', 3)
			.build();
		const tr = extendCharacterBackward(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 3 },
				head: { blockId: 'b1', offset: 1 },
			}),
		);
	});

	it('returns null at start of document', () => {
		const state = stateBuilder().paragraph('AB', 'b1').cursor('b1', 0).build();
		expect(extendCharacterBackward(state)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// extendToBlockStart / extendToBlockEnd
// ---------------------------------------------------------------------------

describe('extendToBlockStart', () => {
	it('extends selection to offset 0', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();
		const tr = extendToBlockStart(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 3 },
				head: { blockId: 'b1', offset: 0 },
			}),
		);
	});

	it('returns null when head is already at start', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		expect(extendToBlockStart(state)).toBeNull();
	});
});

describe('extendToBlockEnd', () => {
	it('extends selection to end of block', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const tr = extendToBlockEnd(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 0 },
				head: { blockId: 'b1', offset: 5 },
			}),
		);
	});

	it('returns null when head is already at end', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 5).build();
		expect(extendToBlockEnd(state)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// extendToDocumentStart / extendToDocumentEnd
// ---------------------------------------------------------------------------

describe('extendToDocumentStart', () => {
	it('extends selection to document start', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b2', 3)
			.build();
		const tr = extendToDocumentStart(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b2', offset: 3 },
				head: { blockId: 'b1', offset: 0 },
			}),
		);
	});

	it('returns null when head is already at document start (no-op)', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b1', 0)
			.build();
		expect(extendToDocumentStart(state)).toBeNull();
	});
});

describe('extendToDocumentEnd', () => {
	it('extends selection to document end', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b1', 0)
			.build();
		const tr = extendToDocumentEnd(state);
		if (!tr) {
			expect.unreachable('Expected non-null transaction');
			return;
		}
		const next = state.apply(tr);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 0 },
				head: { blockId: 'b2', offset: 6 },
			}),
		);
	});

	it('returns null when head is already at document end (no-op)', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b2', 6)
			.build();
		expect(extendToDocumentEnd(state)).toBeNull();
	});
});
