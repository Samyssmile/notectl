/**
 * Attribute edits on the first opening tag of an HTML fragment. The serializer
 * uses them to add block-level attributes (`data-block-id`, `dir`, `id`, and the
 * alignment class or style) to whatever markup a NodeSpec's `toHTML()` produced.
 * Tag scanning is quote-aware, so `>` inside attribute values is never a tag end.
 */

import { escapeAttr, normalizeHTMLId } from '../model/HTMLUtils.js';

/**
 * Injects or merges an attribute into the first opening tag of an HTML fragment.
 * Values are expected to be pre-escaped by the caller.
 */
export function injectAttrIntoFirstTag(html: string, attr: string, value: string): string {
	const firstTagRange: { start: number; end: number } | undefined = findFirstOpeningTagRange(html);
	if (!firstTagRange) return html;
	const firstTag: string = html.slice(firstTagRange.start, firstTagRange.end + 1);
	const pattern: RegExp = new RegExp(`\\s${attr}\\s*=\\s*(\"([^\"]*)\"|'([^']*)')`);
	const existing: RegExpMatchArray | null = firstTag.match(pattern);
	if (existing) {
		const existingValue: string = existing[2] ?? existing[3] ?? '';
		if (attr === 'style' && /(?:^|;)\s*text-align\s*:/i.test(existingValue)) {
			return html;
		}
		const sep: string = attr === 'style' ? '; ' : ' ';
		const mergedAttr: string = ` ${attr}="${existingValue}${sep}${value}"`;
		const nextFirstTag: string = firstTag.replace(pattern, mergedAttr);
		return `${html.slice(0, firstTagRange.start)}${nextFirstTag}${html.slice(firstTagRange.end + 1)}`;
	}
	const isSelfClosing: boolean = firstTag.endsWith('/>');
	const injectedFirstTag: string = isSelfClosing
		? `${firstTag.slice(0, -2)} ${attr}="${value}"/>`
		: `${firstTag.slice(0, -1)} ${attr}="${value}">`;
	return `${html.slice(0, firstTagRange.start)}${injectedFirstTag}${html.slice(firstTagRange.end + 1)}`;
}

/** Replaces an attribute on the first opening tag, or adds it when absent. */
function setAttrOnFirstTag(html: string, attr: string, value: string): string {
	const firstTagRange: { start: number; end: number } | undefined = findFirstOpeningTagRange(html);
	if (!firstTagRange) return html;
	const firstTag: string = html.slice(firstTagRange.start, firstTagRange.end + 1);
	const replacement: string = ` ${attr}="${value}"`;
	const withoutExisting: string = removeAttributes(firstTag, attr);
	const isSelfClosing: boolean = withoutExisting.endsWith('/>');
	const nextFirstTag: string = isSelfClosing
		? `${withoutExisting.slice(0, -2)}${replacement}/>`
		: `${withoutExisting.slice(0, -1)}${replacement}>`;
	return `${html.slice(0, firstTagRange.start)}${nextFirstTag}${html.slice(firstTagRange.end + 1)}`;
}

/** Removes real attributes by name without matching attribute-like text inside quoted values. */
function removeAttributes(openingTag: string, attr: string): string {
	const ranges: { readonly start: number; readonly end: number }[] = [];
	let index = 1;

	// Skip the tag name.
	while (
		index < openingTag.length &&
		!isTagWhitespace(openingTag[index] ?? '') &&
		openingTag[index] !== '>' &&
		openingTag[index] !== '/'
	) {
		index++;
	}

	while (index < openingTag.length) {
		while (isTagWhitespace(openingTag[index] ?? '')) index++;
		if (openingTag[index] === '>' || openingTag[index] === undefined) break;
		if (openingTag[index] === '/' && openingTag[index + 1] === '>') break;

		const start: number = index;
		while (
			index < openingTag.length &&
			!isTagWhitespace(openingTag[index] ?? '') &&
			openingTag[index] !== '=' &&
			openingTag[index] !== '>' &&
			openingTag[index] !== '/'
		) {
			index++;
		}
		const name: string = openingTag.slice(start, index);
		if (name === '') {
			index++;
			continue;
		}

		while (isTagWhitespace(openingTag[index] ?? '')) index++;
		if (openingTag[index] === '=') {
			index++;
			while (isTagWhitespace(openingTag[index] ?? '')) index++;
			const quote: string | undefined = openingTag[index];
			if (quote === '"' || quote === "'") {
				index++;
				while (index < openingTag.length && openingTag[index] !== quote) index++;
				if (openingTag[index] === quote) index++;
			} else {
				while (
					index < openingTag.length &&
					!isTagWhitespace(openingTag[index] ?? '') &&
					openingTag[index] !== '>' &&
					!(openingTag[index] === '/' && openingTag[index + 1] === '>')
				) {
					index++;
				}
			}
		}

		if (name.toLowerCase() === attr.toLowerCase()) ranges.push({ start, end: index });
	}

	let result: string = openingTag;
	for (let rangeIndex = ranges.length - 1; rangeIndex >= 0; rangeIndex--) {
		const range = ranges[rangeIndex];
		if (range) result = `${result.slice(0, range.start)}${result.slice(range.end)}`;
	}
	return result;
}

function isTagWhitespace(character: string): boolean {
	return (
		character === ' ' ||
		character === '\t' ||
		character === '\n' ||
		character === '\f' ||
		character === '\r'
	);
}

/** Applies a validated semantic HTML ID to the first element emitted for a block. */
export function setHTMLIdOnFirstTag(html: string, value: unknown): string {
	const htmlId: string | undefined = normalizeHTMLId(value);
	return htmlId ? setAttrOnFirstTag(html, 'id', escapeAttr(htmlId)) : html;
}

/** Finds the first opening tag range, treating `>` inside quotes as attribute text. */
function findFirstOpeningTagRange(html: string): { start: number; end: number } | undefined {
	let start: number = html.indexOf('<');
	while (start >= 0) {
		const nextChar: string | undefined = html[start + 1];
		if (nextChar && /[A-Za-z]/.test(nextChar)) {
			let quote: '"' | "'" | undefined;
			for (let i = start + 2; i < html.length; i++) {
				const char: string = html[i] ?? '';
				if (quote) {
					if (char === quote) quote = undefined;
					continue;
				}
				if (char === '"' || char === "'") {
					quote = char;
					continue;
				}
				if (char === '>') {
					return { start, end: i };
				}
			}
			return undefined;
		}
		start = html.indexOf('<', start + 1);
	}
	return undefined;
}

/** Returns the first opening tag of `html` (quote-aware), or `''` if none exists. */
export function firstOpeningTag(html: string): string {
	const range: { start: number; end: number } | undefined = findFirstOpeningTagRange(html);
	if (!range) return '';
	return html.slice(range.start, range.end + 1);
}
