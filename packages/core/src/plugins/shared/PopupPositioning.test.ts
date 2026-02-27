import { describe, expect, it } from 'vitest';
import { appendToRoot, positionPopup } from './PopupPositioning.js';

describe('PopupPositioning', () => {
	describe('positionPopup', () => {
		it('positions below-start with correct top and left', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(100, 50, 80, 30);

			positionPopup(popup, anchor, { position: 'below-start' });

			expect(popup.style.position).toBe('fixed');
			expect(popup.style.zIndex).toBe('10000');
			expect(popup.style.top).toBe('82px'); // bottom(50+30) + 2 offset
			expect(popup.style.left).toBe('100px');
		});

		it('positions below-end with right alignment', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(700, 50, 80, 30);

			positionPopup(popup, anchor, { position: 'below-end' });

			expect(popup.style.position).toBe('fixed');
			expect(popup.style.left).toBe('auto');
			// right edge calculation depends on window.innerWidth
		});

		it('positions right of anchor', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(100, 200, 80, 30);

			positionPopup(popup, anchor, { position: 'right' });

			expect(popup.style.position).toBe('fixed');
			expect(popup.style.top).toBe('200px');
			expect(popup.style.left).toBe('182px'); // 100 + 80 + 2 offset
		});

		it('uses custom offset', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(100, 50, 80, 30);

			positionPopup(popup, anchor, { position: 'below-start', offset: 10 });

			expect(popup.style.top).toBe('90px'); // bottom(50+30) + 10
			expect(popup.style.left).toBe('100px');
		});

		it('always sets fixed positioning and z-index', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(0, 0, 100, 30);

			positionPopup(popup, anchor, { position: 'below-start' });

			expect(popup.style.position).toBe('fixed');
			expect(popup.style.zIndex).toBe('10000');
		});
	});

	describe('appendToRoot', () => {
		it('appends to document.body when reference is in document', () => {
			const element: HTMLDivElement = document.createElement('div');
			const reference: HTMLDivElement = document.createElement('div');
			document.body.appendChild(reference);

			appendToRoot(element, reference);

			expect(element.parentNode).toBe(document.body);

			element.remove();
			reference.remove();
		});

		it('appends to shadow root when reference is inside one', () => {
			const host: HTMLDivElement = document.createElement('div');
			document.body.appendChild(host);
			const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
			const reference: HTMLDivElement = document.createElement('div');
			shadow.appendChild(reference);

			const element: HTMLDivElement = document.createElement('div');
			appendToRoot(element, reference);

			expect(element.parentNode).toBe(shadow);

			host.remove();
		});
	});
});
