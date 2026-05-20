import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '../Plugin.js';
import type { ToolbarItem } from './ToolbarItem.js';
import {
	type OverflowControllerConfig,
	ToolbarOverflowController,
} from './ToolbarOverflowController.js';

// --- Helpers ---

function makeItem(id: string, overrides?: Partial<ToolbarItem>): ToolbarItem {
	return {
		id,
		group: 'format',
		icon: '<svg></svg>',
		label: id,
		command: `cmd-${id}`,
		...overrides,
	};
}

function makeButton(item: ToolbarItem): { element: HTMLButtonElement; item: ToolbarItem } {
	const btn: HTMLButtonElement = document.createElement('button');
	btn.className = `notectl-toolbar-btn notectl-toolbar-btn--${item.id}`;
	btn.setAttribute('data-toolbar-item', item.id);
	Object.defineProperty(btn, 'offsetWidth', { value: 32, configurable: true });
	return { element: btn, item };
}

function createToolbar(): HTMLElement {
	const toolbar: HTMLElement = document.createElement('div');
	toolbar.className = 'notectl-toolbar';
	document.body.appendChild(toolbar);
	return toolbar;
}

function createSeparator(): HTMLSpanElement {
	const sep: HTMLSpanElement = document.createElement('span');
	sep.className = 'notectl-toolbar-separator';
	sep.setAttribute('role', 'separator');
	Object.defineProperty(sep, 'offsetWidth', { value: 9, configurable: true });
	return sep;
}

function createMockContext(overrides?: Partial<PluginContext>): PluginContext {
	return {
		executeCommand: vi.fn(),
		getState: vi.fn(() => ({})),
		...overrides,
	} as unknown as PluginContext;
}

function createController(overrides?: Partial<OverflowControllerConfig>): {
	controller: ToolbarOverflowController;
	config: OverflowControllerConfig;
} {
	const toolbar: HTMLElement = overrides?.toolbar ?? createToolbar();
	const config: OverflowControllerConfig = {
		toolbar,
		ariaLabel: 'More tools',
		context: createMockContext(),
		onOverflowChange: vi.fn(),
		onItemActivated: vi.fn(),
		getActiveElement: () => null,
		...overrides,
	};
	const controller = new ToolbarOverflowController(config);
	return { controller, config };
}

// --- Mock ResizeObserver ---

let resizeCallback: (() => void) | null = null;

class MockResizeObserver {
	constructor(cb: ResizeObserverCallback) {
		resizeCallback = () => cb([], this as unknown as ResizeObserver);
	}
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {
		resizeCallback = null;
	}
}

// --- Tests ---

