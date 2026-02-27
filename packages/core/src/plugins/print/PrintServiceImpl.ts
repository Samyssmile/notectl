/**
 * PrintService implementation.
 * Handles the synchronous print flow: event emission, style collection,
 * content preparation, iframe creation, and cleanup.
 */

import { setStyleText } from '../../style/StyleRuntime.js';
import type { PluginEventBus } from '../Plugin.js';
import { prepare } from './PrintContentPreparer.js';
import { collectAll } from './PrintStyleCollector.js';
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

/** Builds a complete HTML document string from CSS, body content, and title. */
export function buildHTMLDocument(
	css: string,
	content: string,
	title: string,
	lang = 'en',
): string {
	const safeTitle: string = escapeHTML(title);
	return [
		'<!DOCTYPE html>',
		`<html lang="${lang}">`,
		'<head>',
		`<meta charset="utf-8">`,
		`<title>${safeTitle}</title>`,
		`<style>${css}</style>`,
		'</head>',
		`<body>${content}</body>`,
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

		// 2. Collect styles
		const css: string = collectAll(shadowRoot, host, finalOptions);

		// 3. Prepare content
		const clone: HTMLElement = prepare(container, finalOptions);
		const contentHTML: string = clone.outerHTML;

		// 4. Build HTML document
		const title: string = finalOptions.title ?? '';
		const lang: string =
			host.closest('[lang]')?.getAttribute('lang') ?? (document.documentElement.lang || 'en');
		const html: string = buildHTMLDocument(css, contentHTML, title, lang);

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
			setStyleText(iframe, 'position:fixed;left:-9999px;width:0;height:0;border:none;');
			document.body.appendChild(iframe);

			const iframeDoc: Document | null = iframe.contentDocument;
			if (!iframeDoc) {
				document.body.removeChild(iframe);
				return;
			}

			iframeDoc.open();
			iframeDoc.write(html);
			iframeDoc.close();

			const cleanup = (): void => {
				iframe.remove();
			};

			// Defer cleanup until print dialog closes
			if (iframe.contentWindow) {
				iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
				iframe.contentWindow.print();
			} else {
				cleanup();
			}
		},

		toHTML(options?: PrintOptions): string {
			const resolved: PrintOptions = mergeOptions(options);
			return executePrint(resolved) ?? '';
		},
	};
}
