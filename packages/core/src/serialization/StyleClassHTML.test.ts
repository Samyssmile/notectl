import { describe, expect, it } from 'vitest';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { CSSDeclaration, StyleClass } from '../model/StyleClass.js';
import {
	type ClassDeclarationResolver,
	type DeclarationCanonicalizer,
	type StyleClassLookup,
	createCSSOMCanonicalizer,
	createClassDeclarationResolver,
	createStyleClassLookup,
	rehydrateStyleClasses,
} from './StyleClassHTML.js';
import { MAX_REHYDRATED_DECLARATIONS } from './StyleRehydration.js';

const TEXT_RED: StyleClass = { className: 'text-red', declaration: 'color: #e03131' };

/** Reads colors back the way browsers do: `#e03131` becomes `rgb(224, 49, 49)`. */
const browserLikeCanonicalizer: DeclarationCanonicalizer = ({ property, value }: CSSDeclaration) =>
	value === '#e03131' ? `${property}: rgb(224, 49, 49)` : `${property}: ${value}`;

function fragment(html: string): DocumentFragment {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function firstElement(root: DocumentFragment): HTMLElement {
	const el: Element | null = root.firstElementChild;
	if (!(el instanceof HTMLElement)) throw new Error('No element');
	return el;
}

function resolverOf(entries: Record<string, string>): ClassDeclarationResolver {
	return (className: string) => entries[className];
}

describe('createCSSOMCanonicalizer', () => {
	it("writes declarations in the CSS engine's own form", () => {
		const canonicalize: DeclarationCanonicalizer = createCSSOMCanonicalizer();

		expect(canonicalize({ property: 'color', value: 'rgb(224,49,49)' })).toBe(
			'color: rgb(224, 49, 49)',
		);
		expect(canonicalize({ property: 'font-family', value: "'Inter', sans-serif" })).toBe(
			canonicalize({ property: 'font-family', value: 'Inter, sans-serif' }),
		);
	});

	it('keeps a value the engine rejects as written', () => {
		const canonicalize: DeclarationCanonicalizer = createCSSOMCanonicalizer();

		expect(canonicalize({ property: 'color', value: 'not-a-color' })).toBe('color: not-a-color');
	});
});

describe('createStyleClassLookup', () => {
	it('finds the class of a declaration in any spelling the engine reads back', () => {
		const lookup: StyleClassLookup = createStyleClassLookup([TEXT_RED], browserLikeCanonicalizer);

		expect(lookup('color: #e03131')).toBe(TEXT_RED);
		expect(lookup('color: rgb(224, 49, 49)')).toBe(TEXT_RED);
		expect(lookup('color: blue')).toBeUndefined();
	});

	it('lets the first registered class win when two declarations are equivalent', () => {
		const rgb: StyleClass = { className: 'red-rgb', declaration: 'color: rgb(224, 49, 49)' };
		const lookup: StyleClassLookup = createStyleClassLookup(
			[rgb, TEXT_RED],
			browserLikeCanonicalizer,
		);

		expect(lookup('color: #e03131')).toBe(rgb);
	});

	it('finds nothing without style classes', () => {
		const lookup: StyleClassLookup = createStyleClassLookup([], () => {
			throw new Error('canonicalized without style classes');
		});

		expect(lookup('color: #e03131')).toBeUndefined();
	});

	it('finds nothing for a declaration that is not safe', () => {
		const lookup: StyleClassLookup = createStyleClassLookup([TEXT_RED], browserLikeCanonicalizer);

		expect(lookup('color: #e03131 } p { color: red')).toBeUndefined();
	});
});

describe('createClassDeclarationResolver', () => {
	it('prefers the styleMap, then registered classes, then notectl alignment classes', () => {
		const registry = new SchemaRegistry();
		registry.registerStyleClass(TEXT_RED);
		registry.registerStyleClass({ className: 'lead', declaration: 'font-size: 18px' });
		const styleMap = new Map([['lead', 'font-size: 20px']]);

		const resolve: ClassDeclarationResolver = createClassDeclarationResolver(registry, styleMap);

		expect(resolve('lead')).toBe('font-size: 20px');
		expect(resolve('text-red')).toBe('color: #e03131');
		expect(resolve('notectl-align-center')).toBe('text-align: center');
		expect(resolve('unknown')).toBeUndefined();
	});

	it('resolves notectl alignment classes without a registry', () => {
		const resolve: ClassDeclarationResolver = createClassDeclarationResolver();

		expect(resolve('notectl-align-left')).toBe('text-align: start');
		expect(resolve('text-red')).toBeUndefined();
	});
});

describe('rehydrateStyleClasses', () => {
	it('adds the declarations of known classes and keeps every class on the element', () => {
		const root: DocumentFragment = fragment('<span class="intro text-red">x</span>');

		rehydrateStyleClasses(
			root,
			resolverOf({ 'text-red': 'color: #e03131' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		const el: HTMLElement = firstElement(root);
		expect(el.style.color).toBe('#e03131');
		expect(el.className).toBe('intro text-red');
	});

	it('adds every declaration of a class that stands for several', () => {
		const root: DocumentFragment = fragment('<span class="notectl-s-x">x</span>');

		rehydrateStyleClasses(
			root,
			resolverOf({ 'notectl-s-x': 'color: red; font-size: 18px' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		const el: HTMLElement = firstElement(root);
		expect([el.style.color, el.style.fontSize]).toEqual(['red', '18px']);
	});

	it('lets a property the element sets inline win over a class', () => {
		const root: DocumentFragment = fragment(
			'<span class="text-red big" style="color: blue">x</span>',
		);

		rehydrateStyleClasses(
			root,
			resolverOf({ 'text-red': 'color: #e03131', big: 'color: green; font-size: 18px' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		const el: HTMLElement = firstElement(root);
		expect([el.style.color, el.style.fontSize]).toEqual(['blue', '18px']);
	});

	it('lets an inline shorthand win over a class for one of its longhands', () => {
		const root: DocumentFragment = fragment('<span class="mark" style="background: red">x</span>');

		rehydrateStyleClasses(
			root,
			resolverOf({ mark: 'background-color: yellow' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		expect(firstElement(root).style.backgroundColor).toBe('red');
	});

	it('lets the first listed class win over later ones', () => {
		const root: DocumentFragment = fragment('<p class="align-start notectl-align-end">x</p>');

		rehydrateStyleClasses(
			root,
			resolverOf({ 'align-start': 'text-align: start', 'notectl-align-end': 'text-align: end' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		expect(firstElement(root).style.textAlign).toBe('start');
	});

	it('keeps the raw style text readable for the table parser', () => {
		const root: DocumentFragment = fragment(
			'<table class="framed" style="--ntbl-bc: #ABCDEF;"><tr><td>x</td></tr></table>',
		);

		rehydrateStyleClasses(root, resolverOf({ framed: 'width: 100%' }), MAX_REHYDRATED_DECLARATIONS);

		const style: string = firstElement(root).getAttribute('style') ?? '';
		expect(style).toMatch(/--ntbl-bc:\s*#ABCDEF/);
		expect(firstElement(root).style.width).toBe('100%');
	});

	it('keeps a semicolon inside parentheses within its declaration', () => {
		const root: DocumentFragment = fragment('<p class="pattern">x</p>');

		rehydrateStyleClasses(
			root,
			resolverOf({ pattern: 'background-image: url(data:image/png;base64,AAAA); color: red' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		const el: HTMLElement = firstElement(root);
		expect(el.style.backgroundImage).toContain('data:image/png;base64,AAAA');
		expect(el.style.color).toBe('red');
	});

	it('skips declarations that are not safe', () => {
		const root: DocumentFragment = fragment('<span class="evil">x</span>');

		rehydrateStyleClasses(
			root,
			resolverOf({ evil: 'color: red } p { color: blue' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		expect(firstElement(root).hasAttribute('style')).toBe(false);
	});

	it('reaches nested elements', () => {
		const root: DocumentFragment = fragment(
			'<p><strong><span class="text-red">x</span></strong></p>',
		);

		rehydrateStyleClasses(
			root,
			resolverOf({ 'text-red': 'color: #e03131' }),
			MAX_REHYDRATED_DECLARATIONS,
		);

		expect(root.querySelector('span')?.style.color).toBe('#e03131');
	});
});
