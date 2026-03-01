import { afterEach, describe, expect, it } from 'vitest';
import {
	appendStyleText,
	createRuntimeStyleSheet,
	getStyleNonceForNode,
	getStyleText,
	registerStyleRoot,
	removeStyleProperty,
	setStyleProperties,
	setStyleProperty,
	unregisterStyleRoot,
} from './StyleRuntime.js';

describe('StyleRuntime', () => {
	afterEach(() => {
		unregisterStyleRoot(document);
		document.body.innerHTML = '';
	});

	it('avoids inline style attributes in strict mode', () => {
		const host: HTMLDivElement = document.createElement('div');
		document.body.appendChild(host);
		const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
		registerStyleRoot(shadow, {});

		const el: HTMLDivElement = document.createElement('div');
		shadow.appendChild(el);
		setStyleProperties(el, { top: '10px', left: '20px' });

		expect(el.getAttribute('style')).toBeNull();
		expect(el.getAttribute('data-notectl-style-token')).toBeTruthy();
		expect(getStyleText(el)).toContain('top: 10px');
		expect(getStyleText(el)).toContain('left: 20px');

		unregisterStyleRoot(shadow);
	});

	it('returns configured nonce for nodes in a registered root', () => {
		const host: HTMLDivElement = document.createElement('div');
		document.body.appendChild(host);
		const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
		registerStyleRoot(shadow, { nonce: 'nonce-123' });

		const el: HTMLDivElement = document.createElement('div');
		shadow.appendChild(el);

		expect(getStyleNonceForNode(el)).toBe('nonce-123');

		unregisterStyleRoot(shadow);
	});

	it('reuses token for identical declarations and removes runtime rule when released', () => {
		const host: HTMLDivElement = document.createElement('div');
		document.body.appendChild(host);
		const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
		const sheet = createRuntimeStyleSheet();
		registerStyleRoot(shadow, { sheet });

		const first: HTMLDivElement = document.createElement('div');
		const second: HTMLDivElement = document.createElement('div');
		shadow.appendChild(first);
		shadow.appendChild(second);

		setStyleProperties(first, { top: '10px', left: '20px' });
		setStyleProperties(second, { left: '20px', top: '10px' });

		const firstToken = first.getAttribute('data-notectl-style-token');
		const secondToken = second.getAttribute('data-notectl-style-token');
		expect(firstToken).toBeTruthy();
		expect(secondToken).toBe(firstToken);

		removeStyleProperty(first, 'top');
		removeStyleProperty(first, 'left');
		expect(first.getAttribute('data-notectl-style-token')).toBeNull();
		expect(second.getAttribute('data-notectl-style-token')).toBe(firstToken);

		removeStyleProperty(second, 'top');
		removeStyleProperty(second, 'left');
		expect(second.getAttribute('data-notectl-style-token')).toBeNull();

		if (sheet) {
			const hasRuntimeRule = Array.from(sheet.cssRules).some((rule: CSSRule): boolean =>
				rule.cssText.includes('data-notectl-style-token'),
			);
			expect(hasRuntimeRule).toBe(false);
		}

		unregisterStyleRoot(shadow);
	});

	it('removes token when setting last property to empty value', () => {
		const host: HTMLDivElement = document.createElement('div');
		document.body.appendChild(host);
		const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
		registerStyleRoot(shadow, {});

		const el: HTMLDivElement = document.createElement('div');
		shadow.appendChild(el);
		setStyleProperty(el, 'top', '12px');
		expect(el.getAttribute('data-notectl-style-token')).toBeTruthy();

		setStyleProperty(el, 'top', '');
		expect(el.getAttribute('data-notectl-style-token')).toBeNull();
		expect(getStyleText(el)).toBe('');

		unregisterStyleRoot(shadow);
	});

	it('merges appendStyleText declarations and overwrites existing values', () => {
		const host: HTMLDivElement = document.createElement('div');
		document.body.appendChild(host);
		const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
		registerStyleRoot(shadow, {});

		const el: HTMLDivElement = document.createElement('div');
		shadow.appendChild(el);
		setStyleProperties(el, { top: '10px', left: '4px' });
		appendStyleText(el, 'left: 20px; width: 100px;');

		const styleText = getStyleText(el);
		expect(styleText).toContain('top: 10px');
		expect(styleText).toContain('left: 20px');
		expect(styleText).toContain('width: 100px');
		expect(styleText).not.toContain('left: 4px');

		unregisterStyleRoot(shadow);
	});

	it('normalizes camelCase property names to kebab-case in strict mode', () => {
		const host: HTMLDivElement = document.createElement('div');
		document.body.appendChild(host);
		const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
		registerStyleRoot(shadow, {});

		const el: HTMLDivElement = document.createElement('div');
		shadow.appendChild(el);
		setStyleProperty(el, 'backgroundColor', 'red');
		setStyleProperty(el, 'borderTopWidth', '2px');

		const styleText = getStyleText(el);
		expect(styleText).toContain('background-color: red');
		expect(styleText).toContain('border-top-width: 2px');

		unregisterStyleRoot(shadow);
	});
});
