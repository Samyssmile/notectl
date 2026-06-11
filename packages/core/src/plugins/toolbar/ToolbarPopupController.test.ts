import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '../Plugin.js';
import { PopupManager } from '../shared/PopupManager.js';
import type { ToolbarItem } from './ToolbarItem.js';
import { ToolbarPopupController } from './ToolbarPopupController.js';

/** Mutable holder so the popup's rendered button can be reported as "active". */
interface ActiveRef {
	el: HTMLElement | null;
}

/**
 * Opens a custom toolbar popup whose content is built by `render`, wiring a real
 * {@link PopupManager} and a controller whose active element is `ref.el`.
 */
function openCustomPopup(
	render: (popup: HTMLElement) => void,
	ref: ActiveRef,
): ToolbarPopupController {
	const controller = new ToolbarPopupController(() => ref.el);
	controller.setPopupManager(new PopupManager(document.body));
	const item: ToolbarItem = {
		id: 'test-custom',
		group: 'insert',
		icon: '<svg/>',
		label: 'Test',
		command: 'noop',
		popupType: 'custom',
		renderPopup: (popup: HTMLElement): void => render(popup),
	};
	const trigger: HTMLButtonElement = document.createElement('button');
	document.body.appendChild(trigger);
	controller.toggle(trigger, item, {} as PluginContext);
	return controller;
}

function pressKey(target: HTMLElement, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('ToolbarPopupController custom popup keyboard activation', () => {
	let controller: ToolbarPopupController | null = null;

	afterEach(() => {
		controller?.close();
		controller = null;
		document.body.innerHTML = '';
	});

	it('activates a click-based custom popup button on Enter and Space', () => {
		// The formula-palette convention: action on `click`; `mousedown` only guards
		// focus. Dispatching `mousedown` alone (the old behaviour) never activated these.
		const onActivate = vi.fn();
		const ref: ActiveRef = { el: null };
		controller = openCustomPopup((popup) => {
			const btn: HTMLButtonElement = document.createElement('button');
			btn.type = 'button';
			btn.addEventListener('mousedown', (e) => e.preventDefault());
			btn.addEventListener('click', onActivate);
			popup.appendChild(btn);
			ref.el = btn;
		}, ref);

		const button = ref.el as HTMLElement;
		pressKey(button, 'Enter');
		pressKey(button, ' ');

		expect(onActivate).toHaveBeenCalledTimes(2);
	});

	it('still activates a mousedown-based custom popup button (link/image convention)', () => {
		// These buttons run their action on `mousedown` and have no `click` action,
		// so the full press must keep activating them exactly once.
		const onMousedownAction = vi.fn();
		const ref: ActiveRef = { el: null };
		controller = openCustomPopup((popup) => {
			const btn: HTMLButtonElement = document.createElement('button');
			btn.type = 'button';
			btn.addEventListener('mousedown', (e) => {
				e.preventDefault();
				onMousedownAction();
			});
			popup.appendChild(btn);
			ref.el = btn;
		}, ref);

		pressKey(ref.el as HTMLElement, 'Enter');

		expect(onMousedownAction).toHaveBeenCalledTimes(1);
	});
});
