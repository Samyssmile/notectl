/** Shared actions and URL form for both link bubble hosts. */
import {
	applyAttributedMark,
	isAttributedMarkActive,
} from '../../commands/AttributedMarkCommands.js';
import { sanitizeHref } from '../../model/HTMLUtils.js';
import { isCollapsed, isTextSelection, selectionsEqual } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { LINK_LOCALE_EN, type LinkLocale } from './LinkLocale.js';
import { createNavigationLink, scrollToFragment } from './LinkNavigation.js';
import type { LinkRange } from './LinkRange.js';
import { changeLink, resolveLinkRange } from './LinkRange.js';

export function renderLinkBubble(
	popup: HTMLElement,
	context: PluginContext,
	locale: LinkLocale,
	onClose: () => void,
): void {
	const state: EditorState = context.getState();
	const range: LinkRange | null = resolveLinkRange(state);
	let dismissed = false;
	const dismiss = (): void => {
		if (dismissed) return;
		dismissed = true;
		onClose();
	};
	const close = (): void => {
		dismiss();
		context.getContainer().focus();
	};
	const valid = (): boolean =>
		!context.isReadOnly() &&
		context.getState().doc === state.doc &&
		(range
			? JSON.stringify(resolveLinkRange(context.getState())) === JSON.stringify(range)
			: selectionsEqual(context.getState().selection, state.selection));
	popup.classList.add('notectl-link-popup', 'notectl-link-bubble');
	popup.setAttribute('role', 'dialog');
	popup.setAttribute('aria-label', locale.label);
	const content: HTMLDivElement = document.createElement('div');
	popup.append(content);
	const button = (label: string, aria: string, action: () => void): HTMLButtonElement => {
		const el: HTMLButtonElement = document.createElement('button');
		el.type = 'button';
		el.className = 'notectl-link-popup__button';
		el.textContent = label;
		el.setAttribute('aria-label', aria);
		el.addEventListener('mousedown', (e) => e.preventDefault());
		el.addEventListener('click', action);
		return el;
	};
	const form = (): void => {
		content.replaceChildren();
		const input: HTMLInputElement = document.createElement('input');
		input.type = 'url';
		input.className = 'notectl-link-popup__input';
		input.value = String(range?.mark.attrs?.href ?? '');
		input.placeholder = locale.urlPlaceholder;
		input.setAttribute('aria-label', locale.urlAria);
		const error: HTMLDivElement = document.createElement('div');
		error.className = 'notectl-link-popup__error';
		error.setAttribute('role', 'alert');
		error.hidden = true;
		const apply = (): void => {
			if (!valid()) {
				close();
				return;
			}
			const href: string = sanitizeHref(input.value.trim());
			if (!href) {
				error.textContent = locale.invalidUrl;
				error.hidden = false;
				input.setAttribute('aria-invalid', 'true');
				input.focus();
				return;
			}
			const tr: Transaction | null = range
				? changeLink(context.getState(), range, href)
				: isTextSelection(state.selection) && !isCollapsed(state.selection)
					? applyAttributedMark(state, { type: markType('link'), attrs: { href } })
					: null;
			if (tr) context.dispatch(tr);
			close();
		};
		const applyButton: HTMLButtonElement = button(locale.apply, locale.applyAria, apply);
		applyButton.classList.add('notectl-link-popup__button--apply');
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.isComposing) {
				e.preventDefault();
				apply();
			}
		});
		input.addEventListener('input', () => {
			error.hidden = true;
			input.removeAttribute('aria-invalid');
		});
		content.append(input, applyButton, error);
		input.focus();
		requestAnimationFrame(() => {
			if (input.isConnected) input.focus();
		});
	};
	popup.addEventListener('keydown', (e) => {
		// The custom dialog owns its keys, including text editing and form Tab order.
		e.stopImmediatePropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}
		if (content.querySelector('input')) return;
		const actions: HTMLElement[] = Array.from(content.querySelectorAll<HTMLElement>('a, button'));
		const index: number = actions.indexOf(
			popup.getRootNode() instanceof ShadowRoot
				? ((popup.getRootNode() as ShadowRoot).activeElement as HTMLElement)
				: (document.activeElement as HTMLElement),
		);
		let next: number = index;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % actions.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
			next = (index + actions.length - 1) % actions.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = actions.length - 1;
		else return;
		e.preventDefault();
		actions.forEach((el, i) => {
			el.tabIndex = i === next ? 0 : -1;
		});
		actions[next]?.focus();
	});
	popup.addEventListener('focusout', (e) => {
		if (e.relatedTarget instanceof Node && !popup.contains(e.relatedTarget)) dismiss();
	});
	if (!range) {
		form();
		if (isAttributedMarkActive(state, 'link')) {
			content.append(
				button(locale.removeLink, locale.removeLinkAria, () => {
					if (valid()) context.executeCommand('removeLink');
					close();
				}),
			);
		}
		return;
	}
	const href: string = String(range.mark.attrs?.href ?? '');
	const open: HTMLAnchorElement | null = createNavigationLink(document, href, true);
	if (open) {
		open.className = 'notectl-link-bubble__open';
		const label: HTMLSpanElement = document.createElement('span');
		label.textContent =
			(open.target === '_blank' ? locale.openLinkInNewTab : locale.openLink) ??
			LINK_LOCALE_EN.openLink;
		const address: HTMLSpanElement = document.createElement('span');
		address.className = 'notectl-link-bubble__url';
		address.dir = 'ltr';
		address.textContent = sanitizeHref(href);
		open.append(label, address);
		open.addEventListener('click', (e) => {
			if (e.defaultPrevented || !href.startsWith('#')) return;
			e.preventDefault();
			scrollToFragment(context.getContainer(), href);
		});
		content.append(open);
	}
	const editLabel: string = locale.editLink ?? LINK_LOCALE_EN.editLink;
	const edit: HTMLButtonElement = button(editLabel, editLabel, form);
	const remove: HTMLButtonElement = button(locale.removeLink, locale.removeLinkAria, () => {
		if (valid()) context.executeCommand('removeLink');
		close();
	});
	edit.tabIndex = open ? -1 : 0;
	remove.tabIndex = -1;
	content.append(edit, remove);
	const closeButton: HTMLButtonElement = button(
		'×',
		locale.closeBubble ?? LINK_LOCALE_EN.closeBubble,
		close,
	);
	closeButton.className = 'notectl-link-bubble__close';
	popup.append(closeButton);
}
