import { type Mock, describe, expect, it, vi } from 'vitest';
import type { NodeSpec } from '../model/NodeSpec.js';
import { isCollapsed, isNodeSelection } from '../model/Selection.js';
import { markType } from '../model/TypeBrands.js';
import type { BlockId } from '../model/TypeBrands.js';
import { applyCommand, stateBuilder } from '../test/TestUtils.js';
import {
	extendLineDown,
	extendLineUp,
	extendToLineEnd,
	extendToLineStart,
	extendWordBackward,
	extendWordForward,
	moveLineDown,
	moveLineUp,
	moveToLineEnd,
	moveToLineStart,
	moveWordBackward,
	moveWordForward,
	viewExtend,
	viewMove,
} from './ViewMovementCommands.js';

/**
 * Tests run in happy-dom which does not implement Selection.modify,
 * so all paths exercise the model-based fallback logic.
 */

function container(): HTMLElement {
	return document.createElement('div');
}

// ---------------------------------------------------------------------------
// Word Movement (fallback → findWordBoundary*)
// ---------------------------------------------------------------------------

describe('moveWordForward (fallback)', () => {
	it('moves past the current word', () => {
		const state = stateBuilder().paragraph('hello world', 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, (s) => moveWordForward(container(), s));
		// findWordBoundaryForward skips "hello" + trailing space → offset 6
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 6 } }),
		);
	});

	it('crosses block boundary when at end of block', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.paragraph('CD', 'b2')
			.cursor('b1', 2)
			.build();
		const next = applyCommand(state, (s) => moveWordForward(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b2', offset: 0 } }),
		);
	});

	it('returns null at end of document', () => {
		const state = stateBuilder().paragraph('AB', 'b1').cursor('b1', 2).build();
		expect(moveWordForward(container(), state)).toBeNull();
	});
});

describe('moveWordBackward (fallback)', () => {
	it('moves to start of current word', () => {
		const state = stateBuilder().paragraph('hello world', 'b1').cursor('b1', 8).build();
		const next = applyCommand(state, (s) => moveWordBackward(container(), s));
		// findWordBoundaryBackward from "or" skips back to "w" → offset 6
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 6 } }),
		);
	});

	it('crosses block boundary when at start of block', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.paragraph('CD', 'b2')
			.cursor('b2', 0)
			.build();
		const next = applyCommand(state, (s) => moveWordBackward(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 2 } }),
		);
	});
});

// ---------------------------------------------------------------------------
// Line Boundary Movement (fallback → moveToBlockStart/End)
// ---------------------------------------------------------------------------

describe('moveToLineStart (fallback)', () => {
	it('moves to offset 0 of current block', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();
		const next = applyCommand(state, (s) => moveToLineStart(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 0 } }),
		);
	});

	it('returns null when already at start', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		expect(moveToLineStart(container(), state)).toBeNull();
	});
});

describe('moveToLineEnd (fallback)', () => {
	it('moves to end of current block', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, (s) => moveToLineEnd(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 5 } }),
		);
	});
});

// ---------------------------------------------------------------------------
// Line Movement (fallback → navigateAcrossBlocks)
// ---------------------------------------------------------------------------

describe('moveLineUp (fallback)', () => {
	it('navigates to previous block', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b2', 0)
			.build();
		const next = applyCommand(state, (s) => moveLineUp(container(), s));
		// navigateAcrossBlocks 'up' → places cursor at end of previous block
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b1', offset: 5 } }),
		);
	});

	it('returns null at first block', () => {
		const state = stateBuilder().paragraph('Only', 'b1').cursor('b1', 0).build();
		expect(moveLineUp(container(), state)).toBeNull();
	});
});

describe('moveLineDown (fallback)', () => {
	it('navigates to next block', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b1', 5)
			.build();
		const next = applyCommand(state, (s) => moveLineDown(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({ anchor: { blockId: 'b2', offset: 0 } }),
		);
	});
});

// ---------------------------------------------------------------------------
// Extend Word
// ---------------------------------------------------------------------------

