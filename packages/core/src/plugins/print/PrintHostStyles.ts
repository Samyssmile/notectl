/**
 * Copies the host page's stylesheets verbatim into the print document.
 *
 * The print document preserves the editor's shadow boundary (declarative
 * shadow DOM), so host-authored rules — `::part()`, element selectors, custom
 * properties, `@media`, `@layer`, `@supports`, CSS nesting — apply natively
 * and need no translation or rewriting.
 *
 * All copied CSS is wrapped in the `notectl-host` cascade layer. Layering does
 * not weaken it against the editor's shadow styles, because the cascade
 * compares tree context before layers (an outer normal declaration beats a
 * shadow-tree one regardless). It does keep the print document's own rules in
 * control: its unlayered rules (page setup, body typography, customCSS) win
 * over the copy for normal declarations regardless of specificity, and the
 * print guards (host-element reset, forced light theme) — `!important` inside
 * the earlier-declared `notectl-print` layer — win even against `!important`
 * host rules.
 *
 * Stylesheets whose rules are not readable (cross-origin) are re-referenced
 * via hoisted `@import ... layer(notectl-host)` statements so the print
 * document loads them itself. Disabled stylesheets are skipped and
 * stylesheet-level media conditions are preserved as `@media` wrappers.
 */

/** Cascade layer that holds the copied host-page styles in print output. */
export const HOST_STYLE_LAYER = 'notectl-host';

const IMPORT_RULE_TYPE = 3;

/** Host-page CSS split into hoisted `@import` statements and layered rule text. */
export interface HostStyleCopy {
	/** `@import ... layer(notectl-host)` statements for unreadable (cross-origin) sheets. */
	readonly imports: readonly string[];
	/** Serialized rule text of all readable host stylesheets, in cascade order. */
	readonly layerBody: string;
}

interface CopyState {
	readonly imports: string[];
	readonly parts: string[];
	readonly seen: Set<CSSStyleSheet>;
	/** Base URL for rules from sheets without an own URL (inline styles). */
	readonly baseURL: string;
	/** Counter for naming hoisted anonymous import layers uniquely. */
	anonymousLayerCount: number;
}

/**
 * Collects the style roots that can hold rules targeting this editor: the
 * document plus any shadow roots the editor is nested in (outermost first, so
 * later, closer scopes win source-order ties after flattening).
 */
function styleRootsOf(host: HTMLElement): readonly (Document | ShadowRoot)[] {
	const roots: (Document | ShadowRoot)[] = [];
	let node: Node = host.getRootNode();
	while (node instanceof ShadowRoot) {
		roots.push(node);
		node = node.host.getRootNode();
	}
	roots.push(host.ownerDocument);
	return roots.reverse();
}

function sheetsOfRoot(root: Document | ShadowRoot): readonly CSSStyleSheet[] {
	const sheets: CSSStyleSheet[] = Array.from(root.styleSheets);
	const adopted: readonly CSSStyleSheet[] | undefined = root.adoptedStyleSheets;
	if (adopted) sheets.push(...adopted);
	return sheets;
}

/** Escapes a URL for embedding in `@import url("...")`. */
function escapeImportURL(url: string): string {
	return url.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Matches `url(...)` tokens: double-quoted, single-quoted, or bare. */
const CSS_URL_PATTERN = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)"'\s]+))\s*\)/g;

/**
 * URLs that must not be rebased: fragment-only references stay document-local
 * (SVG paint servers like `fill: url(#gradient)`), and URLs that already have
 * a scheme or are protocol-relative resolve identically everywhere.
 */
