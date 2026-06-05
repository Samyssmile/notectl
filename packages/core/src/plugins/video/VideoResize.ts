/**
 * Pointer resize overlay for a selected video.
 *
 * Because the embed's aspect ratio is locked (height always follows width), only
 * the responsive width percentage changes — so the overlay exposes two side
 * handles rather than four corners, which communicates "resize width" honestly.
 * The handles are decorative (`aria-hidden`): keyboard resize is provided by the
 * plugin's shortcuts with live-region announcements, the accessible path.
 */

import { getStyleNonceForNode } from '../../style/StyleRuntime.js';

type SideHandle = 'w' | 'e';

const HANDLES: readonly SideHandle[] = ['w', 'e'];
/** +1 means dragging right grows width; -1 means dragging left grows it. */
const HANDLE_X_SIGN: Readonly<Record<SideHandle, 1 | -1>> = { w: -1, e: 1 };

/** Callbacks the overlay uses to read geometry and commit changes. */
export interface VideoResizeCallbacks {
	readonly minPercent: number;
	getWidthPercent(): number;
	/** Width of the 100%-reference container (the figure / content column). */
	getReferenceWidth(): number;
	isRtl(): boolean;
	/** Applies a width live during drag (no transaction). */
	applyLiveWidth(percent: number): void;
	/** Commits the final width as an undoable transaction. */
	commit(percent: number): void;
	/** Formats a percentage for the live size indicator. */
	formatPercent(percent: number): string;
}

let activeCursorStyle: HTMLStyleElement | null = null;

/** Forces an `ew-resize` cursor document-wide during a drag and disables selection. */
function setGlobalResizeCursor(referenceNode: Node): void {
	clearGlobalResizeCursor();
	activeCursorStyle = document.createElement('style');
	const nonce: string | undefined = getStyleNonceForNode(referenceNode);
	if (nonce) activeCursorStyle.setAttribute('nonce', nonce);
	activeCursorStyle.textContent = '*{cursor:ew-resize!important;user-select:none!important}';
	document.head.appendChild(activeCursorStyle);
}

function clearGlobalResizeCursor(): void {
	activeCursorStyle?.remove();
	activeCursorStyle = null;
}

/** A mounted resize overlay with a teardown handle. */
export interface VideoResizeOverlay {
	readonly element: HTMLElement;
	destroy(): void;
}

/**
 * Builds the resize overlay (two side handles + live size indicator + optional
 * keyboard hint) and wires pointer dragging. Returns the element to append and a
 * `destroy` that detaches global listeners.
 */
export function createVideoResizeOverlay(
	callbacks: VideoResizeCallbacks,
	keyboardHint: string,
): VideoResizeOverlay {
	const overlay: HTMLDivElement = document.createElement('div');
	overlay.className = 'notectl-video__resize-overlay';
	overlay.setAttribute('data-notectl-no-print', '');

	const indicator: HTMLDivElement = document.createElement('div');
	indicator.className = 'notectl-video__size-indicator';
	overlay.appendChild(indicator);

	let detachMove: (() => void) | null = null;

	for (const position of HANDLES) {
		const handle: HTMLDivElement = document.createElement('div');
		handle.className = `notectl-video__resize-handle notectl-video__resize-handle--${position}`;
		handle.setAttribute('aria-hidden', 'true');
		attachHandle(handle, position, overlay, indicator, callbacks, (fn) => {
			detachMove = fn;
		});
		overlay.appendChild(handle);
	}

	if (keyboardHint) {
		const hint: HTMLDivElement = document.createElement('div');
		hint.className = 'notectl-video__keyboard-hint';
		hint.setAttribute('aria-hidden', 'true');
		hint.textContent = keyboardHint;
		overlay.appendChild(hint);
	}

	return {
		element: overlay,
		destroy(): void {
			detachMove?.();
			clearGlobalResizeCursor();
		},
	};
}

/** Wires a single side handle's pointer drag. */
function attachHandle(
	handle: HTMLElement,
	position: SideHandle,
	overlay: HTMLElement,
	indicator: HTMLElement,
	callbacks: VideoResizeCallbacks,
	registerDetach: (fn: () => void) => void,
): void {
	let startX = 0;
	let startPercent = 0;
	let referenceWidth = 0;
	let currentPercent = 0;
	let xSign: 1 | -1 = HANDLE_X_SIGN[position];

	const onPointerMove = (e: PointerEvent): void => {
		const deltaPx: number = (e.clientX - startX) * xSign;
		const deltaPercent: number = referenceWidth > 0 ? (deltaPx / referenceWidth) * 100 : 0;
		currentPercent = clamp(startPercent + deltaPercent, callbacks.minPercent);
		callbacks.applyLiveWidth(currentPercent);
		indicator.textContent = callbacks.formatPercent(Math.round(currentPercent));
	};

	const onPointerUp = (e: PointerEvent): void => {
		document.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerup', onPointerUp);
		overlay.classList.remove('notectl-video__resize-overlay--active');
		indicator.classList.remove('notectl-video__size-indicator--visible');
		clearGlobalResizeCursor();
		callbacks.commit(Math.round(currentPercent));
		(e.target as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);
	};

	registerDetach(() => {
		document.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerup', onPointerUp);
	});

	handle.addEventListener('pointerdown', (e: PointerEvent) => {
		e.preventDefault();
		e.stopPropagation();
		startX = e.clientX;
		startPercent = callbacks.getWidthPercent();
		currentPercent = startPercent;
		referenceWidth = callbacks.getReferenceWidth();
		xSign = callbacks.isRtl() ? (-HANDLE_X_SIGN[position] as 1 | -1) : HANDLE_X_SIGN[position];

		overlay.classList.add('notectl-video__resize-overlay--active');
		indicator.textContent = callbacks.formatPercent(Math.round(startPercent));
		indicator.classList.add('notectl-video__size-indicator--visible');
		setGlobalResizeCursor(overlay);

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp);
	});
}

/** Clamps a percentage to `[min, 100]`. */
function clamp(value: number, min: number): number {
	return Math.max(min, Math.min(100, value));
}
