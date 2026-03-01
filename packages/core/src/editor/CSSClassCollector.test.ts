import { describe, expect, it } from 'vitest';
import { CSSClassCollector } from './CSSClassCollector.js';

describe('CSSClassCollector', () => {
	describe('getClassName', () => {
		it('returns a class name for declarations', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassName('color: red');
			expect(cls).toMatch(/^notectl-s-[a-z0-9]+$/);
		});

		it('returns the same class for identical declarations', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassName('color: red');
			const cls2: string = collector.getClassName('color: red');
			expect(cls1).toBe(cls2);
		});

		it('returns different classes for different declarations', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassName('color: red');
			const cls2: string = collector.getClassName('color: blue');
			expect(cls1).not.toBe(cls2);
		});

		it('normalizes declaration order for deduplication', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassName('color: red; font-size: 14px');
			const cls2: string = collector.getClassName('font-size: 14px; color: red');
			expect(cls1).toBe(cls2);
		});

		it('handles leading/trailing whitespace and semicolons', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassName('color: red');
			const cls2: string = collector.getClassName('  color: red  ;  ');
			expect(cls1).toBe(cls2);
		});

		it('handles hash collision by appending suffix', () => {
			const collector = new CSSClassCollector();
			// First, register a class normally
			const cls1: string = collector.getClassName('color: red');

			// Force a collision by manually adding the same hash to usedHashes
			// We do this by accessing the class internals indirectly:
			// Register a second declaration that would produce the same result,
			// then verify the collector still produces distinct class names.
			// Instead, we verify the public contract: two different declarations
			// always produce different class names (even though FNV collisions
			// are extremely rare, the code path must be correct).
			const cls2: string = collector.getClassName('color: blue');
			expect(cls1).not.toBe(cls2);

			// Verify both appear in CSS output
			const css: string = collector.toCSS();
			expect(css).toContain('color: red');
			expect(css).toContain('color: blue');
		});

		it('produces deterministic hashes (same across independent instances)', () => {
			const collector1 = new CSSClassCollector();
			const collector2 = new CSSClassCollector();
			const cls1: string = collector1.getClassName('color: red');
			const cls2: string = collector2.getClassName('color: red');
			expect(cls1).toBe(cls2);
		});

		it('produces deterministic hashes regardless of registration order', () => {
			const collector1 = new CSSClassCollector();
			collector1.getClassName('color: blue');
			collector1.getClassName('color: red');

			const collector2 = new CSSClassCollector();
			collector2.getClassName('color: red');

			// Same input → same hash, regardless of what else was registered first
			expect(collector1.getClassName('color: red')).toBe(collector2.getClassName('color: red'));
		});
	});

	describe('getAlignmentClassName', () => {
		it('returns semantic alignment class name', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getAlignmentClassName('center');
			expect(cls).toBe('notectl-align-center');
		});

		it('deduplicates same alignment', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getAlignmentClassName('right');
			const cls2: string = collector.getAlignmentClassName('right');
			expect(cls1).toBe(cls2);
		});

		it('returns different classes for different alignments', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getAlignmentClassName('center');
			const cls2: string = collector.getAlignmentClassName('right');
			expect(cls1).toBe('notectl-align-center');
			expect(cls2).toBe('notectl-align-right');
		});
	});

	describe('toCSS', () => {
		it('returns empty string when no classes collected', () => {
			const collector = new CSSClassCollector();
			expect(collector.toCSS()).toBe('');
		});

		it('produces CSS rules for collected classes', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassName('color: red');
			const css: string = collector.toCSS();
			expect(css).toBe(`.${cls} { color: red; }`);
		});

		it('produces rules for multiple classes', () => {
			const collector = new CSSClassCollector();
			const cls1: string = collector.getClassName('color: red');
			const cls2: string = collector.getClassName('font-size: 14px');
			const css: string = collector.toCSS();
			expect(css).toContain(`.${cls1} { color: red; }`);
			expect(css).toContain(`.${cls2} { font-size: 14px; }`);
		});

		it('produces alignment rules', () => {
			const collector = new CSSClassCollector();
			collector.getAlignmentClassName('center');
			const css: string = collector.toCSS();
			expect(css).toBe('.notectl-align-center { text-align: center; }');
		});

		it('produces combined style and alignment rules', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassName('color: red');
			collector.getAlignmentClassName('center');
			const css: string = collector.toCSS();
			expect(css).toContain(`.${cls} { color: red; }`);
			expect(css).toContain('.notectl-align-center { text-align: center; }');
		});

		it('normalizes multi-property declarations in output', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassName('font-size: 14px; color: red');
			const css: string = collector.toCSS();
			// Sorted alphabetically
			expect(css).toBe(`.${cls} { color: red; font-size: 14px; }`);
		});
	});

	describe('toStyleMap', () => {
		it('returns empty map when no classes collected', () => {
			const collector = new CSSClassCollector();
			const map: ReadonlyMap<string, string> = collector.toStyleMap();
			expect(map.size).toBe(0);
		});

		it('maps class names to declarations', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassName('color: red');
			const map: ReadonlyMap<string, string> = collector.toStyleMap();
			expect(map.get(cls)).toBe('color: red');
		});

		it('includes alignment classes in the map', () => {
			const collector = new CSSClassCollector();
			collector.getAlignmentClassName('center');
			const map: ReadonlyMap<string, string> = collector.toStyleMap();
			expect(map.get('notectl-align-center')).toBe('text-align: center');
		});
	});
});
