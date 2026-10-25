/** Owns link gestures and the preview lifecycle, independently of mark editing. */

import { sanitizeHref } from '../../model/HTMLUtils.js';
import { isCollapsed } from '../../model/Selection.js';
import { isEventFromEditorContent } from '../../platform/EditorEventBoundary.js';
import type { PluginContext } from '../Plugin.js';
import type { LinkLocale } from './LinkLocale.js';
import { findLinkAnchor, openLink, scrollToFragment } from './LinkNavigation.js';
import { LinkPreview } from './LinkPreview.js';

export class LinkInteractionController {
	private readonly container: HTMLElement;
	private readonly preview: LinkPreview;
	private readonly handleLayoutChange = (): void => {
		this.preview.close();
	};
	private readonly handleClick = (event: MouseEvent): void => this.onClick(event);
	private readonly handleKeydown = (event: KeyboardEvent): void => {
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
		if (!['Control', 'Meta', 'Shift', 'Alt'].includes(event.key)) this.preview.close();
	};

	constructor(
		private readonly context: PluginContext,
		locale: LinkLocale,
		openInNewTab: boolean,
	) {
		this.container = context.getContainer();
		this.preview = new LinkPreview(this.container, locale, openInNewTab);
		this.container.addEventListener('click', this.handleClick);
		this.container.addEventListener('keydown', this.handleKeydown, true);
		this.container.addEventListener('scroll', this.handleLayoutChange, true);
		this.container.ownerDocument.addEventListener('scroll', this.handleLayoutChange, true);
		this.container.ownerDocument.defaultView?.addEventListener('resize', this.handleLayoutChange);
	}

	closePreview(): void {
		this.preview.close();
	}

	destroy(): void {
		this.container.removeEventListener('click', this.handleClick);
		this.container.removeEventListener('keydown', this.handleKeydown, true);
		this.container.removeEventListener('scroll', this.handleLayoutChange, true);
		this.container.ownerDocument.removeEventListener('scroll', this.handleLayoutChange, true);
		this.container.ownerDocument.defaultView?.removeEventListener(
			'resize',
			this.handleLayoutChange,
		);
		this.preview.destroy();
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
		this.preview.show(anchor);
	}
}
