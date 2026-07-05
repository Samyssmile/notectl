import { describe, expect, it } from 'vitest';
import { type HostStyleSegment, collectHostStyleSegments } from './PrintHostStyles.js';

/**
 * The copier serializes host CSSOM verbatim. happy-dom drops `::part()` rules
 * at CSS parse time and cannot express cross-origin sheets, so these tests
 * drive the traversal with hand-built fake CSSOM objects; the real-browser
 * end-to-end behaviour is proven by e2e/print-part-css.spec.ts.
 *
 * `collectHostStyleSegments` reads sheets from the host's root nodes; the
 * fakes are injected via a fake host whose ownerDocument exposes the fake
 * sheets.
 */

interface FakeRuleInit {
	readonly cssText: string;
	readonly type?: number;
	readonly styleSheet?: CSSStyleSheet | null;
	readonly href?: string | null;
	readonly media?: string;
	/** Import rule layer: null = unlayered, '' = anonymous, name otherwise. */
	readonly layerName?: string | null;
	readonly supportsText?: string | null;
}

function fakeRule(init: FakeRuleInit): CSSRule {
	return {
		type: init.type ?? 1,
		cssText: init.cssText,
		styleSheet: init.styleSheet ?? null,
		href: init.href ?? null,
		media: { mediaText: init.media ?? '' },
		layerName: init.layerName ?? null,
		supportsText: init.supportsText ?? null,
	} as unknown as CSSRule;
}

interface FakeSheetInit {
	readonly rules?: readonly CSSRule[];
	readonly disabled?: boolean;
	readonly media?: string;
	readonly href?: string | null;
	/** Simulates a cross-origin sheet: accessing cssRules throws. */
	readonly unreadable?: boolean;
}

function fakeSheet(init: FakeSheetInit): CSSStyleSheet {
	const sheet = {
		disabled: init.disabled ?? false,
		media: { mediaText: init.media ?? '' },
		href: init.href ?? null,
	};
	if (init.unreadable) {
		Object.defineProperty(sheet, 'cssRules', {
			get(): CSSRuleList {
				throw new DOMException('Cannot access rules', 'SecurityError');
			},
		});
	} else {
		Object.defineProperty(sheet, 'cssRules', {
			get(): CSSRuleList {
				return (init.rules ?? []) as unknown as CSSRuleList;
			},
		});
	}
	return sheet as unknown as CSSStyleSheet;
}

/** Builds a host element whose document root exposes exactly `sheets`. */
function fakeHost(sheets: readonly CSSStyleSheet[], baseURI?: string): HTMLElement {
	const doc = {
		styleSheets: sheets,
		adoptedStyleSheets: [],
		baseURI,
	};
	const host = {
		ownerDocument: doc,
		getRootNode(): unknown {
			return doc;
		},
	};
	return host as unknown as HTMLElement;
}

/** Concatenated rule text of all `rules` segments. */
function layerBody(segments: readonly HostStyleSegment[]): string {
	return segments
		.filter((segment): segment is Extract<HostStyleSegment, { kind: 'rules' }> => {
			return segment.kind === 'rules';
		})
		.map((segment): string => segment.css)
		.join('\n');
}

/** All hoisted `@import` statements, in order. */
function importStatements(segments: readonly HostStyleSegment[]): readonly string[] {
	return segments
		.filter((segment): segment is Extract<HostStyleSegment, { kind: 'import' }> => {
			return segment.kind === 'import';
		})
		.map((segment): string => segment.statement);
}

const PART_RULE_TEXT = 'notectl-editor::part(table-cell) { padding: 0px; }';

