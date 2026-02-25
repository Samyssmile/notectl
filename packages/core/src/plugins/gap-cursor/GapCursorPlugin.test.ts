import { describe, expect, it } from 'vitest';
import type { NodeSpec } from '../../model/NodeSpec.js';
import {
	createGapCursor,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { GapCursorPlugin } from './GapCursorPlugin.js';

/** Minimal void NodeSpec for testing. */
const hrSpec: NodeSpec = {
	isVoid: true,
	toDOM: (node) => {
		const el: HTMLElement = document.createElement('hr');
		el.setAttribute('data-block-id', node.id);
		return el;
	},
};

function makeGetNodeSpec(spec: NodeSpec): (type: string) => NodeSpec | undefined {
	return (type: string): NodeSpec | undefined => {
		if (type === 'horizontal_rule') return spec;
		return undefined;
	};
}

/** Finds a keymap handler for the given key across all registered keymaps. */
function findHandler(
	keymaps: readonly Record<string, () => boolean>[],
	key: string,
): (() => boolean) | undefined {
	for (const km of keymaps) {
		if (key in km) return km[key];
	}
	return undefined;
}

describe('GapCursorPlugin', () => {
	describe('keymap navigation from GapCursor', () => {
		it('arrow toward void block → NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.voidBlock('horizontal_rule', 'hr1')
				.paragraph('World', 'b2')
				.gapCursor('hr1', 'before')
				.schema(['paragraph', 'horizontal_rule'], [], makeGetNodeSpec(hrSpec))
				.build();

			const h = await pluginHarness(new GapCursorPlugin(), state);

			const handler = findHandler(h.getKeymaps(), 'ArrowRight');
			expect(handler).toBeDefined();
			expect(handler?.()).toBe(true);
			expect(h.dispatch).toHaveBeenCalled();

			const newState = h.getState();
			expect(isNodeSelection(newState.selection)).toBe(true);
			if (isNodeSelection(newState.selection)) {
				expect(newState.selection.nodeId).toBe('hr1');
			}
		});

		it('arrow away from void block → TextSelection of neighbor', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.voidBlock('horizontal_rule', 'hr1')
				.paragraph('World', 'b2')
				.gapCursor('hr1', 'before')
				.schema(['paragraph', 'horizontal_rule'], [], makeGetNodeSpec(hrSpec))
				.build();

			const h = await pluginHarness(new GapCursorPlugin(), state);

			const handler = findHandler(h.getKeymaps(), 'ArrowLeft');
			expect(handler).toBeDefined();
			expect(handler?.()).toBe(true);

			const newState = h.getState();
			expect(isTextSelection(newState.selection)).toBe(true);
		});

		it('arrow away at document boundary → no-op', async () => {
			const state = stateBuilder()
				.voidBlock('horizontal_rule', 'hr1')
				.paragraph('Hello', 'b1')
				.gapCursor('hr1', 'before')
				.schema(['paragraph', 'horizontal_rule'], [], makeGetNodeSpec(hrSpec))
				.build();

			const h = await pluginHarness(new GapCursorPlugin(), state);

			const handler = findHandler(h.getKeymaps(), 'ArrowLeft');
			expect(handler).toBeDefined();
			expect(handler?.()).toBe(false);
		});
	});

	describe('GapCursor commands', () => {
		it('returns false for non-GapCursor state', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.cursor('b1', 0)
				.schema(['paragraph'], [])
				.build();

			const h = await pluginHarness(new GapCursorPlugin(), state);

			const handler = findHandler(h.getKeymaps(), 'ArrowRight');
			expect(handler).toBeDefined();
			expect(handler?.()).toBe(false);
		});
	});

	describe('GapCursor vertical navigation', () => {
		it('GapCursor(before, ArrowDown) → NodeSelection of the void block', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.voidBlock('horizontal_rule', 'hr1')
				.paragraph('World', 'b2')
				.gapCursor('hr1', 'before')
				.schema(['paragraph', 'horizontal_rule'], [], makeGetNodeSpec(hrSpec))
				.build();

			const h = await pluginHarness(new GapCursorPlugin(), state);

			const handler = findHandler(h.getKeymaps(), 'ArrowDown');
			expect(handler).toBeDefined();
			expect(handler?.()).toBe(true);

			const newState = h.getState();
			expect(isNodeSelection(newState.selection)).toBe(true);
			if (isNodeSelection(newState.selection)) {
				expect(newState.selection.nodeId).toBe('hr1');
			}
		});

		it('GapCursor(after, ArrowUp) → NodeSelection of the void block', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.voidBlock('horizontal_rule', 'hr1')
				.paragraph('World', 'b2')
				.gapCursor('hr1', 'after')
				.schema(['paragraph', 'horizontal_rule'], [], makeGetNodeSpec(hrSpec))
				.build();

			const h = await pluginHarness(new GapCursorPlugin(), state);

			const handler = findHandler(h.getKeymaps(), 'ArrowUp');
			expect(handler).toBeDefined();
			expect(handler?.()).toBe(true);

			const newState = h.getState();
			expect(isNodeSelection(newState.selection)).toBe(true);
			if (isNodeSelection(newState.selection)) {
				expect(newState.selection.nodeId).toBe('hr1');
			}
		});
	});

	describe('GapCursor: two adjacent void blocks', () => {
		it('navigates through the full cycle between two void blocks', async () => {
			const state = stateBuilder()
				.voidBlock('horizontal_rule', 'hr1')
				.voidBlock('horizontal_rule', 'hr2')
				.gapCursor('hr1', 'after')
				.schema(['paragraph', 'horizontal_rule'], [], makeGetNodeSpec(hrSpec))
				.build();

			const h = await pluginHarness(new GapCursorPlugin(), state);

			// From GapCursor(hr1, after), ArrowRight → NodeSelection(hr2)
			const rightHandler = findHandler(h.getKeymaps(), 'ArrowRight');
			expect(rightHandler).toBeDefined();
			expect(rightHandler?.()).toBe(true);

			const afterRight = h.getState();
			expect(isNodeSelection(afterRight.selection)).toBe(true);
			if (isNodeSelection(afterRight.selection)) {
				expect(afterRight.selection.nodeId).toBe('hr2');
			}
		});
	});

	describe('GapCursor factory and type guards', () => {
		it('createGapCursor creates the correct shape', () => {
			const sel = createGapCursor('b1' as BlockId, 'before', ['b1' as BlockId]);
			expect(sel.type).toBe('gap');
			expect(sel.side).toBe('before');
			expect(sel.blockId).toBe('b1');
			expect(isGapCursor(sel)).toBe(true);
			expect(isNodeSelection(sel)).toBe(false);
			expect(isTextSelection(sel)).toBe(false);
		});
	});
});
