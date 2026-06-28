/**
 * LinkPlugin: registers a link mark type with href attribute,
 * toggle command, keyboard shortcut (Mod-K), and toolbar button
 * with a URL input popup.
 */

import {
	applyAttributedMark,
	isAttributedMarkActive,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import type { BlockNode } from '../../model/Document.js';
import { hasMark } from '../../model/Document.js';
import { escapeHTML, sanitizeHref } from '../../model/HTMLUtils.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { dispatchIfPresent, resolveLocale } from '../shared/PluginHelpers.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { LINK_LOCALE_EN, type LinkLocale, loadLinkLocale } from './LinkLocale.js';

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

/** `[text](url "optional title")`, not preceded by `!` (which would be an image). */
const LINK_RULE = /(?:^|[^!])(\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))$/;
/** `<scheme:...>` autolink. */
const AUTOLINK_RULE = /(<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\s]+)>)$/;

// --- Plugin ---

export class LinkPlugin implements Plugin {
	readonly id = 'link';
	readonly name = 'Link';
	readonly priority = 25;

	private readonly config: LinkConfig;
	private locale!: LinkLocale;

	constructor(config?: Partial<LinkConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(context, this.config.locale, LINK_LOCALE_EN, loadLinkLocale);
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerKeymap(context);
		this.registerToolbarItem(context);
		if (this.config.inputRule !== false) {
			this.registerInputRules(context);
		}
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
				if (openInNewTab) {
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
				if (openInNewTab) {
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
			'Mod-K': () => context.executeCommand('toggleLink'),
		});
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
			isEnabled: (state) => !isCollapsed(state.selection),
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

	private addLink(context: PluginContext, state: EditorState, href: string): boolean {
		const sel = state.selection;
		if (!isTextSelection(sel)) return false;
		if (isCollapsed(sel)) return false;

		const mark = { type: markType('link'), attrs: { href } };
		return dispatchIfPresent(context, applyAttributedMark(state, mark));
	}

	private removeLink(context: PluginContext, state: EditorState): boolean {
		const sel = state.selection;
		if (!isTextSelection(sel)) return false;

		if (isCollapsed(sel)) {
			// Remove link from entire link span around cursor (plugin-specific extent scan)
			const block = state.getBlock(sel.anchor.blockId);
			if (!block) return false;

			const textChildren: { pos: number; end: number; hasLink: boolean }[] = [];
			let pos = 0;
			for (const child of block.children) {
				if (!('text' in child)) continue;
				const end = pos + child.text.length;
				textChildren.push({ pos, end, hasLink: hasMark(child.marks, markType('link')) });
				pos = end;
			}

			const cursorIdx = textChildren.findIndex(
				(c) => sel.anchor.offset >= c.pos && sel.anchor.offset <= c.end,
			);
			const cursorEntry = cursorIdx >= 0 ? textChildren[cursorIdx] : undefined;
			if (cursorIdx === -1 || !cursorEntry?.hasLink) return false;

			let startIdx = cursorIdx;
			while (startIdx > 0 && textChildren[startIdx - 1]?.hasLink) {
				startIdx--;
			}

			let endIdx = cursorIdx;
			while (endIdx < textChildren.length - 1 && textChildren[endIdx + 1]?.hasLink) {
				endIdx++;
			}

			const startEntry = textChildren[startIdx];
			const endEntry = textChildren[endIdx];
			if (!startEntry || !endEntry) return false;

			const linkStart = startEntry.pos;
			const linkEnd = endEntry.end;

			const builder = state.transaction('command');
			builder.removeMark(sel.anchor.blockId, linkStart, linkEnd, { type: markType('link') });
			builder.setSelection(sel);
			context.dispatch(builder.build());
			return true;
		}

		// Range selection: delegate to shared helper
		return dispatchIfPresent(context, removeAttributedMark(state, markType('link')));
	}

	private renderLinkPopup(
		container: HTMLElement,
		context: PluginContext,
		onClose: () => void,
	): void {
		container.classList.add('notectl-link-popup');

		const state = context.getState();
		const isActive = this.isLinkActive(state);

		if (isActive) {
			// Show remove link button
			const removeBtn = document.createElement('button');
			removeBtn.type = 'button';
			removeBtn.className = 'notectl-link-popup__button';
			removeBtn.textContent = this.locale.removeLink;
			removeBtn.setAttribute('aria-label', this.locale.removeLinkAria);
			removeBtn.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				context.executeCommand('removeLink');
				onClose();
				context.getContainer().focus();
			});
			container.appendChild(removeBtn);
		} else {
			// Show URL input
			const input = document.createElement('input');
			input.type = 'url';
			input.className = 'notectl-link-popup__input';
			input.placeholder = this.locale.urlPlaceholder;
			input.setAttribute('aria-label', this.locale.urlAria);

			const applyBtn = document.createElement('button');
			applyBtn.type = 'button';
			applyBtn.className = 'notectl-link-popup__button notectl-link-popup__button--apply';
			applyBtn.textContent = this.locale.apply;
			applyBtn.setAttribute('aria-label', this.locale.applyAria);

			const errorMsg = document.createElement('div');
			errorMsg.className = 'notectl-link-popup__error';
			errorMsg.setAttribute('role', 'alert');
			errorMsg.hidden = true;

			const applyLink = (): void => {
				const raw: string = input.value.trim();
				if (raw === '') return;
				const sanitized: string = sanitizeHref(raw);
				if (sanitized === '') {
					errorMsg.textContent = this.locale.invalidUrl;
					errorMsg.hidden = false;
					input.setAttribute('aria-invalid', 'true');
					input.focus();
					return;
				}
				errorMsg.hidden = true;
				input.removeAttribute('aria-invalid');
				this.addLink(context, context.getState(), sanitized);
				onClose();
				context.getContainer().focus();
			};

			applyBtn.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				applyLink();
			});

			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					applyLink();
				}
			});

			input.addEventListener('input', () => {
				if (!errorMsg.hidden) {
					errorMsg.hidden = true;
					input.removeAttribute('aria-invalid');
				}
			});

			container.appendChild(input);
			container.appendChild(applyBtn);
			container.appendChild(errorMsg);

			// Auto-focus input
			requestAnimationFrame(() => input.focus());
		}
	}
}
