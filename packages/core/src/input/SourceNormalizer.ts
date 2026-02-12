/**
 * SourceNormalizer: normalizes vendor-specific HTML before parsing.
 * Cleans up Word, Google Docs, and Apple Pages artifacts.
 */

type SourceType = 'word' | 'gdocs' | 'pages' | 'browser';

/** Detects the source and normalizes the DOM container in-place. */
export function normalizeSource(rawHTML: string, container: DocumentFragment | HTMLElement): void {
	const source: SourceType = detectSource(rawHTML);

	switch (source) {
		case 'word':
			normalizeWord(container);
			break;
		case 'gdocs':
			normalizeGoogleDocs(container);
			break;
		case 'pages':
			normalizePages(container);
			break;
		case 'browser':
			break;
	}

	stripRemainingStyles(container);
}

function detectSource(html: string): SourceType {
	if (
		html.includes('class="Mso') ||
		html.includes('xmlns:w=') ||
		html.includes('<!--[if gte mso')
	) {
		return 'word';
	}
	if (html.includes('id="docs-internal-guid"') || html.includes('data-sheets-')) {
		return 'gdocs';
	}
	if (html.includes('-webkit-text-') || html.includes('content="...Pages"')) {
		return 'pages';
	}
	return 'browser';
}

// --- Word Normalization ---

function normalizeWord(container: DocumentFragment | HTMLElement): void {
	removeConditionalComments(container);
	removeNamespaceElements(container);
	removeMsoStyles(container);
	unwrapEmptySpans(container);
	convertMsoListParagraphs(container);
	convertInlineStylesToTags(container);
	removeEmptyParagraphs(container);
}

function removeConditionalComments(container: DocumentFragment | HTMLElement): void {
	const walker: TreeWalker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
	const toRemove: Comment[] = [];
	let node: Comment | null = walker.nextNode() as Comment | null;
	while (node) {
		toRemove.push(node);
		node = walker.nextNode() as Comment | null;
	}
	for (const comment of toRemove) {
		comment.parentNode?.removeChild(comment);
	}
}

function removeNamespaceElements(container: DocumentFragment | HTMLElement): void {
	const selectors: string = 'o\\:p, v\\:shapetype, v\\:shape, w\\:sdt, w\\:sdtcontent';
	try {
		const elements: NodeListOf<Element> = container.querySelectorAll(selectors);
		for (const el of Array.from(elements)) {
			el.parentNode?.removeChild(el);
		}
	} catch {
		// querySelectorAll may fail on namespace selectors; use fallback
		removeNamespaceElementsFallback(container);
	}
}

function removeNamespaceElementsFallback(container: DocumentFragment | HTMLElement): void {
	const toRemove: Element[] = [];
	const walker: TreeWalker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
	let node: Element | null = walker.nextNode() as Element | null;
	while (node) {
		if (node.tagName.includes(':')) {
			toRemove.push(node);
		}
		node = walker.nextNode() as Element | null;
	}
	for (const el of toRemove) {
		el.parentNode?.removeChild(el);
	}
}

function removeMsoStyles(container: DocumentFragment | HTMLElement): void {
	const elements: NodeListOf<HTMLElement> = container.querySelectorAll('[style]');
	for (const el of Array.from(elements)) {
		const style: string = el.getAttribute('style') ?? '';
		const cleaned: string = style
			.split(';')
			.filter((prop: string) => !prop.trim().startsWith('mso-'))
			.join(';')
			.trim();

		if (cleaned) {
			el.setAttribute('style', cleaned);
		} else {
			el.removeAttribute('style');
		}
	}
}

function unwrapEmptySpans(container: DocumentFragment | HTMLElement): void {
	const spans: NodeListOf<HTMLSpanElement> = container.querySelectorAll('span');
	for (const span of Array.from(spans)) {
		const hasNonStyleAttrs: boolean = Array.from(span.attributes).some(
			(attr: Attr) => attr.name !== 'style' && attr.name !== 'class',
		);
		if (hasNonStyleAttrs) continue;

		const parent: Node | null = span.parentNode;
		if (!parent) continue;

		while (span.firstChild) {
			parent.insertBefore(span.firstChild, span);
		}
		parent.removeChild(span);
	}
}

