/**
 * Collects and aggregates CSS for print output.
 *
 * The print document preserves the editor's shadow boundary (declarative
 * shadow DOM), so styles split into two scopes:
 *
 * - Shadow scope (inside the template): the editor's own adopted styles
 *   (base styles behind a cascade layer, runtime style-token rules
 *   unlayered), print content rules, and `customCSS`.
 * - Document scope: print guards (host-element reset, `html`/`body` page
 *   reset, and forced light theme — `!important` inside the `notectl-print`
 *   layer so they hold even against `!important` host rules such as
 *   `@media print { body * { visibility: hidden } }`), body typography
 *   snapshot, `@page` setup, and
 *   two `customCSS` copies: unlayered for normal-strength page-level rules
 *   (`@page`, `body`) and inside the earliest `notectl-custom` layer so
 *   consumer `!important` rules outrank the print guards.
 *
 * Document layer order is `notectl-custom, notectl-print, notectl-theme,
 * notectl-host` (declared in {@link buildHTMLDocument}). For normal
 * declarations unlayered rules win over all layers; for `!important`
 * declarations the layer order reverses, so earlier layers win:
 * customCSS > print guards > theme snapshot > host copy.
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
 * Document-level cascade layer holding the computed theme-token snapshot for
 * `forceLightTheme: false`. Declared before `notectl-host`, so every natively
 * carried host-page token rule (later layer wins normal declarations)
 * outranks the snapshot; it only backfills token sources the stylesheet copy
 * cannot carry.
 */
export const THEME_STYLE_LAYER = 'notectl-theme';

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
 * Generates light theme custom properties targeting `:root` and the print
 * host element. `:root` makes the tokens inherit document-wide, so page-level
 * `customCSS` rules (`body { background: var(--notectl-bg) }`) keep resolving;
 * the host element re-pins them closer than the shadow theme sheet's `:host`
 * defaults. Every declaration is `!important`; emitted inside the
 * `notectl-print` layer, it beats copied host-page token overrides (even
 * `!important` ones) and the shadow theme sheet (tree context), guaranteeing
 * readable print output regardless of the active editor theme.
 */
export function generateLightThemeTokens(hostSelector: string): string {
	const css: string = generateThemeCSS(LIGHT_THEME).replace(':host {', `:root, ${hostSelector} {`);
	return markDeclarationsImportant(css);
}

/**
 * Serializes an element's inline `--notectl-*` declarations. Tokens set via
 * the `style` attribute or JS `setProperty` (runtime theme switchers) cannot
 * travel through the stylesheet copy; re-emitting them as inline style on the
 * print document's corresponding element preserves their live cascade
 * strength — inline declarations beat every copied stylesheet rule, exactly
 * as on the live page.
 */
export function collectInlineThemeTokens(el: Element | null): string {
	if (!(el instanceof HTMLElement)) return '';
	const declarations: string[] = [];
	for (let i = 0; i < el.style.length; i++) {
		const prop: string = el.style[i] ?? '';
		if (!prop.startsWith('--notectl-')) continue;
		const value: string = el.style.getPropertyValue(prop).trim();
		if (value) declarations.push(`${prop}: ${value}`);
	}
	return declarations.join('; ');
}

/**
 * Snapshots all computed `--notectl-*` tokens from the host element into a
 * `:root` rule, as a fallback when carrying the live theme
 * (`forceLightTheme: false`). Tokens set via the host's inline `style`
 * attribute (stripped from the print replica), via JS `setProperty`, or via
 * rules scoped to wrapper elements that do not exist in the print document
 * cannot travel through the stylesheet copy; the computed result pins them at
 * document level. Emitted inside the `notectl-theme` layer so every natively
 * carried host rule — including print-conditional ones — still wins.
 */
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

/** Computed background-color values that mean "no own background". */
const TRANSPARENT_BACKGROUNDS: readonly string[] = ['', 'transparent', 'rgba(0, 0, 0, 0)'];

/**
 * Resolves the background the editor content visually sits on, for carrying
 * the live theme into print (`forceLightTheme: false`). Walks up from the
 * content container (crossing shadow boundaries) to the host and finally the
 * page body, returning the first non-transparent computed background-color.
 * Falls back to white so print output never inherits an undefined background.
 */
export function resolveCarriedBackground(host: HTMLElement, container: HTMLElement): string {
	let el: HTMLElement | null = container;
	while (el) {
		const background: string = getComputedStyle(el).getPropertyValue('background-color').trim();
		if (!TRANSPARENT_BACKGROUNDS.includes(background)) return background;
		if (el === host.ownerDocument.body) break;
		const root: Node = el.getRootNode();
		el = el.parentElement ?? (root instanceof ShadowRoot ? (root.host as HTMLElement) : null);
	}
	return '#ffffff';
}

