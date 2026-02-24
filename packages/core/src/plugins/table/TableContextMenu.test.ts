import { describe, expect, it, vi } from 'vitest';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { createTableContextMenu } from './TableContextMenu.js';
import type { TableLocale } from './TableLocale.js';
import { TABLE_LOCALE_EN } from './TableLocale.js';
import { createTableState } from './TableTestUtils.js';

// --- Mock context ---

function createMockContext(initialState: EditorState): PluginContext {
	let currentState: EditorState = initialState;
	return {
		getState: () => currentState,
		dispatch: vi.fn((tr) => {
			currentState = currentState.apply(tr);
		}),
		announce: vi.fn(),
		executeCommand: vi.fn(),
		getContainer: () => document.createElement('div'),
	} as unknown as PluginContext;
}

// --- Helpers ---

function openMenu(container?: HTMLElement): {
	menu: HTMLDivElement;
	container: HTMLElement;
	context: PluginContext;
	close: () => void;
	handle: ReturnType<typeof createTableContextMenu>;
} {
	const state = createTableState({ rows: 2, cols: 2 });
	const ctx = createMockContext(state);
	const el: HTMLElement = container ?? document.createElement('div');
	const anchorRect: DOMRect = new DOMRect(100, 100, 0, 0);
	const onClosed = vi.fn();

	const handle = createTableContextMenu(el, ctx, 't1' as BlockId, anchorRect, onClosed);
	const menu = el.querySelector('[role="menu"]') as HTMLDivElement;

	return { menu, container: el, context: ctx, close: onClosed, handle };
}

// --- Tests ---

