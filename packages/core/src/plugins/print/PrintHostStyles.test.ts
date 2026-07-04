import { describe, expect, it } from 'vitest';
import { collectHostStyleCopy } from './PrintHostStyles.js';

/**
 * The copier serializes host CSSOM verbatim. happy-dom drops `::part()` rules
 * at CSS parse time and cannot express cross-origin sheets, so these tests
 * drive the traversal with hand-built fake CSSOM objects; the real-browser
 * end-to-end behaviour is proven by e2e/print-part-css.spec.ts.
 *
 * `collectHostStyleCopy` reads sheets from the host's root nodes; the fakes
 * are injected via `document.adoptedStyleSheets`-shaped fake documents is not
 * possible in happy-dom, so tests go through a fake host whose ownerDocument
 * exposes the fake sheets.
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

const PART_RULE_TEXT = 'notectl-editor::part(table-cell) { padding: 0px; }';

describe('collectHostStyleCopy', () => {
	it('serializes readable sheets verbatim into the layer body', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })] }),
		]);
		const copy = collectHostStyleCopy(host);
		expect(copy.layerBody).toBe(PART_RULE_TEXT);
		expect(copy.imports).toEqual([]);
	});

	it('preserves grouped rules as-is (no unwrapping, no translation)', () => {
		const grouped = '@media print { notectl-editor::part(table-cell) { padding: 0px; } }';
		const host: HTMLElement = fakeHost([fakeSheet({ rules: [fakeRule({ cssText: grouped })] })]);
		expect(collectHostStyleCopy(host).layerBody).toBe(grouped);
	});

	it('skips disabled sheets', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })], disabled: true }),
		]);
		const copy = collectHostStyleCopy(host);
		expect(copy.layerBody).toBe('');
		expect(copy.imports).toEqual([]);
	});

	it('wraps sheet-level media conditions around the serialized text', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })], media: '(max-width: 600px)' }),
		]);
		expect(collectHostStyleCopy(host).layerBody).toBe(
			`@media (max-width: 600px) {\n${PART_RULE_TEXT}\n}`,
		);
	});

	it('ignores an "all" sheet media condition', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ rules: [fakeRule({ cssText: PART_RULE_TEXT })], media: 'all' }),
		]);
		expect(collectHostStyleCopy(host).layerBody).toBe(PART_RULE_TEXT);
	});

	it('hoists unreadable sheets as layered @import statements', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ unreadable: true, href: 'https://cdn.example/theme.css', media: 'screen' }),
		]);
		const copy = collectHostStyleCopy(host);
		expect(copy.layerBody).toBe('');
		expect(copy.imports).toEqual([
			'@import url("https://cdn.example/theme.css") layer(notectl-host) screen;',
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
		const copy = collectHostStyleCopy(host);
		expect(copy.layerBody).toBe(`${PART_RULE_TEXT}\nbody { margin: 0px; }`);
		expect(copy.imports).toEqual([]);
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
		expect(collectHostStyleCopy(host).layerBody).toBe(`@media print {\n${PART_RULE_TEXT}\n}`);
	});

	it('hoists unreadable @import targets as layered @import statements', () => {
		const unreadable: CSSStyleSheet = fakeSheet({
			unreadable: true,
			href: 'https://cdn.example/fonts.css',
		});
		const host: HTMLElement = fakeHost([
			fakeSheet({
				rules: [fakeRule({ cssText: '@import url(fonts.css);', type: 3, styleSheet: unreadable })],
			}),
		]);
		const copy = collectHostStyleCopy(host);
		expect(copy.imports).toEqual([
			'@import url("https://cdn.example/fonts.css") layer(notectl-host);',
		]);
	});

	it('survives @import cycles', () => {
		const rules: CSSRule[] = [fakeRule({ cssText: PART_RULE_TEXT })];
		const cyclic: CSSStyleSheet = fakeSheet({ rules });
		rules.push(fakeRule({ cssText: '@import url(self.css);', type: 3, styleSheet: cyclic }));
		const host: HTMLElement = fakeHost([cyclic]);
		expect(collectHostStyleCopy(host).layerBody).toBe(PART_RULE_TEXT);
	});

	it('escapes quotes in hoisted import URLs', () => {
		const host: HTMLElement = fakeHost([
			fakeSheet({ unreadable: true, href: 'https://cdn.example/a"b.css' }),
		]);
		expect(collectHostStyleCopy(host).imports).toEqual([
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
		const body: string = collectHostStyleCopy(host).layerBody;
		expect(body).toContain('url("https://app.example/assets/img/a.png")');
		expect(body).toContain('url("https://app.example/assets/css/b.png")');
		expect(body).toContain('url("https://app.example/assets/css/sub/c.png")');
	});

	it('leaves fragment, scheme, and protocol-relative url() references untouched', () => {
		const cssText: string =
			'.x { fill: url(#gradient); background: url(data:image/png;base64,AA==) ' +
			'url(https://cdn.example/i.png) url(//cdn.example/j.png); }';
		const host: HTMLElement = fakeHost([
			fakeSheet({ href: 'https://app.example/css/t.css', rules: [fakeRule({ cssText })] }),
		]);
		expect(collectHostStyleCopy(host).layerBody).toBe(cssText);
	});

	it('rebases url() in sheets without an own URL against the document base', () => {
		const host: HTMLElement = fakeHost(
			[fakeSheet({ rules: [fakeRule({ cssText: '.x { background: url(img/a.png); }' })] })],
			'https://app.example/reports/view',
		);
		expect(collectHostStyleCopy(host).layerBody).toBe(
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
		expect(collectHostStyleCopy(host).layerBody).toBe(
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
		expect(collectHostStyleCopy(host).layerBody).toBe(`@layer defaults {\n${PART_RULE_TEXT}\n}`);
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
		expect(collectHostStyleCopy(host).layerBody).toBe(`@layer {\n${PART_RULE_TEXT}\n}`);
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
		expect(collectHostStyleCopy(host).layerBody).toBe(
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
		expect(collectHostStyleCopy(host).imports).toEqual([
			'@import url("https://cdn.example/grid.css") layer(notectl-host.vendor) ' +
				'supports(display: grid) screen;',
			'@import url("https://cdn.example/anon.css") layer(notectl-host.notectl-anonymous-1);',
		]);
	});

	it('returns empty copy for a host document without stylesheets', () => {
		const host: HTMLElement = fakeHost([]);
		const copy = collectHostStyleCopy(host);
		expect(copy.layerBody).toBe('');
		expect(copy.imports).toEqual([]);
	});

	it('works against the real happy-dom document without throwing', () => {
		const host: HTMLElement = document.createElement('notectl-editor');
		document.body.appendChild(host);
		const copy = collectHostStyleCopy(host);
		expect(typeof copy.layerBody).toBe('string');
		document.body.removeChild(host);
	});
});
