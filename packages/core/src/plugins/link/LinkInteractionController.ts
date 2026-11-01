/** Owns link gestures and the bubble lifecycle, independently of mark editing. */

import { sanitizeHref } from '../../model/HTMLUtils.js';
import { isCollapsed, isTextSelection, selectionsEqual } from '../../model/Selection.js';
import type { EditorSelection } from '../../model/Selection.js';
import { isEventFromEditorContent } from '../../platform/EditorEventBoundary.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import type { PopupCloseOptions } from '../shared/PopupManager.js';
import { LinkBubble } from './LinkBubble.js';
import { LINK_LOCALE_EN, type LinkLocale } from './LinkLocale.js';
import { findLinkAnchor, openLink, scrollToFragment } from './LinkNavigation.js';
import type { LinkRange } from './LinkRange.js';
import { resolveLinkRange } from './LinkRange.js';

const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Control', 'Meta', 'Shift', 'Alt']);

interface LayoutSource {
	readonly target: EventTarget;
	readonly type: 'scroll' | 'resize';
	readonly capture: boolean;
}

export class LinkInteractionController {
	private readonly container: HTMLElement;
	private readonly bubble: LinkBubble;
	private readonly layoutSources: readonly LayoutSource[];
	private readonly handleLayoutChange = (): void => {
		this.bubble.reposition();
	};
	private readonly handleClick = (event: MouseEvent): void => this.onClick(event);
	private readonly handleKeydown = (event: KeyboardEvent): void => this.onKeydown(event);
	private announcementPending = false;
	private lastRange = '';
	private pointerSelection = false;
	private pendingTabs = 0;
	private pendingAnchor: HTMLAnchorElement | null = null;
	private readonly handlePointer = (): void => {
		this.pointerSelection = true;
	};
	private toolbarClose: (() => void) | null = null;
	private readonly handleInput = (): void => {
		this.closeBubble();
	};

	renderToolbar(
		popup: HTMLElement,
		context: PluginContext,
		close: (options?: PopupCloseOptions) => void,
	): void {
		this.closeBubble();
		let closed = false;
		const dismiss = (): void => {
			if (closed) return;
			closed = true;
			this.toolbarClose = null;
			close({ restoreFocusTo: null });
		};
		this.toolbarClose = dismiss;
		this.bubble.render(popup, context, dismiss);
	}

	onSelectionChange(oldState: EditorState, state: EditorState): void {
		if (this.pendingAnchor && resolveLinkRange(state)) {
			this.showClickedLink(this.pendingAnchor);
		}
		if (selectionsEqual(oldState.selection, state.selection)) return;
		const range: LinkRange | null = isCollapsed(state.selection) ? resolveLinkRange(state) : null;
		const key: string = range ? JSON.stringify(range) : '';
		if (key === this.lastRange) return;
		this.closeBubble();
		this.lastRange = key;
		const root: Node = this.container.getRootNode();
		const active: Element | null =
			root instanceof ShadowRoot ? root.activeElement : this.container.ownerDocument.activeElement;
		if (range && !this.pointerSelection && active === this.container && !this.context.isReadOnly())
			this.showAtSelection();
	}

	showAtSelection(): boolean {
		if (this.context.isReadOnly()) return false;
		const state: EditorState = this.context.getState();
		const sel: EditorSelection = state.selection;
		if (!isTextSelection(sel)) return false;
		const range: LinkRange | null = resolveLinkRange(state);
		if (!range && isCollapsed(sel)) return false;
		const block: HTMLElement | null = this.container.querySelector<HTMLElement>(
			`[data-block-id="${CSS.escape(sel.anchor.blockId)}"]`,
		);
		if (!block) return false;
		let anchor: HTMLElement = block;
		if (range) {
			// DOM is used only for placement; the model range owns all editing.
			const links: HTMLAnchorElement[] = Array.from(block.querySelectorAll<HTMLAnchorElement>('a'));
			const href: string = String(range.mark.attrs?.href ?? '');
			const target: HTMLAnchorElement | undefined = links.find((link) => {
				const start: number = anchorOffset(block, link);
				return (
					link.getAttribute('href') === sanitizeHref(href) &&
					start <= sel.anchor.offset &&
					start + (link.textContent?.length ?? 0) >= sel.anchor.offset
				);
			});
			if (!target) return false;
			anchor = target;
		}
		this.closeBubble();
		if (!this.bubble.show(anchor)) return false;
		this.lastRange = range ? JSON.stringify(range) : '';
		this.announcementPending = true;
		this.announce();
		return true;
	}

