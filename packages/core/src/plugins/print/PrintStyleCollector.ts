/**
 * Collects and aggregates CSS for print output.
 * Extracts adopted stylesheets, snapshots theme tokens, and generates print-specific CSS.
 */

import type { PrintOptions } from './PrintTypes.js';

/** Extracts CSS text from all adopted stylesheets on a ShadowRoot. */
export function extractAdoptedStyles(shadowRoot: ShadowRoot): string {
	const parts: string[] = [];
	for (const sheet of shadowRoot.adoptedStyleSheets) {
		for (const rule of sheet.cssRules) {
			parts.push(rule.cssText);
		}
	}
	return parts.join('\n');
}

/** Snapshots --notectl-* CSS custom properties from the host element into a :root block. */
export function snapshotThemeTokens(host: HTMLElement): string {
	const computed: CSSStyleDeclaration = getComputedStyle(host);
	const tokens: string[] = [];

	for (let i = 0; i < computed.length; i++) {
		const prop: string = computed[i] ?? '';
		if (prop.startsWith('--notectl-')) {
			const value: string = computed.getPropertyValue(prop).trim();
			if (value) {
				tokens.push(`  ${prop}: ${value};`);
			}
		}
	}

	if (tokens.length === 0) return '';
	return `:root {\n${tokens.join('\n')}\n}`;
}

/** Generates print-specific CSS rules based on PrintOptions. */
export function generatePrintCSS(options: PrintOptions): string {
	const parts: string[] = [];

	// @page rule
	const pageProps: string[] = [];
	if (options.margin) {
		pageProps.push(`  margin: ${options.margin};`);
	}
	if (options.orientation) {
		pageProps.push(`  size: A4 ${options.orientation};`);
	}
	if (pageProps.length > 0) {
		parts.push(`@page {\n${pageProps.join('\n')}\n}`);
	}

	// Print media rules
	const printRules: string[] = [];

	// Hide non-printable elements
	printRules.push('[data-notectl-no-print] { display: none !important; }');

	// Code blocks: preserve background, force wrapping
	printRules.push(
		'.notectl-code-block { white-space: pre-wrap !important; ' +
			'word-break: break-all !important; page-break-inside: avoid; }',
	);

	// Images: avoid page breaks
	printRules.push('img { page-break-inside: avoid; }');

	// Tables: avoid page breaks
	printRules.push('.notectl-table { break-inside: avoid; }');

	// Print background colors
	if (options.printBackground) {
		printRules.push(
			'* { -webkit-print-color-adjust: exact !important; ' +
				'print-color-adjust: exact !important; }',
		);
	}

	parts.push(`@media print {\n  ${printRules.join('\n  ')}\n}`);

	return parts.join('\n\n');
}

/** Collects all CSS needed for print: adopted styles, theme tokens, print CSS, and custom CSS. */
export function collectAll(
	shadowRoot: ShadowRoot,
	host: HTMLElement,
	options: PrintOptions,
): string {
	const parts: string[] = [];

	const adopted: string = extractAdoptedStyles(shadowRoot);
	if (adopted) parts.push(adopted);

	const theme: string = snapshotThemeTokens(host);
	if (theme) parts.push(theme);

	const printCSS: string = generatePrintCSS(options);
	if (printCSS) parts.push(printCSS);

	if (options.customCSS) {
		parts.push(options.customCSS);
	}

	return parts.join('\n\n');
}
