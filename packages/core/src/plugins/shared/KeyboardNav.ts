/**
 * Generic keyboard navigation helpers reused by toolbar and popup UIs.
 */

/**
 * Applies roving tabindex: sets tabindex="0" on the focused item,
 * tabindex="-1" on all others.
 */
export function applyRovingTabindex(items: readonly HTMLElement[], focusedIndex: number): void {
	for (let i = 0; i < items.length; i++) {
		const item: HTMLElement | undefined = items[i];
		if (item) {
			item.setAttribute('tabindex', i === focusedIndex ? '0' : '-1');
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

/** Flips horizontal arrow keys for RTL contexts. */
function flipHorizontalKey(
	key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
): 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' {
	if (key === 'ArrowLeft') return 'ArrowRight';
	if (key === 'ArrowRight') return 'ArrowLeft';
	return key;
}

/**
 * Navigates a grid of cells with arrow keys.
 * Returns the new [row, col] position.
 * When `isRtl` is true, horizontal arrows are flipped to match visual direction.
 */
export function navigateGrid(
	row: number,
	col: number,
	maxRows: number,
	maxCols: number,
	key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
	isRtl = false,
): [number, number] {
	const resolved: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' = isRtl
		? flipHorizontalKey(key)
		: key;

	switch (resolved) {
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
