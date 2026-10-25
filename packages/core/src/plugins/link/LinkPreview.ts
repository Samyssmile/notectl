/** Non-modal link preview. Keeps the editing selection until an action is chosen. */

import { type PopupHandle, PopupManager } from '../shared/PopupManager.js';
import { LINK_LOCALE_EN, type LinkLocale } from './LinkLocale.js';
import { createNavigationLink, scrollToFragment } from './LinkNavigation.js';

export class LinkPreview {
	private readonly popups: PopupManager;
	private handle: PopupHandle | null = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly locale: LinkLocale,
		private readonly openInNewTab: boolean,
	) {
		this.popups = new PopupManager(container);
	}

	show(anchor: HTMLAnchorElement): void {
		this.close();
		const href: string = anchor.getAttribute('href') ?? '';
		const link: HTMLAnchorElement | null = createNavigationLink(
			this.container.ownerDocument,
			href,
			this.openInNewTab,
		);
		if (!link) return;

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

		this.handle = this.popups.open({
			anchor,
			className: 'notectl-link-preview',
			ariaRole: 'dialog',
			ariaLabel: this.locale.label,
			autoFocus: false,
			onClose: () => {
				this.handle = null;
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
		handle?.close({ restoreFocusTo: restoreFocus ? this.container : null });
		return handle !== null;
	}

	destroy(): void {
		this.close();
		this.popups.destroy();
	}
}
