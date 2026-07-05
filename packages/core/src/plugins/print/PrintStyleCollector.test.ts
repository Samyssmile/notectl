import { describe, expect, it, vi } from 'vitest';
import { PaperSize } from '../../model/PaperSize.js';
import { createRuntimeStyleSheet } from '../../style/StyleRuntime.js';
import {
	buildDocumentCSS,
	buildExportDocumentCSS,
	buildShadowCSS,
	collectInlineThemeTokens,
	generateContentPrintCSS,
	generateHostResetCSS,
	generateLightThemeTokens,
	generatePageCSS,
	generatePageResetCSS,
	partitionAdoptedStyles,
	resolveCarriedBackground,
	snapshotThemeTokens,
	snapshotTypography,
} from './PrintStyleCollector.js';

/**
 * happy-dom's getComputedStyle does not iterate custom properties, so token
 * snapshot tests stub it with an indexable declaration exposing the given
 * properties.
 */
function fakeComputedStyle(props: Record<string, string>): CSSStyleDeclaration {
	const names: string[] = Object.keys(props);
	const style: Record<string | number, unknown> = {
		length: names.length,
		getPropertyValue: (prop: string): string => props[prop] ?? '',
	};
	names.forEach((name: string, index: number): void => {
		style[index] = name;
	});
	return style as unknown as CSSStyleDeclaration;
}

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
		it('targets exactly the given selector list with light theme custom properties', () => {
			// The internal variant passes ':root, <host>' so page-level customCSS
			// var() references resolve; the export passes only the marker-qualified
			// replica so nothing leaks into an embedding page.
			const result: string = generateLightThemeTokens(':root, notectl-editor');
			expect(result).toContain(':root, notectl-editor {');
			expect(result).not.toContain(':host');
			expect(result).toContain('--notectl-');
		});

		it('marks every token declaration important', () => {
			const result: string = generateLightThemeTokens('notectl-editor');
			expect(result).toContain('--notectl-bg: #ffffff !important;');
			// Every declaration line must end important — the tokens must beat
			// !important host-page overrides from the notectl-print layer.
			const declarations: string[] = result.split('\n').filter((line) => line.endsWith(';'));
			expect(declarations.length).toBeGreaterThan(0);
			for (const declaration of declarations) {
				expect(declaration.endsWith(' !important;')).toBe(true);
			}
		});
	});

	describe('generateHostResetCSS', () => {
		it('neutralizes widget chrome on the host selector with important declarations', () => {
			const result: string = generateHostResetCSS('notectl-editor');
			expect(result).toContain('notectl-editor {');
			expect(result).toContain('display: block !important;');
			expect(result).toContain('height: auto !important;');
			expect(result).toContain('border: none !important;');
			expect(result).toContain('overflow: visible !important;');
			// The reset must beat !important host chrome from the notectl-print
			// layer, so no declaration may be left non-important.
			const declarations: string[] = result.split('\n').filter((line) => line.endsWith(';'));
			expect(declarations.length).toBeGreaterThan(0);
			for (const declaration of declarations) {
				expect(declaration.endsWith(' !important;')).toBe(true);
			}
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

		it('pins the given background instead of white', () => {
			const host: HTMLElement = attachedHost('div');
			const result: string = snapshotTypography(host, undefined, 'rgb(30, 30, 46)');
			expect(result).toContain('background: rgb(30, 30, 46);');
			expect(result).not.toContain('#ffffff');
			document.body.removeChild(host);
		});
	});

	describe('snapshotThemeTokens', () => {
		it('snapshots computed --notectl-* tokens onto :root and the host selector', () => {
			const host: HTMLElement = attachedHost();
			vi.spyOn(window, 'getComputedStyle').mockReturnValue(
				fakeComputedStyle({
					'--notectl-bg': '#1e1e2e',
					'--notectl-fg': '#cdd6f4',
					color: 'red',
				}),
			);
			try {
				const result: string = snapshotThemeTokens(host, ':root, notectl-editor');
				// Targeting the host element (not just :root) is what lets the
				// unlayered snapshot beat element-targeted rules in the layered host
				// copy that match differently without their wrapper ancestors.
				expect(result).toContain(':root, notectl-editor {');
				expect(result).toContain('--notectl-bg: #1e1e2e;');
				expect(result).toContain('--notectl-fg: #cdd6f4;');
				expect(result).not.toContain('color: red');
			} finally {
				vi.restoreAllMocks();
				document.body.removeChild(host);
			}
		});

		it('returns empty string when no tokens are set', () => {
			const host: HTMLElement = attachedHost();
			expect(snapshotThemeTokens(host, ':root, notectl-editor')).toBe('');
			document.body.removeChild(host);
		});
	});

	describe('collectInlineThemeTokens', () => {
		it('collects only --notectl-* declarations from the inline style', () => {
			const el: HTMLElement = document.createElement('div');
			el.style.setProperty('--notectl-bg', '#1e1e2e');
			el.style.setProperty('--notectl-fg', '#cdd6f4');
			el.style.setProperty('height', '400px');
			el.style.setProperty('--other-token', 'red');

			expect(collectInlineThemeTokens(el)).toBe('--notectl-bg: #1e1e2e; --notectl-fg: #cdd6f4');
		});

		it('returns empty string for elements without inline tokens', () => {
			const el: HTMLElement = document.createElement('div');
			el.style.setProperty('height', '400px');
			expect(collectInlineThemeTokens(el)).toBe('');
			expect(collectInlineThemeTokens(null)).toBe('');
		});
	});

	describe('generatePageResetCSS', () => {
		it('restores page-level visibility and geometry with important declarations', () => {
			const result: string = generatePageResetCSS();
			expect(result).toContain('html, body {');
			expect(result).toContain('visibility: visible !important;');
			expect(result).toContain('display: block !important;');
			expect(result).toContain('height: auto !important;');
			expect(result).toContain('overflow: visible !important;');
		});

		it('does not guard box properties that customCSS should control normally', () => {
			// margin/padding stay unguarded so plain `body { margin: … }` in
			// customCSS keeps working without !important.
			const result: string = generatePageResetCSS();
			expect(result).not.toContain('margin');
			expect(result).not.toContain('padding');
		});
	});

	describe('resolveCarriedBackground', () => {
		it('returns the nearest non-transparent background above the content', () => {
			const host: HTMLElement = attachedHost();
			const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
			const wrapper: HTMLElement = document.createElement('div');
			wrapper.style.backgroundColor = 'rgb(30, 30, 46)';
			const content: HTMLElement = document.createElement('div');
			wrapper.appendChild(content);
			shadow.appendChild(wrapper);

			expect(resolveCarriedBackground(content)).toBe('rgb(30, 30, 46)');
			document.body.removeChild(host);
		});

		it('crosses the shadow boundary to the host element', () => {
			const host: HTMLElement = attachedHost();
			host.style.backgroundColor = 'rgb(10, 20, 30)';
			const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
			const content: HTMLElement = document.createElement('div');
			shadow.appendChild(content);

			expect(resolveCarriedBackground(content)).toBe('rgb(10, 20, 30)');
			document.body.removeChild(host);
		});

		it('reads a background painted on the document root element', () => {
			// Dark themes commonly paint html and leave body transparent; the walk
			// must not stop at body or the carried background falls back to white
			// while the carried text color stays light — invisible print output.
			const host: HTMLElement = attachedHost();
			const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
			const content: HTMLElement = document.createElement('div');
			shadow.appendChild(content);
			document.documentElement.style.backgroundColor = 'rgb(13, 17, 23)';

			try {
				expect(resolveCarriedBackground(content)).toBe('rgb(13, 17, 23)');
			} finally {
				document.documentElement.style.removeProperty('background-color');
				document.body.removeChild(host);
			}
		});

		it('falls back to white when no ancestor sets a background', () => {
			const host: HTMLElement = attachedHost();
			const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
			const content: HTMLElement = document.createElement('div');
			shadow.appendChild(content);

			expect(resolveCarriedBackground(content)).toBe('#ffffff');
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

		it('unclips the content area from carried screen scroll constraints', () => {
			// A host-carried --notectl-content-max-height or ::part(content)
			// height rule must not clip print output to one scroll fold.
			const result: string = generateContentPrintCSS({});
			expect(result).toContain(
				'.notectl-content { height: auto !important; max-height: none !important; ' +
					'min-height: 0 !important; overflow: visible !important; }',
			);
		});
	});

	describe('buildShadowCSS', () => {
		it('wraps base styles in the cascade layer', () => {
			// The documented #202 semantic: customCSS overrides the editor's
			// built-in element styling regardless of selector specificity.
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
		it('wraps the host reset in the notectl-print layer under its own tag name', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, {});
			expect(result).toContain(
				'@layer notectl-print {\nnotectl-editor {\n  display: block !important;',
			);
			document.body.removeChild(host);
		});

		it('forces light theme tokens by default', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, {});
			expect(result).toContain('--notectl-');
			document.body.removeChild(host);
		});

		it('emits the forced light tokens on :root and the host element', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, {});
			// Without :root, page-level customCSS referencing var(--notectl-*)
			// resolves to guaranteed-invalid in the print document.
			expect(result).toContain(':root, notectl-editor {');
			document.body.removeChild(host);
		});

		it('guards document-scope backgrounds with print-color-adjust', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, { forceLightTheme: false });
			// The shadow-scope guard cannot reach body/html: without this the
			// pinned carried background is stripped by the browser's default
			// "no background graphics" print behavior.
			const layerStart: number = result.indexOf('@layer notectl-print {');
			const guard: number = result.indexOf('print-color-adjust: exact !important;');
			expect(layerStart).toBeGreaterThanOrEqual(0);
			expect(guard).toBeGreaterThan(layerStart);
			document.body.removeChild(host);
		});

		it('omits the document-scope color-adjust guard when printBackground is false', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, { printBackground: false });
			expect(result).not.toContain('print-color-adjust');
			document.body.removeChild(host);
		});

		it('carries the live theme when forceLightTheme is false', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, { forceLightTheme: false });
			// No forced light tokens; the theme travels natively via the copied
			// shadow theme sheet and host-page rules (plus the snapshot fallback).
			expect(result).not.toContain('--notectl-bg: #ffffff !important');
			document.body.removeChild(host);
		});

		it('emits the token snapshot unlayered on :root and the host when carrying the theme', () => {
			const host: HTMLElement = attachedHost();
			vi.spyOn(window, 'getComputedStyle').mockReturnValue(
				fakeComputedStyle({ '--notectl-bg': '#1e1e2e' }),
			);
			try {
				const result: string = buildDocumentCSS(host, host, { forceLightTheme: false });
				// Unlayered, the computed snapshot beats the layered host copy: a
				// host rule that matches differently in the print document (its
				// wrapper ancestors are not replicated) cannot flip the live tokens.
				expect(result).toContain(':root, notectl-editor {\n  --notectl-bg: #1e1e2e;');
				expect(result).not.toContain('@layer notectl-theme');
			} finally {
				vi.restoreAllMocks();
				document.body.removeChild(host);
			}
		});

		it('does not emit a token snapshot when forcing the light theme', () => {
			const host: HTMLElement = attachedHost();
			vi.spyOn(window, 'getComputedStyle').mockReturnValue(
				fakeComputedStyle({ '--notectl-bg': '#1e1e2e' }),
			);
			try {
				const result: string = buildDocumentCSS(host, host, {});
				expect(result).not.toContain('--notectl-bg: #1e1e2e');
			} finally {
				vi.restoreAllMocks();
				document.body.removeChild(host);
			}
		});

		it('includes the html/body page reset in the notectl-print layer', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, {});
			const layerStart: number = result.indexOf('@layer notectl-print {');
			const pageReset: number = result.indexOf('html, body {');
			expect(layerStart).toBeGreaterThanOrEqual(0);
			expect(pageReset).toBeGreaterThan(layerStart);
			expect(result).toContain('visibility: visible !important;');
			document.body.removeChild(host);
		});

		it('pins the carried theme background when forceLightTheme is false', () => {
			const host: HTMLElement = attachedHost();
			host.style.backgroundColor = 'rgb(30, 30, 46)';
			const result: string = buildDocumentCSS(host, host, { forceLightTheme: false });
			expect(result).toContain('background: rgb(30, 30, 46);');
			document.body.removeChild(host);
		});

		it('pins a white body background when forcing the light theme', () => {
			const host: HTMLElement = attachedHost();
			host.style.backgroundColor = 'rgb(30, 30, 46)';
			const result: string = buildDocumentCSS(host, host, {});
			expect(result).toContain('background: #ffffff;');
			document.body.removeChild(host);
		});

		it('includes @page rules and the customCSS document copy', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, {
				margin: '2cm',
				customCSS: '@page { size: A5; }',
			});
			expect(result).toContain('margin: 2cm;');
			expect(result).toContain('@page { size: A5; }');
			document.body.removeChild(host);
		});

		it('adds a customCSS copy in the notectl-custom layer as the important escape hatch', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildDocumentCSS(host, host, {
				customCSS: 'notectl-editor { border: 1px solid green !important; }',
			});
			// Unlayered copy for normal-strength rules plus the layered copy whose
			// !important declarations outrank the print guards and host rules.
			expect(result).toContain('\n\nnotectl-editor { border: 1px solid green !important; }');
			expect(result).toContain(
				'@layer notectl-custom {\nnotectl-editor { border: 1px solid green !important; }\n}',
			);
			document.body.removeChild(host);
		});
	});

	describe('buildExportDocumentCSS', () => {
		const MARKER = 'data-notectl-static';

		it('qualifies every active selector with the replica marker', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildExportDocumentCSS(host, host, {}, MARKER);
			// Embedding the export via innerHTML/setHTMLUnsafe must not restyle
			// the consumer's page: only marked replicas may ever match. (@scope
			// cannot express this: its implicit descendant prefix excludes the
			// scoping root and all shadow content.)
			expect(result).toContain('notectl-editor[data-notectl-static] {');
			expect(result).not.toContain(':root');
			expect(result).not.toMatch(/(?:^|\n)notectl-editor \{/);
			document.body.removeChild(host);
		});

		it('omits page-level rules that would leak into an embedding page', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildExportDocumentCSS(host, host, { margin: '2cm' }, MARKER);
			expect(result).not.toContain('html, body {');
			expect(result).not.toMatch(/(?:^|\n)body \{/);
			expect(result).not.toContain('@page');
			document.body.removeChild(host);
		});

		it('paints the replica canvas via an important typography snapshot after the reset', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildExportDocumentCSS(host, host, {}, MARKER);
			// Same layer, later source order: the snapshot's background beats the
			// host reset's `background: transparent !important`.
			const reset: number = result.indexOf('background: transparent !important;');
			const canvas: number = result.indexOf('background: #ffffff !important;');
			expect(reset).toBeGreaterThanOrEqual(0);
			expect(canvas).toBeGreaterThan(reset);
			expect(result).toContain('margin: 0 !important;');
			document.body.removeChild(host);
		});

		it('pins the carried theme background on the replica when not forcing light', () => {
			const host: HTMLElement = attachedHost();
			host.style.backgroundColor = 'rgb(30, 30, 46)';
			const result: string = buildExportDocumentCSS(host, host, { forceLightTheme: false }, MARKER);
			expect(result).toContain('background: rgb(30, 30, 46) !important;');
			document.body.removeChild(host);
		});

		it('scopes the color-adjust guard to the replica subtree', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildExportDocumentCSS(host, host, {}, MARKER);
			// A bare `* { print-color-adjust }` would restyle every element of an
			// embedding page; the shadow-scope copy covers the print content.
			expect(result).toContain(
				'notectl-editor[data-notectl-static], notectl-editor[data-notectl-static] * {',
			);
			expect(result).not.toMatch(/(?:^|\n)\* \{/);
			document.body.removeChild(host);
		});

		it('includes the marker-targeted token snapshot when carrying the theme', () => {
			const host: HTMLElement = attachedHost();
			vi.spyOn(window, 'getComputedStyle').mockReturnValue(
				fakeComputedStyle({ '--notectl-bg': '#1e1e2e' }),
			);
			try {
				const result: string = buildExportDocumentCSS(
					host,
					host,
					{ forceLightTheme: false },
					MARKER,
				);
				expect(result).toContain('notectl-editor[data-notectl-static] {\n  --notectl-bg: #1e1e2e;');
			} finally {
				vi.restoreAllMocks();
				document.body.removeChild(host);
			}
		});

		it('leaves customCSS to the shadow copy and the standalone bundle', () => {
			const host: HTMLElement = attachedHost();
			const result: string = buildExportDocumentCSS(
				host,
				host,
				{ customCSS: '.notectl-content p { margin: 4px; }' },
				MARKER,
			);
			// Consumer-authored page-level rules (body, @page) must not act on an
			// embedding page; the copies live in buildDocumentCSS (bundle/iframe)
			// and buildShadowCSS (content rules).
			expect(result).not.toContain('.notectl-content p');
			expect(result).toContain('--notectl-bg: #ffffff !important;');
			document.body.removeChild(host);
		});
	});
});
