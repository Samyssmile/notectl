import { describe, expect, it, vi } from 'vitest';
import { PaperSize } from '../../model/PaperSize.js';
import { registerStyleRoot, unregisterStyleRoot } from '../../style/StyleRuntime.js';
import { EventBus } from '../EventBus.js';
import type { PluginEventBus } from '../Plugin.js';
import { buildHTMLDocument, createPrintService } from './PrintServiceImpl.js';
import type { ManagedPrintService, PrintDocumentInput } from './PrintServiceImpl.js';
import type { BeforePrintEvent } from './PrintTypes.js';
import { AFTER_PRINT, BEFORE_PRINT } from './PrintTypes.js';

/** Creates a minimal test environment for PrintService. */
function createTestEnv(contentHTML?: string): {
	service: ManagedPrintService;
	eventBus: PluginEventBus;
	container: HTMLElement;
	host: HTMLElement;
} {
	const hostEl: HTMLElement = document.createElement('div');
	document.body.appendChild(hostEl);
	const shadow: ShadowRoot = hostEl.attachShadow({ mode: 'open' });

	const content: HTMLElement = document.createElement('div');
	content.className = 'notectl-content';
	content.innerHTML = contentHTML ?? '<p data-block-type="paragraph">Hello World</p>';
	shadow.appendChild(content);

	const bus = new EventBus();
	const pluginEventBus: PluginEventBus = {
		emit: (key, payload) => bus.emit(key, payload),
		on: (key, callback) => bus.on(key, callback),
		off: (key, callback) => bus.off(key, callback),
	};

	const service: ManagedPrintService = createPrintService(shadow, hostEl, content, pluginEventBus);

	return { service, eventBus: pluginEventBus, container: content, host: hostEl };
}

