/**
 * Keyboard navigation helpers for the toolbar (WAI-ARIA Toolbar pattern).
 * Also re-exports generic navigation helpers from `plugins/shared`.
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

export {
	applyRovingTabindex,
	findNextDropdownItem,
	navigateGrid,
} from '../shared/KeyboardNav.js';

/**
 * Resolves a horizontal navigation direction based on text direction.
 * In RTL, ArrowRight moves backward (-1) and ArrowLeft moves forward (1).
 */
export function resolveHorizontalDirection(
	key: 'ArrowRight' | 'ArrowLeft',
	isRtl: boolean,
): 1 | -1 {
	if (key === 'ArrowRight') return isRtl ? -1 : 1;
	return isRtl ? 1 : -1;
}
