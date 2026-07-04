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
}

function fakeRule(init: FakeRuleInit): CSSRule {
	return {
		type: init.type ?? 1,
		cssText: init.cssText,
		styleSheet: init.styleSheet ?? null,
		href: init.href ?? null,
		media: { mediaText: init.media ?? '' },
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
function fakeHost(sheets: readonly CSSStyleSheet[]): HTMLElement {
	const doc = {
		styleSheets: sheets,
		adoptedStyleSheets: [],
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
