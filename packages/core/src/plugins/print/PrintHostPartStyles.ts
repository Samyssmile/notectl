/**
 * Carries host-page `::part()` styling into the flattened print document.
 *
 * The print document has no shadow host, so `::part()` can never match there;
 * the cloned elements keep their `part="..."` attributes instead. This module
 * reads the host page's stylesheets and rewrites every `::part()` rule that
 * targets this editor into an attribute-selector rule, so consumer shadow-part
 * styling survives into print (WYSIWYG).
 *
 * Coverage: top-level rules, rules nested in `@media`/`@supports` (re-emitted
 * wrapped in the same condition so the print document evaluates it), rules in
 * `@layer` blocks and CSS-nesting parents (flattened), and same-origin
 * `@import` stylesheets. Disabled stylesheets are skipped, stylesheet-level
 * media conditions are preserved, and custom properties referenced by carried
 * rules are snapshotted from the live page. Cross-origin stylesheets are
 * skipped silently because their rules are not readable.
 */

/** Matches `var(--name` references, including those in fallback positions. */
const CUSTOM_PROPERTY_REFERENCE = /var\(\s*(--[A-Za-z0-9_-]+)/g;

/** Legacy CSSRule.type values — stable across browsers, safe for dispatch. */
const IMPORT_RULE_TYPE = 3;
const MEDIA_RULE_TYPE = 4;
const SUPPORTS_RULE_TYPE = 12;

/**
 * Splits a selector list on top-level commas only, respecting parentheses,
 * brackets, and quoted strings. A naive `split(',')` would corrupt selectors
 * like `:is(a, b)::part(x)` into unbalanced fragments; an unbalanced paren in
 * emitted CSS swallows every rule that follows it.
 */
export function splitSelectorList(selectorText: string): readonly string[] {
	const selectors: string[] = [];
	let depth = 0;
	let start = 0;
	let quote: string | null = null;
	for (let i = 0; i < selectorText.length; i++) {
		const char: string = selectorText[i] ?? '';
		if (quote) {
			if (char === '\\') {
				i++;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '(' || char === '[') {
			depth++;
		} else if (char === ')' || char === ']') {
			depth = Math.max(0, depth - 1);
		} else if (char === ',' && depth === 0) {
			selectors.push(selectorText.slice(start, i));
			start = i + 1;
		}
	}
	selectors.push(selectorText.slice(start));
	return selectors;
}

/**
 * Translates a single `::part()` selector authored on the host page into a
 * plain attribute selector usable in the flattened print document:
 *
 *   notectl-editor::part(table-cell)        -> [part~="table-cell"]
 *   notectl-editor::part(table cell):hover  -> [part~="table"][part~="cell"]:hover
 *
 * Returns `null` when the selector does not target this `host` via `::part()`,
 * or when it chains multiple `::part()` pseudo-elements (not supported).
 */
export function translatePartSelector(selector: string, host: HTMLElement): string | null {
	const match: RegExpExecArray | null = /^(.*?)::part\(([^)]*)\)(.*)$/.exec(selector);
	if (!match) return null;

	const hostPortion: string = match[1] ?? '';
	const rawNames: string = match[2] ?? '';
	const trailing: string = match[3] ?? '';
	// A second `::part()` in the trailing portion would be left untranslated.
	if (trailing.includes('::part(')) return null;
	if (!targetsHost(host, hostPortion.trim())) return null;

	const names: readonly string[] = rawNames.trim().split(/\s+/).filter(Boolean);
	if (names.length === 0) return null;

	const attributes: string = names.map((name) => `[part~="${name}"]`).join('');
	return `${attributes}${trailing}`;
}

/**
 * Translates a full selector list. Keeps only the selectors that target this
 * host via `::part()`. Returns `null` when none qualify.
 */
export function translatePartSelectorList(selectorText: string, host: HTMLElement): string | null {
	const translated: string[] = [];
	for (const selector of splitSelectorList(selectorText)) {
		const one: string | null = translatePartSelector(selector.trim(), host);
		if (one) translated.push(one);
	}
	return translated.length > 0 ? translated.join(', ') : null;
}

/** True when `host` matches the selector portion preceding `::part()`. */
function targetsHost(host: HTMLElement, hostPortion: string): boolean {
	if (!hostPortion) return false;
	try {
		return host.matches(hostPortion);
	} catch {
		return false; // invalid selector — cannot target this host
	}
}

/** Type guard for style rules (rules that expose a `selectorText`). */
function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
	return typeof (rule as CSSStyleRule).selectorText === 'string';
}

