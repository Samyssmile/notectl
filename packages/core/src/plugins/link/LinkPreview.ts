/** Non-modal link preview. Keeps the editing selection until an action is chosen. */

import { type PopupHandle, PopupManager } from '../shared/PopupManager.js';
import { LINK_LOCALE_EN, type LinkLocale } from './LinkLocale.js';
import { createNavigationLink, scrollToFragment } from './LinkNavigation.js';

export class LinkPreview {
	private readonly popups: PopupManager;
	private handle: PopupHandle | null = null;
	private anchor: HTMLAnchorElement | null = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly locale: LinkLocale,
	) {
		this.popups = new PopupManager(container);
	}

	/**
	 * Shows the preview for a link in the content. Returns `false` when the URL
	 * is rejected. The author is mid-edit, so the open action always targets a
	 * new tab regardless of how rendered links are configured.
	 */
	show(anchor: HTMLAnchorElement): boolean {
		this.close();
		const href: string = anchor.getAttribute('href') ?? '';
		const link: HTMLAnchorElement | null = createNavigationLink(
			this.container.ownerDocument,
			href,
			true,
		);
		if (!link) return false;

		const label: string =
			(link.target === '_blank' ? this.locale.openLinkInNewTab : this.locale.openLink) ??
			(link.target === '_blank' ? LINK_LOCALE_EN.openLinkInNewTab : LINK_LOCALE_EN.openLink);
		link.className = 'notectl-link-preview__open';
		const action: HTMLSpanElement = document.createElement('span');
		action.textContent = label;
		const address: HTMLSpanElement = document.createElement('span');
		address.className = 'notectl-link-preview__url';
		address.dir = 'ltr';
		address.textContent = link.getAttribute('href');
		link.append(action, address);
		link.addEventListener('click', (event: MouseEvent): void => {
			if (event.defaultPrevented) return;
			if (scrollToFragment(this.container, href)) event.preventDefault();
		});

		this.anchor = anchor;
		this.handle = this.popups.open({
			anchor,
			className: 'notectl-link-preview',
			ariaRole: 'dialog',
			ariaLabel: this.locale.label,
			autoFocus: false,
			onClose: () => {
				this.handle = null;
				this.anchor = null;
			},
			content: (popup: HTMLElement): void => {
				const closeButton: HTMLButtonElement = document.createElement('button');
				closeButton.type = 'button';
				closeButton.className = 'notectl-link-preview__close';
				closeButton.textContent = '×';
				closeButton.setAttribute(
					'aria-label',
					this.locale.closePreview ?? LINK_LOCALE_EN.closePreview,
				);
				closeButton.addEventListener('click', () => this.close(true));
				popup.append(link, closeButton);
				popup.addEventListener('keydown', (event: KeyboardEvent): void => {
					if (event.key !== 'Escape') return;
					event.preventDefault();
					event.stopPropagation();
					this.close(true);
				});
				popup.addEventListener('focusout', (event: FocusEvent): void => {
					if (event.relatedTarget instanceof Node && !popup.contains(event.relatedTarget)) {
						this.close();
					}
				});
			},
		});
		return true;
	}

	/**
	 * Follows the link through scrolling and resizing, such as the scroll a
	 * virtual keyboard causes right after a tap. Closes once the link has left
	 * the editor's visible area or the document.
	 */
	reposition(): void {
		if (!this.handle || !this.anchor) return;
		if (!this.anchor.isConnected || !this.isWithinContent(this.anchor)) {
			this.close();
			return;
		}
		this.popups.reposition(this.handle);
	}

	isOpen(): boolean {
		return this.handle !== null;
	}

	/** Moves from the editor into the preview on Tab without changing the document selection. */
	focus(): boolean {
		const link: HTMLAnchorElement | null | undefined = this.handle?.getElement().querySelector('a');
		if (!link) return false;
		link.focus();
		return true;
	}

	close(restoreFocus = false): boolean {
		const handle: PopupHandle | null = this.handle;
		this.handle = null;
		this.anchor = null;
		handle?.close({ restoreFocusTo: restoreFocus ? this.container : null });
		return handle !== null;
	}

	destroy(): void {
		this.close();
		this.popups.destroy();
	}

	private isWithinContent(anchor: HTMLAnchorElement): boolean {
		const anchorRect: DOMRect = anchor.getBoundingClientRect();
		const contentRect: DOMRect = this.container.getBoundingClientRect();
		return anchorRect.bottom >= contentRect.top && anchorRect.top <= contentRect.bottom;
	}
}