describe('extendWordForward (fallback)', () => {
	it('extends selection to next word boundary', () => {
		const state = stateBuilder().paragraph('hello world', 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, (s) => extendWordForward(container(), s));
		expect(isCollapsed(next.selection)).toBe(false);
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 0 },
				head: { blockId: 'b1', offset: 6 },
			}),
		);
	});
});

describe('extendWordBackward (fallback)', () => {
	it('extends selection to previous word boundary', () => {
		const state = stateBuilder().paragraph('hello world', 'b1').cursor('b1', 11).build();
		const next = applyCommand(state, (s) => extendWordBackward(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 11 },
				head: { blockId: 'b1', offset: 6 },
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// Extend Line Boundary
// ---------------------------------------------------------------------------

describe('extendToLineStart (fallback)', () => {
	it('extends selection to start of block', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();
		const next = applyCommand(state, (s) => extendToLineStart(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 3 },
				head: { blockId: 'b1', offset: 0 },
			}),
		);
	});
});

describe('extendToLineEnd (fallback)', () => {
	it('extends selection to end of block', () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const next = applyCommand(state, (s) => extendToLineEnd(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 0 },
				head: { blockId: 'b1', offset: 5 },
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// Extend Line
// ---------------------------------------------------------------------------

describe('extendLineUp (fallback)', () => {
	it('extends to previous block boundary', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b2', 3)
			.build();
		const next = applyCommand(state, (s) => extendLineUp(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b2', offset: 3 },
				head: { blockId: 'b1', offset: 5 },
			}),
		);
	});
});

describe('extendLineDown (fallback)', () => {
	it('extends to next block boundary', () => {
		const state = stateBuilder()
			.paragraph('First', 'b1')
			.paragraph('Second', 'b2')
			.cursor('b1', 2)
			.build();
		const next = applyCommand(state, (s) => extendLineDown(container(), s));
		expect(next.selection).toEqual(
			expect.objectContaining({
				anchor: { blockId: 'b1', offset: 2 },
				head: { blockId: 'b2', offset: 0 },
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// Guard: NodeSelection / GapCursor
// ---------------------------------------------------------------------------

describe('guards', () => {
	it('returns null for NodeSelection', () => {
		const state = stateBuilder().voidBlock('horizontal_rule', 'hr1').nodeSelection('hr1').build();
		expect(moveWordForward(container(), state)).toBeNull();
		expect(extendWordForward(container(), state)).toBeNull();
	});

	it('returns null for GapCursor', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.gapCursor('hr1', 'before')
			.build();
		expect(moveToLineEnd(container(), state)).toBeNull();
		expect(extendToLineStart(container(), state)).toBeNull();
	});

	it('clears storedMarks on movement', () => {
		const state = stateBuilder()
			.paragraph('hello world', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], ['bold'])
			.build();
		const withMarks = state.apply(
			state
				.transaction('command')
				.setStoredMarks([{ type: markType('bold') }], null)
				.build(),
		);
		expect(withMarks.storedMarks).not.toBeNull();
		const next = applyCommand(withMarks, (s) => moveWordForward(container(), s));
		expect(next.storedMarks).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Fallback cross-block: void and isolating checks
// ---------------------------------------------------------------------------

function voidNodeSpec(typeName: string): (t: string) => { isVoid: boolean } | undefined {
	return (t: string) => (t === typeName ? { isVoid: true } : undefined);
}

describe('fallback cross-block void handling', () => {
	it('creates NodeSelection when word-moving forward into void block', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.cursor('b1', 2)
			.schema(['paragraph', 'horizontal_rule'], [], voidNodeSpec('horizontal_rule'))
			.build();
		const next = applyCommand(state, (s) => moveWordForward(container(), s));
		expect(isNodeSelection(next.selection)).toBe(true);
		if (isNodeSelection(next.selection)) {
			expect(next.selection.nodeId).toBe('hr1' as BlockId);
		}
	});

	it('creates NodeSelection when word-moving backward into void block', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('CD', 'b2')
			.cursor('b2', 0)
			.schema(['paragraph', 'horizontal_rule'], [], voidNodeSpec('horizontal_rule'))
			.build();
		const next = applyCommand(state, (s) => moveWordBackward(container(), s));
		expect(isNodeSelection(next.selection)).toBe(true);
		if (isNodeSelection(next.selection)) {
			expect(next.selection.nodeId).toBe('hr1' as BlockId);
		}
	});

	it('returns null for extend-line into void block', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.cursor('b1', 1)
			.schema(['paragraph', 'horizontal_rule'], [], voidNodeSpec('horizontal_rule'))
			.build();
		const tr = extendLineDown(container(), state);
		// Cannot extend a text selection into a void block
		expect(tr).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Isolating boundary check in view-based path (Selection.modify)
// ---------------------------------------------------------------------------

function isolatingNodeSpec(type: string): NodeSpec | undefined {
	if (type === 'table') return { isolating: true } as NodeSpec;
	if (type === 'table_cell') return { isolating: true } as NodeSpec;
	return undefined;
}

describe('viewMove isolating boundary guard', () => {
	it('returns null when Selection.modify crosses an isolating boundary', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.block('table', '', 'tbl1')
			.cursor('b1', 2)
			.schema(['paragraph', 'table'], [], isolatingNodeSpec)
			.build();

		// Build a container with mock DOM structure
		const div: HTMLElement = document.createElement('div');
		const b1El: HTMLElement = document.createElement('p');
		b1El.setAttribute('data-block-id', 'b1');
		b1El.textContent = 'AB';
		const tblEl: HTMLElement = document.createElement('div');
		tblEl.setAttribute('data-block-id', 'tbl1');
		div.appendChild(b1El);
		div.appendChild(tblEl);

		// Mock getSelection to return a Selection with modify
		const textNode: Text = b1El.firstChild as Text;
		const mockModify: Mock = vi.fn();
		const mockSel = {
			anchorNode: textNode,
			anchorOffset: 2,
			focusNode: textNode,
			focusOffset: 2,
			modify: mockModify,
			setBaseAndExtent: vi.fn(),
			rangeCount: 1,
		};

		vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

		// After modify, simulate DOM moving into the table block
		const tblText: Text = document.createTextNode('');
		tblEl.appendChild(tblText);
		mockModify.mockImplementation(() => {
			// Simulate Selection.modify moving focus into table block
			Object.assign(mockSel, {
				anchorNode: tblText,
				anchorOffset: 0,
				focusNode: tblText,
				focusOffset: 0,
			});
		});

		const tr = viewMove(div, state, 'forward', 'word');

		// Should return null because the boundary is isolating
		expect(tr).toBeNull();

		vi.restoreAllMocks();
	});
});

describe('viewExtend isolating boundary guard', () => {
	it('returns null when Selection.modify extend crosses an isolating boundary', () => {
		const state = stateBuilder()
			.paragraph('AB', 'b1')
			.block('table', '', 'tbl1')
			.cursor('b1', 2)
			.schema(['paragraph', 'table'], [], isolatingNodeSpec)
			.build();

		const div: HTMLElement = document.createElement('div');
		const b1El: HTMLElement = document.createElement('p');
		b1El.setAttribute('data-block-id', 'b1');
		b1El.textContent = 'AB';
		const tblEl: HTMLElement = document.createElement('div');
		tblEl.setAttribute('data-block-id', 'tbl1');
		div.appendChild(b1El);
		div.appendChild(tblEl);

		const textNode: Text = b1El.firstChild as Text;
		const mockModify: Mock = vi.fn();
		const mockSel = {
			anchorNode: textNode,
			anchorOffset: 2,
			focusNode: textNode,
			focusOffset: 2,
			modify: mockModify,
			setBaseAndExtent: vi.fn(),
			rangeCount: 1,
		};

		vi.spyOn(window, 'getSelection').mockReturnValue(mockSel as unknown as Selection);

		const tblText: Text = document.createTextNode('');
		tblEl.appendChild(tblText);
		mockModify.mockImplementation(() => {
			Object.assign(mockSel, {
				focusNode: tblText,
				focusOffset: 0,
			});
		});

		const tr = viewExtend(div, state, 'forward', 'word');

		expect(tr).toBeNull();

		vi.restoreAllMocks();
	});
});
