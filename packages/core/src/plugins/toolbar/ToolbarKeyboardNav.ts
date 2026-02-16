/**
 * Keyboard navigation helpers for the toolbar (WAI-ARIA Toolbar pattern).
 * Pure functions that operate on arrays of buttons and DOM elements.
 */

/** Returns indices of all enabled buttons. */
export function getEnabledIndices(buttons: readonly HTMLButtonElement[]): number[] {
	const result: number[] = [];
	for (let i = 0; i < buttons.length; i++) {
		if (!buttons[i]?.disabled) {
			result.push(i);
		}
	}
	return result;
}

/** Finds the next enabled button index in the given direction (wraps around). */
export function findNextEnabled(
	buttons: readonly HTMLButtonElement[],
	current: number,
	direction: 1 | -1,
): number {
	const len = buttons.length;
	if (len === 0) return -1;

	let index = current;
	for (let i = 0; i < len; i++) {
		index = (index + direction + len) % len;
		if (!buttons[index]?.disabled) {
			return index;
		}
	}
	return current;
}

/** Finds the first enabled button index. */
export function findFirstEnabled(buttons: readonly HTMLButtonElement[]): number {
	for (let i = 0; i < buttons.length; i++) {
		if (!buttons[i]?.disabled) return i;
	}
	return -1;
}

/** Finds the last enabled button index. */
export function findLastEnabled(buttons: readonly HTMLButtonElement[]): number {
	for (let i = buttons.length - 1; i >= 0; i--) {
		if (!buttons[i]?.disabled) return i;
	}
	return -1;
}

/**
 * Applies roving tabindex: sets tabindex="0" on the focused button,
 * tabindex="-1" on all others.
 */
export function applyRovingTabindex(
	buttons: readonly HTMLButtonElement[],
	focusedIndex: number,
): void {
	for (let i = 0; i < buttons.length; i++) {
		const btn = buttons[i];
		if (btn) {
			btn.setAttribute('tabindex', i === focusedIndex ? '0' : '-1');
		}
	}
}

/** Navigates dropdown items with arrow keys (wraps around). */
export function findNextDropdownItem(
	items: readonly HTMLElement[],
	current: number,
	direction: 1 | -1,
): number {
	const len = items.length;
	if (len === 0) return -1;
	return (current + direction + len) % len;
}

/**
 * Navigates a grid of cells with arrow keys.
 * Returns the new [row, col] position.
 */
export function navigateGrid(
	row: number,
	col: number,
	maxRows: number,
	maxCols: number,
	key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
): [number, number] {
	switch (key) {
		case 'ArrowUp':
			return [row > 1 ? row - 1 : maxRows, col];
		case 'ArrowDown':
			return [row < maxRows ? row + 1 : 1, col];
		case 'ArrowLeft':
			return [row, col > 1 ? col - 1 : maxCols];
		case 'ArrowRight':
			return [row, col < maxCols ? col + 1 : 1];
	}
}
