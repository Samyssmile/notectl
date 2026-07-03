/**
 * Collects and aggregates CSS for print output.
 * Extracts adopted stylesheets, snapshots theme tokens, and generates print-specific CSS.
 */

import { generateThemeCSS } from '../../editor/theme/ThemeEngine.js';
import { LIGHT_THEME } from '../../editor/theme/ThemeTokens.js';
import {
	PAPER_MARGIN_HORIZONTAL_PX,
	PAPER_MARGIN_TOP_PX,
	getPaperCSSSize,
} from '../../model/PaperSize.js';
import { isRuntimeStyleSheet } from '../../style/StyleRuntime.js';
import { collectHostPartStyles } from './PrintHostPartStyles.js';
import type { PrintOptions } from './PrintTypes.js';

/** Cascade layer that holds the editor's own base styles in print output. */
const BASE_STYLE_LAYER = 'notectl-base';

/** Adopted shadow styles split by role for print emission. */
export interface AdoptedStylePartition {
	/** Editor base styles — emitted inside the print cascade layer. */
	readonly base: string;
	/**
	 * Runtime style-token rules (strict-CSP mode) carrying user-applied content
	 * formatting — emitted unlayered so they keep their cascade strength.
	 */
	readonly runtime: string;
}

/** Extracts CSS text from all adopted stylesheets on a ShadowRoot. */
export function extractAdoptedStyles(shadowRoot: ShadowRoot): string {
	const partition: AdoptedStylePartition = partitionAdoptedStyles(shadowRoot);
	return [partition.base, partition.runtime].filter(Boolean).join('\n');
}

/**
 * Extracts CSS text from all adopted stylesheets on a ShadowRoot, separating
 * editor base styles from runtime style-token sheets. The distinction matters
 * for print: base styles go into a cascade layer so consumer overrides win,
 * but token rules represent user content formatting (inline styles in
 * non-CSP mode) and must not be demoted with them.
 */
export function partitionAdoptedStyles(shadowRoot: ShadowRoot): AdoptedStylePartition {
	const base: string[] = [];
	const runtime: string[] = [];
	for (const sheet of shadowRoot.adoptedStyleSheets) {
		const target: string[] = isRuntimeStyleSheet(sheet) ? runtime : base;
		for (const rule of sheet.cssRules) {
			target.push(rule.cssText);
		}
	}
	return { base: base.join('\n'), runtime: runtime.join('\n') };
}

/**
 * Generates light theme CSS custom properties for print output.
 * Uses the static LIGHT_THEME definition rather than reading computed styles,
 * ensuring print output is always readable on paper regardless of the active editor theme.
 */
export function generateLightThemeTokens(): string {
	return generateThemeCSS(LIGHT_THEME).replace(':host {', ':root {');
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
export function snapshotTypography(host: HTMLElement, colorOverride?: string): string {
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
		if (prop === 'color' && colorOverride) {
			rules.push(`  color: ${colorOverride};`);
			continue;
		}
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

	// The editor's own styles go into a named cascade layer so that host-authored
	// `::part()` overrides and print-specific rules (all emitted unlayered below)
	// win over them regardless of specificity. This mirrors the shadow-tree
	// cascade, where an outer normal declaration beats the shadow tree's own rule.
	// Runtime style-token rules stay unlayered: they carry user-applied content
	// formatting (inline styles outside strict-CSP mode) and must not lose to
	// unlayered customCSS or translated part rules.
	const adopted: AdoptedStylePartition = partitionAdoptedStyles(shadowRoot);
	if (adopted.base) parts.push(`@layer ${BASE_STYLE_LAYER} {\n${adopted.base}\n}`);
	if (adopted.runtime) parts.push(adopted.runtime);

	const forceLightTheme: boolean = options.forceLightTheme !== false;

	if (forceLightTheme) {
		parts.push(generateLightThemeTokens());
	} else {
		const theme: string = snapshotThemeTokens(host);
		if (theme) parts.push(theme);
	}

	// WYSIWYG: snapshot host typography so the print iframe matches the editor.
	// In the editor, .notectl-content inherits font from :host (shadow DOM).
	// The print iframe is a regular document where :host doesn't apply.
	const colorOverride: string | undefined = forceLightTheme
		? LIGHT_THEME.primitives.foreground
		: undefined;
	parts.push(snapshotTypography(host, colorOverride));

	const printCSS: string = generatePrintCSS(options);
	if (printCSS) parts.push(printCSS);

	// Carry host-page `::part()` styling into print, translated to attribute
	// selectors. Emitted before customCSS so explicit customCSS stays the final
	// override.
	const hostParts: string = collectHostPartStyles(host);
	if (hostParts) parts.push(hostParts);

	if (options.customCSS) {
		parts.push(options.customCSS);
	}

	return parts.join('\n\n');
}
