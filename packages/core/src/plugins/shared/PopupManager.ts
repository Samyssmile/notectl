/**
 * Central popup lifecycle manager. Handles creation, positioning,
 * click-outside closing, Escape key, focus restoration, and popup stacking
 * for submenus/nested popups.
 */

import { isRtlContext } from '../../platform/Platform.js';
import { ServiceKey } from '../Plugin.js';
import { type PopupPosition, appendToRoot, positionPopup } from './PopupPositioning.js';

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
	readonly anchor: HTMLElement | DOMRect;
	readonly content: (container: HTMLElement, close: (options?: PopupCloseOptions) => void) => void;
	readonly className?: string;
	readonly ariaRole?: 'menu' | 'listbox' | 'grid' | 'dialog';
	readonly ariaLabel?: string;
	readonly restoreFocusTo?: HTMLElement;
	readonly onClose?: () => void;
	readonly position?: PopupPosition;
	readonly parent?: PopupHandle;
	readonly referenceNode?: Node;
}

export interface PopupHandle {
	close(options?: PopupCloseOptions): void;
	getElement(): HTMLElement;
}

export interface PopupServiceAPI {
	open(config: PopupConfig): PopupHandle;
	close(): void;
	closeAll(): void;
	isOpen(): boolean;
}

export const PopupServiceKey = new ServiceKey<PopupServiceAPI>('popup');

// --- Internal Entry ---

interface PopupEntry {
	readonly element: HTMLElement;
	readonly config: PopupConfig;
	readonly clickOutsideHandler: (e: MouseEvent) => void;
	readonly parent: PopupEntry | null;
	listenerRegistrationTimer: ReturnType<typeof setTimeout> | null;
	documentListenerAttached: boolean;
}

// --- Manager ---

export class PopupManager implements PopupServiceAPI {
	private readonly stack: PopupEntry[] = [];
	private readonly referenceNode: Node;

	constructor(referenceNode: Node) {
		this.referenceNode = referenceNode;
	}

	/** Opens a popup with the given configuration. Returns a handle for closing it. */
	open(config: PopupConfig): PopupHandle {
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
		};

		const clickOutsideHandler = (e: MouseEvent): void => {
			const path: EventTarget[] = e.composedPath();
			if (path.includes(popup)) return;

			// Don't close if click is inside any ancestor popup in the stack
			for (const stackEntry of this.stack) {
				if (path.includes(stackEntry.element)) return;
			}

			// Don't close if click is on the anchor element
			if (config.anchor instanceof HTMLElement && path.includes(config.anchor)) return;

			this.closeEntry(entry);
		};

		entry = {
			element: popup,
			config,
			clickOutsideHandler,
			parent: parentEntry,
			listenerRegistrationTimer: null,
			documentListenerAttached: false,
		};

		this.stack.push(entry);

		try {
			config.content(popup, (options?: PopupCloseOptions) => this.closeEntry(entry, options));
		} catch (error) {
			this.removeEntry(entry);
			throw error;
		}

		if (!this.stack.includes(entry)) {
			return handle;
		}

		const refNode: Node = config.referenceNode ?? this.referenceNode;
		appendToRoot(popup, refNode);

		const anchorRect: DOMRect =
			config.anchor instanceof HTMLElement ? config.anchor.getBoundingClientRect() : config.anchor;
		positionPopup(popup, anchorRect, {
			position: config.position ?? 'below-start',
			isRtl: this.isRtlContext(),
		});

		entry.listenerRegistrationTimer = setTimeout(() => {
			entry.listenerRegistrationTimer = null;
			if (!this.stack.includes(entry)) return;
			document.addEventListener('mousedown', clickOutsideHandler);
			entry.documentListenerAttached = true;
		}, 0);

		this.focusFirstItem(popup);

		return handle;
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
		this.closeAll();
	}

	// --- Internal ---

	private closeEntry(entry: PopupEntry, options?: PopupCloseOptions): void {
		const index: number = this.stack.indexOf(entry);
		if (index === -1) return;

		// Close all child popups first (anything above this entry in the stack)
		while (this.stack.length > index + 1) {
			const child: PopupEntry | undefined = this.stack[this.stack.length - 1];
			if (child) {
				this.removeEntry(child);
			}
		}

		this.removeEntry(entry);

		if (options !== undefined && 'restoreFocusTo' in options) {
			options.restoreFocusTo?.focus();
		} else if (entry.config.restoreFocusTo) {
			entry.config.restoreFocusTo.focus();
		}
		entry.config.onClose?.();
	}

	private removeEntry(entry: PopupEntry): void {
		const index: number = this.stack.indexOf(entry);
		if (index === -1) return;

		this.stack.splice(index, 1);
		if (entry.listenerRegistrationTimer !== null) {
			clearTimeout(entry.listenerRegistrationTimer);
			entry.listenerRegistrationTimer = null;
		}
		entry.element.remove();
		if (entry.documentListenerAttached) {
			document.removeEventListener('mousedown', entry.clickOutsideHandler);
			entry.documentListenerAttached = false;
		}
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

	private focusFirstItem(popup: HTMLElement): void {
		requestAnimationFrame(() => {
			const firstFocusable: HTMLElement | null =
				popup.querySelector('[role="menuitem"]') ??
				popup.querySelector('[role="option"]') ??
				popup.querySelector('[role="gridcell"]') ??
				popup.querySelector('input') ??
				popup.querySelector('button');
			firstFocusable?.focus();
		});
	}
}
