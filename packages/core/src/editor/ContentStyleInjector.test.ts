import { afterEach, describe, expect, it } from 'vitest';
import {
	adoptContentStyles,
	injectContentStyles,
	removeAdoptedStyles,
	removeContentStyles,
} from './ContentStyleInjector.js';

describe('ContentStyleInjector', () => {
	afterEach(() => {
		// Clean up any injected styles
		for (const el of Array.from(document.querySelectorAll('style[data-test]'))) {
			el.remove();
		}
		const byId: HTMLElement | null = document.getElementById('test-style');
		if (byId) byId.remove();
	});

	describe('injectContentStyles', () => {
		it('creates a <style> element with the given CSS', () => {
			const style: HTMLStyleElement = injectContentStyles('.foo { color: red; }');
			expect(style.textContent).toBe('.foo { color: red; }');
			expect(style.parentElement).toBe(document.head);
			style.remove();
		});

		it('adds nonce attribute when provided', () => {
			const style: HTMLStyleElement = injectContentStyles('.bar { }', { nonce: 'abc123' });
			expect(style.getAttribute('nonce')).toBe('abc123');
			style.remove();
		});

		it('sets id on the style element', () => {
			const style: HTMLStyleElement = injectContentStyles('.baz { }', { id: 'test-style' });
			expect(style.id).toBe('test-style');
			style.remove();
		});

		it('replaces content of existing element with same id', () => {
			const style1: HTMLStyleElement = injectContentStyles('.first { }', { id: 'test-style' });
			const style2: HTMLStyleElement = injectContentStyles('.second { }', { id: 'test-style' });

			// Should return the same element
			expect(style1).toBe(style2);
			expect(style2.textContent).toBe('.second { }');

			// Only one element in DOM
			const elements: NodeListOf<HTMLElement> = document.querySelectorAll('#test-style');
			expect(elements).toHaveLength(1);
			style1.remove();
		});

		it('appends to custom container', () => {
			const container: HTMLDivElement = document.createElement('div');
			document.body.appendChild(container);

			const style: HTMLStyleElement = injectContentStyles('.custom { }', { container });
			expect(style.parentElement).toBe(container);

			container.remove();
		});
	});

	describe('removeContentStyles', () => {
		it('removes an element by id', () => {
			injectContentStyles('.rem { }', { id: 'test-style' });
			expect(document.getElementById('test-style')).not.toBeNull();

			removeContentStyles('test-style');
			expect(document.getElementById('test-style')).toBeNull();
		});

		it('does nothing when id does not exist', () => {
			// Should not throw
			removeContentStyles('non-existent');
		});
	});

	describe('adoptContentStyles', () => {
		afterEach(() => {
			// Clean up adopted sheets
			document.adoptedStyleSheets = [];
		});

		it('adds a CSSStyleSheet to adoptedStyleSheets', () => {
			const before: number = document.adoptedStyleSheets.length;
			const sheet: CSSStyleSheet = adoptContentStyles('.foo { color: red; }');
			expect(document.adoptedStyleSheets).toHaveLength(before + 1);
			expect(document.adoptedStyleSheets).toContain(sheet);
		});

		it('sheet contains the provided CSS rules', () => {
			const sheet: CSSStyleSheet = adoptContentStyles('.bar { font-size: 14px; }');
			const rules: string[] = Array.from(sheet.cssRules).map((r) => r.cssText);
			// First rule is the marker, second is the actual CSS
			expect(rules.some((r) => r.includes('font-size'))).toBe(true);
		});

		it('replaces existing notectl sheets when replace is true', () => {
			const first: CSSStyleSheet = adoptContentStyles('.first { }');
			const second: CSSStyleSheet = adoptContentStyles('.second { }', { replace: true });

			// First sheet should be gone, second should be present
			expect(document.adoptedStyleSheets).not.toContain(first);
			expect(document.adoptedStyleSheets).toContain(second);
		});

		it('appends without replacing by default', () => {
			adoptContentStyles('.first { }');
			adoptContentStyles('.second { }');
			expect(document.adoptedStyleSheets.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('removeAdoptedStyles', () => {
		afterEach(() => {
			document.adoptedStyleSheets = [];
		});

		it('removes a specific sheet from adoptedStyleSheets', () => {
			const sheet: CSSStyleSheet = adoptContentStyles('.rem { }');
			expect(document.adoptedStyleSheets).toContain(sheet);

			removeAdoptedStyles(sheet);
			expect(document.adoptedStyleSheets).not.toContain(sheet);
		});

		it('does nothing when sheet is not adopted', () => {
			const sheet = new CSSStyleSheet();
			// Should not throw
			removeAdoptedStyles(sheet);
		});
	});
});
