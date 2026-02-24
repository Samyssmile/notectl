import { describe, expect, it, vi } from 'vitest';
import { createTextNode } from '../../model/Document.js';
import { mockPluginContext, stateBuilder } from '../../test/TestUtils.js';
import { renderColorPickerPopup } from './ColorPickerPopup.js';
import type { ColorPickerConfig } from './ColorPickerPopup.js';

// Activate module augmentations
import '../../plugins/text-color/TextColorPlugin.js';
import '../../plugins/highlight/HighlightPlugin.js';

// --- Helpers ---

const TEST_COLORS: readonly string[] = [
	'#ff0000',
	'#00ff00',
	'#0000ff',
	'#ffff00',
	'#ff00ff',
	'#00ffff',
	'#000000',
	'#ffffff',
	'#888888',
	'#444444',
	'#aa0000',
	'#00aa00',
	'#0000aa',
];

function defaultState() {
	return stateBuilder()
		.paragraph('hello', 'b1')
		.cursor('b1', 0)
		.schema(['paragraph'], ['textColor', 'highlight'])
		.build();
}

function createConfig(overrides?: Partial<ColorPickerConfig>): ColorPickerConfig {
	return {
		markType: 'textColor',
		colors: TEST_COLORS,
		columns: 10,
		resetLabel: 'Default',
		resetCommand: 'removeTextColor',
		ariaLabelPrefix: 'Text color',
		onClose: vi.fn(),
		...overrides,
	};
}

function renderPopup(config?: Partial<ColorPickerConfig>, state = defaultState()) {
	const container: HTMLDivElement = document.createElement('div');
	const ctx = mockPluginContext({
		getState: () => state,
		dispatch: vi.fn(),
		executeCommand: vi.fn(() => true),
	});
	const cfg = createConfig(config);
	renderColorPickerPopup(container, ctx, cfg);
	return { container, ctx, cfg };
}

// --- Tests ---

