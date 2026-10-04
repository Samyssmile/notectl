import { describe, expect, it } from 'vitest';
import type { ClassDeclarationResolver } from './StyleClassHTML.js';
import { rehydrateStyles } from './StyleRehydration.js';

const NO_CLASSES: ClassDeclarationResolver = () => undefined;

function fragment(html: string): DocumentFragment {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function element(root: ParentNode, selector: string): HTMLElement {
	const el: HTMLElement | null = root.querySelector(selector);
	if (!el) throw new Error(`No ${selector}`);
	return el;
}

/**
 * Leaves the CSSOM of every styled element empty while its `style` attribute
 * keeps its text, as Chromium does under `style-src-attr 'none'`.
 */
function blockInlineStyles(root: ParentNode): void {
	for (const el of Array.from(root.querySelectorAll('[style]'))) {
		Object.defineProperty(el, 'style', { value: document.createElement('span').style });
	}
}

describe('rehydrateStyles', () => {
	describe('when a strict CSP kept style attributes out of the CSSOM', () => {
		it('applies the declarations of every style attribute', () => {
			const root: DocumentFragment = fragment(
				'<p style="text-align: center"><span style="color: #e03131; font-weight: 700">x</span></p>',
			);
			blockInlineStyles(root);

			rehydrateStyles(root, NO_CLASSES);

			const span: HTMLElement = element(root, 'span');
			expect(element(root, 'p').style.textAlign).toBe('center');
			expect([span.style.color, span.style.fontWeight]).toEqual(['#e03131', '700']);
		});

		it('lets a later declaration win, as in CSS', () => {
			const root: DocumentFragment = fragment('<span style="color: red; color: blue">x</span>');
			blockInlineStyles(root);

			rehydrateStyles(root, NO_CLASSES);

			expect(element(root, 'span').style.color).toBe('blue');
		});

		it('keeps an important declaration over a later normal one', () => {
			const root: DocumentFragment = fragment(
				'<span style="color: red !important; color: blue; font-weight: 700 ! IMPORTANT">x</span>',
			);
			blockInlineStyles(root);

			rehydrateStyles(root, NO_CLASSES);

			const style: CSSStyleDeclaration = element(root, 'span').style;
			expect([style.color, style.getPropertyPriority('color')]).toEqual(['red', 'important']);
			expect(style.fontWeight).toBe('700');
		});

		it('lets an inline declaration win over a class for the same property', () => {
			const root: DocumentFragment = fragment(
				'<span class="text-red big" style="color: blue">x</span>',
			);
			blockInlineStyles(root);

			rehydrateStyles(root, (className: string) =>
				className === 'text-red' ? 'color: #e03131' : 'color: green; font-size: 18px',
			);

			const style: CSSStyleDeclaration = element(root, 'span').style;
			expect([style.color, style.fontSize]).toEqual(['blue', '18px']);
		});

		it('skips declarations that are not safe and keeps the others', () => {
			const root: DocumentFragment = fragment(
				'<span style="color: red } p { color: blue; font-style: italic">x</span>',
			);
			blockInlineStyles(root);

			rehydrateStyles(root, NO_CLASSES);

			const style: CSSStyleDeclaration = element(root, 'span').style;
			expect([style.color, style.fontStyle]).toEqual(['', 'italic']);
		});
	});

	it('leaves style attributes the browser applied as written', () => {
		const root: DocumentFragment = fragment(
			'<span style="color:#E03131;font-weight:bold">x</span>',
		);

		rehydrateStyles(root, NO_CLASSES);

		expect(element(root, 'span').getAttribute('style')).toBe('color:#E03131;font-weight:bold');
	});

	it('adds the declarations of known classes', () => {
		const root: DocumentFragment = fragment('<p><span class="text-red">x</span></p>');

		rehydrateStyles(root, (className: string) =>
			className === 'text-red' ? 'color: #e03131' : undefined,
		);

		expect(element(root, 'span').style.color).toBe('#e03131');
	});
});