/**
 * Snapshots computed typography from the host element into a `body` rule.
 * Copied host-page styles are layered and `body` rules from the host page are
 * meant for the host application, so print pins body typography explicitly to
 * what the editor computed live. The page background is pinned to `background`
 * — white when the light theme is forced, the carried theme background
 * otherwise — so dark-theme output never renders light text on white paper.
 */
export function snapshotTypography(
	host: HTMLElement,
	colorOverride?: string,
	background = '#ffffff',
): string {
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
	const rules: string[] = ['  margin: 0;', `  background: ${background};`];
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
	'visibility: visible',
];

/**
 * Declarations that keep the print page itself visible and unclipped. Host
 * pages commonly hide or clip at the page level — the classic
 * `@media print { body * { visibility: hidden } }` trick or app-shell
 * `html, body { height: 100%; overflow: hidden }` — and those rules are
 * copied verbatim into the host layer. Only hide/clip-capable properties are
 * guarded; box properties like `margin` stay overridable via plain customCSS.
 */
const PAGE_RESET_DECLARATIONS: readonly string[] = [
	'display: block',
	'visibility: visible',
	'opacity: 1',
	'position: static',
	'height: auto',
	'min-height: 0',
	'max-height: none',
	'overflow: visible',
	'transform: none',
	'filter: none',
	'contain: none',
];

/**
 * Neutralizes page-level hiding and clipping from copied host rules on
 * `html`/`body`. Every declaration is `!important`; emitted inside the
 * `notectl-print` layer it beats the host copy even against `!important`
 * host rules, while `customCSS` (earlier `notectl-custom` layer) still wins.
 */
export function generatePageResetCSS(): string {
	return [
		'html, body {',
		...PAGE_RESET_DECLARATIONS.map((declaration: string): string => `  ${declaration} !important;`),
		'}',
	].join('\n');
}

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

	// Print flows the full document: screen scroll constraints on the content
	// area (the --notectl-content-max-height token or host ::part(content)
	// height rules) must not clip it to one scroll fold. Shadow-tree
	// `!important` beats document-tree `!important`, so this holds even
	// against host `::part()` rules; the shadow customCSS copy is emitted
	// later in source order and can still override.
	parts.push(
		'.notectl-content { height: auto !important; max-height: none !important; ' +
			'min-height: 0 !important; overflow: visible !important; }',
	);

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
 * (host reset, `html`/`body` page reset, and forced light theme —
 * `!important` inside the `notectl-print` layer), body typography, `@page`,
 * and two copies of customCSS. The unlayered copy carries page-level custom
 * rules (`@page`, `body` — they cannot live inside the shadow scope) at
 * normal strength; the `notectl-custom` layer copy makes consumer
 * `!important` rules outrank the print guards and `!important` host rules.
 */
export function buildDocumentCSS(
	host: HTMLElement,
	container: HTMLElement,
	options: PrintOptions,
): string {
	const hostSelector: string = host.tagName.toLowerCase();
	const parts: string[] = [];

	const forceLightTheme: boolean = options.forceLightTheme !== false;
	const guards: string[] = [generateHostResetCSS(hostSelector), generatePageResetCSS()];
	if (forceLightTheme) {
		guards.push(generateLightThemeTokens(hostSelector));
	}
	// The shadow-scope copy of this guard cannot reach document-tree elements:
	// without it here, the pinned body background (the carried theme background
	// for forceLightTheme: false) is stripped by the browser's default
	// "no background graphics" print behavior.
	if (options.printBackground !== false) {
		guards.push(
			'* {\n  -webkit-print-color-adjust: exact !important;\n  print-color-adjust: exact !important;\n}',
		);
	}
	parts.push(`@layer ${PRINT_STYLE_LAYER} {\n${guards.join('\n\n')}\n}`);

	if (!forceLightTheme) {
		const themeTokens: string = snapshotThemeTokens(host);
		if (themeTokens) {
			parts.push(`@layer ${THEME_STYLE_LAYER} {\n${themeTokens}\n}`);
		}
	}

	const colorOverride: string | undefined = forceLightTheme
		? LIGHT_THEME.primitives.foreground
		: undefined;
	const background: string = forceLightTheme
		? '#ffffff'
		: resolveCarriedBackground(host, container);
	parts.push(snapshotTypography(host, colorOverride, background));

	const pageCSS: string = generatePageCSS(options);
	if (pageCSS) parts.push(pageCSS);

	if (options.customCSS) {
		parts.push(options.customCSS);
		parts.push(`@layer ${CUSTOM_STYLE_LAYER} {\n${options.customCSS}\n}`);
	}

	return parts.join('\n\n');
}
