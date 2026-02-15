import { describe, expect, it } from 'vitest';
import { getBlockText } from '../../model/Document.js';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectNodeSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { BlockquotePlugin } from './BlockquotePlugin.js';

// --- Helpers ---

function makeState(
	blocks?: { type: string; text: string; id: string }[],
	cursorBlockId?: string,
	cursorOffset?: number,
) {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id);
	}
	const bid = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'blockquote'], ['bold', 'italic', 'underline']);
	return builder.build();
}

// --- Tests ---

describe('BlockquotePlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new BlockquotePlugin();
			expect(plugin.id).toBe('blockquote');
			expect(plugin.name).toBe('Blockquote');
			expect(plugin.priority).toBe(35);
		});
	});

	describe('NodeSpec', () => {
		it('registers blockquote NodeSpec', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectNodeSpec(h, 'blockquote');
		});

		it('blockquote NodeSpec creates <blockquote> element', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			const spec = h.getNodeSpec('blockquote');
			assertDefined(spec);
			const { createBlockNode, createTextNode } = await import('../../model/Document.js');
			const el = spec.toDOM(createBlockNode('blockquote', [createTextNode('')], 'test'));
			expect(el?.tagName).toBe('BLOCKQUOTE');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});
	});

	describe('commands', () => {
		it('registers toggleBlockquote command', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectCommandRegistered(h, 'toggleBlockquote');
		});

		it('registers setBlockquote command', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectCommandRegistered(h, 'setBlockquote');
		});

		it('toggleBlockquote converts paragraph to blockquote', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');

			expect(h.dispatch).toHaveBeenCalled();
			expect(h.getState().doc.children[0]?.type).toBe('blockquote');
		});

		it('toggleBlockquote converts blockquote back to paragraph', async () => {
			const state = makeState([{ type: 'blockquote', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('preserves text content when toggling', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const h = await pluginHarness(new BlockquotePlugin(), state);

			h.executeCommand('toggleBlockquote');
			expect(getBlockText(h.getState().doc.children[0])).toBe('Hello World');
		});
	});

	describe('keymap registration', () => {
		it('registers Mod-Shift-> keymap', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectKeyBinding(h, 'Mod-Shift->');
		});
	});

	describe('input rules', () => {
		it('registers one input rule', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expect(h.getInputRules().length).toBe(1);
		});

		it('input rule pattern matches "> "', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			const rule = h.getInputRules()[0];
			expect(rule?.pattern.test('> ')).toBe(true);
			expect(rule?.pattern.test('>> ')).toBe(false);
		});

		it('input rule handler converts paragraph to blockquote', async () => {
			const state = makeState([{ type: 'paragraph', text: '> ', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const rule = h.getInputRules()[0];

			const match = '> '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 2);

			expect(tr).not.toBeNull();
			const newState = state.apply(tr);
			expect(newState.doc.children[0]?.type).toBe('blockquote');
		});

		it('input rule only applies on paragraph blocks', async () => {
			const state = makeState([{ type: 'blockquote', text: '> ', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			const rule = h.getInputRules()[0];
			const match = '> '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 2);

			expect(tr).toBeNull();
		});
	});

	describe('toolbar item', () => {
		it('registers a blockquote toolbar item', async () => {
			const h = await pluginHarness(new BlockquotePlugin());
			expectToolbarItem(h, 'blockquote', {
				group: 'block',
				label: 'Blockquote',
				command: 'toggleBlockquote',
			});
		});

		it('isActive returns true when cursor is in blockquote', async () => {
			const state = makeState([{ type: 'blockquote', text: 'Quote', id: 'b1' }]);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			expectToolbarActive(h, 'blockquote', true);
		});

		it('isActive returns false when cursor is in paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const h = await pluginHarness(new BlockquotePlugin(), state);
			expectToolbarActive(h, 'blockquote', false);
		});

		it('respects separatorAfter config', async () => {
			const h = await pluginHarness(new BlockquotePlugin({ separatorAfter: true }));
			expectToolbarItem(h, 'blockquote', { separatorAfter: true });
		});
	});
});
