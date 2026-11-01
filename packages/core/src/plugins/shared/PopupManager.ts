/**
 * Central popup lifecycle manager. Handles creation, positioning,
 * click-outside closing, Escape key, focus restoration, and popup stacking
 * for submenus/nested popups.
 */

import { isRtlContext } from '../../platform/Platform.js';
import type { ViewportRect } from '../../view/SelectionGeometry.js';
import { consoleLogger } from '../Logger.js';
import { ServiceKey } from '../Plugin.js';
import {
	type PopupPosition,
	appendToRoot,
	positionPopup,
	promoteToTopLayer,
} from './PopupPositioning.js';

// --- Types ---

/** Options for overriding focus restoration when closing a popup. */
export interface PopupCloseOptions {
	/**
	 * Override the default focus target on close.
	 * - `HTMLElement` → focus that element instead of `config.restoreFocusTo`
	 * - `null` → skip focus restoration entirely
	 * - `undefined` / omitted → use default `config.restoreFocusTo`
	 */
	readonly restoreFocusTo?: HTMLElement | null;
}

export interface PopupConfig {
	readonly anchor: HTMLElement | ViewportRect | PopupAnchor;
	readonly content: (container: HTMLElement, close: (options?: PopupCloseOptions) => void) => void;
	readonly className?: string;
	readonly ariaRole?: 'menu' | 'listbox' | 'grid' | 'dialog';
	readonly ariaLabel?: string;
	/** Focus the first control on open. Disable for non-modal previews while editing. */
	readonly autoFocus?: boolean;
	readonly restoreFocusTo?: HTMLElement;
	readonly onClose?: () => void;
	readonly position?: PopupPosition;
	readonly parent?: PopupHandle;
	readonly referenceNode?: Node;
}

export interface PopupHandle {
	close(options?: PopupCloseOptions): void;
	getElement(): HTMLElement;
	/** Re-measures the anchor and applies viewport collision handling. */
	updatePosition(): void;
}

/** A live viewport anchor. A null rectangle closes the popup without moving focus. */
export interface PopupAnchor {
	getRect(): ViewportRect | null;
	subscribe?(listener: () => void): () => void;
}

export interface PopupServiceAPI {
	open(config: PopupConfig): PopupHandle;
	close(): void;
	closeAll(): void;
	isOpen(): boolean;
	reposition(handle: PopupHandle): void;
}

export const PopupServiceKey = new ServiceKey<PopupServiceAPI>('popup');

// --- Internal Entry ---

interface PopupEntry {
	readonly element: HTMLElement;
	readonly config: PopupConfig;
	readonly clickOutsideHandler: (e: Event) => void;
	readonly parent: PopupEntry | null;
	listenerRegistrationTimer: ReturnType<typeof setTimeout> | null;
	documentListenerAttached: boolean;
	focusFrame: number | null;
	readonly cleanups: (() => void)[];
}

// --- Manager ---

export class PopupManager implements PopupServiceAPI {
	private readonly stack: PopupEntry[] = [];
	private readonly referenceNode: Node;
	private destroyed = false;

	constructor(
		referenceNode: Node,
		private readonly registerInteraction?: (element: HTMLElement) => () => void,
	) {
		this.referenceNode = referenceNode;
	}

