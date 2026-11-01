/**
 * LinkPlugin: registers a link mark type with href attribute,
 * editing and navigation commands, keyboard shortcuts, and toolbar popup.
 * Link gestures and the non-modal bubble have their own lifecycle controller.
 */

import {
	getMarkAttrAtSelection,
	isAttributedMarkActive,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import { LINK_CSS } from '../../editor/styles/link.js';
import type { BlockNode } from '../../model/Document.js';
import { escapeHTML, sanitizeHref } from '../../model/HTMLUtils.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { dispatchIfPresent, resolveLocale } from '../shared/PluginHelpers.js';
import type { PopupCloseOptions } from '../shared/PopupManager.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { LinkInteractionController } from './LinkInteractionController.js';
import { LINK_LOCALE_EN, type LinkLocale, loadLinkLocale } from './LinkLocale.js';
import { openLink, shouldOpenInNewTab } from './LinkNavigation.js';
import { changeLink, resolveLinkRange } from './LinkRange.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		link: { href: string; title?: string };
	}
}

// --- Configuration ---

export interface LinkConfig {
	/** Whether to add rel="noopener noreferrer" and target="_blank" by default. */
	readonly openInNewTab: boolean;
	/** Live Markdown shortcuts: `[text](url "title")` and `<url>` autolink. Default true. */
	readonly inputRule?: boolean;
	readonly locale?: LinkLocale;
}

const DEFAULT_CONFIG: LinkConfig = {
	openInNewTab: true,
};

// The inline-node placeholder (U+FFFC) is excluded from every re-inserted
// capture so a live link rule never spans an inline node nor writes the
// sentinel back as literal text.
/** `[text](url "optional title")`, not preceded by `!` (which would be an image). */
const LINK_RULE = /(?:^|[^!])(\[([^\]\uFFFC]+)\]\(([^)\s\uFFFC]+)(?:\s+"([^"\uFFFC]*)")?\))$/;
/** `<scheme:...>` autolink. */
const AUTOLINK_RULE = /(<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\s\uFFFC]+)>)$/;

// --- Plugin ---

export class LinkPlugin implements Plugin {
	readonly id = 'link';
	readonly name = 'Link';
	readonly priority = 25;

	private readonly config: LinkConfig;
	private locale: LinkLocale = LINK_LOCALE_EN;
	private interaction: LinkInteractionController | null = null;

	constructor(config?: Partial<LinkConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(context, this.config.locale, LINK_LOCALE_EN, loadLinkLocale);
		context.registerStyleSheet(LINK_CSS);
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerKeymap(context);
		this.registerToolbarItem(context);
		if (this.config.inputRule !== false) {
			this.registerInputRules(context);
		}
		this.interaction?.destroy();
		this.interaction = new LinkInteractionController(context, this.locale);
	}

	destroy(): void {
		this.interaction?.destroy();
		this.interaction = null;
	}

	onStateChange(oldState: EditorState, newState: EditorState): void {
		if (oldState.doc !== newState.doc) {
			this.interaction?.dismissForDocument(newState);
			return;
		}
		this.interaction?.onSelectionChange(oldState, newState);
		this.interaction?.restoreBubbleAnnouncement();
	}

	onReadOnlyChange(): void {
		this.interaction?.closeBubble();
	}

	/**
	 * Live Markdown link rules: `[text](url "title")` and `<url>` autolink. Bespoke
	 * (not the shared wrapping-mark helper) because links carry an `href`/`title`
	 * attribute and two capture groups (D6).
	 */
	private registerInputRules(context: PluginContext): void {
		const buildLink = (
			state: EditorState,
			blockId: BlockNode['id'],
			start: number,
			end: number,
			text: string,
			href: string,
			title?: string,
		) => {
			const attrs: Record<string, string> = { href };
			if (title) attrs.title = title;
			return state
				.transaction('input')
				.deleteTextAt(blockId, start, end)
				.insertText(blockId, start, text, [{ type: markType('link'), attrs }])
				.setSelection(createCollapsedSelection(blockId, start + text.length))
				.build();
		};

		context.registerInputRule({
			pattern: LINK_RULE,
			handler(state, match, _start, end) {
				const sel = state.selection;
				if (!isTextSelection(sel) || !isCollapsed(sel)) return null;
				const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
				if (!block || block.type === 'code_block') return null;

				const expr = match[1];
				const text = match[2];
				const rawHref = match[3];
				const title = match[4];
				if (!expr || !text || !rawHref) return null;
				const href: string = sanitizeHref(rawHref);
				if (href === '') return null;

				return buildLink(state, sel.anchor.blockId, end - expr.length, end, text, href, title);
			},
		});

		context.registerInputRule({
			pattern: AUTOLINK_RULE,
			handler(state, match, _start, end) {
				const sel = state.selection;
				if (!isTextSelection(sel) || !isCollapsed(sel)) return null;
				const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
				if (!block || block.type === 'code_block') return null;

				const expr = match[1];
				const url = match[2];
				if (!expr || !url) return null;
				const href: string = sanitizeHref(url);
				if (href === '') return null;

				return buildLink(state, sel.anchor.blockId, end - expr.length, end, url, href);
			},
		});
	}