function isRebasableURL(url: string): boolean {
	if (url.startsWith('#') || url.startsWith('//')) return false;
	return !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * Rewrites relative `url()` references to absolute URLs against the source
 * stylesheet's URL. Copied `cssText` keeps URLs as authored; in the print
 * document they would re-resolve against the page URL instead of the
 * stylesheet's location, breaking fonts and images from stylesheets that live
 * in another directory.
 */
function rebaseCSSURLs(cssText: string, baseURL: string): string {
	if (!cssText.includes('url(')) return cssText;
	return cssText.replace(
		CSS_URL_PATTERN,
		(match: string, doubleQuoted?: string, singleQuoted?: string, bare?: string): string => {
			const raw: string = doubleQuoted ?? singleQuoted ?? bare ?? '';
			if (!raw || !isRebasableURL(raw)) return match;
			try {
				return `url("${new URL(raw, baseURL).href}")`;
			} catch {
				return match;
			}
		},
	);
}

/** Returns a unique sublayer name for a hoisted anonymous import layer. */
function anonymousLayerName(state: CopyState): string {
	state.anonymousLayerCount += 1;
	return `notectl-anonymous-${state.anonymousLayerCount}`;
}

/**
 * Re-references a stylesheet whose rules are not readable. The import's own
 * cascade-layer assignment survives as a sublayer of `notectl-host` (nested
 * layers order before the parent's direct rules, mirroring how layered import
 * content loses to unlayered page rules live), and its `supports()` condition
 * is carried verbatim.
 */
function hoistImport(
	state: CopyState,
	href: string,
	mediaText: string,
	layerName: string | null,
	supportsText: string | null,
): void {
	const media: string = mediaText.trim();
	const mediaCondition: string = media && media !== 'all' ? ` ${media}` : '';
	let layer: string = HOST_STYLE_LAYER;
	if (layerName === '') {
		layer = `${HOST_STYLE_LAYER}.${anonymousLayerName(state)}`;
	} else if (layerName) {
		layer = `${HOST_STYLE_LAYER}.${layerName}`;
	}
	const supports: string = supportsText?.trim() ? ` supports(${supportsText.trim()})` : '';
	state.imports.push(
		`@import url("${escapeImportURL(href)}") layer(${layer})${supports}${mediaCondition};`,
	);
}

/** Wraps serialized sheet text in the sheet's own media condition, if any. */
function wrapInSheetMedia(text: string, mediaText: string): string {
	const media: string = mediaText.trim();
	if (!media || media === 'all') return text;
	return `@media ${media} {\n${text}\n}`;
}

function serializeSheet(sheet: CSSStyleSheet, state: CopyState): void {
	if (state.seen.has(sheet)) return;
	state.seen.add(sheet);
	if (sheet.disabled) return;

	let cssRules: CSSRuleList;
	try {
		cssRules = sheet.cssRules;
	} catch {
		// Cross-origin — rules are not readable. Re-reference so the print
		// document loads the stylesheet itself.
		if (sheet.href) hoistImport(state, sheet.href, sheet.media.mediaText, null, null);
		return;
	}

	const base: string = sheet.href ?? state.baseURL;
	const body: string[] = [];
	for (const rule of cssRules) {
		if (rule.type === IMPORT_RULE_TYPE) {
			serializeImportRule(rule as CSSImportRule, state, body);
			continue;
		}
		body.push(rebaseCSSURLs(rule.cssText, base));
	}

	const text: string = body.join('\n');
	if (text) state.parts.push(wrapInSheetMedia(text, sheet.media.mediaText));
}

/**
 * Inlines a readable `@import` target in place; unreadable targets are hoisted
 * as layered `@import` statements (`@import` is not valid inside a layer
 * block, so it cannot be copied verbatim). The import's own cascade-layer
 * assignment and `supports()` condition survive inlining as nested `@layer`
 * and `@supports` blocks — without them, layered import content would compete
 * on specificity against page rules it loses to live.
 */
function serializeImportRule(rule: CSSImportRule, state: CopyState, body: string[]): void {
	const layerName: string | null = rule.layerName ?? null;
	const supportsText: string | null = rule.supportsText ?? null;
	const imported: CSSStyleSheet | null = rule.styleSheet;
	if (imported && !state.seen.has(imported)) {
		let importedRules: CSSRuleList | null;
		try {
			importedRules = imported.cssRules;
		} catch {
			importedRules = null;
		}
		if (importedRules) {
			state.seen.add(imported);
			const base: string = imported.href ?? state.baseURL;
			const inner: string[] = [];
			for (const importedRule of importedRules) {
				if (importedRule.type === IMPORT_RULE_TYPE) {
					serializeImportRule(importedRule as CSSImportRule, state, inner);
					continue;
				}
				inner.push(rebaseCSSURLs(importedRule.cssText, base));
			}
			let text: string = inner.join('\n');
			if (text) {
				if (layerName !== null) {
					// Anonymous import layers stay anonymous via a nameless block.
					text = layerName === '' ? `@layer {\n${text}\n}` : `@layer ${layerName} {\n${text}\n}`;
				}
				if (supportsText?.trim()) {
					// supports(display: grid) allows a bare declaration; the @supports
					// rule grammar does not, so the condition is parenthesized.
					text = `@supports (${supportsText.trim()}) {\n${text}\n}`;
				}
				body.push(wrapInSheetMedia(text, rule.media.mediaText));
			}
			return;
		}
	}
	const href: string | null = imported?.href ?? rule.href;
	if (href) hoistImport(state, href, rule.media.mediaText, layerName, supportsText);
}

/**
 * Copies all stylesheets that can target this editor (document-level plus any
 * enclosing shadow roots, including adopted sheets) into a layered, verbatim
 * CSS copy for the print document.
 */
export function collectHostStyleCopy(host: HTMLElement): HostStyleCopy {
	const state: CopyState = {
		imports: [],
		parts: [],
		seen: new Set(),
		baseURL: host.ownerDocument.baseURI ?? '',
		anonymousLayerCount: 0,
	};
	for (const root of styleRootsOf(host)) {
		for (const sheet of sheetsOfRoot(root)) {
			serializeSheet(sheet, state);
		}
	}
	return { imports: state.imports, layerBody: state.parts.join('\n') };
}
