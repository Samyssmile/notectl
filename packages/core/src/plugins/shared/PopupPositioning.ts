/**
 * Shared popup positioning logic. Positions a popup element relative to an
 * anchor rectangle, clamping to the viewport. Also provides a shadow DOM-aware
 * append helper.
 */

import { setStyleProperties } from '../../style/StyleRuntime.js';

// --- Types ---

export type PopupPosition = 'below-start' | 'below-end' | 'right';

export interface PositionOptions {
	readonly position: PopupPosition;
	readonly offset?: number;
	readonly isRtl?: boolean;
}

// --- Constants ---

const DEFAULT_OFFSET = 2;
const Z_INDEX = '10000';
const POPUP_MIN_MARGIN = 4;

// --- Positioning ---

/**
 * Positions a popup element relative to the given anchor rectangle.
 * Uses fixed positioning and clamps to the viewport edges.
 */
export function positionPopup(popup: HTMLElement, anchor: DOMRect, options: PositionOptions): void {
	const offset: number = options.offset ?? DEFAULT_OFFSET;
	const vpWidth: number = window.innerWidth;
	const vpHeight: number = window.innerHeight;

	// Apply fixed positioning first so offsetWidth/offsetHeight reflect
	// shrink-to-fit sizing rather than normal-flow block width.
	setStyleProperties(popup, { position: 'fixed', zIndex: Z_INDEX });

	const popupWidth: number = popup.offsetWidth;
	const popupHeight: number = popup.offsetHeight;

	const styles: Record<string, string> = {};

	switch (options.position) {
		case 'below-start': {
			let top: number = anchor.bottom + offset;

			if (options.isRtl) {
				// RTL: anchor to physical right edge (visual start)
				let right: number = vpWidth - anchor.right;
				if (right + popupWidth > vpWidth - POPUP_MIN_MARGIN) {
					right = vpWidth - popupWidth - POPUP_MIN_MARGIN;
				}
				if (top + popupHeight > vpHeight - POPUP_MIN_MARGIN) {
					top = anchor.top - popupHeight - offset;
				}
				if (right < POPUP_MIN_MARGIN) right = POPUP_MIN_MARGIN;
				if (top < POPUP_MIN_MARGIN) top = POPUP_MIN_MARGIN;
				styles.top = `${top}px`;
				styles.right = `${right}px`;
				styles.left = 'auto';
			} else {
				let left: number = anchor.left;
				if (left + popupWidth > vpWidth - POPUP_MIN_MARGIN) {
					left = vpWidth - popupWidth - POPUP_MIN_MARGIN;
				}
				if (top + popupHeight > vpHeight - POPUP_MIN_MARGIN) {
					top = anchor.top - popupHeight - offset;
				}
				if (left < POPUP_MIN_MARGIN) left = POPUP_MIN_MARGIN;
				if (top < POPUP_MIN_MARGIN) top = POPUP_MIN_MARGIN;
				styles.top = `${top}px`;
				styles.left = `${left}px`;
				styles.right = 'auto';
			}
			break;
		}
		case 'below-end': {
			let top: number = anchor.bottom + offset;

			if (options.isRtl) {
				// RTL: "end" = physical left edge
				let left: number = anchor.left;
				if (left + popupWidth > vpWidth - POPUP_MIN_MARGIN) {
					left = vpWidth - popupWidth - POPUP_MIN_MARGIN;
				}
				if (top + popupHeight > vpHeight - POPUP_MIN_MARGIN) {
					top = anchor.top - popupHeight - offset;
				}
				if (left < POPUP_MIN_MARGIN) left = POPUP_MIN_MARGIN;
				if (top < POPUP_MIN_MARGIN) top = POPUP_MIN_MARGIN;
				styles.top = `${top}px`;
				styles.left = `${left}px`;
				styles.right = 'auto';
			} else {
				// LTR: "end" = physical right edge
				let right: number = vpWidth - anchor.right;
				if (right + popupWidth > vpWidth - POPUP_MIN_MARGIN) {
					right = vpWidth - popupWidth - POPUP_MIN_MARGIN;
				}
				if (top + popupHeight > vpHeight - POPUP_MIN_MARGIN) {
					top = anchor.top - popupHeight - offset;
				}
				if (right < POPUP_MIN_MARGIN) right = POPUP_MIN_MARGIN;
				if (top < POPUP_MIN_MARGIN) top = POPUP_MIN_MARGIN;
				styles.top = `${top}px`;
				styles.right = `${right}px`;
				styles.left = 'auto';
			}
			break;
		}
		case 'right': {
			let top: number = anchor.top;

			if (options.isRtl) {
				// RTL: open submenu to the physical left
				let left: number = anchor.left - popupWidth - offset;
				if (left < POPUP_MIN_MARGIN) {
					left = anchor.right + offset;
				}
				if (top + popupHeight > vpHeight - POPUP_MIN_MARGIN) {
					top = vpHeight - popupHeight - POPUP_MIN_MARGIN;
				}
				if (left < POPUP_MIN_MARGIN) left = POPUP_MIN_MARGIN;
				if (top < POPUP_MIN_MARGIN) top = POPUP_MIN_MARGIN;
				styles.top = `${top}px`;
				styles.left = `${left}px`;
				styles.right = 'auto';
			} else {
				let left: number = anchor.right + offset;
				if (left + popupWidth > vpWidth - POPUP_MIN_MARGIN) {
					left = anchor.left - popupWidth - offset;
				}
				if (top + popupHeight > vpHeight - POPUP_MIN_MARGIN) {
					top = vpHeight - popupHeight - POPUP_MIN_MARGIN;
				}
				if (left < POPUP_MIN_MARGIN) left = POPUP_MIN_MARGIN;
				if (top < POPUP_MIN_MARGIN) top = POPUP_MIN_MARGIN;
				styles.top = `${top}px`;
				styles.left = `${left}px`;
				styles.right = 'auto';
			}
			break;
		}
	}

	setStyleProperties(popup, styles);
}

/**
 * Appends an element to the appropriate root: the shadow root if the
 * reference node lives inside one, otherwise `document.body`.
 */
export function appendToRoot(element: HTMLElement, referenceNode: Node): void {
	const root: Node = referenceNode.getRootNode();
	if (root instanceof ShadowRoot) {
		root.appendChild(element);
	} else {
		document.body.appendChild(element);
	}
}
