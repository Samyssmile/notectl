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

export interface ContainingBlockOffset {
	readonly x: number;
	readonly y: number;
	readonly rightX: number;
}

// --- Constants ---

const DEFAULT_OFFSET = 2;
const Z_INDEX = '10000';
const POPUP_MIN_MARGIN = 4;

// --- Containing Block Offset ---

/**
 * Measures the offset between the popup's CSS containing block and the
 * viewport. When an ancestor has `transform`, `will-change: transform`,
 * `filter`, or `perspective`, `position: fixed` resolves relative to that
 * ancestor — not the viewport. This probe detects the shift so callers
 * can compensate.
 *
 * Technique: temporarily set `top: 0; left: 0` on the fixed-position
 * element and read `getBoundingClientRect()`. If no containing-block
 * ancestor exists the rect origin is `(0, 0)`; otherwise it equals the
 * ancestor's offset.
 */
export function measureContainingBlockOffset(popup: HTMLElement): ContainingBlockOffset {
	const prevTop: string = popup.style.top;
	const prevLeft: string = popup.style.left;
	const prevRight: string = popup.style.right;

	// Probe 1: left-edge offset
	popup.style.top = '0px';
	popup.style.left = '0px';
	popup.style.right = 'auto';

	const leftRect: DOMRect = popup.getBoundingClientRect();
	const x: number = leftRect.left;
	const y: number = leftRect.top;

	// Probe 2: right-edge offset
	popup.style.left = 'auto';
	popup.style.right = '0px';

	const rightRect: DOMRect = popup.getBoundingClientRect();
	const rightX: number = window.innerWidth - rightRect.right;

	popup.style.top = prevTop;
	popup.style.left = prevLeft;
	popup.style.right = prevRight;

	return { x, y, rightX };
}

// --- Positioning ---

/**
 * Positions a popup element relative to the given anchor rectangle.
 * Uses fixed positioning and clamps to the viewport edges.
 * Automatically compensates for ancestors that create a new containing
 * block (e.g. `transform`, `will-change: transform`).
 */
export function positionPopup(popup: HTMLElement, anchor: DOMRect, options: PositionOptions): void {
	const offset: number = options.offset ?? DEFAULT_OFFSET;
	const vpWidth: number = window.innerWidth;
	const vpHeight: number = window.innerHeight;

	// Apply fixed positioning first so offsetWidth/offsetHeight reflect
	// shrink-to-fit sizing rather than normal-flow block width.
	setStyleProperties(popup, { position: 'fixed', zIndex: Z_INDEX });

	// Detect containing-block offset caused by ancestor transforms etc.
	const cbOffset: ContainingBlockOffset = measureContainingBlockOffset(popup);

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
				styles.top = `${top - cbOffset.y}px`;
				styles.right = `${right - cbOffset.rightX}px`;
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
				styles.top = `${top - cbOffset.y}px`;
				styles.left = `${left - cbOffset.x}px`;
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
				styles.top = `${top - cbOffset.y}px`;
				styles.left = `${left - cbOffset.x}px`;
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
				styles.top = `${top - cbOffset.y}px`;
				styles.right = `${right - cbOffset.rightX}px`;
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
				styles.top = `${top - cbOffset.y}px`;
				styles.left = `${left - cbOffset.x}px`;
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
				styles.top = `${top - cbOffset.y}px`;
				styles.left = `${left - cbOffset.x}px`;
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
