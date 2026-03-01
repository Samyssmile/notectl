import { describe, expect, it, vi } from 'vitest';
import { mockPluginContext, stateBuilder } from '../../test/TestUtils.js';
import type { FontSizePopupConfig } from './FontSizePopup.js';
import { renderFontSizePopup } from './FontSizePopup.js';

// --- Helpers ---

const DEFAULT_SIZES: readonly number[] = [8, 10, 12, 16, 24, 32, 48];

function makeConfig(overrides?: Partial<FontSizePopupConfig>): FontSizePopupConfig {
	return {
		sizes: DEFAULT_SIZES,
		defaultSize: 16,
		onClose: vi.fn(),
		contentElement: document.createElement('div'),
		...overrides,
	};
}

function renderPopup(
	config?: Partial<FontSizePopupConfig>,
	stateOverrides?: Parameters<typeof mockPluginContext>[0],
): { container: HTMLElement; config: FontSizePopupConfig } {
	const state =
		stateOverrides?.getState?.() ?? stateBuilder().schema(['paragraph'], ['fontSize']).build();

	const ctx = mockPluginContext({
		getState: () => state,
		dispatch: vi.fn(),
		...stateOverrides,
	});

	const container: HTMLElement = document.createElement('div');
	const popupConfig: FontSizePopupConfig = makeConfig(config);
	renderFontSizePopup(container, ctx, popupConfig);
	return { container, config: popupConfig };
}

function getInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('.notectl-font-size-picker__input');
	if (!input) throw new Error('Input not found');
	return input;
}

function getList(container: HTMLElement): HTMLElement {
	const list = container.querySelector<HTMLElement>('.notectl-font-size-picker__list');
	if (!list) throw new Error('List not found');
	return list;
}

// --- Tests ---

describe('renderFontSizePopup', () => {
	describe('DOM structure', () => {
		it('adds the picker class to the container', () => {
			const { container } = renderPopup();
			expect(container.classList.contains('notectl-font-size-picker')).toBe(true);
		});

		it('renders the custom input field', () => {
			const { container } = renderPopup();

			const input = container.querySelector<HTMLInputElement>('.notectl-font-size-picker__input');
			expect(input).not.toBeNull();
			expect(input?.type).toBe('number');
			expect(input?.getAttribute('aria-label')).toBe('Custom font size');
		});

		it('renders input with current size as value', () => {
			const { container } = renderPopup({ defaultSize: 16 });

			const input = container.querySelector<HTMLInputElement>('.notectl-font-size-picker__input');
			expect(input?.value).toBe('16');
		});

		it('renders a list item per size', () => {
			const { container } = renderPopup({ sizes: [12, 16, 24] });

			const items = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(items.length).toBe(3);
		});

		it('renders labels with size values', () => {
			const { container } = renderPopup({ sizes: [12, 16, 24] });

			const labels = [...container.querySelectorAll('.notectl-font-size-picker__label')].map(
				(el) => el.textContent,
			);
			expect(labels).toEqual(['12', '16', '24']);
		});
	});

	describe('accessibility', () => {
		it('list has role=listbox', () => {
			const { container } = renderPopup();

			const list = container.querySelector('.notectl-font-size-picker__list');
			expect(list?.getAttribute('role')).toBe('listbox');
			expect(list?.getAttribute('aria-label')).toBe('Font sizes');
		});

		it('items have role=option', () => {
			const { container } = renderPopup({ sizes: [12, 16] });

			const options = container.querySelectorAll('[role="option"]');
			expect(options.length).toBe(2);
		});

		it('active item has aria-selected=true', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['fontSize'])
				.build();

			const { container } = renderPopup({ sizes: [16, 24, 32] }, { getState: () => state });

			const active = container.querySelector('.notectl-font-size-picker__item--active');
			expect(active).not.toBeNull();
			expect(active?.getAttribute('aria-selected')).toBe('true');
		});

		it('active item shows checkmark', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['fontSize'])
				.build();

			const { container } = renderPopup({ sizes: [16, 24, 32] }, { getState: () => state });

			const active = container.querySelector('.notectl-font-size-picker__item--active');
			const check = active?.querySelector('.notectl-font-size-picker__check');
			expect(check?.textContent).toBe('\u2713');
		});

		it('inactive items have no checkmark', () => {
			const { container } = renderPopup({ sizes: [12, 16, 24] });

			const items = container.querySelectorAll('.notectl-font-size-picker__item');
			const inactiveItems = [...items].filter(
				(el) => !el.classList.contains('notectl-font-size-picker__item--active'),
			);

			for (const item of inactiveItems) {
				const check = item.querySelector('.notectl-font-size-picker__check');
				expect(check?.textContent).toBe('');
			}
		});
	});

	describe('keyboard navigation', () => {
		it('Enter on input with valid value closes popup with focus restoration', () => {
			const { container, config } = renderPopup({ sizes: [12, 16, 24] });

			const input = getInput(container);
			input.value = '20';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

			expect(config.onClose).toHaveBeenCalledWith({
				restoreFocusTo: config.contentElement,
			});
		});

		it('Enter on input with out-of-range value does not dismiss', () => {
			const { container, config } = renderPopup({ sizes: [12, 16, 24] });

			const input = getInput(container);
			input.value = '0';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

			expect(config.onClose).not.toHaveBeenCalled();
		});

		it('Escape on input closes popup with focus restoration', () => {
			const { container, config } = renderPopup();

			const input = getInput(container);
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

			expect(config.onClose).toHaveBeenCalledWith({
				restoreFocusTo: config.contentElement,
			});
		});

		it('Escape on list closes popup with focus restoration', () => {
			const { container, config } = renderPopup();

			const list = getList(container);
			list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

			expect(config.onClose).toHaveBeenCalledWith({
				restoreFocusTo: config.contentElement,
			});
		});

		it('ArrowDown on input focuses first list item', () => {
			const { container } = renderPopup({ sizes: [12, 16, 24] });

			const input = getInput(container);
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			const firstItem = container.querySelector('.notectl-font-size-picker__item');
			expect(firstItem?.classList.contains('notectl-font-size-picker__item--focused')).toBe(true);
		});
	});

	describe('mouse interaction', () => {
		it('mousedown on item closes popup with focus restoration', () => {
			const { container, config } = renderPopup({ sizes: [12, 16, 24] });

			const items = container.querySelectorAll('.notectl-font-size-picker__item');
			items[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

			expect(config.onClose).toHaveBeenCalledWith({
				restoreFocusTo: config.contentElement,
			});
		});
	});
});