/**
 * Duck-typed check for `@layer` blocks, which have no legacy type constant
 * (`rule.type` is 0). Also matches `@keyframes` (name + cssRules), which is
 * harmless: keyframe children have no selectorText and are skipped.
 */
function isLayerBlockRule(rule: CSSRule): rule is CSSRule & { readonly cssRules: CSSRuleList } {
	const candidate = rule as { readonly name?: unknown; readonly cssRules?: CSSRuleList };
	return typeof candidate.name === 'string' && candidate.cssRules !== undefined;
}

/** Collects the host page's own stylesheets, including document-level adopted sheets. */
function hostStyleSheets(host: HTMLElement): readonly CSSStyleSheet[] {
	const doc: Document = host.ownerDocument;
	const sheets: CSSStyleSheet[] = Array.from(doc.styleSheets);
	const adopted: readonly CSSStyleSheet[] | undefined = doc.adoptedStyleSheets;
	if (adopted) sheets.push(...adopted);
	return sheets;
}

/** Appends a `@media` wrapper unless the condition is empty or matches everything. */
function appendMediaCondition(conditions: readonly string[], mediaText: string): readonly string[] {
	const condition: string = mediaText.trim();
	if (!condition || condition === 'all') return conditions;
	return [...conditions, `@media ${condition}`];
}

/** Wraps a rule in its enclosing conditional group rules, innermost last. */
function wrapInConditions(ruleText: string, conditions: readonly string[]): string {
	let wrapped: string = ruleText;
	for (let i = conditions.length - 1; i >= 0; i--) {
		wrapped = `${conditions[i]} { ${wrapped} }`;
	}
	return wrapped;
}

/**
 * Resolves CSS-nesting selectors against their parent rule's selector, per the
 * nesting spec: `&` is substituted with `:is(parent)`; a nested selector
 * without `&` is an implicit descendant of the parent.
 */
function resolveNestedSelectorList(selectorText: string, parentSelector: string | null): string {
	if (!parentSelector) return selectorText;
	const parentScope = `:is(${parentSelector})`;
	return splitSelectorList(selectorText)
		.map((selector: string): string => selector.trim())
		.filter((selector: string): boolean => selector.length > 0)
		.map((selector: string): string =>
			selector.includes('&') ? selector.replaceAll('&', parentScope) : `${parentScope} ${selector}`,
		)
		.join(', ');
}

