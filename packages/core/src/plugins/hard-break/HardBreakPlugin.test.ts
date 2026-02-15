import { describe, expect, it } from 'vitest';
import { insertHardBreakCommand } from '../../commands/Commands.js';
import { getInlineChildren, isInlineNode } from '../../model/Document.js';
import { isCollapsed, isNodeSelection } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import {
	expectCommandDispatches,
	expectCommandRegistered,
	expectKeyBinding,
} from '../../test/PluginTestUtils.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { renderBlockContent } from '../../view/Reconciler.js';
import { HardBreakPlugin } from './HardBreakPlugin.js';

// --- Tests ---

describe('HardBreakPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new HardBreakPlugin();
			expect(plugin.id).toBe('hard-break');
			expect(plugin.name).toBe('Hard Break');
			expect(plugin.priority).toBe(10);
		});

		it('registers hard_break InlineNodeSpec', async () => {
			const h = await pluginHarness(new HardBreakPlugin());
			const spec = h.pm.schemaRegistry.getInlineNodeSpec('hard_break');
			expect(spec).toBeDefined();
			expect(spec?.type).toBe('hard_break');
		});

		it('InlineNodeSpec toDOM creates a <br> element', async () => {
			const h = await pluginHarness(new HardBreakPlugin());
			const spec = h.pm.schemaRegistry.getInlineNodeSpec('hard_break');
			const el = spec?.toDOM({ type: 'inline', inlineType: 'hard_break', attrs: {} } as never);
			expect(el?.tagName).toBe('BR');
		});

		it('InlineNodeSpec toHTMLString returns <br>', async () => {
			const h = await pluginHarness(new HardBreakPlugin());
			const spec = h.pm.schemaRegistry.getInlineNodeSpec('hard_break');
			const html = spec?.toHTMLString?.({
				type: 'inline',
				inlineType: 'hard_break',
				attrs: {},
			} as never);
			expect(html).toBe('<br>');
		});

		it('registers insertHardBreak command', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 3)
				.schema(['paragraph'], [])
				.build();
			const h = await pluginHarness(new HardBreakPlugin(), state);
			expectCommandRegistered(h, 'insertHardBreak');
		});

		it('registers Shift-Enter keymap', async () => {
			const h = await pluginHarness(new HardBreakPlugin());
			expectKeyBinding(h, 'Shift-Enter');
		});
	});

	describe('insertHardBreakCommand', () => {
		it('inserts hard_break at collapsed cursor', () => {
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 3)
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			assertDefined(tr, 'transaction should not be null');

			const newState: EditorState = state.apply(tr);
			const block = newState.getBlock('b1' as never);
			assertDefined(block, 'block b1 should exist');

			const children = getInlineChildren(block);
			// "hel" + hard_break + "lo"
			expect(children).toHaveLength(3);
			const middle = children[1];
			assertDefined(middle, 'middle child should exist');
			expect(isInlineNode(middle)).toBe(true);
			if (isInlineNode(middle)) {
				expect(middle.inlineType).toBe('hard_break');
			}

			// Cursor should be at offset 4 (3 + 1 for hard_break)
			expect(isNodeSelection(newState.selection)).toBe(false);
			if (!isNodeSelection(newState.selection)) {
				expect(isCollapsed(newState.selection)).toBe(true);
				expect(newState.selection.anchor.offset).toBe(4);
			}
		});

		it('deletes range selection then inserts hard_break', () => {
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 1 }, { blockId: 'b1', offset: 4 })
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			assertDefined(tr, 'transaction should not be null');

			const newState: EditorState = state.apply(tr);
			const block = newState.getBlock('b1' as never);
			assertDefined(block, 'block b1 should exist');

			const children = getInlineChildren(block);
			// "h" + hard_break + "o"
			expect(children).toHaveLength(3);
			const middle = children[1];
			assertDefined(middle, 'middle child should exist');
			expect(isInlineNode(middle)).toBe(true);
		});

		it('returns null for NodeSelection', () => {
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.nodeSelection('b1')
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			expect(tr).toBeNull();
		});

		it('inserts at start of block', () => {
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 0)
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			assertDefined(tr, 'transaction should not be null');

			const newState: EditorState = state.apply(tr);
			const block = newState.getBlock('b1' as never);
			assertDefined(block, 'block b1 should exist');

			const children = getInlineChildren(block);
			// hard_break + "hello"
			expect(children).toHaveLength(2);
			const first = children[0];
			assertDefined(first, 'first child should exist');
			expect(isInlineNode(first)).toBe(true);
		});

		it('inserts at end of block', () => {
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 5)
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			assertDefined(tr, 'transaction should not be null');

			const newState: EditorState = state.apply(tr);
			const block = newState.getBlock('b1' as never);
			assertDefined(block, 'block b1 should exist');

			const children = getInlineChildren(block);
			// "hello" + hard_break
			expect(children).toHaveLength(2);
			const last = children[1];
			assertDefined(last, 'last child should exist');
			expect(isInlineNode(last)).toBe(true);
		});
	});

	describe('command via harness', () => {
		it('insertHardBreak dispatches a transaction', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], [])
				.build();
			const h = await pluginHarness(new HardBreakPlugin(), state);
			expectCommandDispatches(h, 'insertHardBreak');
		});
	});

	describe('rendering', () => {
		it('hard_break renders as <br contenteditable="false">', async () => {
			const h = await pluginHarness(new HardBreakPlugin());
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 3)
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			assertDefined(tr, 'transaction should not be null');
			const newState: EditorState = state.apply(tr);
			const block = newState.getBlock('b1' as never);
			assertDefined(block, 'block b1 should exist');

			const container: HTMLElement = document.createElement('p');
			renderBlockContent(container, block, h.pm.schemaRegistry);

			const brs: HTMLBRElement[] = Array.from(container.querySelectorAll('br'));
			const hardBreakBr = brs.find((br) => br.getAttribute('contenteditable') === 'false');
			expect(hardBreakBr).toBeDefined();
		});

		it('appends trailing <br> when hard_break is last child', async () => {
			const h = await pluginHarness(new HardBreakPlugin());
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 5)
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			assertDefined(tr, 'transaction should not be null');
			const newState: EditorState = state.apply(tr);
			const block = newState.getBlock('b1' as never);
			assertDefined(block, 'block b1 should exist');

			const container: HTMLElement = document.createElement('p');
			renderBlockContent(container, block, h.pm.schemaRegistry);

			const brs: HTMLBRElement[] = Array.from(container.querySelectorAll('br'));
			// hard_break <br> (contenteditable=false) + trailing hack <br> (no contenteditable)
			expect(brs.length).toBe(2);
			expect(brs[0]?.getAttribute('contenteditable')).toBe('false');
			expect(brs[1]?.getAttribute('contenteditable')).toBeNull();
		});

		it('does not append trailing <br> when hard_break is not last child', async () => {
			const h = await pluginHarness(new HardBreakPlugin());
			const state: EditorState = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 3)
				.schema(['paragraph'], [])
				.build();

			const tr = insertHardBreakCommand(state);
			assertDefined(tr, 'transaction should not be null');
			const newState: EditorState = state.apply(tr);
			const block = newState.getBlock('b1' as never);
			assertDefined(block, 'block b1 should exist');

			const container: HTMLElement = document.createElement('p');
			renderBlockContent(container, block, h.pm.schemaRegistry);

			const brs: HTMLBRElement[] = Array.from(container.querySelectorAll('br'));
			// Only the hard_break <br>, no trailing hack
			expect(brs.length).toBe(1);
			expect(brs[0]?.getAttribute('contenteditable')).toBe('false');
		});
	});
});
