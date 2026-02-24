import { describe, expect, it, vi } from 'vitest';
import { getBlockChildren } from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import {
	BORDER_COLOR_PALETTE,
	buildSetBorderColorTransaction,
	getTableBorderColor,
	renderBorderColorPicker,
	resetTableBorderColor,
	setTableBorderColor,
} from './TableBorderColor.js';
import type { TableLocale } from './TableLocale.js';
import { TABLE_LOCALE_EN } from './TableLocale.js';
import { createTableState } from './TableTestUtils.js';

// --- Mock context ---

function createMockContext(initialState: EditorState): {
	context: PluginContext;
	getState: () => EditorState;
} {
	let currentState: EditorState = initialState;
	const context = {
		getState: () => currentState,
		dispatch: vi.fn((tr) => {
			currentState = currentState.apply(tr);
		}),
		announce: vi.fn(),
		executeCommand: vi.fn(),
	} as unknown as PluginContext;

	return { context, getState: () => currentState };
}

// --- Tests ---

describe('TableBorderColor', () => {
	describe('buildSetBorderColorTransaction', () => {
		it('sets borderColor attr on table', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const tr = buildSetBorderColorTransaction(state, 't1' as BlockId, '#ff0000');
			if (!tr) return expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const table = newState.getBlock('t1' as BlockId);
			expect(table?.attrs?.borderColor).toBe('#ff0000');
		});

		it('removes borderColor when set to undefined', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const tr1 = buildSetBorderColorTransaction(state, 't1' as BlockId, '#ff0000');
			if (!tr1) return expect(tr1).not.toBeNull();
			const stateWithColor = state.apply(tr1);

			const tr2 = buildSetBorderColorTransaction(stateWithColor, 't1' as BlockId, undefined);
			if (!tr2) return expect(tr2).not.toBeNull();

			const newState = stateWithColor.apply(tr2);
			const table = newState.getBlock('t1' as BlockId);
			expect(table?.attrs?.borderColor).toBeUndefined();
		});

		it('sets borderColor to none for borderless', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const tr = buildSetBorderColorTransaction(state, 't1' as BlockId, 'none');
			if (!tr) return expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const table = newState.getBlock('t1' as BlockId);
			expect(table?.attrs?.borderColor).toBe('none');
		});

		it('returns null for unknown table ID', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const tr = buildSetBorderColorTransaction(state, 'nonexistent' as BlockId, '#ff0000');
			expect(tr).toBeNull();
		});

		it('preserves existing attrs', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const tr = buildSetBorderColorTransaction(state, 't1' as BlockId, '#0000ff');
			if (!tr) return expect(tr).not.toBeNull();
			const newState = state.apply(tr);
			const table = newState.getBlock('t1' as BlockId);
			if (!table) return expect(table).toBeDefined();
			expect(table.type).toBe('table');
			expect(getBlockChildren(table).length).toBe(2);
		});
	});

	describe('setTableBorderColor', () => {
		it('sets color when cursor is in table', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context, getState } = createMockContext(state);

			const result = setTableBorderColor(context, '#ff0000');
			expect(result).toBe(true);
			expect(context.dispatch).toHaveBeenCalled();

			const newState = getState();
			const table = newState.getBlock('t1' as BlockId);
			expect(table?.attrs?.borderColor).toBe('#ff0000');
		});

		it('announces color change', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);

			setTableBorderColor(context, '#ff0000');
			expect(context.announce).toHaveBeenCalledWith(
				expect.stringContaining('Table border color set to'),
			);
		});

		it('returns false when cursor is outside table', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			// Move cursor to paragraph after table
			const outsideState = EditorState.create({
				doc: state.doc,
				selection: createCollapsedSelection('after' as BlockId, 0),
				schema: state.schema,
			});
			const { context } = createMockContext(outsideState);

			const result = setTableBorderColor(context, '#ff0000');
			expect(result).toBe(false);
		});
	});

	describe('resetTableBorderColor', () => {
		it('resets border color to default', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context, getState } = createMockContext(state);

			// Set a color first
			setTableBorderColor(context, '#ff0000');
			// Then reset
			const result = resetTableBorderColor(context);
			expect(result).toBe(true);

			const table = getState().getBlock('t1' as BlockId);
			expect(table?.attrs?.borderColor).toBeUndefined();
		});

		it('announces reset', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);

			resetTableBorderColor(context);
			expect(context.announce).toHaveBeenCalledWith('Table borders reset to default');
		});
	});

	describe('getTableBorderColor', () => {
		it('returns undefined when no border color is set', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			expect(getTableBorderColor(state, 't1' as BlockId)).toBeUndefined();
		});

		it('returns the border color when set', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const tr = buildSetBorderColorTransaction(state, 't1' as BlockId, '#ff0000');
			if (!tr) return expect(tr).not.toBeNull();
			const newState = state.apply(tr);
			expect(getTableBorderColor(newState, 't1' as BlockId)).toBe('#ff0000');
		});

		it('returns undefined for unknown table ID', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			expect(getTableBorderColor(state, 'nonexistent' as BlockId)).toBeUndefined();
		});
	});

	describe('renderBorderColorPicker', () => {
		it('creates ARIA grid structure', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');

			renderBorderColorPicker(container, context, 't1' as BlockId, vi.fn());

			const grid = container.querySelector('[role="grid"]');
			expect(grid).not.toBeNull();
			expect(grid?.getAttribute('aria-label')).toBe('Border color picker');

			const rows = container.querySelectorAll('[role="row"]');
			expect(rows.length).toBeGreaterThan(0);

			const cells = container.querySelectorAll('[role="gridcell"]');
			expect(cells.length).toBe(BORDER_COLOR_PALETTE.length);
		});

		it('includes Default and No borders buttons', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');

			renderBorderColorPicker(container, context, 't1' as BlockId, vi.fn());

			const buttons = container.querySelectorAll('button.notectl-color-picker__default');
			expect(buttons.length).toBe(2);
			expect(buttons[0]?.textContent).toBe('Default');
			expect(buttons[1]?.textContent).toBe('No borders');
		});

		it('calls onClose when Escape is pressed on grid', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');
			const onClose = vi.fn();

			renderBorderColorPicker(container, context, 't1' as BlockId, onClose);

			const grid = container.querySelector('[role="grid"]') as HTMLElement;
			grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			expect(onClose).toHaveBeenCalled();
		});

		it('selects color on Enter key', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');
			const onClose = vi.fn();

			renderBorderColorPicker(container, context, 't1' as BlockId, onClose);

			const swatch = container.querySelector('[role="gridcell"]') as HTMLElement;
			swatch.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'Enter',
					bubbles: true,
				}),
			);
			expect(context.dispatch).toHaveBeenCalled();
			expect(onClose).toHaveBeenCalled();
		});

		it('applies roving tabindex', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');

			renderBorderColorPicker(container, context, 't1' as BlockId, vi.fn());

			const cells = container.querySelectorAll('[role="gridcell"]');
			const tabindexZero = Array.from(cells).filter((c) => c.getAttribute('tabindex') === '0');
			expect(tabindexZero.length).toBe(1);
		});

		it('uses color name (not hex) for swatch title', () => {
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');

			renderBorderColorPicker(container, context, 't1' as BlockId, vi.fn());

			const firstSwatch = container.querySelector('[role="gridcell"]') as HTMLElement;
			// Title should be a human-readable name, not a hex code
			expect(firstSwatch.title).not.toMatch(/^#[0-9a-fA-F]{6}$/);
		});
	});

	describe('i18n / locale', () => {
		it('uses custom locale strings for Default and No borders buttons', () => {
			const customLocale: TableLocale = {
				...TABLE_LOCALE_EN,
				defaultColor: 'Standard',
				noBorders: 'Keine Rahmen',
			};
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');

			renderBorderColorPicker(container, context, 't1' as BlockId, vi.fn(), customLocale);

			const buttons = container.querySelectorAll('button.notectl-color-picker__default');
			expect(buttons[0]?.textContent).toBe('Standard');
			expect(buttons[1]?.textContent).toBe('Keine Rahmen');
		});

		it('uses custom locale for grid aria-label', () => {
			const customLocale: TableLocale = {
				...TABLE_LOCALE_EN,
				borderColorPicker: 'Farbauswahl',
			};
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);
			const container: HTMLDivElement = document.createElement('div');

			renderBorderColorPicker(container, context, 't1' as BlockId, vi.fn(), customLocale);

			const grid = container.querySelector('[role="grid"]');
			expect(grid?.getAttribute('aria-label')).toBe('Farbauswahl');
		});

		it('uses custom locale for announcements', () => {
			const customLocale: TableLocale = {
				...TABLE_LOCALE_EN,
				announceBorderReset: 'Rahmen zurückgesetzt',
			};
			const state = createTableState({ rows: 2, cols: 2 });
			const { context } = createMockContext(state);

			resetTableBorderColor(context, customLocale);
			expect(context.announce).toHaveBeenCalledWith('Rahmen zurückgesetzt');
		});
	});
});