function collectFromRules(
	rules: CSSRuleList,
	host: HTMLElement,
	conditions: readonly string[],
	parentSelector: string | null,
	out: string[],
	seen: Set<CSSStyleSheet>,
): void {
	for (const rule of rules) {
		if (isStyleRule(rule)) {
			const effective: string = resolveNestedSelectorList(rule.selectorText, parentSelector);
			const selector: string | null = translatePartSelectorList(effective, host);
			if (selector) {
				const body: string = rule.style.cssText;
				if (body) out.push(wrapInConditions(`${selector} { ${body} }`, conditions));
			}
			const nested: CSSRuleList | undefined = (
				rule as CSSStyleRule & { readonly cssRules?: CSSRuleList }
			).cssRules;
			if (nested && nested.length > 0) {
				collectFromRules(nested, host, conditions, effective, out, seen);
			}
			continue;
		}
		if (rule.type === IMPORT_RULE_TYPE) {
			const imported: CSSStyleSheet | null = (rule as CSSImportRule).styleSheet;
			if (imported) collectFromSheet(imported, host, conditions, out, seen);
			continue;
		}
		if (rule.type === MEDIA_RULE_TYPE) {
			const media: CSSMediaRule = rule as CSSMediaRule;
			const next: readonly string[] = appendMediaCondition(conditions, media.media.mediaText);
			collectFromRules(media.cssRules, host, next, parentSelector, out, seen);
			continue;
		}
		if (rule.type === SUPPORTS_RULE_TYPE) {
			const supports: CSSSupportsRule = rule as CSSSupportsRule;
			const next: readonly string[] = [...conditions, `@supports ${supports.conditionText}`];
			collectFromRules(supports.cssRules, host, next, parentSelector, out, seen);
			continue;
		}
		if (isLayerBlockRule(rule)) {
			// Flatten: carried rules stay unlayered so they win over the print
			// document's own base layer, exactly as host part rules do live.
			collectFromRules(rule.cssRules, host, conditions, parentSelector, out, seen);
		}
		// Other conditional contexts (e.g. @container) cannot be reproduced in
		// the print document and are skipped.
	}
}

function collectFromSheet(
	sheet: CSSStyleSheet,
	host: HTMLElement,
	conditions: readonly string[],
	out: string[],
	seen: Set<CSSStyleSheet>,
): void {
	if (seen.has(sheet)) return;
	seen.add(sheet);
	if (sheet.disabled) return;
	let cssRules: CSSRuleList;
	try {
		cssRules = sheet.cssRules;
	} catch {
		return; // cross-origin stylesheet — not readable
	}
	const sheetConditions: readonly string[] = appendMediaCondition(
		conditions,
		sheet.media.mediaText,
	);
	collectFromRules(cssRules, host, sheetConditions, null, out, seen);
}

/**
 * Snapshots the current values of custom properties referenced by the carried
 * rules into a `:root` block, so `var()` references keep resolving in the
 * print document. `--notectl-*` tokens are excluded — they are managed by the
 * print theme handling.
 */
function snapshotReferencedCustomProperties(
	host: HTMLElement,
	ruleTexts: readonly string[],
): string {
	const names: Set<string> = new Set();
	for (const text of ruleTexts) {
		for (const match of text.matchAll(CUSTOM_PROPERTY_REFERENCE)) {
			const name: string | undefined = match[1];
			if (name && !name.startsWith('--notectl-')) names.add(name);
		}
	}
	if (names.size === 0) return '';

	const computed: CSSStyleDeclaration = getComputedStyle(host);
	const declarations: string[] = [];
	for (const name of Array.from(names).sort()) {
		const value: string = computed.getPropertyValue(name).trim();
		if (value) declarations.push(`  ${name}: ${value};`);
	}
	if (declarations.length === 0) return '';
	return `:root {\n${declarations.join('\n')}\n}`;
}

/**
 * Runs the `::part()` collection over an explicit sheet list.
 * Exposed separately so the traversal is unit-testable with fake sheets
 * (happy-dom drops `::part()` rules at parse time, see the Playwright spec
 * e2e/print-part-css.spec.ts for the real-browser proof).
 */
export function collectPartStylesFromSheets(
	sheets: readonly CSSStyleSheet[],
	host: HTMLElement,
): string {
	const rules: string[] = [];
	const seen: Set<CSSStyleSheet> = new Set();
	for (const sheet of sheets) {
		collectFromSheet(sheet, host, [], rules, seen);
	}
	if (rules.length === 0) return '';
	const customProperties: string = snapshotReferencedCustomProperties(host, rules);
	return customProperties ? [customProperties, ...rules].join('\n') : rules.join('\n');
}

/**
 * Reads the host page's stylesheets and translates every `::part()` rule that
 * targets this editor into an attribute-selector rule for the print document.
 */
export function collectHostPartStyles(host: HTMLElement): string {
	return collectPartStylesFromSheets(hostStyleSheets(host), host);
}
