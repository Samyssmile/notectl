import { afterEach, describe, expect, it } from 'vitest';
import {
	getStyleNonceForNode,
	getStyleText,
	registerStyleRoot,
	setStyleProperties,
	setStyleProperty,
	unregisterStyleRoot,
} from './StyleRuntime.js';

describe('StyleRuntime', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('writes inline styles in inline mode', () => {
		registerStyleRoot(document, { mode: 'inline' });

		const el: HTMLDivElement = document.createElement('div');
		document.body.appendChild(el);
		setStyleProperty(el, 'top', '12px');

		expect(el.style.top).toBe('12px');
		expect(el.getAttribute('style')).toContain('top: 12px');

		unregisterStyleRoot(document);
	});

	it('avoids inline style attributes in strict mode', () => {
		const host: HTMLDivElement = document.createElement('div');
		document.body.appendChild(host);
		const shadow: ShadowRoot = host.attachShadow({ mode: 'open' });
		registerStyleRoot(shadow, { mode: 'strict' });

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
		registerStyleRoot(shadow, { mode: 'strict', nonce: 'nonce-123' });

		const el: HTMLDivElement = document.createElement('div');
		shadow.appendChild(el);

		expect(getStyleNonceForNode(el)).toBe('nonce-123');

		unregisterStyleRoot(shadow);
	});
});
