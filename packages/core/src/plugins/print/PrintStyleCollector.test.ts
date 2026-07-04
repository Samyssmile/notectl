import { describe, expect, it } from 'vitest';
import { PaperSize } from '../../model/PaperSize.js';
import { createRuntimeStyleSheet } from '../../style/StyleRuntime.js';
import {
	buildDocumentCSS,
	buildShadowCSS,
	extractAdoptedStyles,
	generateContentPrintCSS,
	generateHostResetCSS,
	generateLightThemeTokens,
	generatePageCSS,
	partitionAdoptedStyles,
	snapshotTypography,
} from './PrintStyleCollector.js';

function shadowWithSheets(...cssTexts: readonly string[]): ShadowRoot {
	const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
	shadow.adoptedStyleSheets = cssTexts.map((css: string): CSSStyleSheet => {
		const sheet: CSSStyleSheet = new CSSStyleSheet();
		sheet.replaceSync(css);
		return sheet;
	});
	return shadow;
}

function attachedHost(tag = 'notectl-editor'): HTMLElement {
	const host: HTMLElement = document.createElement(tag);
	document.body.appendChild(host);
	return host;
}

describe('PrintStyleCollector', () => {
	describe('extractAdoptedStyles', () => {
		it('extracts CSS text from adopted stylesheets', () => {
			const shadow: ShadowRoot = shadowWithSheets('.foo { color: red; }');
			const result: string = extractAdoptedStyles(shadow);
			expect(result).toContain('.foo');
			expect(result).toContain('color');
		});

		it('returns empty string when no adopted stylesheets', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
			expect(extractAdoptedStyles(shadow)).toBe('');
		});

		it('concatenates rules from multiple stylesheets', () => {
			const shadow: ShadowRoot = shadowWithSheets('.a { color: red; }', '.b { color: blue; }');
			const result: string = extractAdoptedStyles(shadow);
			expect(result).toContain('.a');
			expect(result).toContain('.b');
		});
	});

	describe('partitionAdoptedStyles', () => {
		it('separates runtime style-token sheets from base sheets', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });

			const base: CSSStyleSheet = new CSSStyleSheet();
			base.replaceSync('.notectl-table td { padding: 8px 12px; }');
			const runtime: CSSStyleSheet | null = createRuntimeStyleSheet();
			if (!runtime) throw new Error('constructable stylesheets unavailable');
			runtime.replaceSync('[data-notectl-style-token="s0"] { color: red; }');
			shadow.adoptedStyleSheets = [base, runtime];

			const result = partitionAdoptedStyles(shadow);
			expect(result.base).toContain('.notectl-table td');
			expect(result.base).not.toContain('data-notectl-style-token');
			expect(result.runtime).toContain('[data-notectl-style-token="s0"]');
			expect(result.runtime).not.toContain('.notectl-table td');
		});
	});

	describe('generateLightThemeTokens', () => {
		it('targets the given host selector with light theme custom properties', () => {
			const result: string = generateLightThemeTokens('notectl-editor');
			expect(result).toContain('notectl-editor {');
			expect(result).not.toContain(':host');
			expect(result).toContain('--notectl-');
		});
	});

	describe('generateHostResetCSS', () => {
		it('neutralizes widget chrome on the host selector', () => {
			const result: string = generateHostResetCSS('notectl-editor');
			expect(result).toContain('notectl-editor {');
			expect(result).toContain('display: block;');
			expect(result).toContain('height: auto;');
			expect(result).toContain('border: none;');
			expect(result).toContain('overflow: visible;');
		});
	});

	describe('snapshotTypography', () => {
		it('emits a body rule with margin and white background', () => {
			const host: HTMLElement = attachedHost('div');
			const result: string = snapshotTypography(host);
			expect(result).toContain('body {');
			expect(result).toContain('margin: 0;');
			expect(result).toContain('background: #ffffff;');
			document.body.removeChild(host);
		});

		it('applies the color override when given', () => {
			const host: HTMLElement = attachedHost('div');
			const result: string = snapshotTypography(host, '#111111');
			expect(result).toContain('color: #111111;');
			document.body.removeChild(host);
		});
	});

	describe('generatePageCSS', () => {
		it('emits @page margin from options', () => {
			const result: string = generatePageCSS({ margin: '2cm' });
			expect(result).toContain('@page');
			expect(result).toContain('margin: 2cm;');
		});

		it('emits zero margin and paper size in paper mode', () => {
			const result: string = generatePageCSS({ paperSize: PaperSize.DINA4 });
			expect(result).toContain('margin: 0;');
			expect(result).toContain('size: A4;');
		});

		it('includes orientation when set', () => {
			const result: string = generatePageCSS({
				paperSize: PaperSize.DINA4,
				orientation: 'landscape',
			});
			expect(result).toContain('size: A4 landscape;');
		});

		it('returns empty string without page options', () => {
			expect(generatePageCSS({})).toBe('');
		});
	});

	describe('generateContentPrintCSS', () => {
		it('hides non-printable elements and protects blocks from page breaks', () => {
			const result: string = generateContentPrintCSS({});
			expect(result).toContain('[data-notectl-no-print] { display: none !important; }');
			expect(result).toContain('.notectl-code-block');
			expect(result).toContain('page-break-inside: avoid');
		});

		it('preserves backgrounds by default', () => {
			expect(generateContentPrintCSS({})).toContain('print-color-adjust: exact');
		});

		it('omits color-adjust when printBackground is false', () => {
			expect(generateContentPrintCSS({ printBackground: false })).not.toContain(
				'print-color-adjust',
			);
		});

		it('applies paper content padding in paper mode', () => {
			const result: string = generateContentPrintCSS({ paperSize: PaperSize.DINA4 });
			expect(result).toContain('.notectl-content { padding:');
		});
	});

	describe('buildShadowCSS', () => {
		it('wraps base styles in the cascade layer', () => {
			const shadow: ShadowRoot = shadowWithSheets('.notectl-table td { padding: 8px 12px; }');
			const result: string = buildShadowCSS(shadow, {});
			expect(result).toContain('@layer notectl-base {\n.notectl-table td');
		});

		it('keeps runtime style-token rules outside the base cascade layer', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
			const base: CSSStyleSheet = new CSSStyleSheet();
			base.replaceSync('.notectl-table td { padding: 8px 12px; }');
			const runtime: CSSStyleSheet | null = createRuntimeStyleSheet();
			if (!runtime) throw new Error('constructable stylesheets unavailable');
			runtime.replaceSync('[data-notectl-style-token="s0"] { color: red; }');
			shadow.adoptedStyleSheets = [base, runtime];

			const result: string = buildShadowCSS(shadow, {});
			// The token rule follows the layer's closing brace unlayered, keeping
			// its cascade strength against customCSS.
			expect(result).toContain('}\n\n[data-notectl-style-token="s0"]');
		});

		it('appends customCSS as the final same-tree override', () => {
			const shadow: ShadowRoot = shadowWithSheets('.a { color: red; }');
			const result: string = buildShadowCSS(shadow, { customCSS: '.custom { color: blue; }' });
			expect(result.trimEnd().endsWith('.custom { color: blue; }')).toBe(true);
		});

		it('includes the print content rules', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
			expect(buildShadowCSS(shadow, {})).toContain('[data-notectl-no-print]');
		});
	});

	describe('buildDocumentCSS', () => {
		it('resets the host element under its own tag name', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, {});
			expect(result).toContain('notectl-editor {\n  display: block;');
			document.body.removeChild(host);
		});

		it('forces light theme tokens by default', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, {});
			expect(result).toContain('--notectl-');
			document.body.removeChild(host);
		});

		it('carries the live theme when forceLightTheme is false', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, { forceLightTheme: false });
			// No frozen token snapshot: the theme travels natively via the copied
			// shadow theme sheet and host-page rules.
			expect(result).not.toContain('--notectl-');
			document.body.removeChild(host);
		});

		it('includes @page rules and the customCSS document copy', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, {
				margin: '2cm',
				customCSS: '@page { size: A5; }',
			});
			expect(result).toContain('margin: 2cm;');
			expect(result).toContain('@page { size: A5; }');
			document.body.removeChild(host);
		});
	});
});