	constructor(
		private readonly context: PluginContext,
		private readonly locale: LinkLocale,
	) {
		this.container = context.getContainer();
		this.bubble = new LinkBubble(this.container, locale, context);
		this.layoutSources = collectLayoutSources(this.container);
		this.container.addEventListener('click', this.handleClick);
		this.container.addEventListener('pointerdown', this.handlePointer);
		this.container.addEventListener('beforeinput', this.handleInput);
		this.container.addEventListener('compositionstart', this.handleInput);
		this.container.addEventListener('keydown', this.handleKeydown, true);
		for (const source of this.layoutSources) {
			source.target.addEventListener(source.type, this.handleLayoutChange, source.capture);
		}
	}

	dismissForDocument(state: EditorState): void {
		this.closeBubble();
		const range: LinkRange | null = resolveLinkRange(state);
		this.lastRange = range ? JSON.stringify(range) : '';
	}

	closeBubble(): void {
		this.pendingAnchor = null;
		this.pendingTabs = 0;
		this.bubble.close();
		const close: (() => void) | null = this.toolbarClose;
		this.toolbarClose = null;
		close?.();
	}

	/**
	 * The editor empties its live region on every transaction, including the
	 * selection sync that follows the click which opened the preview. Repeats
	 * the announcement once when that sync has wiped it.
	 */
	restoreBubbleAnnouncement(): void {
		if (!this.announcementPending || !this.bubble.isOpen()) return;
		this.announcementPending = false;
		if (!this.context.hasAnnouncement()) this.announce();
	}

	destroy(): void {
		this.container.removeEventListener('click', this.handleClick);
		this.container.removeEventListener('pointerdown', this.handlePointer);
		this.container.removeEventListener('beforeinput', this.handleInput);
		this.container.removeEventListener('compositionstart', this.handleInput);
		this.container.removeEventListener('keydown', this.handleKeydown, true);
		for (const source of this.layoutSources) {
			source.target.removeEventListener(source.type, this.handleLayoutChange, source.capture);
		}
		this.closeBubble();
		this.bubble.destroy();
	}

	private onKeydown(event: KeyboardEvent): void {
		if (!isEventFromEditorContent(event, this.container)) return;
		this.pointerSelection = false;
		if (event.key === 'Escape' && (this.pendingAnchor || this.bubble.isOpen())) {
			this.closeBubble();
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.key === 'Tab' && !event.shiftKey && this.pendingAnchor) {
			this.pendingTabs++;
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		this.pendingAnchor = null;
		if (event.key === 'Tab' && !event.shiftKey && this.bubble.focus()) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (
			!MODIFIER_KEYS.has(event.key) &&
			!event.key.startsWith('Arrow') &&
			event.key !== 'Home' &&
			event.key !== 'End'
		)
			this.bubble.close();
	}

	private onClick(event: MouseEvent): void {
		if (!isEventFromEditorContent(event, this.container)) return;
		this.closeBubble();
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
		if (event.detail > 1) return;
		this.pendingAnchor = anchor;
		// Chromium can still expose the previous range until its selectionchange fires.
		if (this.container.ownerDocument.getSelection()?.isCollapsed !== false) {
			this.showClickedLink(anchor);
		}
	}

	private showClickedLink(anchor: HTMLAnchorElement): void {
		if (!isCollapsed(this.context.getState().selection)) return;
		const range: LinkRange | null = resolveLinkRange(this.context.getState());
		if (
			!range ||
			sanitizeHref(String(range.mark.attrs?.href ?? '')) !== anchor.getAttribute('href')
		)
			return;
		const block: HTMLElement | null = anchor.closest('[data-block-id]');
		if (block) {
			const start: number = anchorOffset(block, anchor);
			if (
				block.dataset.blockId !== range.selection.anchor.blockId ||
				start < range.selection.anchor.offset ||
				start >= range.selection.head.offset
			)
				return;
		}
		this.pendingAnchor = null;
		if (!this.bubble.show(anchor)) return;
		this.lastRange = JSON.stringify(range);
		if (this.pendingTabs) this.bubble.focus(this.pendingTabs > 1);
		this.pendingTabs = 0;
		// The preview takes no focus, so screen readers learn about it from the live region.
		this.announcementPending = true;
		this.announce();
	}

	private announce(): void {
		this.context.announce(this.locale.bubbleOpened ?? LINK_LOCALE_EN.bubbleOpened);
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

/** Count model offsets before an anchor, treating inline objects as one position. */
function anchorOffset(block: HTMLElement, anchor: HTMLAnchorElement): number {
	const before: Range = block.ownerDocument.createRange();
	before.selectNodeContents(block);
	before.setEndBefore(anchor);
	const preceding: DocumentFragment = before.cloneContents();
	for (const inline of preceding.querySelectorAll('[data-inline-type]'))
		inline.replaceWith('\uFFFC');
	return preceding.textContent?.length ?? 0;
}
