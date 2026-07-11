/**
 * PrintService implementation.
 *
 * Builds a print document that preserves the editor's shadow boundary via
 * declarative shadow DOM: the host page's stylesheets are copied verbatim
 * (layered), the editor's own styles live inside the shadow template, and the
 * cloned content keeps its `part` attributes. Host `::part()` rules,
 * specificity, custom properties, and conditional rules therefore behave
 * exactly as in the live editor — nothing is translated or re-emulated.
 *
 * Two document variants are built from the same inputs:
 *
 * - The export variant (returned by `toHTML()`, broadcast via `AFTER_PRINT`)
 *   is embed-safe: its inline document-level CSS is qualified with the static
 *   replica marker, while everything page-level (host-CSS copy, hoisted
 *   `@import`s, `html`/`body`/`@page` rules) ships inside an inert
 *   `<template>` bundle that the fallback script activates only when the
 *   export is rendered as its own document — so injecting the output into a
 *   live page (documented innerHTML/setHTMLUnsafe flow) cannot restyle or
 *   break the consumer's document. It carries a static light-DOM fallback for
 *   parsers without declarative shadow DOM, and never carries the page's CSP
 *   nonce, which is a secret that must not be persisted into serialized HTML.
 * - The internal variant (written into the transient print iframe) inlines
 *   the full page-fidelity CSS (`html`/`body` reset, body typography,
 *   `@page`, unscoped host-CSS copy, hoisted imports) and carries the style
 *   nonce so it renders under the inherited CSP. It omits fallback, bundle,
 *   and script: the iframe is parsed by the same modern browser, where DSD is
 *   guaranteed.
 */

import { escapeAttr, escapeHTML } from '../../model/HTMLUtils.js';
import { getStyleNonceForNode, setStyleText } from '../../style/StyleRuntime.js';
import type { PluginEventBus } from '../Plugin.js';
import { prepare } from './PrintContentPreparer.js';
import {
	type PrintDestinationProjection,
	namespacePrintFallbackTargets,
	projectPrintDestinations,
} from './PrintDestinationBridge.js';
import {
	HOST_STYLE_LAYER,
	type HostStyleSegment,
	collectHostStyleSegments,
} from './PrintHostStyles.js';
import {
	CUSTOM_STYLE_LAYER,
	PRINT_STYLE_LAYER,
	buildDocumentCSS,
	buildExportDocumentCSS,
	buildShadowCSS,
	collectInlineThemeTokens,
} from './PrintStyleCollector.js';
import {
	AFTER_PRINT,
	type AfterPrintEvent,
	BEFORE_PRINT,
	type BeforePrintEvent,
	type PrintOptions,
	type PrintService,
} from './PrintTypes.js';
import { STATIC_HOST_ATTRIBUTE } from './StaticHostMarker.js';

/**
 * Upper bound for waiting on the print iframe's load event. Referenced host
 * stylesheets (hoisted cross-origin `@import`) load asynchronously and are
 * worth a short wait so the first printed paint is styled, but a hanging
 * stylesheet must never block the print dialog indefinitely.
 */
const PRINT_LOAD_TIMEOUT_MS = 4000;

/** Marker attribute on the static light-DOM fallback of the export variant. */
export const PRINT_FALLBACK_ATTRIBUTE = 'data-notectl-print-fallback';

/**
 * Marker attribute on the inert `<template>` carrying the export variant's
 * standalone style bundle (page-level CSS and the verbatim host-CSS copy).
 */
export const PRINT_STYLE_BUNDLE_ATTRIBUTE = 'data-notectl-print-styles';

/**
 * `<meta name>` marking the export document itself. The fallback script only
 * activates the standalone style bundle when this meta sits in
 * `document.head` — true when the export is the document being rendered
 * (file, iframe `srcdoc`, `document.write`, HTML-to-PDF engines), never when
 * it was inlined into a consumer page (fragment parsing keeps the meta inside
 * the injected subtree, outside `document.head`).
 */
export const PRINT_EXPORT_META_NAME = 'notectl-print-export';

