import { describe, expect, it } from 'vitest';
import type { StyleClass } from '../model/StyleClass.js';
import { CSSClassCollector, type DefaultClassName } from './CSSClassCollector.js';
import type { StyleClassLookup } from './StyleClassHTML.js';

/** A lookup over exact declarations, as the serializer builds from registered classes. */
function lookupOf(...styleClasses: readonly StyleClass[]): StyleClassLookup {
	const byDeclaration = new Map<string, StyleClass>(
		styleClasses.map((styleClass) => [styleClass.declaration, styleClass]),
	);
	return (declaration) => byDeclaration.get(declaration);
}

const TEXT_RED: StyleClass = { className: 'text-red', declaration: 'color: #e03131' };
const TEXT_LG: StyleClass = { className: 'text-lg', declaration: 'font-size: 18px' };

const ALIGN_DEFAULTS: DefaultClassName = (declaration) =>
	declaration === 'text-align: center' ? 'notectl-align-center' : undefined;

describe('CSSClassCollector', () => {
	describe('generated class names', () => {
		it('returns a class name for declarations', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassNames('color: red');
			expect(cls).toMatch(/^notectl-s-[a-z0-9]+$/);
		});

		it('returns the same class for identical declarations', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassNames('color: red');
			const cls2: string = collector.getClassNames('color: red');
			expect(cls1).toBe(cls2);
		});

		it('returns different classes for different declarations', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassNames('color: red');
			const cls2: string = collector.getClassNames('color: blue');
			expect(cls1).not.toBe(cls2);
		});

		it('normalizes declaration order for deduplication', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassNames('color: red; font-size: 14px');
			const cls2: string = collector.getClassNames('font-size: 14px; color: red');
			expect(cls1).toBe(cls2);
		});

		it('handles leading/trailing whitespace and semicolons', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassNames('color: red');
			const cls2: string = collector.getClassNames('  color: red  ;  ');
			expect(cls1).toBe(cls2);
		});

		it('keeps distinct declarations apart and emits a rule for each', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassNames('color: red');
			const cls2: string = collector.getClassNames('color: blue');
			expect(cls1).not.toBe(cls2);

			const css: string = collector.toCSS();
			expect(css).toContain('color: red');
			expect(css).toContain('color: blue');
		});

		it('produces deterministic hashes (same across independent instances)', () => {
			const collector1 = new CSSClassCollector();
			const collector2 = new CSSClassCollector();
			expect(collector1.getClassNames('color: red')).toBe(collector2.getClassNames('color: red'));
		});

		it('produces deterministic hashes regardless of registration order', () => {
			const collector1 = new CSSClassCollector();
			collector1.getClassNames('color: blue');
			collector1.getClassNames('color: red');

			const collector2 = new CSSClassCollector();
			collector2.getClassNames('color: red');

			// Same input → same hash, regardless of what else was registered first
			expect(collector1.getClassNames('color: red')).toBe(collector2.getClassNames('color: red'));
		});

		it('keeps a semicolon inside quotes within one declaration', () => {
			const collector = new CSSClassCollector();
			collector.getClassNames("font-family: 'A;B', serif");
			expect([...collector.toStyleMap().values()]).toEqual(["font-family: 'A;B', serif"]);
		});

		it('returns no class for empty declarations', () => {
			const collector = new CSSClassCollector();
			expect(collector.getClassNames('  ;  ')).toBe('');
			expect(collector.toCSS()).toBe('');
		});

		it('leaves out declarations that could end a CSS rule or a style element', () => {
			const collector = new CSSClassCollector();
			expect(collector.getClassNames('color: red } body { display: none')).toBe('');
			expect(collector.getClassNames('content: "</style>"')).toBe('');
			expect(collector.toCSS()).toBe('');
		});
	});

	describe('application style classes', () => {
		it('uses the class of each mapped declaration', () => {
			const collector = new CSSClassCollector(lookupOf(TEXT_RED, TEXT_LG));
			expect(collector.getClassNames('font-size: 18px; color: #e03131')).toBe('text-red text-lg');
		});

		it('gives the unmapped rest one generated class after the mapped ones', () => {
			const collector = new CSSClassCollector(lookupOf(TEXT_RED));
			const generated: string = new CSSClassCollector().getClassNames('font-size: 13px');

			expect(collector.getClassNames('font-size: 13px; color: #e03131')).toBe(
				`text-red ${generated}`,
			);
		});

		it('writes the registered declaration into css and styleMap', () => {
			const collector = new CSSClassCollector((declaration) =>
				declaration.startsWith('color:') ? TEXT_RED : undefined,
			);

			expect(collector.getClassNames('color: rgb(224, 49, 49)')).toBe('text-red');
			expect(collector.toCSS()).toBe('.text-red { color: #e03131; }');
			expect([...collector.toStyleMap()]).toEqual([['text-red', 'color: #e03131']]);
		});

		it('writes one rule per class however often it is used', () => {
			const collector = new CSSClassCollector(lookupOf(TEXT_RED, TEXT_LG));
			collector.getClassNames('color: #e03131');
			collector.getClassNames('color: #e03131; font-size: 18px');

			expect(collector.toCSS().split('\n')).toEqual([
				'.text-red { color: #e03131; }',
				'.text-lg { font-size: 18px; }',
			]);
		});
	});

	describe('default class names', () => {
		it('uses the default class for a single declaration', () => {
			const collector = new CSSClassCollector(undefined, ALIGN_DEFAULTS);
			expect(collector.getClassNames('text-align: center')).toBe('notectl-align-center');
			expect(collector.toCSS()).toBe('.notectl-align-center { text-align: center; }');
		});

		it('hashes a declaration set that only contains the default declaration', () => {
			const collector = new CSSClassCollector(undefined, ALIGN_DEFAULTS);
			expect(collector.getClassNames('text-align: center; color: red')).toMatch(
				/^notectl-s-[a-z0-9]+$/,
			);
		});

		it('prefers an application class over the default class', () => {
			const center: StyleClass = { className: 'align-center', declaration: 'text-align: center' };
			const collector = new CSSClassCollector(lookupOf(center), ALIGN_DEFAULTS);
			expect(collector.getClassNames('text-align: center')).toBe('align-center');
		});
	});

	describe('toCSS', () => {
		it('returns empty string when no classes collected', () => {
			const collector = new CSSClassCollector();
			expect(collector.toCSS()).toBe('');
		});

		it('produces CSS rules for collected classes', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassNames('color: red');
			expect(collector.toCSS()).toBe(`.${cls} { color: red; }`);
		});

		it('normalizes multi-property declarations in output', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassNames('font-size: 14px; color: red');
			// Sorted alphabetically
			expect(collector.toCSS()).toBe(`.${cls} { color: red; font-size: 14px; }`);
		});
	});

	describe('toStyleMap', () => {
		it('returns empty map when no classes collected', () => {
			const collector = new CSSClassCollector();
			expect(collector.toStyleMap().size).toBe(0);
		});

		it('maps class names to declarations', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassNames('color: red');
			expect(collector.toStyleMap().get(cls)).toBe('color: red');
		});
	});
});
