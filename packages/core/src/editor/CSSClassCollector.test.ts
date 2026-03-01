import { describe, expect, it } from 'vitest';
import { CSSClassCollector } from './CSSClassCollector.js';

describe('CSSClassCollector', () => {
	describe('getClassName', () => {
		it('returns a class name for declarations', () => {
			const collector = new CSSClassCollector();
			const cls: string = collector.getClassName('color: red');
			expect(cls).toBe('notectl-s0');
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
			expect(cls1).toBe('notectl-s0');
			expect(cls2).toBe('notectl-s1');
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

		it('uses base-36 counter for class names', () => {
			const collector = new CSSClassCollector();
			for (let i = 0; i < 10; i++) {
				collector.getClassName(`color: color-${String(i)}`);
			}
			const cls: string = collector.getClassName('color: color-10');
			expect(cls).toBe('notectl-sa');
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
			collector.getClassName('color: red');
			const css: string = collector.toCSS();
			expect(css).toBe('.notectl-s0 { color: red; }');
		});

		it('produces rules for multiple classes', () => {
			const collector = new CSSClassCollector();
			collector.getClassName('color: red');
			collector.getClassName('font-size: 14px');
			const css: string = collector.toCSS();
			expect(css).toContain('.notectl-s0 { color: red; }');
			expect(css).toContain('.notectl-s1 { font-size: 14px; }');
		});

		it('produces alignment rules', () => {
			const collector = new CSSClassCollector();
			collector.getAlignmentClassName('center');
			const css: string = collector.toCSS();
			expect(css).toBe('.notectl-align-center { text-align: center; }');
		});

		it('produces combined style and alignment rules', () => {
			const collector = new CSSClassCollector();
			collector.getClassName('color: red');
			collector.getAlignmentClassName('center');
			const css: string = collector.toCSS();
			expect(css).toContain('.notectl-s0 { color: red; }');
			expect(css).toContain('.notectl-align-center { text-align: center; }');
		});

		it('normalizes multi-property declarations in output', () => {
			const collector = new CSSClassCollector();
			collector.getClassName('font-size: 14px; color: red');
			const css: string = collector.toCSS();
			// Sorted alphabetically
			expect(css).toBe('.notectl-s0 { color: red; font-size: 14px; }');
		});
	});
});
