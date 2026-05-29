/**
 * HTML whitespace normalization, shared by the paste parser (`HTMLParser`) and the
 * `setContentHTML` parser (`DocumentParser`).
 *
 * Per the CSS Text / HTML whitespace processing model for `white-space: normal`,
 * whitespace in normal flow content is *insignificant*: runs of ASCII whitespace
 * (space, tab, line feed, carriage return, form feed) collapse to a single space,
 * and whitespace at the edges of a block collapses away entirely. Only `<br>` is a
 * real line break. Source-formatted HTML (server-rendered, hand-indented, or
 * hard-wrapped by a browser's clipboard serializer) therefore carries newlines and
 * indentation that must NOT survive parsing.
 *
 * This pass rewrites text-node data in place so both parsers can walk a tree whose
 * whitespace already matches what a browser would render. It only touches
 * `Text.data`; marks, block ids, and attributes are left untouched.
 */

/**
 * ASCII whitespace per the HTML spec. Deliberately NOT `\s`: `\s` also matches
 * non-breaking space (` `) and other Unicode spaces, which are significant
 * content and must be preserved verbatim.
 */
const COLLAPSIBLE_WHITESPACE: RegExp = /[ \t\n\r\f]+/g;

/**
 * Tags that establish a block formatting context in normal flow. Each starts a
 * fresh inline run whose leading/trailing whitespace is trimmed independently.
 * Self-contained (not coupled to the parsers' tag sets); unknown tags are treated
 * as inline.
 */
const FLOW_BLOCK_TAGS: ReadonlySet<string> = new Set([
	'P',
	'DIV',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'BLOCKQUOTE',
	'UL',
	'OL',
	'LI',
	'TABLE',
	'THEAD',
	'TBODY',
	'TFOOT',
	'TR',
	'TD',
	'TH',
	'HR',
	'FIGURE',
	'FIGCAPTION',
	'SECTION',
	'ARTICLE',
	'HEADER',
	'FOOTER',
	'MAIN',
	'ASIDE',
	'NAV',
	'DL',
	'DT',
	'DD',
]);

/** Tags whose descendant whitespace is significant and must be preserved verbatim. */
const PRESERVE_TAGS: ReadonlySet<string> = new Set(['PRE', 'TEXTAREA']);

/** `white-space` values that preserve whitespace (the `pre*` family). */
const PRESERVE_WHITESPACE_VALUES: ReadonlySet<string> = new Set([
	'pre',
	'pre-wrap',
	'pre-line',
	'break-spaces',
]);

/** Mutable state threaded through a single inline formatting context. */
interface CollapseState {
	/** Most recent non-empty text node in this context, for trailing-space trimming. */
	lastTextNode: Text | null;
	/**
	 * Whether a leading space on the next text node should be dropped. True at the
	 * start of a context and after any text node that ended with a space.
	 */
	collapsePending: boolean;
}

/**
 * Collapses insignificant HTML whitespace throughout `root`, mutating text-node
 * data in place. Call once on a (disposable) parsed fragment before walking it.
 */
export function normalizeHTMLWhitespace(root: DocumentFragment | HTMLElement): void {
	normalizeContext(root);
}

/** Processes one inline formatting context, then trims its trailing whitespace. */
function normalizeContext(container: DocumentFragment | HTMLElement): void {
	const state: CollapseState = { lastTextNode: null, collapsePending: true };
	for (const child of Array.from(container.childNodes)) {
		processNode(child, state);
	}
	trimTrailingSpace(state.lastTextNode);
}

function processNode(node: ChildNode, state: CollapseState): void {
	if (node.nodeType === Node.TEXT_NODE) {
		collapseTextNode(node as Text, state);
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;

	const el = node as HTMLElement;

	// Whitespace-preserving subtree (code blocks etc.): end the current inline run
	// and leave the subtree untouched.
	if (isPreserveElement(el)) {
		endInlineRun(state);
		return;
	}

	// Block element: the current inline run ends here; recurse as a fresh context.
	if (isFlowBlockElement(el)) {
		endInlineRun(state);
		normalizeContext(el);
		return;
	}

	// Inline element: keep collapsing within the same context.
	for (const child of Array.from(el.childNodes)) {
		processNode(child, state);
	}
}

/** Collapses whitespace runs in a text node and drops a leading space when pending. */
function collapseTextNode(text: Text, state: CollapseState): void {
	let data: string = text.data.replace(COLLAPSIBLE_WHITESPACE, ' ');
	if (state.collapsePending && data.startsWith(' ')) {
		data = data.slice(1);
	}
	text.data = data;

	// Fully collapsed away (e.g. a whitespace-only node): leave `collapsePending` as
	// is so a later node still drops its leading space.
	if (data.length === 0) return;

	state.collapsePending = data.endsWith(' ');
	state.lastTextNode = text;
}

/** Ends the current inline run at a block/preserve boundary and resets state. */
function endInlineRun(state: CollapseState): void {
	trimTrailingSpace(state.lastTextNode);
	state.lastTextNode = null;
	state.collapsePending = true;
}

/** Removes the single (already-collapsed) trailing space from a text node, if any. */
function trimTrailingSpace(node: Text | null): void {
	if (node?.data.endsWith(' ')) {
		node.data = node.data.slice(0, -1);
	}
}

function isFlowBlockElement(el: HTMLElement): boolean {
	return FLOW_BLOCK_TAGS.has(el.tagName);
}

function isPreserveElement(el: HTMLElement): boolean {
	if (PRESERVE_TAGS.has(el.tagName)) return true;
	const whiteSpace: string = (el.style?.whiteSpace ?? '').toLowerCase();
	return PRESERVE_WHITESPACE_VALUES.has(whiteSpace);
}
