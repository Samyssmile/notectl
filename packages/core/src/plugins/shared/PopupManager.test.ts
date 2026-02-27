import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopupManager } from './PopupManager.js';

// --- Helpers ---

function createManager(): PopupManager {
	return new PopupManager(document.body);
}

// --- Tests ---

describe('PopupManager', () => {
	afterEach(() => {
		// Clean up any popups left in the DOM
		for (const el of document.querySelectorAll('.notectl-popup')) {
			el.remove();
		}
	});

	describe('open', () => {
		it('creates a popup element in the DOM', () => {
			const manager = createManager();
			const anchor = new DOMRect(100, 100, 80, 30);

			manager.open({
				anchor,
				content: () => {},
			});

			const popup = document.querySelector('.notectl-popup');
			expect(popup).not.toBeNull();
			manager.destroy();
		});

		it('adds custom className', () => {
			const manager = createManager();

			manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				className: 'my-popup',
				content: () => {},
			});

			const popup = document.querySelector('.notectl-popup.my-popup');
			expect(popup).not.toBeNull();
			manager.destroy();
		});

		it('sets ARIA role and label', () => {
			const manager = createManager();

			manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				ariaRole: 'menu',
				ariaLabel: 'Test menu',
				content: () => {},
			});

			const popup = document.querySelector('.notectl-popup');
			expect(popup?.getAttribute('role')).toBe('menu');
			expect(popup?.getAttribute('aria-label')).toBe('Test menu');
			manager.destroy();
		});

		it('calls content callback with container and close', () => {
			const manager = createManager();
			const contentFn = vi.fn();

			manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: contentFn,
			});

			expect(contentFn).toHaveBeenCalledOnce();
			expect(contentFn.mock.calls[0]?.[0]).toBeInstanceOf(HTMLDivElement);
			expect(typeof contentFn.mock.calls[0]?.[1]).toBe('function');
			manager.destroy();
		});

		it('returns a handle with close and getElement', () => {
			const manager = createManager();

			const handle = manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});

			expect(typeof handle.close).toBe('function');
			expect(handle.getElement()).toBeInstanceOf(HTMLDivElement);
			manager.destroy();
		});
	});

	describe('close', () => {
		it('removes popup from DOM via handle.close()', () => {
			const manager = createManager();

			const handle = manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});

			expect(document.querySelector('.notectl-popup')).not.toBeNull();
			handle.close();
			expect(document.querySelector('.notectl-popup')).toBeNull();
			manager.destroy();
		});

		it('calls onClose callback', () => {
			const manager = createManager();
			const onClose = vi.fn();

			const handle = manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
				onClose,
			});

			handle.close();
			expect(onClose).toHaveBeenCalledOnce();
			manager.destroy();
		});

		it('manager.close() closes topmost popup', () => {
			const manager = createManager();

			manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});

			expect(manager.isOpen()).toBe(true);
			manager.close();
			expect(manager.isOpen()).toBe(false);
			manager.destroy();
		});
	});

	describe('closeAll', () => {
		it('closes all open popups', () => {
			const manager = createManager();

			manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});
			manager.open({
				anchor: new DOMRect(100, 100, 80, 30),
				content: () => {},
			});

			expect(document.querySelectorAll('.notectl-popup').length).toBe(2);
			manager.closeAll();
			expect(document.querySelectorAll('.notectl-popup').length).toBe(0);
			manager.destroy();
		});
	});

	describe('isOpen', () => {
		it('returns false when no popups are open', () => {
			const manager = createManager();
			expect(manager.isOpen()).toBe(false);
			manager.destroy();
		});

		it('returns true when a popup is open', () => {
			const manager = createManager();

			manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});

			expect(manager.isOpen()).toBe(true);
			manager.destroy();
		});
	});

	describe('stacking', () => {
		it('supports multiple open popups', () => {
			const manager = createManager();

			const handle1 = manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});

			manager.open({
				anchor: new DOMRect(100, 100, 80, 30),
				parent: handle1,
				content: () => {},
			});

			expect(document.querySelectorAll('.notectl-popup').length).toBe(2);
			manager.destroy();
		});

		it('closing parent also closes child popups', () => {
			const manager = createManager();

			const handle1 = manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});

			manager.open({
				anchor: new DOMRect(100, 100, 80, 30),
				parent: handle1,
				content: () => {},
			});

			handle1.close();
			expect(document.querySelectorAll('.notectl-popup').length).toBe(0);
			manager.destroy();
		});
	});

	describe('focus management', () => {
		it('restores focus to restoreFocusTo element on close', () => {
			const manager = createManager();
			const trigger: HTMLButtonElement = document.createElement('button');
			document.body.appendChild(trigger);
			trigger.focus();

			const handle = manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				restoreFocusTo: trigger,
				content: () => {},
			});

			handle.close();
			expect(document.activeElement).toBe(trigger);

			trigger.remove();
			manager.destroy();
		});
	});

	describe('destroy', () => {
		it('closes all popups', () => {
			const manager = createManager();

			manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
			});

			manager.destroy();
			expect(document.querySelectorAll('.notectl-popup').length).toBe(0);
		});
	});

	describe('double close safety', () => {
		it('closing an already-closed handle is a no-op', () => {
			const manager = createManager();
			const onClose = vi.fn();

			const handle = manager.open({
				anchor: new DOMRect(0, 0, 80, 30),
				content: () => {},
				onClose,
			});

			handle.close();
			handle.close(); // Should not throw or call onClose again
			expect(onClose).toHaveBeenCalledOnce();
			manager.destroy();
		});
	});
});