describe('TableContextMenu', () => {
	describe('DOM structure', () => {
		it('creates a menu with role="menu"', () => {
			const { menu } = openMenu();
			expect(menu).not.toBeNull();
			expect(menu.getAttribute('role')).toBe('menu');
			expect(menu.getAttribute('aria-label')).toBe('Table actions');
		});

		it('contains menuitem buttons', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');
			expect(items.length).toBeGreaterThan(0);
		});

		it('contains separators', () => {
			const { menu } = openMenu();
			const separators = menu.querySelectorAll('[role="separator"]');
			expect(separators.length).toBeGreaterThan(0);
		});

		it('includes all expected menu items', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');
			const labels: string[] = Array.from(items).map((el) => el.textContent ?? '');
			expect(labels).toContain('Insert Row Above');
			expect(labels).toContain('Insert Row Below');
			expect(labels).toContain('Insert Column Left');
			expect(labels).toContain('Insert Column Right');
			expect(labels).toContain('Delete Row');
			expect(labels).toContain('Delete Column');
			expect(labels).toContain('Delete Table');
			expect(labels).toContain('Border Color...');
		});

		it('Border Color has aria-haspopup', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');
			const borderItem = Array.from(items).find((el) => el.textContent === 'Border Color...');
			expect(borderItem?.getAttribute('aria-haspopup')).toBe('true');
		});

		it('renders keyboard hint footer', () => {
			const { menu } = openMenu();
			const hint = menu.querySelector('.notectl-table-context-menu__hint');
			expect(hint).not.toBeNull();
			expect(hint?.getAttribute('aria-hidden')).toBe('true');
			expect(hint?.textContent).toContain('Navigate');
			expect(hint?.textContent).toContain('Esc Close');
		});
	});

	describe('keyboard navigation', () => {
		it('ArrowDown moves to next item', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');

			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			// Second item should now have tabindex="0"
			expect(items[1]?.getAttribute('tabindex')).toBe('0');
			expect(items[0]?.getAttribute('tabindex')).toBe('-1');
		});

		it('ArrowUp wraps to last item from first', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');

			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

			// Last item should have tabindex="0"
			const lastItem = items[items.length - 1];
			expect(lastItem?.getAttribute('tabindex')).toBe('0');
		});

		it('ArrowDown wraps from last to first', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');

			// Navigate to last
			for (let i = 0; i < items.length; i++) {
				menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			}

			// Should wrap to first (index 0)
			expect(items[0]?.getAttribute('tabindex')).toBe('0');
		});

		it('Escape closes menu', () => {
			const { menu, handle } = openMenu();
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			expect(handle.isOpen()).toBe(false);
		});

		it('Home moves to first item', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');

			// Move down a few
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			// Home
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));

			expect(items[0]?.getAttribute('tabindex')).toBe('0');
		});

		it('End moves to last item', () => {
			const { menu } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');

			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

			const lastItem = items[items.length - 1];
			expect(lastItem?.getAttribute('tabindex')).toBe('0');
		});
	});

	describe('event isolation', () => {
		it('stops keydown events from propagating to parent elements', () => {
			const parent: HTMLDivElement = document.createElement('div');
			const parentHandler = vi.fn();
			parent.addEventListener('keydown', parentHandler);

			const { menu } = openMenu(parent);

			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			expect(parentHandler).not.toHaveBeenCalled();
		});

		it('stops all key types from propagating (ArrowUp, Enter, Escape)', () => {
			const parent: HTMLDivElement = document.createElement('div');
			const parentHandler = vi.fn();
			parent.addEventListener('keydown', parentHandler);

			const { menu } = openMenu(parent);

			const keys: string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
			for (const key of keys) {
				menu.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
			}

			expect(parentHandler).not.toHaveBeenCalled();
		});

		it('stops click events from propagating to parent elements', () => {
			const parent: HTMLDivElement = document.createElement('div');
			const parentClickHandler = vi.fn();
			parent.addEventListener('click', parentClickHandler);

			const { menu } = openMenu(parent);
			const items = menu.querySelectorAll('[role="menuitem"]');
			const firstItem = items[0] as HTMLElement;
			firstItem.click();

			expect(parentClickHandler).not.toHaveBeenCalled();
		});
	});

	describe('actions', () => {
		it('Enter on item executes command and closes', () => {
			const { menu, context, handle } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');

			// First item is "Insert Row Above"
			const firstItem = items[0] as HTMLElement;
			firstItem.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'Enter',
					bubbles: true,
				}),
			);

			expect(context.executeCommand).toHaveBeenCalledWith('addRowAbove');
			expect(handle.isOpen()).toBe(false);
		});

		it('Space on item executes command', () => {
			const { menu, context, handle } = openMenu();

			// Move to second item (Insert Row Below)
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			menu.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

			expect(context.executeCommand).toHaveBeenCalledWith('addRowBelow');
			expect(handle.isOpen()).toBe(false);
		});

		it('click on item executes command', () => {
			const { menu, context, handle } = openMenu();
			const items = menu.querySelectorAll('[role="menuitem"]');

			const deleteRowItem = Array.from(items).find(
				(el) => el.textContent === 'Delete Row',
			) as HTMLElement;
			deleteRowItem.click();

			expect(context.executeCommand).toHaveBeenCalledWith('deleteRow');
			expect(handle.isOpen()).toBe(false);
		});
	});

	describe('submenu', () => {
		it('ArrowRight on Border Color opens submenu', () => {
			const container: HTMLDivElement = document.createElement('div');
			const { menu } = openMenu(container);
			const items = menu.querySelectorAll('[role="menuitem"]');

			// Navigate to Border Color
			const borderItem = Array.from(items).find(
				(el) => el.textContent === 'Border Color...',
			) as HTMLElement;
			const borderIndex: number = Array.from(items).indexOf(borderItem);

			// Navigate to the border color item
			for (let i = 0; i < borderIndex; i++) {
				menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			}

			// ArrowRight opens submenu
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

			expect(borderItem.getAttribute('aria-expanded')).toBe('true');

			// A sub-popup should be in the container
			const subPopups = container.querySelectorAll('.notectl-table-context-menu');
			expect(subPopups.length).toBe(2); // Menu + submenu
		});

		it('submenu keydown events do not propagate to parent', () => {
			const parent: HTMLDivElement = document.createElement('div');
			const parentHandler = vi.fn();
			parent.addEventListener('keydown', parentHandler);

			const { menu } = openMenu(parent);
			const items = menu.querySelectorAll('[role="menuitem"]');

			// Navigate to Border Color and open submenu
			const borderItem = Array.from(items).find(
				(el) => el.textContent === 'Border Color...',
			) as HTMLElement;
			const borderIndex: number = Array.from(items).indexOf(borderItem);
			for (let i = 0; i < borderIndex; i++) {
				menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			}
			parentHandler.mockClear();

			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

			// Get the submenu popup
			const subPopups = parent.querySelectorAll('.notectl-table-context-menu');
			const subPopup = subPopups[1] as HTMLElement;
			expect(subPopup).toBeDefined();

			parentHandler.mockClear();
			subPopup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

			expect(parentHandler).not.toHaveBeenCalled();
		});
	});

	describe('lifecycle', () => {
		it('close removes menu from DOM', () => {
			const container: HTMLDivElement = document.createElement('div');
			const { handle } = openMenu(container);

			expect(container.querySelector('[role="menu"]')).not.toBeNull();
			handle.close();
			expect(container.querySelector('[role="menu"]')).toBeNull();
		});

		it('isOpen returns correct state', () => {
			const { handle } = openMenu();
			expect(handle.isOpen()).toBe(true);
			handle.close();
			expect(handle.isOpen()).toBe(false);
		});

		it('destroy is alias for close', () => {
			const container: HTMLDivElement = document.createElement('div');
			const { handle } = openMenu(container);

			handle.destroy();
			expect(container.querySelector('[role="menu"]')).toBeNull();
			expect(handle.isOpen()).toBe(false);
		});
	});

	describe('i18n / locale', () => {
		it('uses custom locale for menu item labels', () => {
			const customLocale: TableLocale = {
				...TABLE_LOCALE_EN,
				insertRowAbove: 'Zeile oben einfügen',
				deleteTable: 'Tabelle löschen',
				tableActions: 'Tabellenaktionen',
			};
			const state = createTableState({ rows: 2, cols: 2 });
			const ctx = createMockContext(state);
			const el: HTMLDivElement = document.createElement('div');
			const anchorRect: DOMRect = new DOMRect(100, 100, 0, 0);

			createTableContextMenu(el, ctx, 't1' as BlockId, anchorRect, vi.fn(), customLocale);
			const menu = el.querySelector('[role="menu"]') as HTMLDivElement;

			expect(menu.getAttribute('aria-label')).toBe('Tabellenaktionen');
			const items = menu.querySelectorAll('[role="menuitem"]');
			const labels: string[] = Array.from(items).map((item) => item.textContent ?? '');
			expect(labels).toContain('Zeile oben einfügen');
			expect(labels).toContain('Tabelle löschen');
		});
	});
});