describe('ToolbarOverflowController', () => {
	let originalResizeObserver: typeof ResizeObserver;

	beforeEach(() => {
		originalResizeObserver = globalThis.ResizeObserver;
		globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
	});

	afterEach(() => {
		globalThis.ResizeObserver = originalResizeObserver;
		document.body.innerHTML = '';
		resizeCallback = null;
	});

	it('shows no overflow button when all items fit', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 500, configurable: true });

		const onChange = vi.fn();
		const { controller } = createController({ toolbar, onOverflowChange: onChange });

		const items: ToolbarItem[] = [makeItem('bold'), makeItem('italic')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLElement | null = toolbar.querySelector('.notectl-toolbar-overflow-btn');
		expect(overflowBtn?.classList.contains('notectl-toolbar-overflow-btn--hidden')).toBe(true);

		expect(onChange).toHaveBeenCalledWith(
			buttons.map((b) => b.element),
			null,
		);

		controller.destroy();
	});

	it('hides overflowing items and shows overflow button when toolbar is narrow', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 100, configurable: true });

		const onChange = vi.fn();
		const { controller } = createController({ toolbar, onOverflowChange: onChange });

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b'), makeItem('c'), makeItem('d')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLElement | null = toolbar.querySelector('.notectl-toolbar-overflow-btn');
		expect(overflowBtn?.classList.contains('notectl-toolbar-overflow-btn--hidden')).toBe(false);

		const hiddenCount: number = buttons.filter((b) =>
			b.element.classList.contains('notectl-toolbar-btn--overflow-hidden'),
		).length;
		expect(hiddenCount).toBeGreaterThan(0);

		controller.destroy();
	});

	it('opens dropdown on overflow button click and renders hidden items', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 80, configurable: true });

		const { controller } = createController({
			toolbar,
			getActiveElement: () => document.activeElement,
		});

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b'), makeItem('c')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLButtonElement | null = toolbar.querySelector(
			'.notectl-toolbar-overflow-btn',
		);
		expect(overflowBtn).not.toBeNull();

		overflowBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		const dropdown: HTMLElement | null = document.querySelector('.notectl-toolbar-popup');
		expect(dropdown).not.toBeNull();
		expect(dropdown?.getAttribute('role')).toBe('menu');

		const menuItems: NodeListOf<Element> | undefined =
			dropdown?.querySelectorAll('[role="menuitem"]');
		expect(menuItems?.length).toBeGreaterThan(0);

		controller.destroy();
	});

	it('executes command when overflow menu item is clicked', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		const executeCommand = vi.fn();
		const context: PluginContext = createMockContext({ executeCommand });

		const { controller } = createController({
			toolbar,
			context,
			getActiveElement: () => document.activeElement,
		});

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLButtonElement | null = toolbar.querySelector(
			'.notectl-toolbar-overflow-btn',
		);
		overflowBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		const menuItems: NodeListOf<Element> = document.querySelectorAll('.notectl-dropdown__item');
		expect(menuItems.length).toBeGreaterThan(0);

		const firstMenuItem: HTMLElement = menuItems[0] as HTMLElement;
		firstMenuItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

		expect(executeCommand).toHaveBeenCalled();

		controller.destroy();
	});

	it('calls onItemActivated for popup items instead of executeCommand', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		const onItemActivated = vi.fn();

		const { controller } = createController({
			toolbar,
			onItemActivated,
			getActiveElement: () => document.activeElement,
		});

		const popupItem: ToolbarItem = {
			id: 'table',
			group: 'insert',
			icon: '<svg></svg>',
			label: 'Table',
			command: 'insertTable',
			popupType: 'gridPicker',
			popupConfig: { maxRows: 6, maxCols: 6, onSelect: vi.fn() },
		};
		const items: ToolbarItem[] = [makeItem('a'), popupItem];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLButtonElement | null = toolbar.querySelector(
			'.notectl-toolbar-overflow-btn',
		);
		overflowBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		const dropdown: HTMLElement | null = document.querySelector('.notectl-toolbar-popup');
		expect(dropdown).not.toBeNull();
		const tableItem: HTMLElement | null =
			dropdown?.querySelector('[data-toolbar-item="table"]') ?? null;
		expect(tableItem).not.toBeNull();
		tableItem?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

		expect(onItemActivated).toHaveBeenCalledWith(
			expect.any(HTMLButtonElement),
			expect.objectContaining({ id: 'table' }),
		);

		controller.destroy();
	});

	it('closes dropdown on Escape and refocuses overflow button', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		let activeEl: Element | null = null;
		const { controller } = createController({
			toolbar,
			getActiveElement: () => activeEl,
		});

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLButtonElement | null = toolbar.querySelector(
			'.notectl-toolbar-overflow-btn',
		);
		overflowBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		const dropdown: HTMLElement | null = document.querySelector('.notectl-toolbar-popup');
		expect(dropdown).not.toBeNull();

		const firstItem: HTMLElement | null = dropdown?.querySelector(
			'[role="menuitem"]',
		) as HTMLElement | null;
		activeEl = firstItem;

		dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		const dropdownAfter: HTMLElement | null = document.querySelector('.notectl-toolbar-popup');
		expect(dropdownAfter).toBeNull();
		expect(overflowBtn?.getAttribute('aria-expanded')).toBe('false');

		controller.destroy();
	});

	it('navigates dropdown items with ArrowDown/ArrowUp', () => {
		const toolbar: HTMLElement = createToolbar();
		// Very narrow: all 3 buttons overflow (32*3 + 2*2 = 100 > 50 - 36 = 14)
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		let activeEl: Element | null = null;
		const { controller } = createController({
			toolbar,
			getActiveElement: () => activeEl,
		});

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b'), makeItem('c')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLButtonElement | null = toolbar.querySelector(
			'.notectl-toolbar-overflow-btn',
		);
		overflowBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		const dropdown: HTMLElement | null = document.querySelector('.notectl-toolbar-popup');
		expect(dropdown).not.toBeNull();

		const menuItems: HTMLElement[] = Array.from(
			dropdown?.querySelectorAll('[role="menuitem"]') ?? [],
		) as HTMLElement[];
		expect(menuItems.length).toBeGreaterThanOrEqual(2);

		activeEl = menuItems[0] ?? null;
		const secondItem: HTMLElement = menuItems[1] as HTMLElement;
		const focusSpy = vi.spyOn(secondItem, 'focus');

		dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

		expect(focusSpy).toHaveBeenCalled();

		controller.destroy();
	});

	it('hides trailing separators when items after them overflow', () => {
		const toolbar: HTMLElement = createToolbar();
		// 1 btn (32) + gap (2) + sep (9) + gap (2) + 1 btn (32) = 77
		// available = 90 - 34 (overflow btn) - 2 (gap) = 54 → first btn fits, separator+second don't
		Object.defineProperty(toolbar, 'clientWidth', { value: 90, configurable: true });

		const { controller } = createController({ toolbar });

		const item1 = makeButton(makeItem('a'));
		const sep = createSeparator();
		const item2 = makeButton(makeItem('b'));

		toolbar.appendChild(item1.element);
		toolbar.appendChild(sep);
		toolbar.appendChild(item2.element);

		controller.update([item1, item2]);

		// item2 overflows, so the separator should also be hidden
		expect(item2.element.classList.contains('notectl-toolbar-btn--overflow-hidden')).toBe(true);
		expect(sep.classList.contains('notectl-toolbar-separator--overflow-hidden')).toBe(true);

		controller.destroy();
	});

	it('recalculates on resize', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', {
			value: 500,
			configurable: true,
			writable: true,
		});

		const onChange = vi.fn();
		const { controller } = createController({ toolbar, onOverflowChange: onChange });

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b'), makeItem('c')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);
		onChange.mockClear();

		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });
		resizeCallback?.();

		expect(onChange).toHaveBeenCalled();

		controller.destroy();
	});

	it('does not attach manual close listener after destroy before the deferred registration fires', () => {
		vi.useFakeTimers();
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		const addSpy = vi.spyOn(document, 'addEventListener');
		const { controller } = createController({
			toolbar,
			getActiveElement: () => document.activeElement,
		});

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLButtonElement | null = toolbar.querySelector(
			'.notectl-toolbar-overflow-btn',
		);
		overflowBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		controller.destroy();
		vi.runAllTimers();

		const mousedownAdds = addSpy.mock.calls.filter((call) => call[0] === 'mousedown');
		expect(mousedownAdds).toHaveLength(0);

		addSpy.mockRestore();
		vi.useRealTimers();
	});

	it('sets aria-label on overflow button from config', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		const { controller } = createController({
			toolbar,
			ariaLabel: 'Weitere Werkzeuge',
		});

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const overflowBtn: HTMLElement | null = toolbar.querySelector('.notectl-toolbar-overflow-btn');
		expect(overflowBtn?.getAttribute('aria-label')).toBe('Weitere Werkzeuge');

		controller.destroy();
	});

	it('performs all width reads before classList writes', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 100, configurable: true });

		const { controller } = createController({ toolbar });

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b'), makeItem('c'), makeItem('d')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		// Track ordering of offsetWidth reads vs classList.add writes
		const ops: string[] = [];
		for (const b of buttons) {
			const origDescriptor =
				Object.getOwnPropertyDescriptor(b.element, 'offsetWidth') ??
				Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
			Object.defineProperty(b.element, 'offsetWidth', {
				get() {
					ops.push('read');
					return origDescriptor?.value ?? 32;
				},
				configurable: true,
			});
			const origAdd = b.element.classList.add.bind(b.element.classList);
			b.element.classList.add = (...args: string[]) => {
				if (args.includes('notectl-toolbar-btn--overflow-hidden')) {
					ops.push('write');
				}
				origAdd(...args);
			};
		}

		controller.update(buttons);

		// All reads should come before all writes
		const lastReadIndex: number = ops.lastIndexOf('read');
		const firstWriteIndex: number = ops.indexOf('write');
		if (firstWriteIndex !== -1) {
			expect(lastReadIndex).toBeLessThan(firstWriteIndex);
		}

		controller.destroy();
	});

	it('cleans up on destroy', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		const { controller } = createController({ toolbar });

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);
		controller.destroy();

		const overflowBtn: HTMLElement | null = toolbar.querySelector('.notectl-toolbar-overflow-btn');
		expect(overflowBtn).toBeNull();
	});

	it('includes overflow button in onChange when overflow items exist', () => {
		const toolbar: HTMLElement = createToolbar();
		Object.defineProperty(toolbar, 'clientWidth', { value: 50, configurable: true });

		const onChange = vi.fn();
		const { controller } = createController({ toolbar, onOverflowChange: onChange });

		const items: ToolbarItem[] = [makeItem('a'), makeItem('b'), makeItem('c')];
		const buttons = items.map((item) => {
			const b = makeButton(item);
			toolbar.appendChild(b.element);
			return b;
		});

		controller.update(buttons);

		const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
		const overflowBtn = lastCall?.[1];
		expect(overflowBtn).toBeInstanceOf(HTMLButtonElement);
		expect(overflowBtn.classList.contains('notectl-toolbar-overflow-btn')).toBe(true);

		controller.destroy();
	});

	// --- Group-aware overflow ---

	describe('group-aware overflow', () => {
		function createGroup(width: number): HTMLDivElement {
			const group: HTMLDivElement = document.createElement('div');
			group.className = 'notectl-toolbar-group';
			group.setAttribute('part', 'toolbar-group');
			Object.defineProperty(group, 'offsetWidth', { value: width, configurable: true });
			return group;
		}

		function appendInGroup(
			toolbar: HTMLElement,
			group: HTMLDivElement,
			items: readonly ToolbarItem[],
		): { element: HTMLButtonElement; item: ToolbarItem }[] {
			const out: { element: HTMLButtonElement; item: ToolbarItem }[] = [];
			for (const item of items) {
				const b = makeButton(item);
				group.appendChild(b.element);
				out.push(b);
			}
			toolbar.appendChild(group);
			return out;
		}

		it('keeps an entire group together when it fits', () => {
			const toolbar: HTMLElement = createToolbar();
			Object.defineProperty(toolbar, 'clientWidth', { value: 500, configurable: true });
			const { controller } = createController({ toolbar });

			const group = createGroup(66); // 2 buttons * 32 + 2 gap
			const buttons = appendInGroup(toolbar, group, [makeItem('bold'), makeItem('italic')]);

			controller.update(buttons);

			expect(group.classList.contains('notectl-toolbar-group--overflow-hidden')).toBe(false);
			for (const b of buttons) {
				expect(b.element.classList.contains('notectl-toolbar-btn--overflow-hidden')).toBe(false);
			}

			controller.destroy();
		});

		it('hides the entire trailing group when any of its buttons would not fit', () => {
			const toolbar: HTMLElement = createToolbar();
			// Available = 100, max = 100 - 34 (overflow btn) - 2 (gap) = 64
			Object.defineProperty(toolbar, 'clientWidth', { value: 100, configurable: true });
			const { controller } = createController({ toolbar });

			const groupA = createGroup(34); // fits: 32+2
			const sep = createSeparator();
			const groupB = createGroup(66); // 2 buttons — would overflow

			const buttonsA = appendInGroup(toolbar, groupA, [makeItem('bold')]);
			toolbar.appendChild(sep);
			const buttonsB = appendInGroup(toolbar, groupB, [makeItem('h1'), makeItem('h2')]);
			const allButtons = [...buttonsA, ...buttonsB];

			controller.update(allButtons);

			expect(groupA.classList.contains('notectl-toolbar-group--overflow-hidden')).toBe(false);
			expect(groupB.classList.contains('notectl-toolbar-group--overflow-hidden')).toBe(true);

			// Both buttons of group B should be marked overflow-hidden (group as a unit)
			for (const b of buttonsB) {
				expect(b.element.classList.contains('notectl-toolbar-btn--overflow-hidden')).toBe(true);
			}
			// Button in group A stays visible
			expect(buttonsA[0]?.element.classList.contains('notectl-toolbar-btn--overflow-hidden')).toBe(
				false,
			);

			controller.destroy();
		});

		it('overflowed group buttons appear in the dropdown when opened', () => {
			const toolbar: HTMLElement = createToolbar();
			Object.defineProperty(toolbar, 'clientWidth', { value: 100, configurable: true });
			const { controller } = createController({
				toolbar,
				getActiveElement: () => document.activeElement,
			});

			const groupA = createGroup(34);
			const sep = createSeparator();
			const groupB = createGroup(66);

			const buttonsA = appendInGroup(toolbar, groupA, [makeItem('bold')]);
			toolbar.appendChild(sep);
			const buttonsB = appendInGroup(toolbar, groupB, [makeItem('h1'), makeItem('h2')]);

			controller.update([...buttonsA, ...buttonsB]);

			const overflowBtn: HTMLButtonElement | null = toolbar.querySelector(
				'.notectl-toolbar-overflow-btn',
			);
			expect(overflowBtn).not.toBeNull();
			overflowBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

			const menuItems: NodeListOf<Element> = document.querySelectorAll('.notectl-dropdown__item');
			const ids: string[] = Array.from(menuItems).map(
				(m) => m.getAttribute('data-toolbar-item') ?? '',
			);
			expect(ids).toEqual(['h1', 'h2']);

			controller.destroy();
		});

		it('hides the trailing separator after the last visible group', () => {
			const toolbar: HTMLElement = createToolbar();
			Object.defineProperty(toolbar, 'clientWidth', { value: 100, configurable: true });
			const { controller } = createController({ toolbar });

			const groupA = createGroup(34);
			const sep = createSeparator();
			const groupB = createGroup(66);

			const buttonsA = appendInGroup(toolbar, groupA, [makeItem('bold')]);
			toolbar.appendChild(sep);
			const buttonsB = appendInGroup(toolbar, groupB, [makeItem('h1'), makeItem('h2')]);

			controller.update([...buttonsA, ...buttonsB]);

			expect(sep.classList.contains('notectl-toolbar-separator--overflow-hidden')).toBe(true);

			controller.destroy();
		});
	});
});
