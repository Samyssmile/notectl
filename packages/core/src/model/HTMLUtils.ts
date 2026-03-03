/**
 * HTML string escaping and formatting utilities shared across serialization and parsing.
 */

/**
 * URI scheme regex for DOMPurify that extends the default allowlist with `blob:` and `data:`.
 * `blob:` is needed to preserve same-origin blob URLs (e.g. uploaded images) through
 * clipboard round-trips and HTML serialization.
 */
export const SAFE_URI_REGEXP: RegExp =
	/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

/** Escapes special HTML characters in text content. */
export function escapeHTML(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Escapes a value for safe interpolation into an HTML attribute (double-quoted). */
export function escapeAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Block-level HTML tags that should appear on their own line with indentation. */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
	'p',
	'div',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'ul',
	'ol',
	'li',
	'blockquote',
	'table',
	'thead',
	'tbody',
	'tfoot',
	'tr',
	'td',
	'th',
	'pre',
	'figure',
	'figcaption',
	'section',
	'article',
	'header',
	'footer',
]);

/** Void (self-closing) HTML tags that never have children. */
const VOID_TAGS: ReadonlySet<string> = new Set([
	'br',
	'hr',
	'img',
	'input',
	'col',
	'area',
	'meta',
	'link',
]);

/**
 * Pretty-prints an HTML string with indentation and line breaks for block-level elements.
 * Inline content (e.g. `<strong>bold</strong> text`) stays on a single line.
 */
export function formatHTML(html: string, indent = '  '): string {
	const tokens: readonly string[] = tokenizeHTML(html);
	const lines: string[] = [];
	let depth = 0;
	let inlineBuffer = '';

	const flushInline = (): void => {
		const trimmed: string = inlineBuffer.trim();
		if (trimmed.length > 0) {
			lines.push(`${indent.repeat(depth)}${trimmed}`);
		}
		inlineBuffer = '';
	};

	for (const token of tokens) {
		const tag: string = token.startsWith('<') ? extractTagName(token) : '';
		const isBlock: boolean = BLOCK_TAGS.has(tag);
		const isVoid: boolean = VOID_TAGS.has(tag);

		if (isBlock || isVoid) {
			flushInline();

			if (token.startsWith('</')) {
				depth = Math.max(0, depth - 1);
				lines.push(`${indent.repeat(depth)}${token}`);
			} else {
				lines.push(`${indent.repeat(depth)}${token}`);
				if (isBlock && !isVoid && !token.endsWith('/>')) {
					depth += 1;
				}
			}
		} else {
			inlineBuffer += token;
		}
	}

	flushInline();
	return lines.join('\n');
}

/** Splits HTML into a flat list of tokens: tags and text segments between block boundaries. */
function tokenizeHTML(html: string): readonly string[] {
	const tokens: string[] = [];
	let textStart = 0;
	let i = 0;
	while (i < html.length) {
		if (html[i] !== '<') {
			i += 1;
			continue;
		}

		let nameStart = i + 1;
		if (nameStart < html.length && html[nameStart] === '/') {
			nameStart += 1;
		}
		const nameChar: string | undefined = html[nameStart];
		if (nameStart >= html.length || !nameChar || !isASCIILetter(nameChar)) {
			i += 1;
			continue;
		}

		const tagEnd: number | undefined = findTagEnd(html, nameStart + 1);
		if (tagEnd === undefined) {
			break;
		}

		if (i > textStart) {
			tokens.push(html.slice(textStart, i));
		}
		tokens.push(html.slice(i, tagEnd + 1));
		i = tagEnd + 1;
		textStart = i;
	}

	if (textStart < html.length) {
		tokens.push(html.slice(textStart));
	}
	return tokens;
}

function findTagEnd(html: string, from: number): number | undefined {
	let quote: '"' | "'" | undefined;
	for (let i = from; i < html.length; i += 1) {
		const char: string = html[i] ?? '';
		if (quote) {
			if (char === quote) {
				quote = undefined;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '>') {
			return i;
		}
	}
	return undefined;
}

function isASCIILetter(char: string): boolean {
	return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

/** Extracts the tag name from an HTML tag string like `<p>` or `</div class="x">`. */
function extractTagName(tag: string): string {
	const match: RegExpMatchArray | null = tag.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
	return match?.[1]?.toLowerCase() ?? '';
}
