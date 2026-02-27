import { describe, expect, it, vi } from 'vitest';
import { renderColorGrid } from './ColorGrid.js';
import type { ColorGridConfig } from './ColorGrid.js';

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

function defaultConfig(overrides?: Partial<ColorGridConfig>): ColorGridConfig {
	return {
		colors: TEST_COLORS,
		columns: 10,
		ariaLabel: 'Test color picker',
		ariaLabelPrefix: 'Test',
		activeColor: null,
		onSelect: vi.fn(),
		onClose: vi.fn(),
		...overrides,
	};
}

function renderGrid(overrides?: Partial<ColorGridConfig>): {
	container: HTMLDivElement;
	config: ColorGridConfig;
} {
	const container: HTMLDivElement = document.createElement('div');
	const config = defaultConfig(overrides);
	renderColorGrid(container, config);
	return { container, config };
}

// --- Tests ---

describe('ColorGrid', () => {
	describe('DOM structure', () => {
		it('renders a grid with role="grid"', () => {
			const { container } = renderGrid();
			const grid = container.querySelector('[role="grid"]');
			expect(grid).not.toBeNull();
		});

		it('sets aria-label on the grid', () => {
			const { container } = renderGrid({ ariaLabel: 'My picker' });
			const grid = container.querySelector('[role="grid"]');
			expect(grid?.getAttribute('aria-label')).toBe('My picker');
		});

		it('renders correct number of swatches', () => {
			const { container } = renderGrid();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches.length).toBe(TEST_COLORS.length);
		});

		it('organizes swatches into ARIA rows', () => {
			const { container } = renderGrid();
			const rows = container.querySelectorAll('[role="row"]');
			// 13 colors / 10 columns = 2 rows
			expect(rows.length).toBe(2);
		});

		it('each swatch has role="gridcell"', () => {
			const { container } = renderGrid();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			for (const swatch of swatches) {
				expect(swatch.getAttribute('role')).toBe('gridcell');
			}
		});

		it('each swatch has aria-label with prefix + color name', () => {
			const { container } = renderGrid({ ariaLabelPrefix: 'Highlight' });
			const swatch = container.querySelector('.notectl-color-picker__swatch');
			// #ff0000 → "Red"
			expect(swatch?.getAttribute('aria-label')).toBe('Highlight Red');
		});

		it('uses custom swatchLabel formatter', () => {
			const { container } = renderGrid({
				swatchLabel: (name) => `Border ${name}`,
			});
			const swatch = container.querySelector('.notectl-color-picker__swatch');
			expect(swatch?.getAttribute('aria-label')).toBe('Border Red');
		});

		it('title shows hex by default', () => {
			const { container } = renderGrid();
			const swatch = container.querySelector('.notectl-color-picker__swatch') as HTMLElement;
			expect(swatch?.title).toBe('#ff0000');
		});

		it('title shows color name when titleAsName is true', () => {
			const { container } = renderGrid({ titleAsName: true });
			const swatch = container.querySelector('.notectl-color-picker__swatch') as HTMLElement;
			expect(swatch?.title).toBe('Red');
		});
	});

	describe('active color', () => {
		it('marks active swatch with --active class', () => {
			const { container } = renderGrid({ activeColor: '#ff0000' });
			const active = container.querySelector('.notectl-color-picker__swatch--active');
			expect(active).not.toBeNull();
		});

		it('active swatch has aria-selected="true"', () => {
			const { container } = renderGrid({ activeColor: '#ff0000' });
			const active = container.querySelector('.notectl-color-picker__swatch--active');
			expect(active?.getAttribute('aria-selected')).toBe('true');
		});

		it('inactive swatches have aria-selected="false"', () => {
			const { container } = renderGrid();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			for (const swatch of swatches) {
				expect(swatch.getAttribute('aria-selected')).toBe('false');
			}
		});

		it('active color comparison is case-insensitive', () => {
			const { container } = renderGrid({ activeColor: '#FF0000' });
			const active = container.querySelector('.notectl-color-picker__swatch--active');
			expect(active).not.toBeNull();
		});
	});

	describe('light color borders', () => {
		it('white swatch gets a visible border', () => {
			const { container } = renderGrid();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			const whiteSwatch = Array.from(swatches).find(
				(s) => (s as HTMLElement).title === '#ffffff',
			) as HTMLElement | undefined;
			expect(whiteSwatch?.style.border).toBe('1px solid #d0d0d0');
		});

		it('dark colors do not get a border', () => {
			const { container } = renderGrid();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			const blackSwatch = Array.from(swatches).find(
				(s) => (s as HTMLElement).title === '#000000',
			) as HTMLElement | undefined;
			expect(blackSwatch?.style.border).not.toBe('1px solid #d0d0d0');
		});
	});

	describe('roving tabindex', () => {
		it('first swatch has tabindex="0" by default', () => {
			const { container } = renderGrid();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches[0]?.getAttribute('tabindex')).toBe('0');
		});

		it('non-focused swatches have tabindex="-1"', () => {
			const { container } = renderGrid();
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			for (let i = 1; i < swatches.length; i++) {
				expect(swatches[i]?.getAttribute('tabindex')).toBe('-1');
			}
		});

		it('active swatch gets initial tabindex="0"', () => {
			const { container } = renderGrid({ activeColor: '#00ff00' });
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			// #00ff00 is at index 1
			expect(swatches[1]?.getAttribute('tabindex')).toBe('0');
			expect(swatches[0]?.getAttribute('tabindex')).toBe('-1');
		});
	});

	describe('mouse interaction', () => {
		it('clicking swatch calls onSelect', () => {
			const onSelect = vi.fn();
			const { container } = renderGrid({ onSelect });
			const swatch = container.querySelector('.notectl-color-picker__swatch') as HTMLElement;

			swatch.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			expect(onSelect).toHaveBeenCalledWith('#ff0000');
		});
	});

	describe('keyboard navigation', () => {
		it('Escape calls onClose', () => {
			const onClose = vi.fn();
			const { container } = renderGrid({ onClose });
			const grid = container.querySelector('[role="grid"]') as HTMLElement;

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('Enter on swatch calls onSelect', () => {
			const onSelect = vi.fn();
			const { container } = renderGrid({ onSelect });
			const swatch = container.querySelector('.notectl-color-picker__swatch') as HTMLElement;

			swatch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			expect(onSelect).toHaveBeenCalledWith('#ff0000');
		});

		it('ArrowRight moves to next swatch', () => {
			const { container } = renderGrid();
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

			expect(swatches[1]?.getAttribute('tabindex')).toBe('0');
			expect(swatches[0]?.getAttribute('tabindex')).toBe('-1');
		});

		it('ArrowDown moves to next row', () => {
			const { container } = renderGrid();
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			expect(swatches[10]?.getAttribute('tabindex')).toBe('0');
		});

		it('Home moves to first swatch in row', () => {
			const { container } = renderGrid();
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');

			// Move right a few times
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
			expect(swatches[0]?.getAttribute('tabindex')).toBe('0');
		});

		it('End moves to last swatch in row', () => {
			const { container } = renderGrid();
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');

			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
			expect(swatches[9]?.getAttribute('tabindex')).toBe('0');
		});

		it('clamps to last swatch on partial row navigation', () => {
			const fiveColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
			const { container } = renderGrid({ colors: fiveColors, columns: 3 });
			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');

			// Move to col 3 (index 2)
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

			// ArrowDown from col 3, row 1 → col 3, row 2 (index 5) → clamp to 4
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			expect(swatches[4]?.getAttribute('tabindex')).toBe('0');
		});
	});
});
