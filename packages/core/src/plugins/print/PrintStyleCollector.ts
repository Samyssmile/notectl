/**
 * Collects and aggregates CSS for print output.
 * Extracts adopted stylesheets, snapshots theme tokens, and generates print-specific CSS.
 */

import {
	PAPER_MARGIN_HORIZONTAL_PX,
	PAPER_MARGIN_TOP_PX,
	getPaperCSSSize,
} from '../../editor/PaperSize.js';
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

/**
 * Snapshots computed typography from the host element into a `body` rule.
 * In the editor, typography is inherited from `:host` (shadow DOM).
 * The print iframe is a regular document where `:host` doesn't match,
 * so we must apply the same font/line-height explicitly.
 */
export function snapshotTypography(host: HTMLElement): string {
	const computed: CSSStyleDeclaration = getComputedStyle(host);
	const props: string[] = [
		'font-family',
		'font-size',
		'font-weight',
		'line-height',
		'letter-spacing',
		'word-spacing',
		'color',
	];
	const rules: string[] = ['  margin: 0;'];
	for (const prop of props) {
		const value: string = computed.getPropertyValue(prop).trim();
		if (value) {
			rules.push(`  ${prop}: ${value};`);
		}
	}
	return `body {\n${rules.join('\n')}\n}`;
}

/** Generates print-specific CSS rules based on PrintOptions. */
export function generatePrintCSS(options: PrintOptions): string {
	const parts: string[] = [];

	// @page rule
	const pageProps: string[] = [];
	if (options.margin) {
		pageProps.push(`  margin: ${options.margin};`);
	} else if (options.paperSize) {
		// WYSIWYG: zero @page margin so body = full paper width;
		// document margins are applied as content padding below.
		pageProps.push('  margin: 0;');
	}
	if (options.paperSize || options.orientation) {
		const sizeKeyword: string = options.paperSize ? getPaperCSSSize(options.paperSize) : 'A4';
		const sizeParts: string[] = [sizeKeyword];
		if (options.orientation) {
			sizeParts.push(options.orientation);
		}
		pageProps.push(`  size: ${sizeParts.join(' ')};`);
	}
	if (pageProps.length > 0) {
		parts.push(`@page {\n${pageProps.join('\n')}\n}`);
	}

	// WYSIWYG: apply paper-mode document margins to print content
	if (options.paperSize) {
		parts.push(
			`.notectl-content { padding: ${PAPER_MARGIN_TOP_PX}px ${PAPER_MARGIN_HORIZONTAL_PX}px !important; }`,
		);
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

	// Preserve background colors and images in print output (WYSIWYG default).
	// Only omitted when the consumer explicitly opts out via printBackground: false.
	if (options.printBackground !== false) {
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

	// WYSIWYG: snapshot host typography so the print iframe matches the editor.
	// In the editor, .notectl-content inherits font from :host (shadow DOM).
	// The print iframe is a regular document where :host doesn't apply.
	if (options.paperSize) {
		parts.push(snapshotTypography(host));
	}

	const printCSS: string = generatePrintCSS(options);
	if (printCSS) parts.push(printCSS);

	if (options.customCSS) {
		parts.push(options.customCSS);
	}

	return parts.join('\n\n');
}