describe('ColorPickerPopup', () => {
	describe('DOM structure', () => {
		it('adds notectl-color-picker class to container', () => {
			const { container } = renderPopup();
			expect(container.classList.contains('notectl-color-picker')).toBe(true);
		});

		it('renders reset button with label', () => {
			const { container } = renderPopup({ resetLabel: 'None' });
			const btn = container.querySelector('.notectl-color-picker__default');
			expect(btn?.textContent).toBe('None');
		});

		it('renders grid with role="grid"', () => {
			const { container } = renderPopup();
			const grid = container.querySelector('.notectl-color-picker__grid');
			expect(grid?.getAttribute('role')).toBe('grid');
		});

		it('renders correct number of swatches', () => {
			const { container } = renderPopup();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches.length).toBe(TEST_COLORS.length);
		});

		it('organizes swatches into ARIA rows', () => {
			const { container } = renderPopup();
			const rows = container.querySelectorAll('[role="row"]');
			// 13 colors / 10 columns = 2 rows
			expect(rows.length).toBe(2);
		});

		it('each swatch has role="gridcell"', () => {
			const { container } = renderPopup();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			for (const swatch of swatches) {
				expect(swatch.getAttribute('role')).toBe('gridcell');
			}
		});

		it('each swatch has aria-label', () => {
			const { container } = renderPopup({ ariaLabelPrefix: 'Highlight' });
			const swatch = container.querySelector('.notectl-color-picker__swatch');
			expect(swatch?.getAttribute('aria-label')).toBe('Highlight #ff0000');
		});

		it('white swatch gets a visible border', () => {
			const { container } = renderPopup();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			const whiteSwatch = Array.from(swatches).find(
				(s) => (s as HTMLElement).title === '#ffffff',
			) as HTMLElement | undefined;
			expect(whiteSwatch?.style.border).toBe('1px solid #d0d0d0');
		});

		it('grid has aria-label with prefix', () => {
			const { container } = renderPopup({ ariaLabelPrefix: 'Text color' });
			const grid = container.querySelector('[role="grid"]');
			expect(grid?.getAttribute('aria-label')).toBe('Text color color picker');
		});
	});

	describe('active color', () => {
		it('marks active swatch with --active class', () => {
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('hello', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				)
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			const { container } = renderPopup({ markType: 'textColor' }, state);
			const active = container.querySelector('.notectl-color-picker__swatch--active');
			expect(active).toBeTruthy();
			expect((active as HTMLElement).title).toBe('#ff0000');
		});

		it('no active swatch when mark is absent', () => {
			const { container } = renderPopup();
			const active = container.querySelector('.notectl-color-picker__swatch--active');
			expect(active).toBeNull();
		});
	});

	describe('roving tabindex', () => {
		it('focused swatch has tabindex="0"', () => {
			const { container } = renderPopup();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches[0]?.getAttribute('tabindex')).toBe('0');
		});

		it('non-focused swatches have tabindex="-1"', () => {
			const { container } = renderPopup();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			for (let i = 1; i < swatches.length; i++) {
				expect(swatches[i]?.getAttribute('tabindex')).toBe('-1');
			}
		});

		it('active color swatch gets initial tabindex="0"', () => {
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('hello', [{ type: 'textColor', attrs: { color: '#00ff00' } }])],
					'b1',
				)
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			const { container } = renderPopup({ markType: 'textColor' }, state);
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			// #00ff00 is at index 1
			expect(swatches[1]?.getAttribute('tabindex')).toBe('0');
			expect(swatches[0]?.getAttribute('tabindex')).toBe('-1');
		});
	});

	describe('mouse interaction', () => {
		it('clicking swatch calls onClose', () => {
			const onClose = vi.fn();
			const { container } = renderPopup({ onClose });
			const swatch = container.querySelector('.notectl-color-picker__swatch') as HTMLElement;

			swatch.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('clicking reset button calls onClose', () => {
			const onClose = vi.fn();
			const { container } = renderPopup({ onClose });
			const btn = container.querySelector('.notectl-color-picker__default') as HTMLElement;

			btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('clicking reset button executes reset command', () => {
			const { container, ctx } = renderPopup({ resetCommand: 'removeHighlight' });
			const btn = container.querySelector('.notectl-color-picker__default') as HTMLElement;

			btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			expect(ctx.executeCommand).toHaveBeenCalledWith('removeHighlight');
		});
	});

	describe('keyboard navigation', () => {
		it('Escape on grid calls onClose', () => {
			const onClose = vi.fn();
			const { container } = renderPopup({ onClose });
			const grid = container.querySelector('[role="grid"]') as HTMLElement;

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('Escape on reset button calls onClose', () => {
			const onClose = vi.fn();
			const { container } = renderPopup({ onClose });
			const btn = container.querySelector('.notectl-color-picker__default') as HTMLElement;

			btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('Enter on swatch applies color and closes', () => {
			const onClose = vi.fn();
			const { container } = renderPopup({ onClose });
			const swatch = container.querySelector('.notectl-color-picker__swatch') as HTMLElement;

			swatch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('Space on swatch applies color and closes', () => {
			const onClose = vi.fn();
			const { container } = renderPopup({ onClose });
			const swatch = container.querySelector('.notectl-color-picker__swatch') as HTMLElement;

			swatch.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('ArrowRight moves to next swatch', () => {
			const { container } = renderPopup();
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');

			// Focus first swatch
			(swatches[0] as HTMLElement).focus();

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

			// After navigation, second swatch should have tabindex="0"
			expect(swatches[1]?.getAttribute('tabindex')).toBe('0');
			expect(swatches[0]?.getAttribute('tabindex')).toBe('-1');
		});

		it('ArrowDown moves to next row', () => {
			const { container } = renderPopup();
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');

			(swatches[0] as HTMLElement).focus();

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			// Should move to index 10 (row 2, col 1)
			expect(swatches[10]?.getAttribute('tabindex')).toBe('0');
		});

		it('clamps to last swatch on partial last row', () => {
			// 5 colors, 3 columns = row1(3) + row2(2)
			// Navigate down from col 3 in row 1 should target col 3 in row 2 (index 5)
			// which doesn't exist, so clamp to index 4 (last swatch)
			const fiveColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
			const { container } = renderPopup({ colors: fiveColors, columns: 3 });
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches.length).toBe(5);

			// Focus third swatch (row 1, col 3) and navigate down
			// Since happy-dom may not track activeElement reliably,
			// first navigate from index 0 to index 2 using ArrowRight twice
			(swatches[0] as HTMLElement).focus();
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			// Now at index 2 (row 1, col 3) — verify
			expect(swatches[2]?.getAttribute('tabindex')).toBe('0');

			// Navigate down: row 2, col 3 = index 5, which is past end → clamp to 4
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			expect(swatches[4]?.getAttribute('tabindex')).toBe('0');
		});
	});
});