	/** Opens a popup with the given configuration. Returns a handle for closing it. */
	open(config: PopupConfig): PopupHandle {
		if (this.destroyed) throw new Error('Popup service has been destroyed.');
		const popup: HTMLDivElement = document.createElement('div');
		popup.className = config.className ? `notectl-popup ${config.className}` : 'notectl-popup';

		if (config.ariaRole) {
			popup.setAttribute('role', config.ariaRole);
		}
		if (config.ariaLabel) {
			popup.setAttribute('aria-label', config.ariaLabel);
		}

		const parentEntry: PopupEntry | null = config.parent
			? this.findEntryByHandle(config.parent)
			: null;

		let entry!: PopupEntry;
		const handle: PopupHandle = {
			close: (options?: PopupCloseOptions) => this.closeEntry(entry, options),
			getElement: () => popup,
			updatePosition: () => this.reposition(handle),
		};

		const clickOutsideHandler = (e: Event): void => {
			const path: EventTarget[] = e.composedPath();
			if (path.includes(popup)) return;

			// Don't close if click is inside any ancestor popup in the stack
			for (const stackEntry of this.stack) {
				if (path.includes(stackEntry.element)) return;
			}

			// Don't close if click is on the anchor element
			if (config.anchor instanceof HTMLElement && path.includes(config.anchor)) return;

			this.closeEntry(entry, { restoreFocusTo: null });
		};

		entry = {
			element: popup,
			config,
			clickOutsideHandler,
			parent: parentEntry,
			listenerRegistrationTimer: null,
			documentListenerAttached: false,
			focusFrame: null,
			cleanups: [],
		};

		this.stack.push(entry);
		const unregister = this.registerInteraction?.(popup);
		if (unregister) entry.cleanups.push(unregister);
		try {
			config.content(popup, (options?: PopupCloseOptions) => this.closeEntry(entry, options));
		} catch (error) {
			this.closeEntry(entry, { restoreFocusTo: null });
			throw error;
		}

		if (!this.stack.includes(entry)) {
			return handle;
		}

		// Feature handlers on this same container run first and may consume Escape
		// or close with their own focus target before the default dismissal runs.
		popup.addEventListener('keydown', (event) => {
			if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
			if (this.stack.at(-1) !== entry) return;
			event.preventDefault();
			event.stopPropagation();
			this.closeEntry(entry);
		});

		try {
			const refNode: Node = config.referenceNode ?? this.referenceNode;
			appendToRoot(popup, refNode);
			// Promote to the top layer before measuring/positioning so the popup
			// escapes any ancestor stacking context in the host page.
			promoteToTopLayer(popup);

			this.positionEntry(entry);
			if (!this.stack.includes(entry)) return handle;
			if ('getRect' in config.anchor && config.anchor.subscribe) {
				const unsubscribe = config.anchor.subscribe(() => this.reposition(handle));
				if (this.stack.includes(entry)) entry.cleanups.push(unsubscribe);
				else unsubscribe();
			}
			if (!this.stack.includes(entry)) return handle;
			this.observePosition(entry);

			entry.listenerRegistrationTimer = setTimeout(() => {
				entry.listenerRegistrationTimer = null;
				if (!this.stack.includes(entry)) return;
				document.addEventListener('mousedown', clickOutsideHandler);
				document.addEventListener('touchstart', clickOutsideHandler);
				entry.documentListenerAttached = true;
			}, 0);

			if (config.autoFocus !== false) this.focusFirstItem(entry);

			return handle;
		} catch (error) {
			this.closeEntry(entry, { restoreFocusTo: null });
			throw error;
		}
	}

	/** Closes the topmost popup in the stack. */
	close(): void {
		const top: PopupEntry | undefined = this.stack[this.stack.length - 1];
		if (top) {
			this.closeEntry(top);
		}
	}

	/** Closes all open popups. */
	closeAll(): void {
		while (this.stack.length > 0) {
			const top: PopupEntry | undefined = this.stack[this.stack.length - 1];
			if (top) {
				this.closeEntry(top);
			}
		}
	}

	/** Returns true if any popup is currently open. */
	isOpen(): boolean {
		return this.stack.length > 0;
	}

	/** Cleans up all popups and event listeners. */
	destroy(): void {
		this.destroyed = true;
		while (this.stack.length) {
			const entry = this.stack.at(-1);
			if (entry) this.closeEntry(entry, { restoreFocusTo: null });
		}
	}

	// --- Internal ---

	private closeEntry(entry: PopupEntry, options?: PopupCloseOptions): void {
		const index: number = this.stack.indexOf(entry);
		if (index === -1) return;

		// Only descendants belong to this popup; other root popups keep their lifecycle.
		const descendants: PopupEntry[] = [];
		for (const child of [...this.stack].reverse()) {
			let parent = child.parent;
			while (parent && parent !== entry) parent = parent.parent;
			if (parent === entry) {
				descendants.push(child);
				this.removeEntry(child);
			}
		}

		this.removeEntry(entry);
		// Detach the complete group before callbacks may re-enter close().
		for (const child of descendants) this.notifyClose(child);

		if (options !== undefined && 'restoreFocusTo' in options) {
			options.restoreFocusTo?.focus();
		} else if (entry.config.restoreFocusTo) {
			entry.config.restoreFocusTo.focus();
		}
		this.notifyClose(entry);
	}

