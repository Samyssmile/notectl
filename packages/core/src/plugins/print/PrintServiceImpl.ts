/**
 * PrintService implementation.
 *
 * Builds a print document that preserves the editor's shadow boundary via
 * declarative shadow DOM: the host page's stylesheets are copied verbatim
 * (layered), the editor's own styles live inside the shadow template, and the
 * cloned content keeps its `part` attributes. Host `::part()` rules,
 * specificity, custom properties, and conditional rules therefore behave
 * exactly as in the live editor — nothing is translated or re-emulated.
 */

import { setStyleText } from '../../style/StyleRuntime.js';
import type { PluginEventBus } from '../Plugin.js';
import { prepare } from './PrintContentPreparer.js';
import { HOST_STYLE_LAYER, collectHostStyleCopy } from './PrintHostStyles.js';
import { buildDocumentCSS, buildShadowCSS } from './PrintStyleCollector.js';
import {
	AFTER_PRINT,
	type AfterPrintEvent,
	BEFORE_PRINT,
	type BeforePrintEvent,
	type PrintOptions,
	type PrintService,
} from './PrintTypes.js';

/** Escapes HTML special characters in a plain-text string. */
function escapeHTML(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes a string for use inside a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Serializes an element's attributes for the print document. The `style`
 * attribute is stripped from the host element: element-attached declarations
 * would beat every stylesheet rule, defeating the print host reset.
 */
function serializeAttributes(el: Element, skip: readonly string[]): string {
	const parts: string[] = [];
	for (const attribute of Array.from(el.attributes)) {
		if (skip.includes(attribute.name)) continue;
		parts.push(
			attribute.value === ''
				? attribute.name
				: `${attribute.name}="${escapeAttribute(attribute.value)}"`,
		);
	}
	return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

/**
 * Serializes theme-context attributes (`class` and `data-*`) so selectors
 * like `html.dark notectl-editor::part(x)` keep matching when the live theme
 * is carried into print (`forceLightTheme: false`).
 */
function serializeThemeContextAttributes(el: Element | null): string {
	if (!el) return '';
	const parts: string[] = [];
	for (const attribute of Array.from(el.attributes)) {
		if (attribute.name !== 'class' && !attribute.name.startsWith('data-')) continue;
		parts.push(`${attribute.name}="${escapeAttribute(attribute.value)}"`);
	}
	return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

/** Everything needed to assemble the print document. */
export interface PrintDocumentInput {
	/** Document-level CSS: host reset, light theme, body, `@page`, customCSS copy. */
	readonly documentCSS: string;
	/** Hoisted `@import ... layer(notectl-host)` statements for unreadable host sheets. */
	readonly hostImports: readonly string[];
	/** Verbatim host-page CSS, emitted inside the `notectl-host` layer. */
	readonly hostLayerCSS: string;
	/** CSS placed inside the declarative shadow root. */
	readonly shadowCSS: string;
	/** The live editor host element; its tag and attributes are replicated. */
	readonly host: HTMLElement;
	/** Serialized cloned editor content. */
	readonly contentHTML: string;
	readonly title: string;
	readonly lang: string;
	/** Copy html/body theme-context attributes (only when the live theme is carried). */
	readonly carryThemeContext: boolean;
}

/** Builds the complete print document as an HTML string. */
export function buildHTMLDocument(input: PrintDocumentInput): string {
	const doc: Document = input.host.ownerDocument;
	const hostTag: string = input.host.tagName.toLowerCase();
	const hostAttributes: string = serializeAttributes(input.host, ['style']);

	const htmlContext: string = input.carryThemeContext
		? serializeThemeContextAttributes(doc.documentElement)
		: '';
	const bodyContext: string = input.carryThemeContext
		? serializeThemeContextAttributes(doc.body)
		: '';

	const hostStyleParts: string[] = [...input.hostImports];
	if (input.hostLayerCSS) {
		hostStyleParts.push(`@layer ${HOST_STYLE_LAYER} {\n${input.hostLayerCSS}\n}`);
	}

	const head: string[] = ['<meta charset="utf-8">', `<title>${escapeHTML(input.title)}</title>`];
	if (hostStyleParts.length > 0) {
		head.push(`<style>${hostStyleParts.join('\n')}</style>`);
	}
	head.push(`<style>${input.documentCSS}</style>`);

	return [
		'<!DOCTYPE html>',
		`<html lang="${escapeAttribute(input.lang)}"${htmlContext}>`,
		'<head>',
		...head,
		'</head>',
		`<body${bodyContext}>`,
		`<${hostTag}${hostAttributes}>`,
		'<template shadowrootmode="open">',
		`<style>${input.shadowCSS}</style>`,
		input.contentHTML,
		'</template>',
		`</${hostTag}>`,
		'</body>',
		'</html>',
	].join('\n');
}

/** Creates and returns the PrintService implementation. */
export function createPrintService(
	shadowRoot: ShadowRoot,
	host: HTMLElement,
	container: HTMLElement,
	eventBus: PluginEventBus,
): PrintService {
	function mergeOptions(options?: PrintOptions): PrintOptions {
		return options ?? {};
	}

	function executePrint(options: PrintOptions): string | null {
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
		const documentCSS: string = buildDocumentCSS(host, finalOptions);
		const hostCopy = collectHostStyleCopy(host);

		// 3. Prepare content
		const clone: HTMLElement = prepare(container, finalOptions);
		const contentHTML: string = clone.outerHTML;

		// 4. Build HTML document
		const title: string = finalOptions.title ?? '';
		const lang: string =
			host.closest('[lang]')?.getAttribute('lang') ?? (document.documentElement.lang || 'en');
		const html: string = buildHTMLDocument({
			documentCSS,
			hostImports: hostCopy.imports,
			hostLayerCSS: hostCopy.layerBody,
			shadowCSS,
			host,
			contentHTML,
			title,
			lang,
			carryThemeContext: finalOptions.forceLightTheme === false,
		});

		// 5. Emit AFTER_PRINT
		const afterEvent: AfterPrintEvent = { html };
		eventBus.emit(AFTER_PRINT, afterEvent);

		return html;
	}

	return {
		print(options?: PrintOptions): void {
			const resolved: PrintOptions = mergeOptions(options);
			const html: string | null = executePrint(resolved);
			if (!html) return;

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
			iframeDoc.write(html);
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
			if (iframeDoc.readyState === 'complete') {
				triggerPrint();
			} else {
				iframeWindow.addEventListener('load', triggerPrint, { once: true });
			}
		},

		toHTML(options?: PrintOptions): string {
			const resolved: PrintOptions = mergeOptions(options);
			return executePrint(resolved) ?? '';
		},
	};
}
