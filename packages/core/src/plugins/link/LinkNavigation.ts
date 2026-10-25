/** Safe link activation shared by editor gestures and link actions. */

import { fragmentIdentifiers, sanitizeHref } from '../../model/HTMLUtils.js';

/** Fragment-only links always target this editor, including with a new-tab default. */
export function shouldOpenInNewTab(href: string, openInNewTab: boolean): boolean {
	return openInNewTab && !href.startsWith('#');
}

/** Finds links through nested formatting without crossing the editor boundary. */
export function findLinkAnchor(
	container: HTMLElement,
	target: EventTarget | null,
): HTMLAnchorElement | null {
	let element: Element | null =
		target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
	while (element && container.contains(element)) {
		if (element instanceof HTMLAnchorElement) return element;
		if (element === container) break;
		element = element.parentElement;
	}
	return null;
}

/** Resolves semantic IDs inside this editor without interpolating URLs into selectors. */
export function scrollToFragment(container: HTMLElement, href: string): boolean {
	for (const identifier of fragmentIdentifiers(href)) {
		const target: Element | undefined =
			container.id === identifier
				? container
				: Array.from(container.getElementsByTagName('*')).find((el) => el.id === identifier);
		if (target) {
			target.scrollIntoView();
			return true;
		}
	}
	return false;
}

/** Creates a native navigation link; rejected and empty URLs never become active links. */
export function createNavigationLink(
	document: Document,
	rawHref: string,
	openInNewTab: boolean,
): HTMLAnchorElement | null {
	const href: string = sanitizeHref(rawHref);
	if (!href) return null;
	const link: HTMLAnchorElement = document.createElement('a');
	link.setAttribute('href', href);
	if (shouldOpenInNewTab(href, openInNewTab)) {
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
	}
	return link;
}

/** Activates synchronously within the user gesture so popup blockers allow the navigation. */
export function openLink(container: HTMLElement, rawHref: string, openInNewTab: boolean): boolean {
	const link: HTMLAnchorElement | null = createNavigationLink(
		container.ownerDocument,
		rawHref,
		openInNewTab,
	);
	if (!link) return false;
	const href: string = link.getAttribute('href') ?? '';
	if (href.startsWith('#')) return scrollToFragment(container, href);

	// Outside contenteditable: native activation retains URL/base/protocol handling.
	link.hidden = true;
	container.ownerDocument.body.appendChild(link);
	try {
		link.click();
	} finally {
		link.remove();
	}
	return true;
}
