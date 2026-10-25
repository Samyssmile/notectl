/** Owns link gestures and the preview lifecycle, independently of mark editing. */

import { sanitizeHref } from '../../model/HTMLUtils.js';
import { isCollapsed } from '../../model/Selection.js';
import { isEventFromEditorContent } from '../../platform/EditorEventBoundary.js';
import type { PluginContext } from '../Plugin.js';
import { LINK_LOCALE_EN, type LinkLocale } from './LinkLocale.js';
import { findLinkAnchor, openLink, scrollToFragment } from './LinkNavigation.js';
import { LinkPreview } from './LinkPreview.js';

const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Control', 'Meta', 'Shift', 'Alt']);

interface LayoutSource {
	readonly target: EventTarget;
	readonly type: 'scroll' | 'resize';
	readonly capture: boolean;
}

export class LinkInteractionController {
	private readonly container: HTMLElement;
	private readonly preview: LinkPreview;
	private readonly layoutSources: readonly LayoutSource[];
	private readonly handleLayoutChange = (): void => {
		this.preview.reposition();
	};
	private readonly handleClick = (event: MouseEvent): void => this.onClick(event);
	private readonly handleKeydown = (event: KeyboardEvent): void => this.onKeydown(event);
	private announcementPending = false;

	constructor(
		private readonly context: PluginContext,
		private readonly locale: LinkLocale,
	) {
		this.container = context.getContainer();
		this.preview = new LinkPreview(this.container, locale);
		this.layoutSources = collectLayoutSources(this.container);
		this.container.addEventListener('click', this.handleClick);
		this.container.addEventListener('keydown', this.handleKeydown, true);
		for (const source of this.layoutSources) {
			source.target.addEventListener(source.type, this.handleLayoutChange, source.capture);
		}
	}

	closePreview(): void {
		this.preview.close();
	}

	/**
	 * The editor empties its live region on every transaction, including the
	 * selection sync that follows the click which opened the preview. Repeats
	 * the announcement once when that sync has wiped it.
	 */
	restorePreviewAnnouncement(): void {
		if (!this.announcementPending || !this.preview.isOpen()) return;
		this.announcementPending = false;
		if (!this.context.hasAnnouncement()) this.announce();
	}

	destroy(): void {
		this.container.removeEventListener('click', this.handleClick);
		this.container.removeEventListener('keydown', this.handleKeydown, true);
		for (const source of this.layoutSources) {
			source.target.removeEventListener(source.type, this.handleLayoutChange, source.capture);
		}
		this.preview.destroy();
	}

	private onKeydown(event: KeyboardEvent): void {
		if (!isEventFromEditorContent(event, this.container)) return;
		if (event.key === 'Escape' && this.preview.close()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.key === 'Tab' && !event.shiftKey && this.preview.focus()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (!MODIFIER_KEYS.has(event.key)) this.preview.close();
	}

	private onClick(event: MouseEvent): void {
		if (!isEventFromEditorContent(event, this.container)) return;
		this.preview.close();
		if (event.defaultPrevented || event.button !== 0 || event.altKey || event.shiftKey) return;
		const anchor: HTMLAnchorElement | null = findLinkAnchor(this.container, event.target);
		if (!anchor) return;
		const href: string = sanitizeHref(anchor.getAttribute('href') ?? '');
		if (!href) {
			event.preventDefault();
			return;
		}

		const modified: boolean = event.ctrlKey || event.metaKey;
		if (!modified && scrollToFragment(this.container, href)) {
			event.preventDefault();
			return;
		}
		// Readonly links retain native navigation, modifiers, context menus and keyboard activation.
		if (this.context.isReadOnly()) return;
		if (modified) {
			event.preventDefault();
			openLink(this.container, href, true);
			return;
		}
		if (href.startsWith('#')) return;

		event.preventDefault();
		if (event.detail > 1 || !isCollapsed(this.context.getState().selection)) return;
		if (this.container.ownerDocument.getSelection()?.isCollapsed === false) return;
		if (!this.preview.show(anchor)) return;
		// The preview takes no focus, so screen readers learn about it from the live region.
		this.announcementPending = true;
		this.announce();
	}

	private announce(): void {
		this.context.announce(this.locale.previewOpened ?? LINK_LOCALE_EN.previewOpened);
	}
}

/**
 * Everything that can move a link on screen: scrolling inside the editor
 * (scroll does not cross the shadow boundary, so the content element needs
 * its own capture listener), scrolling the page, resizing the window, and the
 * visual viewport changes a virtual keyboard causes.
 */
function collectLayoutSources(container: HTMLElement): readonly LayoutSource[] {
	const view: Window | null = container.ownerDocument.defaultView;
	const sources: LayoutSource[] = [
		{ target: container, type: 'scroll', capture: true },
		{ target: container.ownerDocument, type: 'scroll', capture: true },
	];
	if (view) sources.push({ target: view, type: 'resize', capture: false });
	if (view?.visualViewport) {
		sources.push(
			{ target: view.visualViewport, type: 'resize', capture: false },
			{ target: view.visualViewport, type: 'scroll', capture: false },
		);
	}
	return sources;
}