/**
 * Fallback for consumers that render the export variant with a parser that
 * does not attach declarative shadow roots but does execute scripts (older
 * WebViews, headless HTML-to-PDF engines). When the export is the document
 * itself (its marker meta sits in `document.head`), the inert standalone
 * style bundle (page-level CSS, verbatim host-CSS copy, hoisted imports) is
 * moved into the head, restoring full page fidelity; inlined into a consumer
 * page the meta never reaches the head, so the bundle stays inert and cannot
 * restyle the page. The shadow-attach step is strictly scoped to marked
 * replicas: only a `template[shadowrootmode]` that is a direct child of a
 * `[data-notectl-static]` host is attached — a document-wide sweep would
 * consume declarative templates belonging to the consumer's own components
 * when the export is inlined into a live page. Once a shadow root exists the
 * static light-DOM fallback is removed so extracted text is not doubled;
 * engines without Shadow DOM keep the rendered fallback. Native DSD parsing
 * leaves no template behind, making the attach branch a no-op. Kept ES5-safe
 * for legacy engines; must not contain a literal `</`. Deliberately emitted
 * without a nonce: the export variant never embeds the page's CSP secrets,
 * and if a consumer's CSP blocks the script the static fallback still
 * renders.
 */
const DSD_FALLBACK_SCRIPT: string = [
	'(function () {',
	'  var head = document.head;',
	'  if (head && head.querySelector(\'meta[name="notectl-print-export"]\')) {',
	"    var bundles = document.querySelectorAll('template[data-notectl-print-styles]');",
	'    for (var b = 0; b < bundles.length; b++) {',
	'      if (bundles[b].content) head.appendChild(bundles[b].content);',
	'      bundles[b].parentNode.removeChild(bundles[b]);',
	'    }',
	'  }',
	"  var statics = document.querySelectorAll('[data-notectl-static]');",
	'  for (var i = 0; i < statics.length; i++) {',
	'    var host = statics[i];',
	'    if (!host.shadowRoot && host.attachShadow) {',
	'      for (var j = 0; j < host.children.length; j++) {',
	'        var child = host.children[j];',
	"        if (child.tagName !== 'TEMPLATE') continue;",
	"        if (!child.getAttribute('shadowrootmode') || !child.content) continue;",
	"        host.attachShadow({ mode: 'open' }).appendChild(child.content);",
	'        host.removeChild(child);',
	'        break;',
	'      }',
	'    }',
	'    if (!host.shadowRoot) continue;',
	"    var fallbacks = host.querySelectorAll('[data-notectl-print-fallback]');",
	'    for (var k = 0; k < fallbacks.length; k++) {',
	'      fallbacks[k].parentNode.removeChild(fallbacks[k]);',
	'    }',
	'  }',
	'})();',
].join('\n');

/**
 * Escapes `</` in CSS embedded into a `<style>` element. The HTML parser ends
 * the element at any literal `</style`, even inside a CSS string such as
 * `content: "</style>"`, which would break the print document. `\/` is a
 * valid CSS escape for `/`, so the stylesheet semantics are unchanged.
 */
