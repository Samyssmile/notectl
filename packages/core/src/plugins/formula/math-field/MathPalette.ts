/**
 * Accessible structural palette / on-screen math keyboard (Layer A).
 *
 * Renders grouped buttons that insert LaTeX snippets at the caret. Implements
 * the WAI-ARIA toolbar pattern with a roving tabindex: one button is tabbable,
 * arrow keys move focus across the whole palette, Home/End jump to the ends.
 * Mouse clicks use mousedown+preventDefault so the LaTeX field keeps focus and
 * caret position; activation inserts the snippet and returns focus to the field.
 */

import type { MathPaletteGroup } from './MathFieldTypes.js';

export class MathPalette {
	/** The toolbar root element. */
	readonly root: HTMLElement;

	private readonly buttons: HTMLButtonElement[] = [];
	private activeIndex = 0;

	constructor(
		groups: readonly MathPaletteGroup[],
		label: string,
		onInsert: (snippet: string) => void,
	) {
		this.root = document.createElement('div');
		this.root.className = 'notectl-math-palette';
		this.root.setAttribute('role', 'toolbar');
		this.root.setAttribute('aria-label', label);

		for (const group of groups) {
			this.root.appendChild(this.buildGroup(group, onInsert));
		}
		this.root.addEventListener('keydown', (e: KeyboardEvent) => this.onKeydown(e));
		this.setActive(0);
	}

	/** Moves keyboard focus to the palette's currently active button. */
	focus(): void {
		this.buttons[this.activeIndex]?.focus();
	}

	private buildGroup(group: MathPaletteGroup, onInsert: (snippet: string) => void): HTMLElement {
		const wrapper: HTMLDivElement = document.createElement('div');
		wrapper.className = 'notectl-math-palette__group';
		wrapper.setAttribute('role', 'group');
		wrapper.setAttribute('aria-label', group.label);

		for (const item of group.items) {
			const btn: HTMLButtonElement = document.createElement('button');
			btn.type = 'button';
			btn.className = 'notectl-math-palette__btn';
			btn.textContent = item.label;
			btn.setAttribute('aria-label', item.ariaLabel);
			btn.tabIndex = -1;
			btn.addEventListener('mousedown', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
			});
			btn.addEventListener('click', () => onInsert(item.snippet));
			this.buttons.push(btn);
			wrapper.appendChild(btn);
		}
		return wrapper;
	}

	private onKeydown(e: KeyboardEvent): void {
		const last: number = this.buttons.length - 1;
		let next: number = this.activeIndex;
		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = this.activeIndex >= last ? 0 : this.activeIndex + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = this.activeIndex <= 0 ? last : this.activeIndex - 1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = last;
				break;
			default:
				return;
		}
		e.preventDefault();
		this.setActive(next);
		this.buttons[next]?.focus();
	}

	private setActive(index: number): void {
		const prev: HTMLButtonElement | undefined = this.buttons[this.activeIndex];
		if (prev) prev.tabIndex = -1;
		const cur: HTMLButtonElement | undefined = this.buttons[index];
		if (cur) cur.tabIndex = 0;
		this.activeIndex = index;
	}
}
