import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCollapsedSelection, isCollapsed } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { mockPluginContext, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { CARET_NAVIGATION_LOCALE_EN, resolveBlockLabel } from './CaretNavigationLocale.js';
import { CaretNavigationPlugin } from './CaretNavigationPlugin.js';

describe('CaretNavigationPlugin', () => {
	it('registers keymaps with navigation priority', async () => {
		const state = stateBuilder().paragraph('Hello world', 'b1').cursor('b1', 0).build();
		const h = await pluginHarness(new CaretNavigationPlugin(), state);

		const keymaps = h.getKeymaps();
		expect(keymaps.length).toBeGreaterThan(0);

		// Check that at least some expected keys are registered
		const allKeys: string[] = keymaps.flatMap((km) => Object.keys(km));
		expect(allKeys).toContain('Shift-ArrowRight');
		expect(allKeys).toContain('Shift-ArrowLeft');
		expect(allKeys).toContain('Shift-ArrowUp');
		expect(allKeys).toContain('Shift-ArrowDown');
	});

	it('Shift-ArrowRight extends selection forward', async () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const h = await pluginHarness(new CaretNavigationPlugin(), state);

		const keymaps = h.getKeymaps();
		const shiftRight = keymaps
			.flatMap((km) => Object.entries(km))
			.find(([key]) => key === 'Shift-ArrowRight');

		if (!shiftRight) {
			expect.unreachable('Expected Shift-ArrowRight keymap entry');
			return;
		}
		const handler = shiftRight[1];
		const result: boolean = handler();
		expect(result).toBe(true);
		expect(h.dispatch).toHaveBeenCalled();

		const newState = h.getState();
		expect(isCollapsed(newState.selection)).toBe(false);
	});

	it('Shift-ArrowLeft extends selection backward', async () => {
		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();
		const h = await pluginHarness(new CaretNavigationPlugin(), state);

		const keymaps = h.getKeymaps();
		const shiftLeft = keymaps
			.flatMap((km) => Object.entries(km))
			.find(([key]) => key === 'Shift-ArrowLeft');

		if (!shiftLeft) {
			expect.unreachable('Expected Shift-ArrowLeft keymap entry');
			return;
		}
		const handler = shiftLeft[1];
		const result: boolean = handler();
		expect(result).toBe(true);
		expect(h.dispatch).toHaveBeenCalled();
	});

	it('registers word movement keys', async () => {
		const state = stateBuilder().paragraph('Hello world', 'b1').cursor('b1', 0).build();
		const h = await pluginHarness(new CaretNavigationPlugin(), state);

		const keymaps = h.getKeymaps();
		const allKeys: string[] = keymaps.flatMap((km) => Object.keys(km));

		// On Linux (happy-dom), word movement uses Mod-Arrow
		// On Mac, it would use Alt-Arrow
		// We check that at least one set is registered
		const hasModWord: boolean =
			allKeys.includes('Mod-ArrowRight') || allKeys.includes('Alt-ArrowRight');
		expect(hasModWord).toBe(true);
	});

	it('registers line boundary keys', async () => {
		const state = stateBuilder().paragraph('Hello world', 'b1').cursor('b1', 0).build();
		const h = await pluginHarness(new CaretNavigationPlugin(), state);

		const keymaps = h.getKeymaps();
		const allKeys: string[] = keymaps.flatMap((km) => Object.keys(km));

		// On Linux: Home/End, on Mac: Mod-ArrowLeft/Right
		const hasLineBoundary: boolean = allKeys.includes('Home') || allKeys.includes('Mod-ArrowLeft');
		expect(hasLineBoundary).toBe(true);
	});

	it('registers document boundary keys', async () => {
		const state = stateBuilder().paragraph('Hello world', 'b1').cursor('b1', 0).build();
		const h = await pluginHarness(new CaretNavigationPlugin(), state);

		const keymaps = h.getKeymaps();
		const allKeys: string[] = keymaps.flatMap((km) => Object.keys(km));

		// On Linux: Mod-Home/Mod-End, on Mac: Mod-ArrowUp/Down
		const hasDocBoundary: boolean = allKeys.includes('Mod-Home') || allKeys.includes('Mod-ArrowUp');
		expect(hasDocBoundary).toBe(true);
	});

	it('word movement dispatches transaction', async () => {
		const state = stateBuilder().paragraph('Hello world', 'b1').cursor('b1', 0).build();
		const h = await pluginHarness(new CaretNavigationPlugin(), state);

		const keymaps = h.getKeymaps();
		const allEntries = keymaps.flatMap((km) => Object.entries(km));

		// Find word-forward key (Mod-ArrowRight on Linux, Alt-ArrowRight on Mac)
		const wordForward = allEntries.find(
			([key]) => key === 'Mod-ArrowRight' || key === 'Alt-ArrowRight',
		);

		if (!wordForward) {
			expect.unreachable('Expected word-forward keymap entry');
			return;
		}
		const result: boolean = wordForward[1]();
		expect(result).toBe(true);
		expect(h.dispatch).toHaveBeenCalled();
	});

	describe('RTL horizontal mapping', () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		async function initRtlPlugin(initialState: EditorState): Promise<{
			getState: () => EditorState;
			getHandler: (key: string) => (() => boolean) | undefined;
		}> {
			const plugin = new CaretNavigationPlugin();
			let currentState = initialState;
			const container: HTMLElement = document.createElement('div');
			const block: HTMLElement = document.createElement('p');
			block.setAttribute('data-block-id', 'b1');
			block.setAttribute('dir', 'rtl');
			block.textContent = 'ABC';
			container.appendChild(block);

			const registerKeymap = vi.fn();
			const ctx = mockPluginContext({
				getState: () => currentState,
				dispatch: (tr) => {
					currentState = currentState.apply(tr);
				},
				getContainer: () => container,
				registerKeymap,
			});

			await plugin.init(ctx);
			const keymap = registerKeymap.mock.calls[0]?.[0] as Record<string, () => boolean> | undefined;
			return {
				getState: () => currentState,
				getHandler: (key: string) => keymap?.[key],
			};
		}

		it('maps Shift-ArrowLeft to logical forward in RTL', async () => {
			vi.spyOn(window, 'getComputedStyle').mockReturnValue({
				direction: 'rtl',
			} as CSSStyleDeclaration);
			const state = stateBuilder().paragraph('ABC', 'b1').cursor('b1', 0).build();
			const { getHandler, getState } = await initRtlPlugin(state);
			const handler = getHandler('Shift-ArrowLeft');

			if (!handler) {
				expect.unreachable('Expected Shift-ArrowLeft keymap entry');
				return;
			}
			expect(handler()).toBe(true);
			const next = getState();
			if (isCollapsed(next.selection)) {
				expect.unreachable('Expected non-collapsed selection');
				return;
			}
			expect(next.selection.anchor.offset).toBe(0);
			expect(next.selection.head.offset).toBe(1);
		});

		it('maps Shift-ArrowRight to logical backward in RTL', async () => {
			vi.spyOn(window, 'getComputedStyle').mockReturnValue({
				direction: 'rtl',
			} as CSSStyleDeclaration);
			const state = stateBuilder().paragraph('ABC', 'b1').cursor('b1', 2).build();
			const { getHandler, getState } = await initRtlPlugin(state);
			const handler = getHandler('Shift-ArrowRight');

			if (!handler) {
				expect.unreachable('Expected Shift-ArrowRight keymap entry');
				return;
			}
			expect(handler()).toBe(true);
			const next = getState();
			if (isCollapsed(next.selection)) {
				expect.unreachable('Expected non-collapsed selection');
				return;
			}
			expect(next.selection.anchor.offset).toBe(2);
			expect(next.selection.head.offset).toBe(1);
		});
	});
});

