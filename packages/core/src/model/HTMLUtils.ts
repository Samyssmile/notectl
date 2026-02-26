/**
 * HTML string escaping and formatting utilities shared across serialization and parsing.
 */

/** Escapes special HTML characters in text content. */
export function escapeHTML(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
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
	const tagPattern: RegExp = /(<\/?[a-zA-Z][^>]*\/?>)/g;
	let lastIndex = 0;

	let match: RegExpExecArray | null = tagPattern.exec(html);
	while (match !== null) {
		const text: string = html.slice(lastIndex, match.index);
		if (text.length > 0) {
			tokens.push(text);
		}
		tokens.push(match[1] ?? match[0]);
		lastIndex = tagPattern.lastIndex;
		match = tagPattern.exec(html);
	}

	const remaining: string = html.slice(lastIndex);
	if (remaining.length > 0) {
		tokens.push(remaining);
	}

	return tokens;
}

/** Extracts the tag name from an HTML tag string like `<p>` or `</div class="x">`. */
function extractTagName(tag: string): string {
	const match: RegExpMatchArray | null = tag.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
	return match?.[1]?.toLowerCase() ?? '';
}
