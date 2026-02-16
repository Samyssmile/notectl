import { describe, expect, it } from 'vitest';
import {
	applyRovingTabindex,
	findFirstEnabled,
	findLastEnabled,
	findNextDropdownItem,
	findNextEnabled,
	getEnabledIndices,
	navigateGrid,
} from './ToolbarKeyboardNav.js';

function makeButtons(disabledIndices: number[] = [], count = 5): HTMLButtonElement[] {
	const buttons: HTMLButtonElement[] = [];
	for (let i = 0; i < count; i++) {
		const btn = document.createElement('button');
		btn.disabled = disabledIndices.includes(i);
		buttons.push(btn);
	}
	return buttons;
}

describe('ToolbarKeyboardNav', () => {
	describe('getEnabledIndices', () => {
		it('returns all indices when none disabled', () => {
			const buttons = makeButtons();
			expect(getEnabledIndices(buttons)).toEqual([0, 1, 2, 3, 4]);
		});

		it('skips disabled buttons', () => {
			const buttons = makeButtons([1, 3]);
			expect(getEnabledIndices(buttons)).toEqual([0, 2, 4]);
		});

		it('returns empty for all disabled', () => {
			const buttons = makeButtons([0, 1, 2], 3);
			expect(getEnabledIndices(buttons)).toEqual([]);
		});
	});

	describe('findNextEnabled', () => {
		it('moves forward skipping disabled', () => {
			const buttons = makeButtons([1]);
			expect(findNextEnabled(buttons, 0, 1)).toBe(2);
		});

		it('wraps around forward', () => {
			const buttons = makeButtons();
			expect(findNextEnabled(buttons, 4, 1)).toBe(0);
		});

		it('moves backward', () => {
			const buttons = makeButtons();
			expect(findNextEnabled(buttons, 2, -1)).toBe(1);
		});

		it('wraps around backward', () => {
			const buttons = makeButtons();
			expect(findNextEnabled(buttons, 0, -1)).toBe(4);
		});

		it('returns current when all disabled', () => {
			const buttons = makeButtons([0, 1, 2], 3);
			expect(findNextEnabled(buttons, 0, 1)).toBe(0);
		});
	});

	describe('findFirstEnabled / findLastEnabled', () => {
		it('finds first enabled', () => {
			const buttons = makeButtons([0]);
			expect(findFirstEnabled(buttons)).toBe(1);
		});

		it('finds last enabled', () => {
			const buttons = makeButtons([4]);
			expect(findLastEnabled(buttons)).toBe(3);
		});

		it('returns -1 when all disabled', () => {
			const buttons = makeButtons([0, 1, 2], 3);
			expect(findFirstEnabled(buttons)).toBe(-1);
			expect(findLastEnabled(buttons)).toBe(-1);
		});
	});

	describe('applyRovingTabindex', () => {
		it('sets tabindex=0 on focused, -1 on rest', () => {
			const buttons = makeButtons([], 3);
			applyRovingTabindex(buttons, 1);

			expect(buttons[0]?.getAttribute('tabindex')).toBe('-1');
			expect(buttons[1]?.getAttribute('tabindex')).toBe('0');
			expect(buttons[2]?.getAttribute('tabindex')).toBe('-1');
		});
	});

	describe('findNextDropdownItem', () => {
		it('moves forward with wrap', () => {
			const items = [
				document.createElement('div'),
				document.createElement('div'),
				document.createElement('div'),
			];
			expect(findNextDropdownItem(items, 0, 1)).toBe(1);
			expect(findNextDropdownItem(items, 2, 1)).toBe(0);
		});

		it('moves backward with wrap', () => {
			const items = [
				document.createElement('div'),
				document.createElement('div'),
				document.createElement('div'),
			];
			expect(findNextDropdownItem(items, 1, -1)).toBe(0);
			expect(findNextDropdownItem(items, 0, -1)).toBe(2);
		});
	});

	describe('navigateGrid', () => {
		it('moves right', () => {
			expect(navigateGrid(1, 1, 3, 3, 'ArrowRight')).toEqual([1, 2]);
		});

		it('wraps right to left', () => {
			expect(navigateGrid(1, 3, 3, 3, 'ArrowRight')).toEqual([1, 1]);
		});

		it('moves down', () => {
			expect(navigateGrid(1, 1, 3, 3, 'ArrowDown')).toEqual([2, 1]);
		});

		it('wraps down to top', () => {
			expect(navigateGrid(3, 1, 3, 3, 'ArrowDown')).toEqual([1, 1]);
		});

		it('moves left', () => {
			expect(navigateGrid(1, 2, 3, 3, 'ArrowLeft')).toEqual([1, 1]);
		});

		it('wraps left to right', () => {
			expect(navigateGrid(1, 1, 3, 3, 'ArrowLeft')).toEqual([1, 3]);
		});

		it('moves up', () => {
			expect(navigateGrid(2, 1, 3, 3, 'ArrowUp')).toEqual([1, 1]);
		});

		it('wraps up to bottom', () => {
			expect(navigateGrid(1, 1, 3, 3, 'ArrowUp')).toEqual([3, 1]);
		});
	});
});