// ---------------------------------------------------------------------------
// ARIA block-navigation announcements
// ---------------------------------------------------------------------------

describe('CaretNavigationPlugin ARIA announcements', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function initPlugin(): Promise<{
		plugin: CaretNavigationPlugin;
		announce: ReturnType<typeof vi.fn>;
	}> {
		const plugin = new CaretNavigationPlugin();
		const announce = vi.fn();
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b1', 0)
			.build();

		const ctx = mockPluginContext({
			getState: () => state,
			announce,
		});
		await plugin.init(ctx);
		return { plugin, announce };
	}

	it('announces block type on cross-block navigation', async () => {
		const { plugin, announce } = await initPlugin();

		const state1 = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b1', 5)
			.build();

		const state2 = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b2', 0)
			.build();

		const tr = state1
			.transaction('input')
			.setSelection(createCollapsedSelection('b2' as BlockId, 0))
			.build();

		// First call: records initial block (b1), does not announce
		plugin.onStateChange(state1, state1, tr);
		// Second call: block changed to b2 → debounced announcement
		plugin.onStateChange(state1, state2, tr);

		expect(announce).not.toHaveBeenCalled();
		vi.advanceTimersByTime(150);
		expect(announce).toHaveBeenCalledWith('Paragraph');
	});

	it('debounces rapid navigation — only announces last block', async () => {
		const { plugin, announce } = await initPlugin();

		const stateB1 = stateBuilder()
			.paragraph('A', 'b1')
			.block('heading', 'B', 'b2', { attrs: { level: 2 } })
			.paragraph('C', 'b3')
			.cursor('b1', 0)
			.schema(['paragraph', 'heading'], [])
			.build();

		const stateB2 = stateBuilder()
			.paragraph('A', 'b1')
			.block('heading', 'B', 'b2', { attrs: { level: 2 } })
			.paragraph('C', 'b3')
			.cursor('b2', 0)
			.schema(['paragraph', 'heading'], [])
			.build();

		const stateB3 = stateBuilder()
			.paragraph('A', 'b1')
			.block('heading', 'B', 'b2', { attrs: { level: 2 } })
			.paragraph('C', 'b3')
			.cursor('b3', 0)
			.schema(['paragraph', 'heading'], [])
			.build();

		const dummyTr = stateB1
			.transaction('input')
			.setSelection(createCollapsedSelection('b2' as BlockId, 0))
			.build();

		// Establish initial block
		plugin.onStateChange(stateB1, stateB1, dummyTr);
		// Quick nav through b2 and b3 in <150ms
		plugin.onStateChange(stateB1, stateB2, dummyTr);
		vi.advanceTimersByTime(50);
		plugin.onStateChange(stateB2, stateB3, dummyTr);

		vi.advanceTimersByTime(150);
		expect(announce).toHaveBeenCalledTimes(1);
		expect(announce).toHaveBeenCalledWith('Paragraph');
	});

	it('does not announce when staying in same block', async () => {
		const { plugin, announce } = await initPlugin();

		const state = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 0).build();
		const state2 = stateBuilder().paragraph('Hello', 'b1').cursor('b1', 3).build();

		const tr = state
			.transaction('input')
			.setSelection(createCollapsedSelection('b1' as BlockId, 3))
			.build();

		// Init → b1
		plugin.onStateChange(state, state, tr);
		// Still b1
		plugin.onStateChange(state, state2, tr);

		vi.advanceTimersByTime(200);
		expect(announce).not.toHaveBeenCalled();
	});

	it('does not announce for NodeSelection', async () => {
		const { plugin, announce } = await initPlugin();

		const state1 = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('image', 'img1')
			.cursor('b1', 0)
			.build();

		const state2 = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('image', 'img1')
			.nodeSelection('img1')
			.build();

		const tr = state1.transaction('input').build();

		// Init block
		plugin.onStateChange(state1, state1, tr);
		// NodeSelection → resets tracking, no announce
		plugin.onStateChange(state1, state2, tr);

		vi.advanceTimersByTime(200);
		expect(announce).not.toHaveBeenCalled();
	});

	it('cancels pending timer when selection switches to NodeSelection', async () => {
		const { plugin, announce } = await initPlugin();

		const state1 = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.voidBlock('image', 'img1')
			.cursor('b1', 0)
			.build();

		const state2 = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.voidBlock('image', 'img1')
			.cursor('b2', 0)
			.build();

		const state3 = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.voidBlock('image', 'img1')
			.nodeSelection('img1')
			.build();

		const tr = state1.transaction('input').build();

		// Init block (b1)
		plugin.onStateChange(state1, state1, tr);
		// Cross to b2 — starts debounce timer
		plugin.onStateChange(state1, state2, tr);
		// Before timer fires, switch to NodeSelection — timer must be cancelled
		plugin.onStateChange(state2, state3, tr);

		vi.advanceTimersByTime(200);
		// Stale announcement for b2 must NOT fire
		expect(announce).not.toHaveBeenCalled();
	});

	it('destroy clears pending timer', async () => {
		const { plugin, announce } = await initPlugin();

		const state1 = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b1', 0)
			.build();

		const state2 = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b2', 0)
			.build();

		const tr = state1.transaction('input').build();

		plugin.onStateChange(state1, state1, tr);
		plugin.onStateChange(state1, state2, tr);

		// Destroy before debounce fires
		plugin.destroy();

		vi.advanceTimersByTime(200);
		expect(announce).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// resolveBlockLabel
// ---------------------------------------------------------------------------

describe('resolveBlockLabel', () => {
	const locale = CARET_NAVIGATION_LOCALE_EN;

	it('resolves known block types to locale strings', () => {
		expect(resolveBlockLabel(locale, 'paragraph')).toBe('Paragraph');
		expect(resolveBlockLabel(locale, 'code_block')).toBe('Code Block');
		expect(resolveBlockLabel(locale, 'blockquote')).toBe('Block Quote');
		expect(resolveBlockLabel(locale, 'list_item')).toBe('List Item');
		expect(resolveBlockLabel(locale, 'horizontal_rule')).toBe('Horizontal Rule');
		expect(resolveBlockLabel(locale, 'image')).toBe('Image');
		expect(resolveBlockLabel(locale, 'table')).toBe('Table');
	});

	it('resolves heading levels 1–6', () => {
		for (let level = 1; level <= 6; level++) {
			expect(resolveBlockLabel(locale, 'heading', { level })).toBe(`Heading ${level}`);
		}
	});

	it('falls back to typeName for unknown block types', () => {
		expect(resolveBlockLabel(locale, 'my_custom_block')).toBe('my_custom_block');
	});

	it('falls back to typeName for heading with invalid level', () => {
		expect(resolveBlockLabel(locale, 'heading', { level: 99 })).toBe('heading');
	});

	it('falls back to typeName for heading without attrs', () => {
		expect(resolveBlockLabel(locale, 'heading')).toBe('heading');
	});
});