describe('collectHostStyleSegments', () => {
	it('serializes readable sheets verbatim into rules segments', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })] }),
		]);
		const segments = collectHostStyleSegments(host);
		expect(layerBody(segments)).toBe(PART_RULE_TEXT);
		expect(importStatements(segments)).toEqual([]);
	});

	it('preserves grouped rules as-is (no unwrapping, no translation)', () => {
		const grouped = '@media print { notectl-editor::part(table-cell) { padding: 0px; } }';
		const host: HTMLElement = fakeHost([fakeSheet({ rules: [fakeRule({ cssText: grouped })] })]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(grouped);
	});

	it('skips disabled sheets', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })], disabled: true }),
		]);
		expect(collectHostStyleSegments(host)).toEqual([]);
	});

	it('wraps sheet-level media conditions around the serialized text', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })], media: '(max-width: 600px)' }),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(
			`@media (max-width: 600px) {\n${PART_RULE_TEXT}\n}`,
		);
	});

	it('ignores an "all" sheet media condition', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })], media: 'all' }),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(PART_RULE_TEXT);
	});

	it('hoists unreadable sheets as layered @import statements', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ unreadable: true, href: 'https://cdn.example/theme.css', media: 'screen' }),
		]);
		const segments = collectHostStyleSegments(host);
		expect(layerBody(segments)).toBe('');
		expect(importStatements(segments)).toEqual([
			'@import url("https://cdn.example/theme.css") layer(notectl-host) screen;',
		]);
	});

	it('keeps hoisted imports at their live source-order position', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: '.a { color: red; }' })] }),
			fakeSheet({ unreadable: true, href: 'https://cdn.example/theme.css' }),
			fakeSheet({ rules: [fakeRule({ cssText: '.b { color: blue; }' })] }),
		]);
		// Equal-specificity ties inside the notectl-host layer resolve by source
		// order, so the hoisted sheet must stay between its neighbours.
		expect(collectHostStyleSegments(host)).toEqual([
			{ kind: 'rules', css: '.a { color: red; }' },
			{
				kind: 'import',
				statement: '@import url("https://cdn.example/theme.css") layer(notectl-host);',
			},
			{ kind: 'rules', css: '.b { color: blue; }' },
		]);
	});

	it('coalesces adjacent readable sheets into one rules segment', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: '.a { color: red; }' })] }),
			fakeSheet({ rules: [fakeRule({ cssText: '.b { color: blue; }' })] }),
		]);
		expect(collectHostStyleSegments(host)).toEqual([
			{ kind: 'rules', css: '.a { color: red; }\n.b { color: blue; }' },
		]);
	});

	it('hoists an unreadable nested import ahead of the importing sheet rules', () => {
		const unreadable: CSSStyleSheet = fakeSheet({
			unreadable: true,
			href: 'https://cdn.example/fonts.css',
		});
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [
					fakeRule({ cssText: '@import url(fonts.css);', type: 3, styleSheet: unreadable }),
					fakeRule({ cssText: '.after { color: green; }' }),
				],
			}),
		]);
		// Live, the import's content applies before the sheet's own rules.
		expect(collectHostStyleSegments(host)).toEqual([
			{
				kind: 'import',
				statement: '@import url("https://cdn.example/fonts.css") layer(notectl-host);',
			},
			{ kind: 'rules', css: '.after { color: green; }' },
		]);
	});

	it('inlines readable @import targets in place', () => {
		const imported: CSSStyleSheet = fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })] });
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [
					fakeRule({ cssText: '@import url(x.css);', type: 3, styleSheet: imported }),
					fakeRule({ cssText: 'body { margin: 0px; }' }),
				],
			}),
		]);
		const segments = collectHostStyleSegments(host);
		expect(layerBody(segments)).toBe(`${PART_RULE_TEXT}\nbody { margin: 0px; }`);
		expect(importStatements(segments)).toEqual([]);
	});

	it('wraps inlined @import content in the import media condition', () => {
		const imported: CSSStyleSheet = fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })] });
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [
					fakeRule({
						cssText: '@import url(x.css) print;',
						type: 3,
						styleSheet: imported,
						media: 'print',
					}),
				],
			}),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(`@media print {\n${PART_RULE_TEXT}\n}`);
	});

	it('survives @import cycles', () => {
		const rules: CSSRule[] = [fakeRule({ cssText: PART_RULE_TEXT })];
		const cyclic: CSSStyleSheet = fakeSheet({ rules });
		rules.push(fakeRule({ cssText: '@import url(self.css);', type: 3, styleSheet: cyclic }));
		const host: HTMLElement = fakeHost([cyclic]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(PART_RULE_TEXT);
	});

	it('escapes quotes in hoisted import URLs', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ unreadable: true, href: 'https://cdn.example/a"b.css' }),
		]);
		expect(importStatements(collectHostStyleSegments(host))).toEqual([
			'@import url("https://cdn.example/a\\"b.css") layer(notectl-host);',
		]);
	});

	it('rebases relative url() references against the stylesheet URL', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({
				href: 'https://app.example/assets/css/theme.css',
				rules: [
					fakeRule({
						cssText:
							'notectl-editor::part(x) { background: url(../img/a.png) url("b.png") ' +
							"url('sub/c.png'); }",
					}),
				],
			}),
		]);
		const body: string = layerBody(collectHostStyleSegments(host));
		expect(body).toContain('url("https://app.example/assets/img/a.png")');
		expect(body).toContain('url("https://app.example/assets/css/b.png")');
		expect(body).toContain('url("https://app.example/assets/css/sub/c.png")');
	});

	it('leaves url( inside CSS string values untouched', () => {
		const cssText: string =
			'.hint::after { content: "url(info)"; } .x { --tip: "see url(docs) for url(more)"; }';
		const host: HTMLElement = fakeHost([
			fakeSheet({ href: 'https://app.example/css/t.css', rules: [fakeRule({ cssText })] }),
		]);
		// Rewriting inside a string would inject quotes and invalidate the
		// declaration — the mention is not a url() token.
		expect(layerBody(collectHostStyleSegments(host))).toBe(cssText);
	});

	it('rebases url() tokens that follow a string mentioning url(', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({
				href: 'https://app.example/css/t.css',
				rules: [fakeRule({ cssText: '.x { content: "url(a)"; background: url(img/b.png); }' })],
			}),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(
			'.x { content: "url(a)"; background: url("https://app.example/css/img/b.png"); }',
		);
	});

	it('resolves CSS escapes in url() arguments before rebasing', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({
				href: 'https://app.example/css/t.css',
				rules: [fakeRule({ cssText: '.x { background: url("a\\"b.png"); }' })],
			}),
		]);
		// The escaped quote is part of the file name; the URL serializer
		// percent-encodes it, keeping the rebased token valid.
		expect(layerBody(collectHostStyleSegments(host))).toBe(
			'.x { background: url("https://app.example/css/a%22b.png"); }',
		);
	});

	it('leaves fragment, scheme, and protocol-relative url() references untouched', () => {
		const cssText: string =
			'.x { fill: url(#gradient); background: url(data:image/png;base64,AA==) ' +
			'url(https://cdn.example/i.png) url(//cdn.example/j.png); }';
		const host: HTMLElement = fakeHost([
			fakeSheet({ href: 'https://app.example/css/t.css', rules: [fakeRule({ cssText })] }),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(cssText);
	});

	it('rebases url() in sheets without an own URL against the document base', () => {
		const host: HTMLElement = fakeHost(
			[fakeSheet({ rules: [fakeRule({ cssText: '.x { background: url(img/a.png); }' })] })],
			'https://app.example/reports/view',
		);
		expect(layerBody(collectHostStyleSegments(host))).toBe(
			'.x { background: url("https://app.example/reports/img/a.png"); }',
		);
	});

	it('rebases inlined @import content against the imported sheet URL', () => {
		const imported: CSSStyleSheet = fakeSheet({
			href: 'https://cdn.example/lib/skin.css',
			rules: [fakeRule({ cssText: '.y { background: url(icons/i.svg); }' })],
		});
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [fakeRule({ cssText: '@import url(skin.css);', type: 3, styleSheet: imported })],
			}),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(
			'.y { background: url("https://cdn.example/lib/icons/i.svg"); }',
		);
	});

	it('wraps inlined @import content in the import cascade layer', () => {
		const imported: CSSStyleSheet = fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })] });
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [
					fakeRule({
						cssText: '@import url(x.css) layer(defaults);',
						type: 3,
						styleSheet: imported,
						layerName: 'defaults',
					}),
				],
			}),
		]);
		// Inside the notectl-host block this becomes the nested layer
		// notectl-host.defaults, which orders before notectl-host's own rules —
		// mirroring layered-import-loses-to-unlayered-page-rules live.
		expect(layerBody(collectHostStyleSegments(host))).toBe(
			`@layer defaults {\n${PART_RULE_TEXT}\n}`,
		);
	});

	it('keeps anonymous import layers anonymous when inlining', () => {
		const imported: CSSStyleSheet = fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })] });
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [
					fakeRule({
						cssText: '@import url(x.css) layer;',
						type: 3,
						styleSheet: imported,
						layerName: '',
					}),
				],
			}),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(`@layer {\n${PART_RULE_TEXT}\n}`);
	});

	it('wraps inlined @import content in its supports() condition', () => {
		const imported: CSSStyleSheet = fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })] });
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [
					fakeRule({
						cssText: '@import url(x.css) supports(display: grid);',
						type: 3,
						styleSheet: imported,
						supportsText: 'display: grid',
					}),
				],
			}),
		]);
		expect(layerBody(collectHostStyleSegments(host))).toBe(
			`@supports (display: grid) {\n${PART_RULE_TEXT}\n}`,
		);
	});

	it('hoists unreadable layered imports as notectl-host sublayers with supports()', () => {
		const unreadable: CSSStyleSheet = fakeSheet({
			unreadable: true,
			href: 'https://cdn.example/grid.css',
		});
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [
					fakeRule({
						cssText: '@import url(grid.css) layer(vendor) supports(display: grid) screen;',
						type: 3,
						styleSheet: unreadable,
						layerName: 'vendor',
						supportsText: 'display: grid',
						media: 'screen',
					}),
					fakeRule({
						cssText: '@import url(grid.css) layer;',
						type: 3,
						styleSheet: fakeSheet({ unreadable: true, href: 'https://cdn.example/anon.css' }),
						layerName: '',
					}),
				],
			}),
		]);
		expect(importStatements(collectHostStyleSegments(host))).toEqual([
			'@import url("https://cdn.example/grid.css") layer(notectl-host.vendor) ' +
				'supports(display: grid) screen;',
			'@import url("https://cdn.example/anon.css") layer(notectl-host.notectl-anonymous-1);',
		]);
	});

	it('returns no segments for a host document without stylesheets', () => {
		const host: HTMLElement = fakeHost([]);
		expect(collectHostStyleSegments(host)).toEqual([]);
	});

	it('works against the real happy-dom document without throwing', () => {
		const host: HTMLElement = document.createElement('notectl-editor');
		document.body.appendChild(host);
		const segments = collectHostStyleSegments(host);
		expect(Array.isArray(segments)).toBe(true);
		document.body.removeChild(host);
	});
});
