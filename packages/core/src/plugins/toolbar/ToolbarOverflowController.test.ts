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
});