function escapeStyleText(css: string): string {
	return css.replace(/<\//g, '<\\/');
}

/** Serializes an element's attributes matched by `include`, with a leading space. */
function serializeFilteredAttributes(el: Element, include: (name: string) => boolean): string {
	const parts: string[] = [];
	for (const attribute of Array.from(el.attributes)) {
		if (!include(attribute.name)) continue;
		parts.push(
			attribute.value === ''
				? attribute.name
				: `${attribute.name}="${escapeAttr(attribute.value)}"`,
		);
	}
	return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

/**
 * Serializes an element's attributes for the print document. The `style`
 * attribute is stripped from the host element: element-attached declarations
 * would beat every stylesheet rule, defeating the print host reset.
 */
function serializeAttributes(el: Element, skip: readonly string[]): string {
	return serializeFilteredAttributes(el, (name: string): boolean => !skip.includes(name));
}

/**
 * Serializes theme-context attributes (`class` and `data-*`) so selectors
 * like `html.dark notectl-editor::part(x)` keep matching when the live theme
 * is carried into print (`forceLightTheme: false`).
 */
function serializeThemeContextAttributes(el: Element | null): string {
	if (!el) return '';
	return serializeFilteredAttributes(
		el,
		(name: string): boolean => name === 'class' || name.startsWith('data-'),
	);
}

/**
 * Serializes an element's inline `--notectl-*` tokens as a `style` attribute
 * (empty string when the element carries none). Used when the live theme is
 * carried: inline tokens beat every copied stylesheet rule, exactly as live.
 */
function serializeInlineTokenStyle(el: Element | null): string {
	const declarations: string = collectInlineThemeTokens(el);
	return declarations ? ` style="${escapeAttr(declarations)}"` : '';
}

/** Everything needed to assemble the print document. */
export interface PrintDocumentInput {
	/**
	 * Document-level CSS matching the variant: full page fidelity for
	 * `internal` ({@link buildDocumentCSS}), marker-qualified inline baseline
	 * for `export` ({@link buildExportDocumentCSS}).
	 */
	readonly documentCSS: string;
	/**
	 * Full-fidelity page CSS ({@link buildDocumentCSS}) shipped by the export
	 * variant inside the inert standalone style bundle; the fallback script
	 * activates it only when the export is rendered as its own document.
	 */
	readonly standaloneCSS: string;
	/** Source-ordered host-page CSS copy (rule chunks and hoisted `@import`s). */
	readonly hostSegments: readonly HostStyleSegment[];
	/** CSS placed inside the declarative shadow root. */
	readonly shadowCSS: string;
	/** The live editor host element; its tag and attributes are replicated. */
	readonly host: HTMLElement;
	/** Serialized print content projected into the declarative shadow root. */
	readonly contentHTML: string;
	/** Unmodified prepared content used by the export's no-DSD light-DOM fallback. */
	readonly fallbackContentHTML: string;
	/** Slotted document-tree markers for fragment navigation and PDF destinations. */
	readonly destinationMarkersHTML: string;
	readonly title: string;
	readonly lang: string;
	/** Copy html/body theme-context attributes (only when the live theme is carried). */
	readonly carryThemeContext: boolean;
	/**
	 * `export` (`toHTML()`, `AFTER_PRINT`) is embed-safe: its inline styles are
	 * marker-qualified, and everything page-level — the host-CSS copy, hoisted
	 * `@import`s, and `standaloneCSS` — ships inside an inert `<template>`
	 * bundle that the replica-scoped fallback script activates only when the
	 * export is rendered as its own document. A consumer page embedding the
	 * output can neither load foreign stylesheets nor have its own elements
	 * restyled. `internal` (the transient print iframe) inlines the unscoped
	 * copy and the imports directly and omits fallback, bundle, and script: the
	 * iframe is parsed by the same modern browser, where declarative shadow DOM
	 * is guaranteed.
	 */
	readonly variant: 'export' | 'internal';
	/**
	 * CSP nonce applied to every embedded `<style>` element so the internal
	 * print iframe renders under an inherited `style-src` nonce policy. Never
	 * set on the export variant: serialized HTML must not persist the page's
	 * live nonce.
	 */
	readonly styleNonce?: string;
}

/** Builds the complete print document as an HTML string. */
export function buildHTMLDocument(input: PrintDocumentInput): string {
	const doc: Document = input.host.ownerDocument;
	const hostTag: string = input.host.tagName.toLowerCase();
	const isExport: boolean = input.variant === 'export';
	// The static marker keeps the replica from booting a live editor when the
	// document is injected into a page where the component is registered. The
	// export variant also drops the id: embedded next to the live editor it
	// would be a duplicate, and getElementById would resolve to the replica.
	// The internal iframe is its own document, so it keeps the id and host
	// rules like `#editor::part(cell)` stay matching.
	const skippedHostAttributes: readonly string[] = isExport
		? ['style', 'id', STATIC_HOST_ATTRIBUTE]
		: ['style', STATIC_HOST_ATTRIBUTE];
	const hostAttributes: string = serializeAttributes(input.host, skippedHostAttributes);
	const hostTokens: string = input.carryThemeContext ? serializeInlineTokenStyle(input.host) : '';

	const htmlContext: string = input.carryThemeContext
		? serializeThemeContextAttributes(doc.documentElement) +
			serializeInlineTokenStyle(doc.documentElement)
		: '';
	const bodyContext: string = input.carryThemeContext
		? serializeThemeContextAttributes(doc.body) + serializeInlineTokenStyle(doc.body)
		: '';

	const nonceAttribute: string = input.styleNonce ? ` nonce="${escapeAttr(input.styleNonce)}"` : '';
	const head: string[] = ['<meta charset="utf-8">', `<title>${escapeHTML(input.title)}</title>`];
	if (isExport) {
		// Standalone marker: only reachable inside document.head when this
		// export IS the rendered document (see PRINT_EXPORT_META_NAME).
		head.push(`<meta name="${PRINT_EXPORT_META_NAME}">`);
	}
	// The layer-order statement must be the document's first style rule: layer
	// order is fixed by first appearance, and for `!important` declarations
	// earlier layers win — customCSS > print guards > host copy. It stays
	// inline even in the export variant; on an embedding page it merely pins
	// the relative order of these notectl-prefixed layers, which only ever
	// hold marker-qualified rules there.
	head.push(
		`<style${nonceAttribute}>@layer ${CUSTOM_STYLE_LAYER}, ${PRINT_STYLE_LAYER}, ${HOST_STYLE_LAYER};</style>`,
	);
	head.push(`<style${nonceAttribute}>${escapeStyleText(input.documentCSS)}</style>`);
	// One `<style>` per segment: `@import` must precede every other rule of its
	// stylesheet, so interleaving imports and rule chunks as separate elements
	// is the only way to keep the live source order — which decides
	// equal-specificity cascade ties inside the `notectl-host` layer. The
	// export variant ships all segments (and the page-level standaloneCSS)
	// inside the inert style bundle instead: copied host selectors and hoisted
	// imports must never act on a page that merely embeds the export.
	const segmentStyles: string[] = input.hostSegments.map((segment: HostStyleSegment): string => {
		const css: string =
			segment.kind === 'import'
				? segment.statement
				: `@layer ${HOST_STYLE_LAYER} {\n${segment.css}\n}`;
		return `<style${nonceAttribute}>${escapeStyleText(css)}</style>`;
	});
	if (!isExport) head.push(...segmentStyles);

	const styleBundle: string = isExport
		? `<template ${PRINT_STYLE_BUNDLE_ATTRIBUTE}><style>${escapeStyleText(input.standaloneCSS)}</style>${segmentStyles.join('')}</template>`
		: '';

	// The static fallback renders only when no shadow root is attached (a
	// shadow host's unslotted light DOM is never rendered): consumers that
	// inject via innerHTML — no DSD parsing, no script execution — get
	// readable, statically styled output instead of a blank page. Its style
	// copy is wrapped in @scope: a <style> element applies document-wide even
	// while its subtree is not rendered, and without the scope the shadow CSS
	// (including customCSS body rules) would leak onto a consumer page that
	// embeds this document via setHTMLUnsafe. Engines without @scope drop the
	// block and render the fallback unstyled but readable.
	const fallback: string = isExport
		? `<div ${PRINT_FALLBACK_ATTRIBUTE}><style>@scope ([${PRINT_FALLBACK_ATTRIBUTE}]) {\n${escapeStyleText(input.shadowCSS)}\n}</style>${input.fallbackContentHTML}</div>`
		: '';
	const fallbackScript: string = isExport ? `<script>${DSD_FALLBACK_SCRIPT}</script>` : '';

	const body: string[] = [
		`<${hostTag}${hostAttributes}${hostTokens} ${STATIC_HOST_ATTRIBUTE}>`,
		'<template shadowrootmode="open">',
		`<style${nonceAttribute}>${escapeStyleText(input.shadowCSS)}</style>`,
		input.contentHTML,
		'</template>',
		...(fallback ? [fallback] : []),
		...(input.destinationMarkersHTML ? [input.destinationMarkersHTML] : []),
		`</${hostTag}>`,
		...(styleBundle ? [styleBundle] : []),
		...(fallbackScript ? [fallbackScript] : []),
	];

	return [
		'<!DOCTYPE html>',
		`<html lang="${escapeAttr(input.lang)}"${htmlContext}>`,
		'<head>',
		...head,
		'</head>',
		`<body${bodyContext}>`,
		...body,
		'</body>',
		'</html>',
	].join('\n');
}

/** PrintService plus internal lifecycle hooks (not part of the public service API). */
export interface ManagedPrintService extends PrintService {
	/** Cancels pending print triggers and removes parked print iframes. */
	dispose(): void;
}

/** Creates and returns the PrintService implementation. */
export function createPrintService(
	shadowRoot: ShadowRoot,
	host: HTMLElement,
	container: HTMLElement,
	eventBus: PluginEventBus,
): ManagedPrintService {
	/** Cancel callbacks for prints still waiting on their iframe's load event. */
	const pendingPrints = new Set<() => void>();

	function mergeOptions(options?: PrintOptions): PrintOptions {
		return options ?? {};
	}

	/** The export document plus the inputs to rebuild the internal variant. */
	interface PrintDocumentBuild {
		readonly html: string;
		readonly input: PrintDocumentInput;
	}

	function executePrint(options: PrintOptions): PrintDocumentBuild | null {
		// 1. Emit BEFORE_PRINT — listeners can mutate options or cancel
		const beforeEvent: BeforePrintEvent = {
			options,
			cancelled: false,
		};
		eventBus.emit(BEFORE_PRINT, beforeEvent);

		if (beforeEvent.cancelled) return null;

		const finalOptions: PrintOptions = beforeEvent.options;

		// 2. Collect styles for both scopes
		const shadowCSS: string = buildShadowCSS(shadowRoot, finalOptions);
		const hostSegments: readonly HostStyleSegment[] = collectHostStyleSegments(host);

		// 3. Prepare content
		const clone: HTMLElement = prepare(container, finalOptions);
		const fallbackClone: HTMLElement = clone.cloneNode(true) as HTMLElement;
		namespacePrintFallbackTargets(fallbackClone);
		const fallbackContentHTML: string = fallbackClone.outerHTML;
		const projection: PrintDestinationProjection = projectPrintDestinations(clone);
		const contentHTML: string = clone.outerHTML;
		const destinationMarkersHTML: string = projection.markers
			.map((marker: HTMLAnchorElement): string => marker.outerHTML)
			.join('');

		// 4. Build the export document (no nonce — serialized output must not
		// persist the page's CSP secret; inline document CSS marker-qualified,
		// page-level CSS in the inert standalone bundle — embedding the output
		// must not restyle the consumer's page)
		const title: string = finalOptions.title ?? '';
		const ownerDocument: Document = host.ownerDocument;
		const lang: string =
			host.closest('[lang]')?.getAttribute('lang') ?? (ownerDocument.documentElement.lang || 'en');
		const input: PrintDocumentInput = {
			documentCSS: buildExportDocumentCSS(host, container, finalOptions, STATIC_HOST_ATTRIBUTE),
			standaloneCSS: buildDocumentCSS(host, container, finalOptions),
			hostSegments,
			shadowCSS,
			host,
			contentHTML,
			fallbackContentHTML,
			destinationMarkersHTML,
			title,
			lang,
			carryThemeContext: finalOptions.forceLightTheme === false,
			variant: 'export',
		};
		const html: string = buildHTMLDocument(input);

		// 5. Emit AFTER_PRINT
		const afterEvent: AfterPrintEvent = { html };
		eventBus.emit(AFTER_PRINT, afterEvent);

		return { html, input };
	}

	return {
		print(options?: PrintOptions): void {
			const resolved: PrintOptions = mergeOptions(options);
			const build: PrintDocumentBuild | null = executePrint(resolved);
			if (!build) return;

			// The iframe is parsed by the same browser, so the fallback is dead
			// weight there; the nonce keeps the styles alive under a CSP
			// inherited by the about:blank iframe. The internal variant inlines
			// the full-fidelity page CSS (html/body reset, body typography,
			// @page) that the embed-safe export ships only in its inert bundle.
			const printHTML: string = buildHTMLDocument({
				...build.input,
				documentCSS: build.input.standaloneCSS,
				variant: 'internal',
				styleNonce: getStyleNonceForNode(container),
			});

			// Create hidden iframe
			const iframe: HTMLIFrameElement = document.createElement('iframe');
			setStyleText(iframe, 'position:fixed;left:-9999px;width:0;height:0;border:none');
			document.body.appendChild(iframe);

			const iframeDoc: Document | null = iframe.contentDocument;
			const iframeWindow: Window | null = iframe.contentWindow;
			if (!iframeDoc || !iframeWindow) {
				document.body.removeChild(iframe);
				return;
			}

			iframeDoc.open();
			iframeDoc.write(printHTML);
			iframeDoc.close();

			const cleanup = (): void => {
				iframe.remove();
			};

			const triggerPrint = (): void => {
				iframeWindow.addEventListener('afterprint', cleanup, { once: true });
				iframeWindow.print();
			};

			// Referenced host stylesheets (cross-origin @import) load
			// asynchronously; wait for them so the first paint printed is styled.
			// A hanging stylesheet must not block the dialog forever, so the wait
			// is bounded — on timeout, printing proceeds with the styles loaded
			// so far. The pending trigger is cancellable: after the editor is
			// destroyed the dialog must not pop up over an unrelated view.
			if (iframeDoc.readyState === 'complete') {
				triggerPrint();
				return;
			}
			let triggered = false;
			const triggerOnce = (): void => {
				if (triggered) return;
				triggered = true;
				pendingPrints.delete(cancelPending);
				window.clearTimeout(timeoutId);
				triggerPrint();
			};
			const cancelPending = (): void => {
				triggered = true;
				window.clearTimeout(timeoutId);
				iframeWindow.removeEventListener('load', triggerOnce);
				iframe.remove();
			};
			const timeoutId: number = window.setTimeout(triggerOnce, PRINT_LOAD_TIMEOUT_MS);
			pendingPrints.add(cancelPending);
			iframeWindow.addEventListener('load', triggerOnce, { once: true });
		},

		toHTML(options?: PrintOptions): string {
			const resolved: PrintOptions = mergeOptions(options);
			return executePrint(resolved)?.html ?? '';
		},

		dispose(): void {
			for (const cancel of pendingPrints) {
				cancel();
			}
			pendingPrints.clear();
		},
	};
}
