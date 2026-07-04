/**
 * Collects and aggregates CSS for print output.
 *
 * The print document preserves the editor's shadow boundary (declarative
 * shadow DOM), so styles split into two scopes:
 *
 * - Shadow scope (inside the template): the editor's own adopted styles
 *   (base styles behind a cascade layer, runtime style-token rules
 *   unlayered), print content rules, and `customCSS`.
 * - Document scope: print guards (host-element reset and forced light theme,
 *   `!important` inside the `notectl-print` layer so they hold even against
 *   `!important` host rules), body typography snapshot, `@page` setup, and
 *   two `customCSS` copies: unlayered for normal-strength page-level rules
 *   (`@page`, `body`) and inside the earliest `notectl-custom` layer so
 *   consumer `!important` rules outrank the print guards.
 *
 * Document layer order is `notectl-custom, notectl-print, notectl-host`
 * (declared in {@link buildHTMLDocument}). For normal declarations unlayered
 * rules win over all layers; for `!important` declarations the layer order
 * reverses, so earlier layers win: customCSS > print guards > host copy.
 */

import { generateThemeCSS } from '../../editor/theme/ThemeEngine.js';
import { LIGHT_THEME } from '../../editor/theme/ThemeTokens.js';
import {
	PAPER_MARGIN_HORIZONTAL_PX,
	PAPER_MARGIN_TOP_PX,
	getPaperCSSSize,
} from '../../model/PaperSize.js';
import { isRuntimeStyleSheet } from '../../style/StyleRuntime.js';
import type { PrintOptions } from './PrintTypes.js';

/** Cascade layer that holds the editor's own base styles in print output. */
const BASE_STYLE_LAYER = 'notectl-base';

/**
 * Document-level cascade layer holding the print guards (host reset, forced
 * light theme). Declared before the host-copy layer, so its `!important`
 * declarations beat `!important` host rules.
 */
export const PRINT_STYLE_LAYER = 'notectl-print';

/**
 * Earliest document-level cascade layer, holding a `customCSS` copy. Its
 * `!important` declarations are the strongest in the print document — the
 * consumer's escape hatch over the print guards and host rules.
 */
export const CUSTOM_STYLE_LAYER = 'notectl-custom';

/**
 * Appends `!important` to every declaration of generated CSS. Only safe for
 * CSS this module generates itself (one declaration per line, no semicolons
 * inside values).
 */
function markDeclarationsImportant(css: string): string {
	return css.replace(/;$/gm, ' !important;');
}

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
 * Generates light theme custom properties targeting the print host element.
 * Every declaration is `!important`; emitted inside the `notectl-print`
 * layer, it beats copied host-page token overrides (even `!important` ones)
 * and the shadow theme sheet (tree context), guaranteeing readable print
 * output regardless of the active editor theme.
 */
export function generateLightThemeTokens(hostSelector: string): string {
	const css: string = generateThemeCSS(LIGHT_THEME).replace(':host {', `${hostSelector} {`);
	return markDeclarationsImportant(css);
}

/**
 * Snapshots computed typography from the host element into a `body` rule.
 * Copied host-page styles are layered and `body` rules from the host page are
 * meant for the host application, so print pins body typography explicitly to
 * what the editor computed live.
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
	const rules: string[] = ['  margin: 0;', '  background: #ffffff;'];
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

/** Declarations that neutralize screen-widget chrome on the print host. */
const HOST_RESET_DECLARATIONS: readonly string[] = [
	'display: block',
	'position: static',
	'inset: auto',
	'width: auto',
	'height: auto',
	'min-width: 0',
	'min-height: 0',
	'max-width: none',
	'max-height: none',
	'margin: 0',
	'padding: 0',
	'border: none',
	'border-radius: 0',
	'outline: none',
	'box-shadow: none',
	'background: transparent',
	'overflow: visible',
	'transform: none',
	'filter: none',
	'opacity: 1',
	'contain: none',
	'float: none',
];

/**
 * Neutralizes screen-widget chrome on the print host element. Copied
 * host-page rules like `notectl-editor { height: 400px; border: … }` style
 * the live widget but must not constrain the paginated print flow. Every
 * declaration is `!important`; emitted inside the `notectl-print` layer, the
 * reset beats the host copy even against `!important` host rules. Inherited
 * properties (fonts, color) are deliberately not touched; `customCSS` can
 * reclaim any of these via `!important` (earlier `notectl-custom` layer).
 */
export function generateHostResetCSS(hostSelector: string): string {
	return [
		`${hostSelector} {`,
		...HOST_RESET_DECLARATIONS.map((declaration: string): string => `  ${declaration} !important;`),
		'}',
	].join('\n');
}

/** Generates the `@page` rule based on PrintOptions. */
export function generatePageCSS(options: PrintOptions): string {
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
	if (pageProps.length === 0) return '';
	return `@page {\n${pageProps.join('\n')}\n}`;
}

/** Generates print-specific content rules; emitted inside the shadow scope. */
export function generateContentPrintCSS(options: PrintOptions): string {
	const parts: string[] = [];

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

/**
 * Builds the CSS placed inside the print document's declarative shadow root:
 * editor base styles behind a cascade layer (so consumer overrides win),
 * runtime style-token rules unlayered, print content rules, and customCSS as
 * the final same-tree override.
 */
export function buildShadowCSS(shadowRoot: ShadowRoot, options: PrintOptions): string {
	const parts: string[] = [];

	const adopted: AdoptedStylePartition = partitionAdoptedStyles(shadowRoot);
	if (adopted.base) parts.push(`@layer ${BASE_STYLE_LAYER} {\n${adopted.base}\n}`);
	if (adopted.runtime) parts.push(adopted.runtime);

	const contentCSS: string = generateContentPrintCSS(options);
	if (contentCSS) parts.push(contentCSS);

	if (options.customCSS) {
		parts.push(options.customCSS);
	}

	return parts.join('\n\n');
}

/**
 * Builds the document-level CSS of the print document: the print guards
 * (host reset and forced light theme, `!important` inside the
 * `notectl-print` layer), body typography, `@page`, and two copies of
 * customCSS. The unlayered copy carries page-level custom rules (`@page`,
 * `body` — they cannot live inside the shadow scope) at normal strength; the
 * `notectl-custom` layer copy makes consumer `!important` rules outrank the
 * print guards and `!important` host rules.
 */
export function buildDocumentCSS(host: HTMLElement, options: PrintOptions): string {
	const hostSelector: string = host.tagName.toLowerCase();
	const parts: string[] = [];

	const forceLightTheme: boolean = options.forceLightTheme !== false;
	const guards: string[] = [generateHostResetCSS(hostSelector)];
	if (forceLightTheme) {
		guards.push(generateLightThemeTokens(hostSelector));
	}
	parts.push(`@layer ${PRINT_STYLE_LAYER} {\n${guards.join('\n\n')}\n}`);

	const colorOverride: string | undefined = forceLightTheme
		? LIGHT_THEME.primitives.foreground
		: undefined;
	parts.push(snapshotTypography(host, colorOverride));

	const pageCSS: string = generatePageCSS(options);
	if (pageCSS) parts.push(pageCSS);

	if (options.customCSS) {
		parts.push(options.customCSS);
		parts.push(`@layer ${CUSTOM_STYLE_LAYER} {\n${options.customCSS}\n}`);
	}

	return parts.join('\n\n');
}
