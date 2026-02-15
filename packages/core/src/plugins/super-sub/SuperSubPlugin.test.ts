import { describe, expect, it, vi } from 'vitest';
import type { BlockId } from '../../model/TypeBrands.js';
import {
	expectCommandDispatches,
	expectCommandRegistered,
	expectKeyBinding,
	expectMarkSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { makePluginOptions, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { PluginManager } from '../PluginManager.js';
import { SuperSubPlugin } from './SuperSubPlugin.js';

// --- Helpers ---

const SUPER_SUB_SCHEMA = ['superscript', 'subscript'] as const;

function rangeState(markTypes: readonly string[] = SUPER_SUB_SCHEMA) {
	return stateBuilder()
		.paragraph('hello', 'b1')
		.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
		.schema(['paragraph'], [...markTypes])
		.build();
}

// --- Tests ---

describe('SuperSubPlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name and priority', () => {
			const plugin = new SuperSubPlugin();
			expect(plugin.id).toBe('super-sub');
			expect(plugin.name).toBe('Superscript & Subscript');
			expect(plugin.priority).toBe(23);
		});
	});

	describe('MarkSpec — superscript', () => {
		it('registers superscript MarkSpec with correct tag and rank', async () => {
			const h = await pluginHarness(new SuperSubPlugin());
			expectMarkSpec(h, 'superscript', { tag: 'SUP', rank: 4 });
		});
	});

	describe('MarkSpec — subscript', () => {
		it('registers subscript MarkSpec with correct tag and rank', async () => {
			const h = await pluginHarness(new SuperSubPlugin());
			expectMarkSpec(h, 'subscript', { tag: 'SUB', rank: 4 });
		});
	});

	describe('commands', () => {
		it('registers toggleSuperscript command', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.schema(['paragraph'], [...SUPER_SUB_SCHEMA])
				.build();
			const h = await pluginHarness(new SuperSubPlugin(), state);
			expectCommandRegistered(h, 'toggleSuperscript');
		});

		it('registers toggleSubscript command', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.schema(['paragraph'], [...SUPER_SUB_SCHEMA])
				.build();
			const h = await pluginHarness(new SuperSubPlugin(), state);
			expectCommandRegistered(h, 'toggleSubscript');
		});

		it('toggleSuperscript dispatches a transaction on range selection', async () => {
			const h = await pluginHarness(new SuperSubPlugin(), rangeState());
			expectCommandDispatches(h, 'toggleSuperscript');
		});

		it('toggleSubscript dispatches a transaction on range selection', async () => {
			const h = await pluginHarness(new SuperSubPlugin(), rangeState());
			expectCommandDispatches(h, 'toggleSubscript');
		});
	});

	describe('keymap', () => {
		it('registers Mod-. for superscript', async () => {
			const h = await pluginHarness(new SuperSubPlugin());
			expectKeyBinding(h, 'Mod-.');
		});

		it('registers Mod-, for subscript', async () => {
			const h = await pluginHarness(new SuperSubPlugin());
			expectKeyBinding(h, 'Mod-,');
		});
	});

	describe('toolbar items', () => {
		it('registers a superscript toolbar item', async () => {
			const h = await pluginHarness(new SuperSubPlugin());
			expectToolbarItem(h, 'superscript', {
				group: 'format',
				label: 'Superscript',
				command: 'toggleSuperscript',
				priority: 50,
				hasSvgIcon: true,
			});
		});

		it('registers a subscript toolbar item', async () => {
			const h = await pluginHarness(new SuperSubPlugin());
			expectToolbarItem(h, 'subscript', {
				group: 'format',
				label: 'Subscript',
				command: 'toggleSubscript',
				priority: 51,
				hasSvgIcon: true,
			});
		});

		it('superscript toolbar item reports active state', async () => {
			const state = stateBuilder()
				.paragraph('x2', 'b1', { marks: [{ type: 'superscript' }] })
				.cursor('b1', 1)
				.schema(['paragraph'], [...SUPER_SUB_SCHEMA])
				.build();

			const h = await pluginHarness(new SuperSubPlugin(), state);
			expectToolbarActive(h, 'superscript', true);
		});

		it('subscript toolbar item reports active state', async () => {
			const state = stateBuilder()
				.paragraph('H2O', 'b1', { marks: [{ type: 'subscript' }] })
				.cursor('b1', 1)
				.schema(['paragraph'], [...SUPER_SUB_SCHEMA])
				.build();

			const h = await pluginHarness(new SuperSubPlugin(), state);
			expectToolbarActive(h, 'subscript', true);
		});

		it('toolbar items report inactive state for plain text', async () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], [...SUPER_SUB_SCHEMA])
				.build();

			const h = await pluginHarness(new SuperSubPlugin(), state);
			expectToolbarActive(h, 'superscript', false);
			expectToolbarActive(h, 'subscript', false);
		});

		it('respects separatorAfter config', async () => {
			const h = await pluginHarness(new SuperSubPlugin({ separatorAfter: true }));
			expectToolbarItem(h, 'subscript', { separatorAfter: true });

			// superscript should not have separator (only last visible item)
			const supItem = h.getToolbarItem('superscript');
			expect(supItem?.separatorAfter).toBeFalsy();
		});
	});

	describe('config', () => {
		it('only registers superscript when subscript is disabled', async () => {
			const h = await pluginHarness(new SuperSubPlugin({ subscript: false }));
			expect(h.getMarkSpec('superscript')).toBeDefined();
			expect(h.getMarkSpec('subscript')).toBeUndefined();
		});

		it('only registers subscript when superscript is disabled', async () => {
			const h = await pluginHarness(new SuperSubPlugin({ superscript: false }));
			expect(h.getMarkSpec('subscript')).toBeDefined();
			expect(h.getMarkSpec('superscript')).toBeUndefined();
		});

		it('hides toolbar item when toolbar config disables it', async () => {
			const h = await pluginHarness(new SuperSubPlugin({ toolbar: { superscript: false } }));
			expect(h.getToolbarItem('superscript')).toBeUndefined();
			expect(h.getToolbarItem('subscript')).toBeDefined();
		});
	});

	describe('exclusivity middleware', () => {
		it('injects removeMark for subscript when addMark superscript is dispatched', async () => {
			const state = rangeState();
			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'superscript' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasRemoveSub: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'subscript',
			);
			expect(hasRemoveSub).toBe(true);
		});

		it('injects removeMark for superscript when addMark subscript is dispatched', async () => {
			const state = rangeState();
			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'subscript' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasRemoveSup: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'superscript',
			);
			expect(hasRemoveSup).toBe(true);
		});

		it('does not inject removeMark for unrelated marks', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['bold', ...SUPER_SUB_SCHEMA])
				.build();

			const plugin = new SuperSubPlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasRemove: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' &&
					(s.mark?.type === 'superscript' || s.mark?.type === 'subscript'),
			);
			expect(hasRemove).toBe(false);
		});

		it('does not register middleware when only one mark is enabled', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['superscript'])
				.build();

			const plugin = new SuperSubPlugin({ subscript: false });
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'superscript' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasRemoveSub: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'subscript',
			);
			expect(hasRemoveSub).toBe(false);
		});
	});
});