	private notifyClose(entry: PopupEntry): void {
		try {
			entry.config.onClose?.();
		} catch (error) {
			consoleLogger.error('[PopupManager] onClose failed', error);
		}
	}

	private removeEntry(entry: PopupEntry): void {
		const index: number = this.stack.indexOf(entry);
		if (index === -1) return;

		this.stack.splice(index, 1);
		for (const cleanup of entry.cleanups) {
			try {
				cleanup();
			} catch (error) {
				consoleLogger.error('[PopupManager] cleanup failed', error);
			}
		}
		if (entry.focusFrame !== null) cancelAnimationFrame(entry.focusFrame);
		if (entry.listenerRegistrationTimer !== null) {
			clearTimeout(entry.listenerRegistrationTimer);
			entry.listenerRegistrationTimer = null;
		}
		entry.element.remove();
		if (entry.documentListenerAttached) {
			document.removeEventListener('mousedown', entry.clickOutsideHandler);
			document.removeEventListener('touchstart', entry.clickOutsideHandler);
			entry.documentListenerAttached = false;
		}
	}

	/** Re-anchors an open popup after its anchor moved, for example through scrolling or resizing. */
	reposition(handle: PopupHandle): void {
		const entry: PopupEntry | null = this.findEntryByHandle(handle);
		if (entry) this.positionEntry(entry);
	}

	private positionEntry(entry: PopupEntry): void {
		const config: PopupConfig = entry.config;
		const anchorRect: ViewportRect | null =
			config.anchor instanceof HTMLElement
				? config.anchor.getBoundingClientRect()
				: 'getRect' in config.anchor
					? config.anchor.getRect()
					: config.anchor;
		if (!anchorRect) {
			this.closeEntry(entry, { restoreFocusTo: null });
			return;
		}
		positionPopup(entry.element, anchorRect, {
			position: config.position ?? 'below-start',
			isRtl: this.isRtlContext(),
		});
	}

	private findEntryByHandle(handle: PopupHandle): PopupEntry | null {
		const element: HTMLElement = handle.getElement();
		return this.stack.find((e) => e.element === element) ?? null;
	}

	/** Detects whether the editor context is RTL from the computed style. */
	private isRtlContext(): boolean {
		if (this.referenceNode instanceof HTMLElement) {
			return isRtlContext(this.referenceNode);
		}
		return false;
	}

	private focusFirstItem(entry: PopupEntry): void {
		const popup = entry.element;
		entry.focusFrame = requestAnimationFrame(() => {
			entry.focusFrame = null;
			if (!popup.isConnected) return;
			const firstFocusable: HTMLElement | null =
				popup.querySelector('[role="menuitem"]') ??
				popup.querySelector('[role="option"]') ??
				popup.querySelector('[role="gridcell"]') ??
				// `input, textarea` returns whichever comes first in the DOM, so a
				// popup whose primary field is a textarea (e.g. the formula editor's
				// LaTeX field) focuses that rather than a later text input.
				popup.querySelector('input, textarea') ??
				popup.querySelector('button');
			firstFocusable?.focus();
		});
	}

	private observePosition(entry: PopupEntry): void {
		let frame: number | null = null;
		const update = (): void => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				if (this.stack.includes(entry)) this.positionEntry(entry);
			});
		};
		const listen = (target: EventTarget, name: string): void => {
			target.addEventListener(name, update, true);
			entry.cleanups.push(() => target.removeEventListener(name, update, true));
		};
		listen(window, 'resize');
		listen(document, 'scroll');
		listen(this.referenceNode.getRootNode(), 'scroll');
		if (window.visualViewport) {
			listen(window.visualViewport, 'resize');
			listen(window.visualViewport, 'scroll');
		}
		const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
		resize?.observe(entry.element);
		if (entry.config.anchor instanceof HTMLElement) resize?.observe(entry.config.anchor);
		entry.cleanups.push(() => {
			resize?.disconnect();
			if (frame !== null) cancelAnimationFrame(frame);
		});
	}
}
