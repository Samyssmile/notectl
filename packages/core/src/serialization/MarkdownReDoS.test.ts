import { describe, expect, it } from 'vitest';
import { parseMarkdownToDocument } from './MarkdownParser.js';

/**
 * ReDoS / robustness suite (D1). Markdown arrives via paste, i.e. untrusted
 * input, so the parser must stay (near-)linear on pathological input and never
 * catastrophically backtrack. These cases would hang a backtracking-regex
 * parser; the delimiter-stack / forward-scan design completes promptly.
 */

/** Parses `input` and asserts it completes under `budgetMs`. */
function parseWithin(input: string, budgetMs: number): void {
	const start: number = performance.now();
	const doc = parseMarkdownToDocument(input);
	const elapsed: number = performance.now() - start;
	expect(doc).toBeDefined();
	expect(elapsed).toBeLessThan(budgetMs);
}

describe('Markdown parser — ReDoS / pathological input', () => {
	// Generous bound: these run under parallel-test CPU contention. The point is
	// to rule out catastrophic (super-linear) blowup, not to benchmark.
	const BUDGET = 3000;

	it('handles a long run of emphasis delimiters', () => {
		parseWithin('*'.repeat(50_000), BUDGET);
		parseWithin('**'.repeat(25_000), BUDGET);
		parseWithin('~'.repeat(50_000), BUDGET);
	});

	it('handles many unmatched opening brackets', () => {
		parseWithin('['.repeat(50_000), BUDGET);
		parseWithin('!['.repeat(25_000), BUDGET);
	});

	it('handles deeply nested brackets and parens', () => {
		const n = 10_000;
		parseWithin(`${'['.repeat(n)}x${']('.repeat(n)}`, BUDGET);
	});

	it('handles long backtick runs', () => {
		parseWithin('`'.repeat(50_000), BUDGET);
		parseWithin(`\`\`${'a'.repeat(40_000)}`, BUDGET);
	});

	it('handles alternating delimiter and text', () => {
		parseWithin('a*'.repeat(25_000), BUDGET);
		parseWithin('_a'.repeat(25_000), BUDGET);
	});

	it('handles adversarial tables and pipes', () => {
		parseWithin(`| ${'a | '.repeat(5_000)}\n| ${'--- | '.repeat(5_000)}`, BUDGET);
		parseWithin('|'.repeat(50_000), BUDGET);
	});

	it('handles long autolink-like and entity-like runs', () => {
		parseWithin('<'.repeat(50_000), BUDGET);
		parseWithin('&'.repeat(50_000), BUDGET);
	});

	it('handles adversarial GFM autolink candidates', () => {
		// Long local-part-shaped runs: an `X+@`-style regex would backtrack
		// quadratically here (regression guard for the @-anchored email scan).
		parseWithin(`${'a_.+-'.repeat(10_000)}@`, BUDGET);
		parseWithin('@'.repeat(50_000), BUDGET);
		parseWithin(' www.'.repeat(10_000), BUDGET);
		parseWithin(` mailto:${'a'.repeat(40_000)}`, BUDGET);
		parseWithin(`www.example.com/${'&amp;'.repeat(8_000)}`, BUDGET);
		parseWithin(`www.example.com/${')'.repeat(40_000)}`, BUDGET);
	});

	it('scales sub-quadratically as input doubles', () => {
		const build = (n: number): string => '*a '.repeat(n);
		const time = (s: string): number => {
			const start: number = performance.now();
			parseMarkdownToDocument(s);
			return performance.now() - start;
		};
		const t1: number = time(build(20_000));
		const t2: number = time(build(40_000));
		// Linear would be ~2x; allow generous overhead but rule out quadratic blowup.
		expect(t2).toBeLessThan(Math.max(t1 * 6, 200));
	});
});
