import { describe, expect, it, vi } from 'vitest';
import { PaperSize } from '../../model/PaperSize.js';
import { EventBus } from '../EventBus.js';
import type { PluginEventBus } from '../Plugin.js';
import { buildHTMLDocument, createPrintService } from './PrintServiceImpl.js';
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
		it('creates a complete HTML document', () => {
			const html: string = buildHTMLDocument('.foo {}', '<p>hi</p>', 'Test');

			expect(html).toContain('<!DOCTYPE html>');
			expect(html).toContain('<title>Test</title>');
			expect(html).toContain('<style>.foo {}</style>');
			expect(html).toContain('<p>hi</p>');
		});

		it('includes lang attribute on html element', () => {
			const html: string = buildHTMLDocument('', '<p>hi</p>', 'Test', 'de');
			expect(html).toContain('<html lang="de">');
		});

		it('defaults lang to en', () => {
			const html: string = buildHTMLDocument('', '<p>hi</p>', 'Test');
			expect(html).toContain('<html lang="en">');
		});

		it('escapes HTML in title', () => {
			const html: string = buildHTMLDocument('', '', '</title><script>alert(1)</script>');
			expect(html).not.toContain('<script>');
			expect(html).toContain('&lt;script&gt;');
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
