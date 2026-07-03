import { describe, expect, it } from 'vitest';
import {
	collectPartStylesFromSheets,
	splitSelectorList,
	translatePartSelector,
	translatePartSelectorList,
} from './PrintHostPartStyles.js';

/**
 * happy-dom drops `::part()` rules at CSS parse time, so these tests drive the
 * traversal with hand-built fake CSSOM objects; the real-browser end-to-end
 * behaviour is proven by the Playwright spec e2e/print-part-css.spec.ts.
 */

interface FakeStyleRuleInit {
	readonly selectorText: string;
	readonly cssText: string;
	readonly nested?: readonly CSSRule[];
}

function fakeStyleRule(init: FakeStyleRuleInit): CSSRule {
	return {
		type: 1,
		selectorText: init.selectorText,
		style: { cssText: init.cssText },
		cssRules: init.nested ?? [],
	} as unknown as CSSRule;
}

function fakeMediaRule(mediaText: string, rules: readonly CSSRule[]): CSSRule {
	return {
		type: 4,
		media: { mediaText },
		cssRules: rules,
	} as unknown as CSSRule;
}

function fakeSupportsRule(conditionText: string, rules: readonly CSSRule[]): CSSRule {
	return {
		type: 12,
		conditionText,
		cssRules: rules,
	} as unknown as CSSRule;
}

function fakeLayerBlockRule(name: string, rules: readonly CSSRule[]): CSSRule {
	return {
		type: 0,
		name,
		cssRules: rules,
	} as unknown as CSSRule;
}

function fakeImportRule(styleSheet: CSSStyleSheet | null): CSSRule {
	return {
		type: 3,
		href: 'imported.css',
		styleSheet,
	} as unknown as CSSRule;
}

interface FakeSheetInit {
	readonly rules: readonly CSSRule[];
	readonly disabled?: boolean;
	readonly media?: string;
}

function fakeSheet(init: FakeSheetInit): CSSStyleSheet {
	return {
		disabled: init.disabled ?? false,
		media: { mediaText: init.media ?? '' },
		cssRules: init.rules,
	} as unknown as CSSStyleSheet;
}

function makeHost(): HTMLElement {
	return document.createElement('notectl-editor');
}

const CELL_RULE: CSSRule = fakeStyleRule({
	selectorText: 'notectl-editor::part(table-cell)',
	cssText: 'padding: 0px;',
});

describe('splitSelectorList', () => {
	it('splits on top-level commas', () => {
		expect(splitSelectorList('a, b, c')).toEqual(['a', ' b', ' c']);
	});

	it('keeps commas inside functional pseudo-classes intact', () => {
		expect(splitSelectorList(':is(a, b)::part(x), c')).toEqual([':is(a, b)::part(x)', ' c']);
	});

	it('keeps commas inside attribute selector strings intact', () => {
		expect(splitSelectorList('[data-x="a,b"], c')).toEqual(['[data-x="a,b"]', ' c']);
	});

	it('handles escaped quotes inside strings', () => {
		expect(splitSelectorList('[data-x="a\\",b"], c')).toEqual(['[data-x="a\\",b"]', ' c']);
	});

	it('returns the whole text when there is no top-level comma', () => {
		expect(splitSelectorList('a:is(b, c)')).toEqual(['a:is(b, c)']);
	});
});

describe('translatePartSelector', () => {
	it('translates a single ::part() to an attribute selector, dropping the host', () => {
		expect(translatePartSelector('notectl-editor::part(table-cell)', makeHost())).toBe(
			'[part~="table-cell"]',
		);
	});

	it('translates compound parts to chained attribute selectors', () => {
		expect(translatePartSelector('notectl-editor::part(table cell)', makeHost())).toBe(
			'[part~="table"][part~="cell"]',
		);
	});

	it('preserves trailing pseudo-classes and pseudo-elements', () => {
		expect(translatePartSelector('notectl-editor::part(table):hover', makeHost())).toBe(
			'[part~="table"]:hover',
		);
	});

	it('preserves trailing functional pseudo-classes containing commas', () => {
		expect(
			translatePartSelector('notectl-editor::part(table):is(:hover, :focus)', makeHost()),
		).toBe('[part~="table"]:is(:hover, :focus)');
	});

	it('matches host selectors with classes', () => {
		const host: HTMLElement = makeHost();
		host.classList.add('themed');
		expect(translatePartSelector('notectl-editor.themed::part(table)', host)).toBe(
			'[part~="table"]',
		);
	});

	it('returns null when the host portion does not match this editor', () => {
		expect(translatePartSelector('.other-widget::part(table)', makeHost())).toBeNull();
	});

	it('returns null for selectors without ::part()', () => {
		expect(translatePartSelector('.notectl-table td', makeHost())).toBeNull();
	});

	it('returns null for chained ::part() pseudo-elements', () => {
		expect(translatePartSelector('notectl-editor::part(a)::part(b)', makeHost())).toBeNull();
	});

	it('returns null for an empty part name', () => {
		expect(translatePartSelector('notectl-editor::part()', makeHost())).toBeNull();
	});
});

