/** Non-modal link bubble. Keeps the editing selection until an action is chosen. */

import type { PluginContext } from '../Plugin.js';
import { type PopupHandle, PopupManager } from '../shared/PopupManager.js';
import { renderLinkBubble } from './LinkBubbleContent.js';
import type { LinkLocale } from './LinkLocale.js';
import { createNavigationLink } from './LinkNavigation.js';

export class LinkBubble {
	private readonly popups: PopupManager;
	private handle: PopupHandle | null = null;
	private anchor: HTMLElement | null = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly locale: LinkLocale,
		private readonly context: PluginContext,
	) {
		this.popups = new PopupManager(container);
	}

	/**
	 * Shows the bubble for a link in the content. Returns `false` when the URL
	 * is rejected. The author is mid-edit, so the open action always targets a
	 * new tab regardless of how rendered links are configured.
	 */
	show(anchor: HTMLElement): boolean {
		this.close();
		const href: string = anchor.getAttribute('href') ?? '';
		const link: HTMLAnchorElement | null = createNavigationLink(
			this.container.ownerDocument,
			href,
			true,
		);
		if (anchor instanceof HTMLAnchorElement && !link) return false;

		this.anchor = anchor;
		this.handle = this.popups.open({
			anchor,
			className: 'notectl-link-bubble',
			ariaRole: 'dialog',
			ariaLabel: this.locale.label,
			autoFocus: false,
			onClose: () => {
				this.handle = null;
				this.anchor = null;
			},
			content: (popup: HTMLElement): void => {
				this.render(popup, this.context, () => this.close());
			},
		});
		return true;
	}

	render(popup: HTMLElement, context: PluginContext, close: () => void): void {
		renderLinkBubble(popup, context, this.locale, close);
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

	/** Moves from the editor into the bubble on Tab without changing the document selection. */
	focus(closeButton = false): boolean {
		const link: HTMLElement | null | undefined = this.handle
			?.getElement()
			.querySelector(closeButton ? '.notectl-link-bubble__close' : 'a, input');
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

	private isWithinContent(anchor: HTMLElement): boolean {
		const anchorRect: DOMRect = anchor.getBoundingClientRect();
		const contentRect: DOMRect = this.container.getBoundingClientRect();
		return anchorRect.bottom >= contentRect.top && anchorRect.top <= contentRect.bottom;
	}
}