	private registerMarkSpec(context: PluginContext): void {
		const openInNewTab = this.config.openInNewTab;

		context.registerMarkSpec({
			type: 'link',
			rank: 10,
			inclusive: false,
			attrs: {
				href: { default: '' },
				title: { default: '' },
			},
			toDOM(mark) {
				const a = document.createElement('a');
				const href: string = sanitizeHref(String(mark.attrs?.href ?? ''));
				a.setAttribute('href', href);
				const title: string = String(mark.attrs?.title ?? '');
				if (title) a.setAttribute('title', title);
				if (shouldOpenInNewTab(href, openInNewTab)) {
					a.setAttribute('target', '_blank');
					a.setAttribute('rel', 'noopener noreferrer');
				}
				return a;
			},
			toHTMLString: (mark, content) => {
				const safeHref: string = sanitizeHref(String(mark.attrs?.href ?? ''));
				const href: string = escapeHTML(safeHref);
				const titleValue: string = String(mark.attrs?.title ?? '');
				const titleAttr: string = titleValue ? ` title="${escapeHTML(titleValue)}"` : '';
				if (shouldOpenInNewTab(safeHref, openInNewTab)) {
					return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${content}</a>`;
				}
				return `<a href="${href}"${titleAttr}>${content}</a>`;
			},
			parseHTML: [
				{
					tag: 'a',
					getAttrs: (el) => {
						// Returning an empty href (instead of `false`) keeps the link mark
						// applied so the parser does not fall back to the core HTMLParser's
						// raw-href default; the empty value renders as a no-op anchor.
						const href: string = sanitizeHref(el.getAttribute('href') ?? '');
						const title: string = el.getAttribute('title') ?? '';
						return title ? { href, title } : { href };
					},
				},
			],
			sanitize: { tags: ['a'], attrs: ['href', 'title', 'target', 'rel'] },
		});
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('showLinkBubble', () => this.interaction?.showAtSelection() ?? false);
		context.registerCommand(
			'openLink',
			() => {
				const href: string | null = getMarkAttrAtSelection(
					context.getState(),
					'link',
					(mark) => mark.attrs.href,
				);
				if (href === null) return false;
				// An author mid-edit keeps the editor; readers follow the configured target.
				const newTab: boolean = context.isReadOnly() ? this.config.openInNewTab : true;
				return openLink(context.getContainer(), href, newTab);
			},
			{ readonlyAllowed: true },
		);
		context.registerCommand('toggleLink', () => {
			const state = context.getState();
			return this.toggleLink(context, state);
		});

		context.registerCommand('setLink', () => {
			// setLink is called by the popup after URL input
			// The actual URL is set via the popup's custom render
			return false;
		});

		context.registerCommand('removeLink', () => {
			const state = context.getState();
			return this.removeLink(context, state);
		});
	}

	private registerKeymap(context: PluginContext): void {
		context.registerKeymap({
			'Mod-K': () => context.executeCommand('showLinkBubble'),
		});
		context.registerKeymap(
			{ 'Alt-Enter': () => context.executeCommand('openLink') },
			{ priority: 'navigation' },
		);
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';

		context.registerToolbarItem({
			id: 'link',
			group: 'insert',
			icon,
			label: this.locale.label,
			tooltip: this.locale.tooltip(formatShortcut('Mod-K')),
			command: 'toggleLink',
			popupType: 'custom',
			renderPopup: (container, ctx, onClose) => {
				this.renderLinkPopup(container, ctx, onClose);
			},
			isActive: (state) => this.isLinkActive(state),
			isEnabled: (state) => !isCollapsed(state.selection) || this.isLinkActive(state),
		});
	}

	private isLinkActive(state: EditorState): boolean {
		return isAttributedMarkActive(state, 'link');
	}

	private toggleLink(context: PluginContext, state: EditorState): boolean {
		if (this.isLinkActive(state)) {
			return this.removeLink(context, state);
		}
		// Adding links requires the toolbar popup for URL input
		return false;
	}

	private removeLink(context: PluginContext, state: EditorState): boolean {
		const sel = state.selection;
		if (!isTextSelection(sel)) return false;

		const range: ReturnType<typeof resolveLinkRange> = resolveLinkRange(state);
		if (range) return dispatchIfPresent(context, changeLink(state, range));
		if (isCollapsed(sel)) return false;

		// Range selection: delegate to shared helper
		return dispatchIfPresent(context, removeAttributedMark(state, markType('link')));
	}

	private renderLinkPopup(
		container: HTMLElement,
		context: PluginContext,
		onClose: (options?: PopupCloseOptions) => void,
	): void {
		this.interaction?.renderToolbar(container, context, onClose);
	}
}