function convertMsoListParagraphs(container: DocumentFragment | HTMLElement): void {
	const listParas: NodeListOf<Element> = container.querySelectorAll(
		'p.MsoListParagraph, p.MsoListParagraphCxSpFirst, p.MsoListParagraphCxSpMiddle, p.MsoListParagraphCxSpLast',
	);
	for (const para of Array.from(listParas)) {
		const li: HTMLLIElement = document.createElement('li');
		while (para.firstChild) {
			li.appendChild(para.firstChild);
		}
		const ul: HTMLUListElement = document.createElement('ul');
		ul.appendChild(li);
		para.parentNode?.replaceChild(ul, para);
	}
}

function removeEmptyParagraphs(container: DocumentFragment | HTMLElement): void {
	const paragraphs: NodeListOf<HTMLParagraphElement> = container.querySelectorAll('p');
	for (const p of Array.from(paragraphs)) {
		const text: string = p.textContent?.trim() ?? '';
		if (text === '' && p.querySelectorAll('img, br').length === 0) {
			p.parentNode?.removeChild(p);
		}
	}
}

// --- Google Docs Normalization ---

function normalizeGoogleDocs(container: DocumentFragment | HTMLElement): void {
	unwrapDocsGuidWrapper(container);
	convertGDocsInlineStyles(container);
}

function unwrapDocsGuidWrapper(container: DocumentFragment | HTMLElement): void {
	const guidWrapper: HTMLElement | null = container.querySelector('[id="docs-internal-guid"]');
	if (!guidWrapper) return;

	const parent: Node | null = guidWrapper.parentNode;
	if (!parent) return;

	while (guidWrapper.firstChild) {
		parent.insertBefore(guidWrapper.firstChild, guidWrapper);
	}
	parent.removeChild(guidWrapper);
}

function convertGDocsInlineStyles(container: DocumentFragment | HTMLElement): void {
	const styledElements: NodeListOf<HTMLElement> = container.querySelectorAll('[style]');

	for (const el of Array.from(styledElements)) {
		const style: CSSStyleDeclaration = el.style;

		if (isBoldWeight(style.fontWeight)) {
			wrapContentsWithTag(el, 'strong');
		}
		if (style.fontStyle === 'italic') {
			wrapContentsWithTag(el, 'em');
		}
		if (style.textDecoration.includes('underline')) {
			wrapContentsWithTag(el, 'u');
		}
		if (style.textDecoration.includes('line-through')) {
			wrapContentsWithTag(el, 's');
		}
	}
}

function isBoldWeight(weight: string): boolean {
	if (weight === 'bold' || weight === 'bolder') return true;
	const numWeight: number = Number(weight);
	return !Number.isNaN(numWeight) && numWeight >= 700;
}

function wrapContentsWithTag(el: HTMLElement, tagName: string): void {
	const existingTag: Element | null = el.querySelector(tagName);
	if (existingTag && existingTag.parentElement === el) return;

	const wrapper: HTMLElement = document.createElement(tagName);
	while (el.firstChild) {
		wrapper.appendChild(el.firstChild);
	}
	el.appendChild(wrapper);
}

// --- Apple Pages Normalization ---

function normalizePages(container: DocumentFragment | HTMLElement): void {
	convertInlineStylesToTags(container);
}

// --- Shared Helpers ---

function convertInlineStylesToTags(container: DocumentFragment | HTMLElement): void {
	const styledElements: NodeListOf<HTMLElement> = container.querySelectorAll('[style]');

	for (const el of Array.from(styledElements)) {
		const style: CSSStyleDeclaration = el.style;

		if (isBoldWeight(style.fontWeight)) {
			wrapContentsWithTag(el, 'strong');
		}
		if (style.fontStyle === 'italic') {
			wrapContentsWithTag(el, 'em');
		}
		if (style.textDecoration.includes('underline')) {
			wrapContentsWithTag(el, 'u');
		}
		if (style.textDecoration.includes('line-through')) {
			wrapContentsWithTag(el, 's');
		}
	}
}

function stripRemainingStyles(container: DocumentFragment | HTMLElement): void {
	const styled: NodeListOf<HTMLElement> = container.querySelectorAll('[style]');
	for (const el of Array.from(styled)) {
		el.removeAttribute('style');
	}

	const classed: NodeListOf<HTMLElement> = container.querySelectorAll('[class]');
	for (const el of Array.from(classed)) {
		el.removeAttribute('class');
	}
}
