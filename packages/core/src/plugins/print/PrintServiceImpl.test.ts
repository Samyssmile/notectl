import { describe, expect, it, vi } from 'vitest';
import { PaperSize } from '../../model/PaperSize.js';
import { EventBus } from '../EventBus.js';
import type { PluginEventBus } from '../Plugin.js';
import { buildHTMLDocument, createPrintService } from './PrintServiceImpl.js';
import type { PrintDocumentInput } from './PrintServiceImpl.js';
import type { BeforePrintEvent, PrintService } from './PrintTypes.js';
import { AFTER_PRINT, BEFORE_PRINT } from './PrintTypes.js';

/** Creates a minimal test environment for PrintService. */
function createTestEnv(contentHTML?: string): {
	service: PrintService;
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

	const service: PrintService = createPrintService(shadow, hostEl, content, pluginEventBus);

	return { service, eventBus: pluginEventBus, container: content, host: hostEl };
}

describe('PrintServiceImpl', () => {
	describe('buildHTMLDocument', () => {
		function buildInput(overrides: Partial<PrintDocumentInput> = {}): PrintDocumentInput {
			const host: HTMLElement = document.createElement('notectl-editor');
			return {
				documentCSS: '.doc {}',
				hostImports: [],
				hostLayerCSS: '',
				shadowCSS: '.shadow {}',
				host,
				contentHTML: '<p>hi</p>',
				title: 'Test',
				lang: 'en',
				carryThemeContext: false,
				...overrides,
			};
		}

		it('creates a document with a declarative shadow root on the host element', () => {
			const html: string = buildHTMLDocument(buildInput());

			expect(html).toContain('<!DOCTYPE html>');
			expect(html).toContain('<title>Test</title>');
			expect(html).toContain('<style>.doc {}</style>');
			expect(html).toContain('<notectl-editor>');
			expect(html).toContain('<template shadowrootmode="open">');
			expect(html).toContain('<style>.shadow {}</style>');
			expect(html).toContain('<p>hi</p>');
			expect(html).toContain('</notectl-editor>');
		});

		it('replicates host attributes but strips the style attribute', () => {
			const host: HTMLElement = document.createElement('notectl-editor');
			host.setAttribute('id', 'main');
			host.setAttribute('class', 'themed');
			host.setAttribute('style', 'height: 400px');
			const html: string = buildHTMLDocument(buildInput({ host }));

			expect(html).toContain('<notectl-editor id="main" class="themed">');
			expect(html).not.toContain('height: 400px');
		});

		it('wraps copied host CSS in the notectl-host layer and hoists imports', () => {
			const html: string = buildHTMLDocument(
				buildInput({
					hostImports: ['@import url("https://cdn.example/x.css") layer(notectl-host);'],
					hostLayerCSS: 'notectl-editor::part(cell) { padding: 0px; }',
				}),
			);

			expect(html).toContain('@import url("https://cdn.example/x.css") layer(notectl-host);');
			expect(html).toContain('@layer notectl-host {\nnotectl-editor::part(cell)');
		});

		it('declares the layer order before the hoisted imports', () => {
			const html: string = buildHTMLDocument(
				buildInput({
					hostImports: ['@import url("https://cdn.example/x.css") layer(notectl-host);'],
					hostLayerCSS: 'notectl-editor::part(cell) { padding: 0px; }',
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
					hostLayerCSS: '.c::before { content: "</style>"; }',
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

		it('includes the lang attribute on the html element', () => {
			const html: string = buildHTMLDocument(buildInput({ lang: 'de' }));
			expect(html).toContain('<html lang="de">');
		});

		it('escapes HTML in title', () => {
			const html: string = buildHTMLDocument(
				buildInput({ title: '</title><script>alert(1)</script>' }),
			);
			expect(html).not.toContain('<script>');
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
	});

	describe('toHTML', () => {
		it('returns a complete HTML document string', () => {
			const { service } = createTestEnv();
			const html: string = service.toHTML({ title: 'My Doc' });

			expect(html).toContain('<!DOCTYPE html>');
			expect(html).toContain('<title>My Doc</title>');
			expect(html).toContain('Hello World');
		});

		it('includes print CSS rules', () => {
			const { service } = createTestEnv();
			const html: string = service.toHTML({ margin: '2cm' });

			expect(html).toContain('@page');
			expect(html).toContain('margin: 2cm');
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

	describe('print', () => {
		it('creates an iframe, prints, and defers cleanup to afterprint', () => {
			const { service } = createTestEnv();

			const originalCreateElement = document.createElement.bind(document);
			const printMock = vi.fn();
			const listeners = new Map<string, EventListenerOrEventListenerObject>();

			vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
				const el: HTMLElement = originalCreateElement(tag);
				if (tag === 'iframe') {
					const fakeWindow = {
						print: printMock,
						addEventListener: (type: string, cb: EventListenerOrEventListenerObject) => {
							listeners.set(type, cb);
						},
					};
					Object.defineProperty(el, 'contentWindow', {
						get() {
							return fakeWindow;
						},
					});
				}
				return el;
			});

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
		it('includes body rule with font-family when paperSize is set', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';

			const html: string = service.toHTML({ paperSize: PaperSize.DINA4 });

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*font-family[^}]*\}/);
			expect(bodyRuleMatch).toBeTruthy();

			document.body.removeChild(host);
		});

		it('includes font-size and line-height in body rule with paperSize', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';
			host.style.fontSize = '16px';
			host.style.lineHeight = '1.5';

			const html: string = service.toHTML({ paperSize: PaperSize.DINA4 });

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*\}/);
			if (!bodyRuleMatch) {
				expect.unreachable('Expected body rule in print HTML');
				return;
			}

			const bodyRule: string = bodyRuleMatch[0];
			expect(bodyRule).toContain('font-size');
			expect(bodyRule).toContain('line-height');

			document.body.removeChild(host);
		});

		it('includes body rule with font-family in paper mode', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Georgia, serif';

			const html: string = service.toHTML({ paperSize: PaperSize.DINA4 });

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*font-family[^}]*\}/);
			expect(bodyRuleMatch).toBeTruthy();

			document.body.removeChild(host);
		});

		it('includes body rule with font-family without paperSize', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';

			const html: string = service.toHTML({});

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*font-family[^}]*\}/);
			expect(bodyRuleMatch).toBeTruthy();

			document.body.removeChild(host);
		});

		it('includes font-size and line-height without paperSize', () => {
			const { service, host } = createTestEnv();
			host.style.fontFamily = 'Arial, sans-serif';
			host.style.fontSize = '18px';
			host.style.lineHeight = '1.8';

			const html: string = service.toHTML({});

			const bodyRuleMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*\}/);
			if (!bodyRuleMatch) {
				expect.unreachable('Expected body rule in print HTML');
				return;
			}

			const bodyRule: string = bodyRuleMatch[0];
			expect(bodyRule).toContain('font-size');
			expect(bodyRule).toContain('line-height');

			document.body.removeChild(host);
		});
	});
});
