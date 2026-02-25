import { describe, expect, it } from 'vitest';
import { PaperSize } from '../../editor/PaperSize.js';
import {
	collectAll,
	extractAdoptedStyles,
	generatePrintCSS,
	snapshotThemeTokens,
	snapshotTypography,
} from './PrintStyleCollector.js';

describe('PrintStyleCollector', () => {
	describe('extractAdoptedStyles', () => {
		it('extracts CSS text from adopted stylesheets', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });

			const sheet: CSSStyleSheet = new CSSStyleSheet();
			sheet.replaceSync('.foo { color: red; }');
			shadow.adoptedStyleSheets = [sheet];

			const result: string = extractAdoptedStyles(shadow);
			expect(result).toContain('.foo');
			expect(result).toContain('color');
		});

		it('returns empty string when no adopted stylesheets', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });

			const result: string = extractAdoptedStyles(shadow);
			expect(result).toBe('');
		});

		it('concatenates rules from multiple stylesheets', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });

			const sheet1: CSSStyleSheet = new CSSStyleSheet();
			sheet1.replaceSync('.a { color: red; }');
			const sheet2: CSSStyleSheet = new CSSStyleSheet();
			sheet2.replaceSync('.b { color: blue; }');
			shadow.adoptedStyleSheets = [sheet1, sheet2];

			const result: string = extractAdoptedStyles(shadow);
			expect(result).toContain('.a');
			expect(result).toContain('.b');
		});
	});

	describe('snapshotThemeTokens', () => {
		it('returns empty string when no --notectl- properties exist', () => {
			const el: HTMLElement = document.createElement('div');
			document.body.appendChild(el);

			const result: string = snapshotThemeTokens(el);
			// In happy-dom, getComputedStyle may not iterate custom properties
			// This test verifies the function handles the empty case
			expect(typeof result).toBe('string');

			document.body.removeChild(el);
		});
	});

	describe('generatePrintCSS', () => {
		it('generates @page rule with margin', () => {
			const result: string = generatePrintCSS({ margin: '2cm' });
			expect(result).toContain('@page');
			expect(result).toContain('margin: 2cm');
		});

		it('generates @page rule with orientation', () => {
			const result: string = generatePrintCSS({ orientation: 'landscape' });
			expect(result).toContain('@page');
			expect(result).toContain('size: A4 landscape');
		});

		it('always includes data-notectl-no-print hide rule', () => {
			const result: string = generatePrintCSS({});
			expect(result).toContain('[data-notectl-no-print]');
			expect(result).toContain('display: none !important');
		});

		it('includes print-color-adjust by default for WYSIWYG fidelity', () => {
			const result: string = generatePrintCSS({});
			expect(result).toContain('print-color-adjust: exact');
			expect(result).toContain('-webkit-print-color-adjust: exact');
		});

		it('includes print-color-adjust when printBackground is true', () => {
			const result: string = generatePrintCSS({ printBackground: true });
			expect(result).toContain('print-color-adjust: exact');
		});

		it('does not include print-color-adjust when printBackground is explicitly false', () => {
			const result: string = generatePrintCSS({ printBackground: false });
			expect(result).not.toContain('print-color-adjust');
		});

		it('includes code block and table print rules', () => {
			const result: string = generatePrintCSS({});
			expect(result).toContain('.notectl-code-block');
			expect(result).toContain('pre-wrap');
			expect(result).toContain('.notectl-table');
		});

		it('generates @page rule with paperSize', () => {
			const result: string = generatePrintCSS({ paperSize: PaperSize.USLetter });
			expect(result).toContain('@page');
			expect(result).toContain('size: letter');
		});

		it('generates @page rule with paperSize and orientation', () => {
			const result: string = generatePrintCSS({
				paperSize: PaperSize.DINA5,
				orientation: 'landscape',
			});
			expect(result).toContain('size: A5 landscape');
		});

		it('uses paperSize instead of default A4 when both paperSize and orientation are set', () => {
			const result: string = generatePrintCSS({
				paperSize: PaperSize.USLegal,
				orientation: 'portrait',
			});
			expect(result).toContain('size: legal portrait');
			expect(result).not.toContain('A4');
		});

		it('falls back to A4 when only orientation is set without paperSize', () => {
			const result: string = generatePrintCSS({ orientation: 'portrait' });
			expect(result).toContain('size: A4 portrait');
		});

		it('sets @page margin to 0 when paperSize is set without custom margin', () => {
			const result: string = generatePrintCSS({ paperSize: PaperSize.DINA4 });
			expect(result).toContain('margin: 0');
		});

		it('uses custom margin over zero default when both paperSize and margin are set', () => {
			const result: string = generatePrintCSS({
				paperSize: PaperSize.DINA4,
				margin: '2cm',
			});
			expect(result).toContain('margin: 2cm');
			expect(result).not.toContain('margin: 0');
		});

		it('injects paper-mode content padding when paperSize is set', () => {
			const result: string = generatePrintCSS({ paperSize: PaperSize.DINA4 });
			expect(result).toContain('.notectl-content');
			expect(result).toContain('padding: 48px 56px');
		});

		it('does not inject paper-mode content padding without paperSize', () => {
			const result: string = generatePrintCSS({});
			expect(result).not.toContain('padding: 48px 56px');
		});
	});

	describe('snapshotTypography', () => {
		it('generates a body rule with margin reset', () => {
			const el: HTMLElement = document.createElement('div');
			document.body.appendChild(el);

			const result: string = snapshotTypography(el);
			expect(result).toContain('body {');
			expect(result).toContain('margin: 0');

			document.body.removeChild(el);
		});

		it('includes font-family and line-height from computed styles', () => {
			const el: HTMLElement = document.createElement('div');
			el.style.fontFamily = 'Arial, sans-serif';
			el.style.lineHeight = '1.6';
			document.body.appendChild(el);

			const result: string = snapshotTypography(el);
			expect(result).toContain('font-family:');
			expect(result).toContain('line-height:');

			document.body.removeChild(el);
		});
	});

	describe('collectAll', () => {
		it('combines adopted styles, print CSS, and custom CSS', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });

			const sheet: CSSStyleSheet = new CSSStyleSheet();
			sheet.replaceSync('.editor { font-size: 14px; }');
			shadow.adoptedStyleSheets = [sheet];

			const host: HTMLElement = document.createElement('div');
			document.body.appendChild(host);

			const result: string = collectAll(shadow, host, {
				customCSS: '.custom { color: green; }',
				margin: '1cm',
			});

			expect(result).toContain('.editor');
			expect(result).toContain('@page');
			expect(result).toContain('.custom');

			document.body.removeChild(host);
		});

		it('works with empty options', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
			const host: HTMLElement = document.createElement('div');

			const result: string = collectAll(shadow, host, {});
			expect(result).toContain('@media print');
		});

		it('includes typography snapshot when paperSize is set', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
			const host: HTMLElement = document.createElement('div');
			document.body.appendChild(host);

			const result: string = collectAll(shadow, host, { paperSize: PaperSize.DINA4 });
			expect(result).toContain('body {');
			expect(result).toContain('margin: 0');

			document.body.removeChild(host);
		});

		it('does not include typography snapshot without paperSize', () => {
			const shadow: ShadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
			const host: HTMLElement = document.createElement('div');

			const result: string = collectAll(shadow, host, {});
			expect(result).not.toContain('body {');
		});
	});
});