describe('translatePartSelectorList', () => {
	it('keeps only the selectors that target this host via ::part()', () => {
		const result: string | null = translatePartSelectorList(
			'notectl-editor::part(table), .other::part(x), div',
			makeHost(),
		);
		expect(result).toBe('[part~="table"]');
	});

	it('translates multiple matching selectors', () => {
		const result: string | null = translatePartSelectorList(
			'notectl-editor::part(table), notectl-editor::part(table-cell)',
			makeHost(),
		);
		expect(result).toBe('[part~="table"], [part~="table-cell"]');
	});

	it('does not corrupt selectors with commas inside functional pseudo-classes', () => {
		const result: string | null = translatePartSelectorList(
			'notectl-editor::part(table):is(:hover, :focus)',
			makeHost(),
		);
		expect(result).toBe('[part~="table"]:is(:hover, :focus)');
	});

	it('returns null when no selector qualifies', () => {
		expect(translatePartSelectorList('.a, .b td', makeHost())).toBeNull();
	});
});

describe('collectPartStylesFromSheets', () => {
	it('carries top-level part rules', () => {
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [CELL_RULE] })],
			makeHost(),
		);
		expect(result).toBe('[part~="table-cell"] { padding: 0px; }');
	});

	it('skips disabled stylesheets', () => {
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [CELL_RULE], disabled: true })],
			makeHost(),
		);
		expect(result).toBe('');
	});

	it('wraps rules from media-scoped stylesheets in their media condition', () => {
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [CELL_RULE], media: '(max-width: 600px)' })],
			makeHost(),
		);
		expect(result).toBe('@media (max-width: 600px) { [part~="table-cell"] { padding: 0px; } }');
	});

	it('ignores an "all" stylesheet media condition', () => {
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [CELL_RULE], media: 'all' })],
			makeHost(),
		);
		expect(result).toBe('[part~="table-cell"] { padding: 0px; }');
	});

	it('carries @media-nested rules wrapped in the same condition', () => {
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [fakeMediaRule('print', [CELL_RULE])] })],
			makeHost(),
		);
		expect(result).toBe('@media print { [part~="table-cell"] { padding: 0px; } }');
	});

	it('carries @supports-nested rules wrapped in the same condition', () => {
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [fakeSupportsRule('(display: grid)', [CELL_RULE])] })],
			makeHost(),
		);
		expect(result).toBe('@supports (display: grid) { [part~="table-cell"] { padding: 0px; } }');
	});

	it('flattens @layer blocks', () => {
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [fakeLayerBlockRule('app', [CELL_RULE])] })],
			makeHost(),
		);
		expect(result).toBe('[part~="table-cell"] { padding: 0px; }');
	});

	it('follows @import rules into the imported stylesheet', () => {
		const imported: CSSStyleSheet = fakeSheet({ rules: [CELL_RULE] });
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [fakeImportRule(imported)] })],
			makeHost(),
		);
		expect(result).toBe('[part~="table-cell"] { padding: 0px; }');
	});

	it('survives @import cycles', () => {
		const rules: CSSRule[] = [CELL_RULE];
		const cyclic: CSSStyleSheet = fakeSheet({ rules });
		rules.push(fakeImportRule(cyclic));
		const result: string = collectPartStylesFromSheets([cyclic], makeHost());
		expect(result).toBe('[part~="table-cell"] { padding: 0px; }');
	});

	it('resolves CSS-nesting selectors against the parent rule', () => {
		const parent: CSSRule = fakeStyleRule({
			selectorText: 'notectl-editor',
			cssText: 'color: red;',
			nested: [fakeStyleRule({ selectorText: '&::part(table)', cssText: 'padding: 0px;' })],
		});
		const result: string = collectPartStylesFromSheets(
			[fakeSheet({ rules: [parent] })],
			makeHost(),
		);
		expect(result).toBe('[part~="table"] { padding: 0px; }');
	});

	it('snapshots custom properties referenced by carried rules into :root', () => {
		const host: HTMLElement = makeHost();
		host.style.setProperty('--cell-pad', '4px');
		document.body.appendChild(host);
		const rule: CSSRule = fakeStyleRule({
			selectorText: 'notectl-editor::part(table-cell)',
			cssText: 'padding: var(--cell-pad);',
		});
		const result: string = collectPartStylesFromSheets([fakeSheet({ rules: [rule] })], host);
		expect(result).toContain(':root {\n  --cell-pad: 4px;\n}');
		expect(result).toContain('[part~="table-cell"] { padding: var(--cell-pad); }');
		document.body.removeChild(host);
	});

	it('does not snapshot --notectl-* custom properties', () => {
		const host: HTMLElement = makeHost();
		host.style.setProperty('--notectl-fg', '#000');
		document.body.appendChild(host);
		const rule: CSSRule = fakeStyleRule({
			selectorText: 'notectl-editor::part(table-cell)',
			cssText: 'color: var(--notectl-fg);',
		});
		const result: string = collectPartStylesFromSheets([fakeSheet({ rules: [rule] })], host);
		expect(result).not.toContain(':root');
		document.body.removeChild(host);
	});
});
