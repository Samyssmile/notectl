import { describe, expect, it } from 'vitest';
import type { ContainingBlockOffset } from './PopupPositioning.js';
import { appendToRoot, measureContainingBlockOffset, positionPopup } from './PopupPositioning.js';

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

		it('below-start RTL anchors to right edge', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(100, 50, 80, 30);

			positionPopup(popup, anchor, { position: 'below-start', isRtl: true });

			expect(popup.style.position).toBe('fixed');
			expect(popup.style.left).toBe('auto');
			// right = vpWidth - anchor.right
			expect(popup.style.right).toBeDefined();
			expect(popup.style.right).not.toBe('auto');
		});

		it('below-start LTR anchors to left edge (unchanged)', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(100, 50, 80, 30);

			positionPopup(popup, anchor, { position: 'below-start', isRtl: false });

			expect(popup.style.left).toBe('100px');
			expect(popup.style.right).toBe('auto');
		});

		it('below-end RTL anchors to left edge', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(100, 50, 80, 30);

			positionPopup(popup, anchor, { position: 'below-end', isRtl: true });

			expect(popup.style.position).toBe('fixed');
			expect(popup.style.left).toBe('100px');
			expect(popup.style.right).toBe('auto');
		});

		it('below-end LTR anchors to right edge (unchanged)', () => {
			const popup: HTMLDivElement = document.createElement('div');
			const anchor = new DOMRect(100, 50, 80, 30);

			positionPopup(popup, anchor, { position: 'below-end', isRtl: false });

			expect(popup.style.position).toBe('fixed');
			expect(popup.style.right).not.toBe('auto');
			expect(popup.style.left).toBe('auto');
		});
	});

	describe('measureContainingBlockOffset', () => {
		it('returns zero offset when no containing-block ancestor exists', () => {
			const popup: HTMLDivElement = document.createElement('div');
			popup.style.position = 'fixed';
			document.body.appendChild(popup);

			// happy-dom has no layout engine, so we mock getBoundingClientRect
			// to simulate a real browser with no containing-block ancestor:
			// - Left probe (left:0): rect at (0, 0)
			// - Right probe (right:0): rect flush against right viewport edge
			const vpWidth: number = window.innerWidth;
			let probeCall = 0;
			popup.getBoundingClientRect = (): DOMRect => {
				probeCall++;
				if (probeCall === 1) return new DOMRect(0, 0, 0, 0);
				return new DOMRect(vpWidth, 0, 0, vpWidth);
			};

			const offset: ContainingBlockOffset = measureContainingBlockOffset(popup);

			expect(offset.x).toBe(0);
			expect(offset.y).toBe(0);
			expect(offset.rightX).toBe(0);

			popup.remove();
		});

		it('preserves previous inline styles after probing', () => {
			const popup: HTMLDivElement = document.createElement('div');
			popup.style.position = 'fixed';
			popup.style.top = '50px';
			popup.style.left = '100px';
			popup.style.right = '20px';
			document.body.appendChild(popup);

			measureContainingBlockOffset(popup);

			expect(popup.style.top).toBe('50px');
			expect(popup.style.left).toBe('100px');
			expect(popup.style.right).toBe('20px');

			popup.remove();
		});
	});

	describe('asymmetric containing block compensation', () => {
		/**
		 * Creates a popup whose getBoundingClientRect returns different values
		 * for the left-probe and right-probe, simulating an asymmetric
		 * containing block (e.g. `transform` ancestor with `margin-left: 200px`).
		 *
		 * happy-dom doesn't actually shift fixed elements inside transforms,
		 * so we mock getBoundingClientRect to simulate the two-probe behavior.
		 */
		function createAsymmetricPopup(
			cbLeftOffset: number,
			cbRightOffset: number,
			cbTopOffset: number,
			popupWidth: number,
			popupHeight: number,
		): HTMLDivElement {
			const popup: HTMLDivElement = document.createElement('div');
			Object.defineProperty(popup, 'offsetWidth', { value: popupWidth });
			Object.defineProperty(popup, 'offsetHeight', { value: popupHeight });

			let callCount = 0;
			popup.getBoundingClientRect = (): DOMRect => {
				callCount++;
				if (callCount === 1) {
					// Left probe: left=0, right=auto → rect.left = cbLeftOffset
					return new DOMRect(cbLeftOffset, cbTopOffset, popupWidth, popupHeight);
				}
				// Right probe: left=auto, right=0 → rect.right = vpWidth - cbRightOffset
				const vpWidth: number = window.innerWidth;
				const rectRight: number = vpWidth - cbRightOffset;
				return new DOMRect(rectRight - popupWidth, cbTopOffset, popupWidth, rectRight);
			};

			return popup;
		}

		it('measureContainingBlockOffset returns distinct rightX for asymmetric CB', () => {
			const popup: HTMLDivElement = createAsymmetricPopup(200, 340, 0, 100, 40);
			document.body.appendChild(popup);

			const offset: ContainingBlockOffset = measureContainingBlockOffset(popup);

			expect(offset.x).toBe(200);
			expect(offset.rightX).toBe(340);
			expect(offset.y).toBe(0);

			popup.remove();
		});

		it('below-start RTL compensates with rightX in asymmetric CB', () => {
			const popup: HTMLDivElement = createAsymmetricPopup(200, 340, 0, 100, 40);
			document.body.appendChild(popup);

			const anchor = new DOMRect(400, 50, 80, 30);
			positionPopup(popup, anchor, { position: 'below-start', isRtl: true });

			// right = vpWidth - anchor.right = 1024 - 480 = 544
			// compensated right = 544 - rightX(340) = 204
			const vpWidth: number = window.innerWidth;
			const expectedRight: number = vpWidth - anchor.right - 340;
			expect(popup.style.right).toBe(`${expectedRight}px`);
			expect(popup.style.left).toBe('auto');

			popup.remove();
		});

		it('below-end LTR compensates with rightX in asymmetric CB', () => {
			const popup: HTMLDivElement = createAsymmetricPopup(200, 340, 0, 100, 40);
			document.body.appendChild(popup);

			const anchor = new DOMRect(400, 50, 80, 30);
			positionPopup(popup, anchor, { position: 'below-end', isRtl: false });

			// right = vpWidth - anchor.right = 1024 - 480 = 544
			// compensated right = 544 - rightX(340) = 204
			const vpWidth: number = window.innerWidth;
			const expectedRight: number = vpWidth - anchor.right - 340;
			expect(popup.style.right).toBe(`${expectedRight}px`);
			expect(popup.style.left).toBe('auto');

			popup.remove();
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