describe('PrintServiceImpl', () => {
	describe('buildHTMLDocument', () => {
		function buildInput(overrides: Partial<PrintDocumentInput> = {}): PrintDocumentInput {
			const host: HTMLElement = document.createElement('notectl-editor');
			return {
				documentCSS: '.doc {}',
				standaloneCSS: '.standalone {}',
				hostSegments: [],
				shadowCSS: '.shadow {}',
				host,
				contentHTML: '<p>hi</p>',
				title: 'Test',
				lang: 'en',
				carryThemeContext: false,
				variant: 'export',
				...overrides,
			};
		}

		it('creates a document with a declarative shadow root on the host element', () => {
			const html: string = buildHTMLDocument(buildInput());

			expect(html).toContain('<!DOCTYPE html>');
			expect(html).toContain('<title>Test</title>');
			expect(html).toContain('<style>.doc {}</style>');
			expect(html).toContain('<notectl-editor data-notectl-static>');
			expect(html).toContain('<template shadowrootmode="open">');
			expect(html).toContain('<style>.shadow {}</style>');
			expect(html).toContain('<p>hi</p>');
			expect(html).toContain('</notectl-editor>');
		});

		it('marks the replicated host as a static replica exactly once', () => {
			const host: HTMLElement = document.createElement('notectl-editor');
			host.setAttribute('data-notectl-static', '');
			const html: string = buildHTMLDocument(buildInput({ host }));

			// A replica of a replica must not end up with a duplicate attribute.
			const openTag: string = html.match(/<notectl-editor[^>]*>/)?.[0] ?? '';
			expect(openTag.match(/data-notectl-static/g)).toHaveLength(1);
		});

		it('embeds the declarative-shadow-root fallback script after the content', () => {
			const html: string = buildHTMLDocument(buildInput());

			// Consumers rendering with a non-DSD parser that executes scripts
			// (older WebViews, HTML-to-PDF engines) still get visible output. The
			// script must start from the replica marker, never from a document-wide
			// template sweep that would consume the consumer's own DSD templates,
			// and it must gate the standalone style bundle on the head meta.
			expect(html).toContain("querySelectorAll('[data-notectl-static]')");
			expect(html).not.toContain("querySelectorAll('template[shadowrootmode]')");
			expect(html).toContain('meta[name="notectl-print-export"]');
			expect(html.indexOf('<script>')).toBeGreaterThan(html.indexOf('</template>'));
		});

		it('embeds a static light-DOM fallback with the shadow CSS inside the host', () => {
			const html: string = buildHTMLDocument(buildInput());

			// Consumers injecting via innerHTML get neither DSD parsing nor script
			// execution; the unslotted light-DOM copy renders readable output.
			const fallbackIndex: number = html.indexOf('<div data-notectl-print-fallback>');
			expect(fallbackIndex).toBeGreaterThan(html.indexOf('</template>'));
			expect(fallbackIndex).toBeLessThan(html.indexOf('</notectl-editor>'));
			expect(html.match(/<p>hi<\/p>/g)).toHaveLength(2);
			expect(html.match(/\.shadow \{\}/g)).toHaveLength(2);
		});

		it('lets the fallback script remove the static fallback once a shadow root exists', () => {
			const html: string = buildHTMLDocument(buildInput());
			expect(html).toContain("querySelectorAll('[data-notectl-print-fallback]')");
		});

		it('omits fallback content and script for the internal print variant', () => {
			const html: string = buildHTMLDocument(buildInput({ variant: 'internal' }));

			expect(html).not.toContain('data-notectl-print-fallback');
			expect(html).not.toContain('<script');
			expect(html.match(/<p>hi<\/p>/g)).toHaveLength(1);
		});

		it('replicates host attributes but strips the style attribute', () => {
			const host: HTMLElement = document.createElement('notectl-editor');
			host.setAttribute('id', 'main');
			host.setAttribute('class', 'themed');
			host.setAttribute('style', 'height: 400px');
			const html: string = buildHTMLDocument(buildInput({ host }));

			expect(html).toContain('<notectl-editor id="main" class="themed" data-notectl-static>');
			expect(html).not.toContain('height: 400px');
		});

		it('wraps copied host CSS in the notectl-host layer and hoists imports internally', () => {
			const html: string = buildHTMLDocument(
				buildInput({
					variant: 'internal',
					hostSegments: [
						{
							kind: 'import',
							statement: '@import url("https://cdn.example/x.css") layer(notectl-host);',
						},
						{ kind: 'rules', css: 'notectl-editor::part(cell) { padding: 0px; }' },
					],
				}),
			);

			expect(html).toContain(
				'<style>@import url("https://cdn.example/x.css") layer(notectl-host);</style>',
			);
			expect(html).toContain('@layer notectl-host {\nnotectl-editor::part(cell)');
			expect(html).not.toContain('@scope');
		});

		it('ships host CSS and page CSS only in the inert style bundle of the export', () => {
			const html: string = buildHTMLDocument(
				buildInput({
					hostSegments: [
						{
							kind: 'import',
							statement: '@import url("https://cdn.example/x.css") layer(notectl-host);',
						},
						{ kind: 'rules', css: 'notectl-editor::part(cell) { padding: 0px; }' },
					],
				}),
			);

			// An embedding page must not have consumer elements matched by the
			// copied selectors, nor foreign stylesheets loaded into it: copied
			// host CSS, hoisted imports, and the page-level CSS live in an inert
			// template that only the script-gated standalone path activates.
			const head: string = html.slice(0, html.indexOf('</head>'));
			const bundleStart: number = html.indexOf('<template data-notectl-print-styles>');
			expect(bundleStart).toBeGreaterThanOrEqual(0);
			expect(head).toContain('<meta name="notectl-print-export">');
			expect(head).not.toContain('@import');
			expect(head).not.toContain('@layer notectl-host {');
			expect(head).not.toContain('.standalone {}');
			expect(html.indexOf('@import')).toBeGreaterThan(bundleStart);
			expect(html.indexOf('notectl-editor::part(cell)')).toBeGreaterThan(bundleStart);
			expect(html.indexOf('.standalone {}')).toBeGreaterThan(bundleStart);
		});

		it('emits host segments as separate style elements in source order', () => {
			const html: string = buildHTMLDocument(
				buildInput({
					variant: 'internal',
					hostSegments: [
						{ kind: 'rules', css: '.before { color: red; }' },
						{
							kind: 'import',
							statement: '@import url("https://cdn.example/x.css") layer(notectl-host);',
						},
						{ kind: 'rules', css: '.after { color: blue; }' },
					],
				}),
			);

			// Same-layer source order decides equal-specificity ties: the hoisted
			// import must stay between its neighbours, exactly as on the live page.
			const beforeIndex: number = html.indexOf('.before');
			const importIndex: number = html.indexOf('@import');
			const afterIndex: number = html.indexOf('.after');
			expect(beforeIndex).toBeGreaterThanOrEqual(0);
			expect(beforeIndex).toBeLessThan(importIndex);
			expect(importIndex).toBeLessThan(afterIndex);
		});

		it('declares the layer order before the hoisted imports', () => {
			const html: string = buildHTMLDocument(
				buildInput({
					variant: 'internal',
					hostSegments: [
						{
							kind: 'import',
							statement: '@import url("https://cdn.example/x.css") layer(notectl-host);',
						},
						{ kind: 'rules', css: 'notectl-editor::part(cell) { padding: 0px; }' },
					],
				}),
			);

			const orderIndex: number = html.indexOf(
				'@layer notectl-custom, notectl-print, notectl-host;',
			);
			const importIndex: number = html.indexOf('@import');
			expect(orderIndex).toBeGreaterThanOrEqual(0);
			expect(orderIndex).toBeLessThan(importIndex);
		});

		it('declares the layer order even without any host CSS', () => {
			const html: string = buildHTMLDocument(buildInput());
			// Without the statement, first appearance inside the document CSS would
			// put notectl-print before notectl-custom and invert important priority.
			expect(html).toContain('@layer notectl-custom, notectl-print, notectl-host;');
		});

		it('escapes literal </style> sequences in every embedded CSS scope', () => {
			const html: string = buildHTMLDocument(
				buildInput({
					documentCSS: '.a::before { content: "</style><script>alert(1)</script>"; }',
					shadowCSS: '.b::before { content: "</style>"; }',
					hostSegments: [{ kind: 'rules', css: '.c::before { content: "</style>"; }' }],
				}),
			);

			// No embedded CSS may close the <style> element early; the opening
			// <script> stays raw text and is inert without a closing tag.
			expect(html).not.toContain('content: "</style>');
			// `\/` is a CSS string escape for `/`, so the value is unchanged.
			expect(html).toContain('content: "<\\/style><script>alert(1)<\\/script>"');
			expect(html).toContain('.b::before { content: "<\\/style>"; }');
			expect(html).toContain('.c::before { content: "<\\/style>"; }');
		});

		it('applies the CSP nonce to every embedded style of the internal variant', () => {
			const html: string = buildHTMLDocument(
				buildInput({ styleNonce: 'test-nonce', variant: 'internal' }),
			);

			// Two document-level styles plus the shadow-template style.
			expect(html.match(/<style nonce="test-nonce">/g)).toHaveLength(3);
			expect(html).not.toContain('<style>');
			expect(html).not.toContain('<script');
		});

		it('emits nonce-less style and script elements without a configured nonce', () => {
			const html: string = buildHTMLDocument(buildInput());
			expect(html).not.toContain('nonce=');
		});

		it('includes the lang attribute on the html element', () => {
			const html: string = buildHTMLDocument(buildInput({ lang: 'de' }));
			expect(html).toContain('<html lang="de">');
		});

		it('escapes HTML in title', () => {
			const html: string = buildHTMLDocument(
				buildInput({ title: '</title><script>alert(1)</script>' }),
			);
			expect(html).not.toContain('<script>alert(1)</script>');
			expect(html).toContain('&lt;script&gt;');
		});

		it('copies theme-context attributes when carrying the live theme', () => {
			document.documentElement.setAttribute('class', 'dark');
			try {
				const html: string = buildHTMLDocument(buildInput({ carryThemeContext: true }));
				expect(html).toContain('<html lang="en" class="dark">');
			} finally {
				document.documentElement.removeAttribute('class');
			}
		});

		it('does not copy theme-context attributes when forcing light theme', () => {
			document.documentElement.setAttribute('class', 'dark');
			try {
				const html: string = buildHTMLDocument(buildInput({ carryThemeContext: false }));
				expect(html).toContain('<html lang="en">');
				expect(html).not.toContain('class="dark"');
			} finally {
				document.documentElement.removeAttribute('class');
			}
		});

		it('carries inline --notectl-* tokens when carrying the live theme', () => {
			const host: HTMLElement = document.createElement('notectl-editor');
			host.style.setProperty('--notectl-bg', '#111111');
			host.style.setProperty('width', '400px');
			document.documentElement.style.setProperty('--notectl-primary', '#222222');
			try {
				const html: string = buildHTMLDocument(buildInput({ host, carryThemeContext: true }));

				// Runtime theme switchers set tokens via setProperty (inline); the
				// stylesheet copy cannot carry them, so they are re-emitted inline
				// where they keep beating every copied stylesheet rule — while
				// non-token inline chrome (width) stays stripped.
				expect(html).toContain('style="--notectl-bg: #111111"');
				expect(html).toContain('style="--notectl-primary: #222222"');
				expect(html).not.toContain('width: 400px');
			} finally {
				document.documentElement.style.removeProperty('--notectl-primary');
			}
		});

		it('carries no inline tokens when forcing the light theme', () => {
			const host: HTMLElement = document.createElement('notectl-editor');
			host.style.setProperty('--notectl-bg', '#111111');
			const html: string = buildHTMLDocument(buildInput({ host, carryThemeContext: false }));
			expect(html).not.toContain('--notectl-bg');
		});
	});

	describe('toHTML', () => {
		it('returns a complete HTML document string', () => {
			const { service } = createTestEnv();
			const html: string = service.toHTML({ title: 'My Doc' });

			expect(html).toContain('<!DOCTYPE html>');
			expect(html).toContain('<title>My Doc</title>');
			expect(html).toContain('Hello World');
		});

		it('keeps @page rules out of the active CSS of the embed-safe export', () => {
			const { service } = createTestEnv();
			const html: string = service.toHTML({ margin: '2cm' });

			// Active on an embedding page, @page would change the consumer's own
			// print margins; it ships only inside the inert standalone bundle
			// (and inline in the print() iframe).
			const bundleStart: number = html.indexOf('<template data-notectl-print-styles>');
			expect(bundleStart).toBeGreaterThanOrEqual(0);
			expect(html.indexOf('@page')).toBeGreaterThan(bundleStart);
		});

		it('qualifies all active document-level selectors with the replica marker', () => {
			const { service } = createTestEnv();
			const html: string = service.toHTML();

			const head: string = html.slice(0, html.indexOf('</head>'));
			expect(head).toContain('div[data-notectl-static]');
			expect(head).not.toContain('html, body {');
			expect(head).not.toContain(':root');
		});

		it('never serializes the CSP nonce into the exported document', () => {
			const { service, host } = createTestEnv();
			const shadow: ShadowRoot | null = host.shadowRoot;
			if (!shadow) throw new Error('test host has no shadow root');
			registerStyleRoot(shadow, { nonce: 'csp-nonce' });
			try {
				// The nonce is a per-session secret: persisting it in toHTML()
				// output (document snapshots, PDF queues, AFTER_PRINT listeners)
				// would let anyone with read access reuse it against the CSP.
				const html: string = service.toHTML();
				expect(html).not.toContain('csp-nonce');
				expect(html).not.toContain('nonce=');
			} finally {
				unregisterStyleRoot(shadow);
				document.body.removeChild(host);
			}
		});

		it('applies custom CSS', () => {
			const { service } = createTestEnv();
			const html: string = service.toHTML({ customCSS: '.highlight { color: red; }' });

			expect(html).toContain('.highlight { color: red; }');
		});
	});

	describe('event emission', () => {
		it('emits BEFORE_PRINT event', () => {
			const { service, eventBus } = createTestEnv();
			const listener = vi.fn();
			eventBus.on(BEFORE_PRINT, listener);

			service.toHTML();

			expect(listener).toHaveBeenCalledOnce();
			expect(listener.mock.calls[0]?.[0]).toHaveProperty('options');
			expect(listener.mock.calls[0]?.[0]).toHaveProperty('cancelled', false);
		});

		it('emits AFTER_PRINT event with generated HTML', () => {
			const { service, eventBus } = createTestEnv();
			const listener = vi.fn();
			eventBus.on(AFTER_PRINT, listener);

			service.toHTML({ title: 'Test' });

			expect(listener).toHaveBeenCalledOnce();
			expect(listener.mock.calls[0]?.[0]).toHaveProperty('html');
			expect(listener.mock.calls[0]?.[0]?.html).toContain('Hello World');
		});

		it('cancels print when BEFORE_PRINT sets cancelled=true', () => {
			const { service, eventBus } = createTestEnv();
			eventBus.on(BEFORE_PRINT, (event: BeforePrintEvent) => {
				event.cancelled = true;
			});

			const html: string = service.toHTML();
			expect(html).toBe('');
		});

		it('allows options mutation via BEFORE_PRINT', () => {
			const { service, eventBus } = createTestEnv();
			eventBus.on(BEFORE_PRINT, (event: BeforePrintEvent) => {
				event.options = { ...event.options, title: 'Modified' };
			});

			const afterListener = vi.fn();
			eventBus.on(AFTER_PRINT, afterListener);

			const html: string = service.toHTML({ title: 'Original' });
			expect(html).toContain('<title>Modified</title>');
		});
	});

	/** Replaces created iframes with a fake window capturing listeners and print(). */
	function mockPrintIframe(): {
		printMock: ReturnType<typeof vi.fn>;
		listeners: Map<string, EventListenerOrEventListenerObject>;
		removedListeners: string[];
		written: string[];
	} {
		const originalCreateElement = document.createElement.bind(document);
		const printMock = vi.fn();
		const listeners = new Map<string, EventListenerOrEventListenerObject>();
		const removedListeners: string[] = [];
		const written: string[] = [];

		vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			const el: HTMLElement = originalCreateElement(tag);
			if (tag === 'iframe') {
				const fakeWindow = {
					print: printMock,
					addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => {
						listeners.set(type, cb);
					},
					removeEventListener: (type: string) => {
						removedListeners.push(type);
					},
				};
				const fakeDocument = {
					readyState: 'loading',
					open: (): void => {},
					write: (html: string): void => {
						written.push(html);
					},
					close: (): void => {},
				};
				Object.defineProperty(el, 'contentWindow', {
					get() {
						return fakeWindow;
					},
				});
				Object.defineProperty(el, 'contentDocument', {
					get() {
						return fakeDocument;
					},
				});
			}
			return el;
		});

		return { printMock, listeners, removedListeners, written };
	}

	describe('print', () => {
		it('creates an iframe, prints, and defers cleanup to afterprint', () => {
			const { service } = createTestEnv();
			const { printMock, listeners } = mockPrintIframe();

			service.print({ title: 'Print Test' });

			// Printing waits for the iframe load event when the document is not
			// complete yet (referenced host stylesheets load asynchronously).
			const loadCb = listeners.get('load') as (() => void) | undefined;
			if (loadCb) loadCb();

			expect(printMock).toHaveBeenCalledOnce();
			// iframe still present until afterprint fires
			expect(listeners.has('afterprint')).toBe(true);

			// Simulate afterprint — triggers cleanup
			const cb = listeners.get('afterprint') as () => void;
			cb();
			expect(document.querySelector('iframe')).toBeNull();

			vi.restoreAllMocks();
		});

		it('prints after the load timeout when the load event never fires', () => {
			vi.useFakeTimers();
			const { service } = createTestEnv();
			const { printMock, listeners } = mockPrintIframe();

			service.print();

			// A hanging host stylesheet (cross-origin @import) blocks the load
			// event; the bounded wait must still open the dialog.
			expect(printMock).not.toHaveBeenCalled();
			vi.advanceTimersByTime(4000);
			expect(printMock).toHaveBeenCalledOnce();

			// A late load event must not print a second time.
			const loadCb = listeners.get('load') as (() => void) | undefined;
			if (loadCb) loadCb();
			expect(printMock).toHaveBeenCalledOnce();

			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		it('prints only once when the load event fires before the timeout', () => {
			vi.useFakeTimers();
			const { service } = createTestEnv();
			const { printMock, listeners } = mockPrintIframe();

			service.print();

			const loadCb = listeners.get('load') as (() => void) | undefined;
			if (loadCb) loadCb();
			expect(printMock).toHaveBeenCalledOnce();

			vi.advanceTimersByTime(10000);
			expect(printMock).toHaveBeenCalledOnce();

			vi.restoreAllMocks();
			vi.useRealTimers();
		});

		it('writes the nonce-carrying internal variant into the iframe only', () => {
			const { service, host, eventBus } = createTestEnv();
			const shadow: ShadowRoot | null = host.shadowRoot;
			if (!shadow) throw new Error('test host has no shadow root');
			registerStyleRoot(shadow, { nonce: 'csp-nonce' });
			const { written } = mockPrintIframe();
			const afterListener = vi.fn();
			eventBus.on(AFTER_PRINT, afterListener);
			try {
				service.print();

				// The iframe document renders under the page's inherited CSP and
				// needs the nonce; it is transient and never serialized. It also
				// skips the fallback — its parser is the same modern browser.
				expect(written).toHaveLength(1);
				expect(written[0]).toContain('<style nonce="csp-nonce">');
				expect(written[0]).not.toContain('data-notectl-print-fallback');

				// The broadcast copy stays nonce-free.
				const broadcast: string = afterListener.mock.calls[0]?.[0]?.html ?? '';
				expect(broadcast).not.toContain('nonce=');
			} finally {
				unregisterStyleRoot(shadow);
				vi.restoreAllMocks();
				document.body.removeChild(host);
			}
		});

		/** Removes iframes leaked by earlier bounded-wait tests (no afterprint). */
		function removeStaleIframes(): void {
			for (const stale of Array.from(document.querySelectorAll('iframe'))) {
				stale.remove();
			}
		}

		it('dispose() cancels a pending print so no dialog opens after destroy', () => {
			vi.useFakeTimers();
			removeStaleIframes();
			const { service } = createTestEnv();
			const { printMock, removedListeners } = mockPrintIframe();

			try {
				service.print();
				expect(document.querySelector('iframe')).not.toBeNull();

				// Editor destroyed (e.g. SPA navigation) while the iframe still
				// waits on a hanging stylesheet.
				service.dispose();

				expect(document.querySelector('iframe')).toBeNull();
				expect(removedListeners).toContain('load');
				vi.advanceTimersByTime(10000);
				expect(printMock).not.toHaveBeenCalled();
			} finally {
				vi.restoreAllMocks();
				vi.useRealTimers();
			}
		});

		it('dispose() leaves nothing pending after a completed print', () => {
			vi.useFakeTimers();
			removeStaleIframes();
			const { service } = createTestEnv();
			const { printMock, listeners } = mockPrintIframe();

			try {
				service.print();
				const loadCb = listeners.get('load') as (() => void) | undefined;
				if (loadCb) loadCb();
				expect(printMock).toHaveBeenCalledOnce();

				// The triggered print deregisters itself; dispose must not touch
				// its iframe while the dialog may still be open.
				service.dispose();
				expect(document.querySelector('iframe')).not.toBeNull();
			} finally {
				vi.restoreAllMocks();
				vi.useRealTimers();
			}
		});
	});

	describe('print output preserves inline color styles', () => {
		it('preserves highlight background-color in print HTML', () => {
			const { service, host } = createTestEnv(
				'<p data-block-type="paragraph">' +
					'<span style="background-color: #fff176">Highlighted text</span>' +
					'</p>',
			);

			const html: string = service.toHTML();

			expect(html).toContain('background-color');
			expect(html).toContain('Highlighted text');

			document.body.removeChild(host);
		});

		it('includes print-color-adjust for highlight colors', () => {
			const { service, host } = createTestEnv(
				'<p data-block-type="paragraph">' +
					'<span style="background-color: #fff176">Highlighted</span>' +
					'</p>',
			);

			const html: string = service.toHTML();

			expect(html).toContain('print-color-adjust');

			document.body.removeChild(host);
		});

		it('preserves text-color foreground color in print HTML', () => {
			const { service, host } = createTestEnv(
				'<p data-block-type="paragraph">' +
					'<span style="color: #e53935">Colored text</span>' +
					'</p>',
			);

			const html: string = service.toHTML();

			expect(html).toContain('color:');
			expect(html).toContain('Colored text');

			document.body.removeChild(host);
		});

		it('includes print-color-adjust for text colors', () => {
			const { service, host } = createTestEnv(
				'<p data-block-type="paragraph">' + '<span style="color: #e53935">Colored</span>' + '</p>',
			);

			const html: string = service.toHTML();

			expect(html).toContain('print-color-adjust');

			document.body.removeChild(host);
		});
	});

	describe('print output preserves host typography', () => {
		/** Captures the internal variant written into the print iframe. */
		function printedHTML(
			service: ManagedPrintService,
			options: Record<string, unknown> = {},
		): string {
			const { written } = mockPrintIframe();
			try {
				service.print(options);
				return written[0] ?? '';
			} finally {
				vi.restoreAllMocks();
			}
		}

		it('includes body rule with font-family when paperSize is set', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';

			const html: string = printedHTML(service, { paperSize: PaperSize.DINA4 });

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*font-family[^}]*\}/);
			expect(bodyRuleMatch).toBeTruthy();

			document.body.removeChild(host);
		});

		it('includes font-size and line-height in body rule with paperSize', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';
			host.style.fontSize = '16px';
			host.style.lineHeight = '1.5';

			const html: string = printedHTML(service, { paperSize: PaperSize.DINA4 });

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/(?:^|\n)body\s*\{[^}]*\}/);
			if (!bodyRuleMatch) {
				expect.unreachable('Expected body rule in print HTML');
				return;
			}

			const bodyRule: string = bodyRuleMatch[0];
			expect(bodyRule).toContain('font-size');
			expect(bodyRule).toContain('line-height');

			document.body.removeChild(host);
		});

		it('includes body rule with font-family without paperSize', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';

			const html: string = printedHTML(service);

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*font-family[^}]*\}/);
			expect(bodyRuleMatch).toBeTruthy();

			document.body.removeChild(host);
		});

		it('writes @page setup into the internal variant', () => {
			const { service } = createTestEnv();

			const html: string = printedHTML(service, { margin: '2cm' });

			expect(html).toContain('@page');
			expect(html).toContain('margin: 2cm');
		});

		it('pins typography on the replica itself in the embed-safe export', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';

			// The active export CSS has no body rule (nothing outside the replica
			// may be styled); the replica paints its own canvas instead, and the
			// page-level body rule ships only in the inert standalone bundle.
			const html: string = service.toHTML({});

			const head: string = html.slice(0, html.indexOf('</head>'));
			expect(head).not.toMatch(/body\s*\{/);
			expect(head).toContain('font-family: Arial, sans-serif !important;');

			document.body.removeChild(host);
		});
	});
});
