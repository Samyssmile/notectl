/**
 * LinkPlugin: registers a link mark type with href attribute,
 * toggle command, keyboard shortcut (Mod-K), and toolbar button
 * with a URL input popup.
 */

import { forEachBlockInRange } from '../../commands/RangeIterator.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import { getBlockMarksAtOffset, hasMark } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import {
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	selectionRange,
} from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import { LINK_LOCALES, type LinkLocale } from './LinkLocale.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		link: { href: string };
	}
}

// --- Configuration ---

export interface LinkConfig {
	/** Whether to add rel="noopener noreferrer" and target="_blank" by default. */
	readonly openInNewTab: boolean;
	/** When true, a separator is rendered after the link toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: LinkLocale;
}

const DEFAULT_CONFIG: LinkConfig = {
	openInNewTab: true,
};

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

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(LINK_LOCALES, context, this.config.locale);
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerKeymap(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		const openInNewTab = this.config.openInNewTab;

		context.registerMarkSpec({
			type: 'link',
			rank: 10,
			attrs: {
				href: { default: '' },
			},
			toDOM(mark) {
				const a = document.createElement('a');
				const href = mark.attrs?.href ?? '';
				a.setAttribute('href', href);
				if (openInNewTab) {
					a.setAttribute('target', '_blank');
					a.setAttribute('rel', 'noopener noreferrer');
				}
				return a;
			},
			toHTMLString: (mark, content) => {
				const href: string = escapeHTML(String(mark.attrs?.href ?? ''));
				if (openInNewTab) {
					return `<a href="${href}" target="_blank" rel="noopener noreferrer">${content}</a>`;
				}
				return `<a href="${href}">${content}</a>`;
			},
			parseHTML: [
				{
					tag: 'a',
					getAttrs: (el) => {
						const href: string = el.getAttribute('href') ?? '';
						return { href };
					},
				},
			],
			sanitize: { tags: ['a'], attrs: ['href', 'target', 'rel'] },
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
			priority: 60,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx, onClose) => {
				this.renderLinkPopup(container, ctx, onClose);
			},
			isActive: (state) => this.isLinkActive(state),
			isEnabled: (state) => !isCollapsed(state.selection),
		});
	}

	private isLinkActive(state: EditorState): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel) || isGapCursor(sel)) return false;
		if (isCollapsed(sel)) {
			const block = state.getBlock(sel.anchor.blockId);
			if (!block) return false;
			const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
			return hasMark(marks, markType('link'));
		}

		// Check if link is active anywhere in selection
		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return false;
		const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
		return hasMark(marks, markType('link'));
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
		if (isNodeSelection(sel) || isGapCursor(sel)) return false;
		if (isCollapsed(sel)) return false;

		const range = selectionRange(sel, state.getBlockOrder());
		const builder = state.transaction('command');
		const mark = { type: markType('link'), attrs: { href } };

		forEachBlockInRange(state, range, (blockId, from, to) => {
			builder.addMark(blockId, from, to, mark);
		});

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	private removeLink(context: PluginContext, state: EditorState): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel) || isGapCursor(sel)) return false;
		const blockOrder = state.getBlockOrder();
		const range = isCollapsed(sel)
			? { from: sel.anchor, to: sel.anchor }
			: selectionRange(sel, blockOrder);

		const builder = state.transaction('command');

		if (isCollapsed(sel)) {
			// Remove link from entire link span around cursor
			const block = state.getBlock(sel.anchor.blockId);
			if (!block) return false;

			// Find the extent of the link mark around the cursor.
			// Build a list of text children with their positions first,
			// then scan backward and forward from the cursor node.
			const textChildren: { pos: number; end: number; hasLink: boolean }[] = [];
			let pos = 0;
			for (const child of block.children) {
				if (!('text' in child)) continue;
				const end = pos + child.text.length;
				textChildren.push({ pos, end, hasLink: hasMark(child.marks, markType('link')) });
				pos = end;
			}

			// Find the text child containing the cursor
			const cursorIdx = textChildren.findIndex(
				(c) => sel.anchor.offset >= c.pos && sel.anchor.offset <= c.end,
			);
			const cursorEntry = cursorIdx >= 0 ? textChildren[cursorIdx] : undefined;
			if (cursorIdx === -1 || !cursorEntry?.hasLink) return false;

			// Scan backward from cursor node to find link start
			let startIdx = cursorIdx;
			while (startIdx > 0 && textChildren[startIdx - 1]?.hasLink) {
				startIdx--;
			}

			// Scan forward from cursor node to find link end
			let endIdx = cursorIdx;
			while (endIdx < textChildren.length - 1 && textChildren[endIdx + 1]?.hasLink) {
				endIdx++;
			}

			const startEntry = textChildren[startIdx];
			const endEntry = textChildren[endIdx];
			if (!startEntry || !endEntry) return false;

			const linkStart = startEntry.pos;
			const linkEnd = endEntry.end;

			builder.removeMark(sel.anchor.blockId, linkStart, linkEnd, { type: markType('link') });
		} else {
			// Remove link from selection range
			forEachBlockInRange(state, range, (blockId, from, to) => {
				builder.removeMark(blockId, from, to, { type: markType('link') });
			});
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
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

			const applyLink = (): void => {
				const href = input.value.trim();
				if (href) {
					this.addLink(context, context.getState(), href);
					onClose();
					context.getContainer().focus();
				}
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

			container.appendChild(input);
			container.appendChild(applyBtn);

			// Auto-focus input
			requestAnimationFrame(() => input.focus());
		}
	}
}
