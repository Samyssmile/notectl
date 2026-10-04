import { describe, expect, it } from 'vitest';
import type { ClassDeclarationResolver } from './StyleClassHTML.js';
import { MAX_REHYDRATED_DECLARATIONS, rehydrateStyles } from './StyleRehydration.js';

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

/** `count` declarations: `first`, then custom properties that no parse rule reads. */
function declarationsWith(first: string, count: number): string {
	const fillers: string[] = Array.from({ length: count - 1 }, (_, i: number) => `--x${i}: 1`);
	return [first, ...fillers].join('; ');
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
				'<span style="color: red !important; color: blue">x</span>',
			);
			blockInlineStyles(root);

			rehydrateStyles(root, NO_CLASSES);

			const style: CSSStyleDeclaration = element(root, 'span').style;
			expect([style.color, style.getPropertyPriority('color')]).toEqual(['red', 'important']);
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

		it('restores a style attribute with as many declarations as the limit', () => {
			const declarations: string = declarationsWith('color: #e03131', MAX_REHYDRATED_DECLARATIONS);
			const root: DocumentFragment = fragment(`<span style="${declarations}">x</span>`);
			blockInlineStyles(root);

			rehydrateStyles(root, NO_CLASSES);

			expect(element(root, 'span').style.color).toBe('#e03131');
		});

		it('keeps a style attribute with more declarations than the limit unapplied', () => {
			const flood: string = declarationsWith('color: #e03131', MAX_REHYDRATED_DECLARATIONS + 1);
			const root: DocumentFragment = fragment(
				`<p><span id="flood" style="${flood}">x</span><span id="plain" style="color: blue">y</span></p>`,
			);
			blockInlineStyles(root);

			rehydrateStyles(root, NO_CLASSES);

			expect(element(root, '#flood').style.length).toBe(0);
			expect(element(root, '#plain').style.color).toBe('blue');
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

	it('adds the declarations of classes that stand for as many as the limit', () => {
		const root: DocumentFragment = fragment('<span class="flood">x</span>');

		rehydrateStyles(root, (className: string) =>
			className === 'flood'
				? declarationsWith('color: #e03131', MAX_REHYDRATED_DECLARATIONS)
				: undefined,
		);

		expect(element(root, 'span').style.color).toBe('#e03131');
	});

	it('adds no class declarations to an element whose classes together exceed the limit', () => {
		const root: DocumentFragment = fragment(
			'<p><span id="flood" class="flood text-red">x</span><span id="plain" class="text-red">y</span></p>',
		);
		const resolve: ClassDeclarationResolver = (className: string) => {
			if (className === 'flood') {
				return declarationsWith('font-weight: 700', MAX_REHYDRATED_DECLARATIONS);
			}
			return className === 'text-red' ? 'color: #e03131' : undefined;
		};

		rehydrateStyles(root, resolve);

		expect(element(root, '#flood').hasAttribute('style')).toBe(false);
		expect(element(root, '#plain').style.color).toBe('#e03131');
	});
});
