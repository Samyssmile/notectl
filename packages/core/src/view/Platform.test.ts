import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getTextDirection,
	isFirefox,
	isMac,
	isWebKit,
	resetPlatformCache,
} from './Platform.js';

afterEach(() => {
	resetPlatformCache();
	vi.restoreAllMocks();
});

describe('isMac', () => {
	it('returns true for macOS platform', () => {
		vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
		expect(isMac()).toBe(true);
	});

	it('returns true for iPhone platform', () => {
		vi.stubGlobal('navigator', { platform: 'iPhone', userAgent: '' });
		expect(isMac()).toBe(true);
	});

	it('returns true for iPad platform', () => {
		vi.stubGlobal('navigator', { platform: 'iPad', userAgent: '' });
		expect(isMac()).toBe(true);
	});

	it('returns false for Linux platform', () => {
		vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: '' });
		expect(isMac()).toBe(false);
	});

	it('returns false for Windows platform', () => {
		vi.stubGlobal('navigator', { platform: 'Win32', userAgent: '' });
		expect(isMac()).toBe(false);
	});

	it('prefers userAgentData.platform when available', () => {
		vi.stubGlobal('navigator', {
			platform: 'Win32',
			userAgent: '',
			userAgentData: { platform: 'macOS' },
		});
		expect(isMac()).toBe(true);
	});

	it('caches the result after first call', () => {
		vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
		expect(isMac()).toBe(true);
		vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: '' });
		expect(isMac()).toBe(true); // still cached as true
	});
});

describe('isFirefox', () => {
	it('returns true for Firefox user agent', () => {
		vi.stubGlobal('navigator', {
			platform: 'Linux x86_64',
			userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
		});
		expect(isFirefox()).toBe(true);
	});

	it('returns false for Chrome user agent', () => {
		vi.stubGlobal('navigator', {
			platform: 'Linux x86_64',
			userAgent:
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
		});
		expect(isFirefox()).toBe(false);
	});
});

describe('isWebKit', () => {
	it('returns true for Safari user agent', () => {
		vi.stubGlobal('navigator', {
			platform: 'MacIntel',
			userAgent:
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
		});
		expect(isWebKit()).toBe(true);
	});

	it('returns false for Chrome (also contains AppleWebKit)', () => {
		vi.stubGlobal('navigator', {
			platform: 'Linux x86_64',
			userAgent:
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
		});
		expect(isWebKit()).toBe(false);
	});

	it('returns false for Firefox', () => {
		vi.stubGlobal('navigator', {
			platform: 'Linux x86_64',
			userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
		});
		expect(isWebKit()).toBe(false);
	});
});

describe('getTextDirection', () => {
	it('returns ltr for default document direction', () => {
		const el: HTMLElement = document.createElement('div');
		document.body.appendChild(el);
		try {
			expect(getTextDirection(el)).toBe('ltr');
		} finally {
			el.remove();
		}
	});

	it('returns rtl when element has direction: rtl style', () => {
		const el: HTMLElement = document.createElement('div');
		el.style.direction = 'rtl';
		document.body.appendChild(el);
		try {
			expect(getTextDirection(el)).toBe('rtl');
		} finally {
			el.remove();
		}
	});

	it('returns ltr for element without explicit direction', () => {
		const el: HTMLElement = document.createElement('p');
		document.body.appendChild(el);
		try {
			expect(getTextDirection(el)).toBe('ltr');
		} finally {
			el.remove();
		}
	});
});
