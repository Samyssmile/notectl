import { describe, expect, it, vi } from 'vitest';
import type { MathPaletteGroup } from './MathFieldTypes.js';
import { MathPalette } from './MathPalette.js';

const GROUPS: readonly MathPaletteGroup[] = [
	{
		id: 'g1',
		label: 'Group one',
		items: [
			{ label: '½', ariaLabel: 'Fraction', snippet: '\\frac{$0}{}' },
			{ label: '√', ariaLabel: 'Square root', snippet: '\\sqrt{$0}' },
			{ label: '∫', ariaLabel: 'Integral', snippet: '\\int_{$0}^{}' },
		],
	},
];

/** Mounts a palette under a parent so bubbling to a host handler can be observed. */
function mount(onInsert: (snippet: string) => void = vi.fn()): {
	palette: MathPalette;
	parent: HTMLElement;
} {
	const palette: MathPalette = new MathPalette(GROUPS, 'Symbols', onInsert);
	const parent: HTMLElement = document.createElement('div');
	parent.appendChild(palette.root);
	document.body.appendChild(parent);
	return { palette, parent };
}

function pressKey(target: HTMLElement, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('MathPalette keyboard', () => {
	it('activates the focused button on Enter and Space, inserting its snippet', () => {
		const onInsert = vi.fn();
		const { palette } = mount(onInsert);
		const active: HTMLButtonElement = palette.activeButton() as HTMLButtonElement;

		pressKey(active, 'Enter');
		expect(onInsert).toHaveBeenLastCalledWith('\\frac{$0}{}');

		pressKey(active, ' ');
		expect(onInsert).toHaveBeenCalledTimes(2);
	});

	it('moves the roving focus by exactly one per Arrow key', () => {
		const { palette } = mount();

		pressKey(palette.activeButton() as HTMLElement, 'ArrowRight');
		expect(palette.activeButton()?.getAttribute('aria-label')).toBe('Square root');

		pressKey(palette.activeButton() as HTMLElement, 'ArrowLeft');
		expect(palette.activeButton()?.getAttribute('aria-label')).toBe('Fraction');
	});

	it('stops the keys it handles from bubbling, so a host popup never double-handles them', () => {
		const { palette, parent } = mount();
		const hostHandler = vi.fn();
		parent.addEventListener('keydown', hostHandler);
		const active: HTMLButtonElement = palette.activeButton() as HTMLButtonElement;

		pressKey(active, 'ArrowRight');
		pressKey(active, 'Home');
		pressKey(active, 'Enter');
		pressKey(active, ' ');

		expect(hostHandler).not.toHaveBeenCalled();
	});

	it('lets Tab and Escape bubble to the surrounding dialog', () => {
		const { palette, parent } = mount();
		const hostHandler = vi.fn();
		parent.addEventListener('keydown', hostHandler);
		const active: HTMLButtonElement = palette.activeButton() as HTMLButtonElement;

		pressKey(active, 'Tab');
		pressKey(active, 'Escape');

		expect(hostHandler).toHaveBeenCalledTimes(2);
	});
});
