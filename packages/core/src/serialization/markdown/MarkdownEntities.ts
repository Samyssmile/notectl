/**
 * HTML entity and backslash-escape decoding shared by the Markdown parser.
 *
 * CommonMark recognizes entity and numeric character references (and backslash
 * escapes) not only in inline text but also inside link destinations, link
 * titles, link reference definitions, and code-fence info strings. The small
 * built-in table covers the common names; uncommon names are decoded through
 * the environment's HTML parser when a DOM is available (browser, happy-dom),
 * because embedding the full HTML5 table (~2200 names) would bloat the chunk.
 * Without a DOM (pure Node) unknown entities stay literal, which never loses
 * content.
 */

/** Characters a backslash may escape (CommonMark ASCII punctuation). */
export const ESCAPABLE = /[!-/:-@[-`{-~]/;

/** Sticky matcher so callers scan at an index without slicing (linear-time, D1). */
const ENTITY_AT = /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/y;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	copy: '©',
	reg: '®',
	hellip: '…',
	mdash: '—',
	ndash: '–',
};

/**
 * Decodes a single HTML entity body (without `&`/`;`), or returns it verbatim.
 * Per CommonMark, U+0000 and invalid code points decode to U+FFFD; decoded
 * line separators become plain spaces so a text node never carries a raw
 * newline (block boundaries are structural in the editor model).
 */
export function decodeEntity(body: string): string {
	if (body[0] === '#') {
		const isHex: boolean = body[1] === 'x' || body[1] === 'X';
		const code: number = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
		if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return `&${body};`;
		if (code === 0) return '�';
		try {
			const decoded: string = String.fromCodePoint(code);
			return decoded === '\n' || decoded === '\r' ? ' ' : decoded;
		} catch {
			return '�';
		}
	}
	return NAMED_ENTITIES[body] ?? decodeNamedEntityViaDom(body) ?? `&${body};`;
}

/** Matches an entity reference at `pos` in `text`, or null. */
export function matchEntityAt(text: string, pos: number): RegExpExecArray | null {
	ENTITY_AT.lastIndex = pos;
	return ENTITY_AT.exec(text);
}

const domEntityCache = new Map<string, string | null>();

function decodeNamedEntityViaDom(body: string): string | null {
	if (typeof document === 'undefined') return null;
	const cached: string | null | undefined = domEntityCache.get(body);
	if (cached !== undefined) return cached;
	// `body` is regex-restricted to alphanumerics, so this cannot inject markup.
	const holder: HTMLElement = document.createElement('div');
	holder.innerHTML = `&${body};`;
	const text: string = holder.textContent ?? '';
	const decoded: string | null = text !== '' && text !== `&${body};` ? text : null;
	domEntityCache.set(body, decoded);
	return decoded;
}

/**
 * Decodes backslash escapes and entity references in a single left-to-right
 * pass (an escaped `&` therefore never starts an entity). Used for the string
 * contexts CommonMark decodes outside inline text: link destinations, titles,
 * reference definitions, and fence info strings.
 */
export function decodeEscapesAndEntities(text: string): string {
	let out = '';
	let i = 0;
	while (i < text.length) {
		const ch: string = text[i] ?? '';
		if (ch === '\\' && ESCAPABLE.test(text[i + 1] ?? '')) {
			out += text[i + 1];
			i += 2;
			continue;
		}
		if (ch === '&') {
			const match: RegExpExecArray | null = matchEntityAt(text, i);
			if (match?.[1]) {
				out += decodeEntity(match[1]);
				i += match[0].length;
				continue;
			}
		}
		out += ch;
		i++;
	}
	return out;
}

/** Decodes only entity references (escapes were already consumed by the caller). */
export function decodeEntitiesOnly(text: string): string {
	let out = '';
	let i = 0;
	while (i < text.length) {
		const ch: string = text[i] ?? '';
		if (ch === '&') {
			const match: RegExpExecArray | null = matchEntityAt(text, i);
			if (match?.[1]) {
				out += decodeEntity(match[1]);
				i += match[0].length;
				continue;
			}
		}
		out += ch;
		i++;
	}
	return out;
}
