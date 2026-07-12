import { describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '../Plugin.js';
import { TABLE_LOCALE_EN } from './TableLocale.js';
import { renderTableSizeEditor } from './TableSizeEditor.js';
import {
	type TableSizeState,
	type TableSizingService,
	TableSizingServiceKey,
} from './TableSizing.js';

function render(
	state: TableSizeState,
	overrides: Partial<TableSizingService> = {},
): {
	readonly container: HTMLDivElement;
	readonly service: TableSizingService;
	readonly close: ReturnType<typeof vi.fn>;
	readonly announce: ReturnType<typeof vi.fn>;
} {
	const service: TableSizingService = {
		getSelectionSize: vi.fn(() => state),
		setSelectionSize: vi.fn(() => true),
		resetSelectionSize: vi.fn(() => true),
		getSize: vi.fn(() => state),
		setSize: vi.fn(() => true),
		resetSize: vi.fn(() => true),
		...overrides,
	};
	const announce = vi.fn();
	const context = {
		getService: (key: unknown) => (key === TableSizingServiceKey ? service : undefined),
		isReadOnly: () => false,
		announce,
	} as unknown as PluginContext;
	const container: HTMLDivElement = document.createElement('div');
	const close = vi.fn();
	renderTableSizeEditor(container, context, { onClose: close }, TABLE_LOCALE_EN);
	return { container, service, close, announce };
}

describe('TableSizeEditor', () => {
	it('represents explicit, mixed, automatic, and unavailable values accessibly', () => {
		const { container } = render({ columnWidthPx: 'mixed', rowMinHeightPx: 'unavailable' });
		const inputs = container.querySelectorAll<HTMLInputElement>('input');

		expect(container.getAttribute('role')).toBe('dialog');
		expect(inputs[0]?.placeholder).toBe('Mixed');
		expect(inputs[1]?.disabled).toBe(true);
		expect(container.textContent).toContain('px');
	});

	it('clamps both dirty dimensions and applies them atomically', () => {
		const { container, service, close } = render({
			columnWidthPx: 100,
			rowMinHeightPx: 40,
		});
		const inputs = container.querySelectorAll<HTMLInputElement>('input');
		const columnInput = inputs[0];
		const rowInput = inputs[1];
		if (!columnInput || !rowInput) throw new Error('Expected sizing inputs');
		columnInput.value = '5';
		rowInput.value = '50000';
		columnInput.dispatchEvent(new Event('input'));
		rowInput.dispatchEvent(new Event('input'));
		const apply = Array.from(container.querySelectorAll('button')).find(
			(button) => button.textContent === 'Apply',
		);
		apply?.click();

		expect(service.setSelectionSize).toHaveBeenCalledOnce();
		expect(service.setSelectionSize).toHaveBeenCalledWith({
			columnWidthPx: 60,
			rowMinHeightPx: 10_000,
		});
		expect(close).toHaveBeenCalledOnce();
	});

	it('does not partially mutate when one dirty value is invalid', () => {
		const { container, service, close } = render({
			columnWidthPx: 100,
			rowMinHeightPx: 40,
		});
		const inputs = container.querySelectorAll<HTMLInputElement>('input');
		const columnInput = inputs[0];
		const rowInput = inputs[1];
		if (!columnInput || !rowInput) throw new Error('Expected sizing inputs');
		columnInput.value = '120';
		rowInput.value = '';
		columnInput.dispatchEvent(new Event('input'));
		rowInput.dispatchEvent(new Event('input'));
		const apply = Array.from(container.querySelectorAll('button')).find(
			(button) => button.textContent === 'Apply',
		);
		apply?.click();

		expect(service.setSelectionSize).not.toHaveBeenCalled();
		expect(rowInput.getAttribute('aria-invalid')).toBe('true');
		expect(close).not.toHaveBeenCalled();
	});

	it('resets one axis independently and announces the automatic state', () => {
		const { container, service, announce } = render({
			columnWidthPx: 100,
			rowMinHeightPx: 40,
		});
		const resetColumn = Array.from(container.querySelectorAll('button')).find(
			(button) => button.textContent === 'Reset column width',
		);
		resetColumn?.click();

		expect(service.resetSelectionSize).toHaveBeenCalledWith('columnWidthPx');
		expect(announce).toHaveBeenCalledWith('Reset column width');
		expect(container.querySelector<HTMLInputElement>('input')?.placeholder).toBe('Automatic');
	});

	it('is a modal dialog that traps Tab focus within its controls', () => {
		const { container } = render({ columnWidthPx: 100, rowMinHeightPx: 40 });
		document.body.appendChild(container);
		try {
			expect(container.getAttribute('aria-modal')).toBe('true');
			const focusable = Array.from(
				container.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'),
			).filter((element) => !element.disabled);
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) throw new Error('Expected focusable controls');

			last.focus();
			last.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
			);
			expect(document.activeElement).toBe(first);

			first.focus();
			first.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'Tab',
					shiftKey: true,
					bubbles: true,
					cancelable: true,
				}),
			);
			expect(document.activeElement).toBe(last);
		} finally {
			container.remove();
		}
	});
});
