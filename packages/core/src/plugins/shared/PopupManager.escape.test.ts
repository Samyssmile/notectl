import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopupManager } from './PopupManager.js';

describe('PopupManager Escape handling', () => {
	const managers: PopupManager[] = [];
	const controls: HTMLElement[] = [];

	afterEach(() => {
		for (const manager of managers.splice(0)) manager.destroy();
		for (const control of controls.splice(0)) control.remove();
	});

	function setup(): { manager: PopupManager; trigger: HTMLButtonElement } {
		const manager: PopupManager = new PopupManager(document.body);
		const trigger: HTMLButtonElement = document.createElement('button');
		managers.push(manager);
		controls.push(trigger);
		document.body.append(trigger);
		return { manager, trigger };
	}

	function pressEscape(element: HTMLElement): KeyboardEvent {
		const event: KeyboardEvent = new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true,
		});
		element.dispatchEvent(event);
		return event;
	}

	it('lets a container feature handler prevent the default dismissal', () => {
		const { manager, trigger } = setup();
		const onClose = vi.fn();
		const handle = manager.open({
			anchor: trigger,
			restoreFocusTo: trigger,
			onClose,
			content(container) {
				container.addEventListener('keydown', (event) => event.preventDefault());
			},
		});

		pressEscape(handle.getElement());

		expect(manager.isOpen()).toBe(true);
		expect(onClose).not.toHaveBeenCalled();
	});

	for (const preventDefault of [false, true]) {
		it(`honors a feature focus override with preventDefault=${preventDefault}`, () => {
			const { manager, trigger } = setup();
			const other: HTMLButtonElement = document.createElement('button');
			controls.push(other);
			document.body.append(other);
			const onClose = vi.fn();
			const handle = manager.open({
				anchor: trigger,
				restoreFocusTo: trigger,
				onClose,
				content(container, close) {
					container.addEventListener('keydown', (event) => {
						if (preventDefault) event.preventDefault();
						close({ restoreFocusTo: other });
					});
				},
			});

			pressEscape(handle.getElement());

			expect(manager.isOpen()).toBe(false);
			expect(document.activeElement).toBe(other);
			expect(onClose).toHaveBeenCalledOnce();
		});
	}

	it('allows a feature to dismiss without restoring focus', () => {
		const { manager, trigger } = setup();
		const focus = vi.spyOn(trigger, 'focus');
		const handle = manager.open({
			anchor: trigger,
			restoreFocusTo: trigger,
			content(container, close) {
				container.addEventListener('keydown', () => close({ restoreFocusTo: null }));
			},
		});

		pressEscape(handle.getElement());

		expect(manager.isOpen()).toBe(false);
		expect(focus).not.toHaveBeenCalled();
	});

	it('dismisses only the topmost popup and restores its default focus target', () => {
		const { manager, trigger } = setup();
		const parent = manager.open({ anchor: trigger, content() {} });
		const child = manager.open({
			anchor: trigger,
			parent,
			restoreFocusTo: trigger,
			content() {},
		});

		pressEscape(parent.getElement());
		expect(child.getElement().isConnected).toBe(true);
		const event = pressEscape(child.getElement());

		expect(event.defaultPrevented).toBe(true);
		expect(child.getElement().isConnected).toBe(false);
		expect(parent.getElement().isConnected).toBe(true);
		expect(document.activeElement).toBe(trigger);
	});
});
