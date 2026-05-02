import { describe, expect, it } from 'vitest';
import type { LanguageDefinition } from '../../code-block/highlighter/TokenizerTypes.js';
import { JAVA_LANGUAGE } from '../../code-block/highlighter/languages/java.js';
import { TYPESCRIPT_LANGUAGE } from '../../code-block/highlighter/languages/typescript.js';
import {
	DEFAULT_RELEVANCE_WEIGHTS,
	MAX_RELEVANCE_WEIGHT,
	computeTokenStats,
} from './TokenStats.js';

const TINY_LANGUAGE: LanguageDefinition = {
	name: 'tiny',
	aliases: [],
	patterns: [
		{ type: 'keyword', pattern: /foo\b/y },
		{ type: 'punctuation', pattern: /[{};]/y },
	],
};

describe('computeTokenStats', () => {
	it('returns zero stats for empty input', () => {
		const stats = computeTokenStats('', TINY_LANGUAGE);

		expect(stats.totalBytes).toBe(0);
		expect(stats.recognizedBytes).toBe(0);
		expect(stats.unknownBytes).toBe(0);
		expect(stats.tokenCount).toBe(0);
		expect(stats.weightedScore).toBe(0);
	});

	it('reports unknown bytes for fully unmatched input', () => {
		const stats = computeTokenStats('xyz', TINY_LANGUAGE);

		expect(stats.totalBytes).toBe(3);
		expect(stats.recognizedBytes).toBe(0);
		expect(stats.unknownBytes).toBe(3);
		expect(stats.tokenCount).toBe(0);
		expect(stats.weightedScore).toBe(0);
	});

	it('aggregates bytes across recognized tokens', () => {
		const stats = computeTokenStats('foo;', TINY_LANGUAGE);

		expect(stats.totalBytes).toBe(4);
		expect(stats.recognizedBytes).toBe(4);
		expect(stats.unknownBytes).toBe(0);
		expect(stats.tokenCount).toBe(2);
	});

	it('weights recognized tokens by their type', () => {
		const stats = computeTokenStats('foo;', TINY_LANGUAGE);
		const expected: number =
			3 * (DEFAULT_RELEVANCE_WEIGHTS.keyword ?? 0) +
			1 * (DEFAULT_RELEVANCE_WEIGHTS.punctuation ?? 0);

		expect(stats.weightedScore).toBeCloseTo(expected);
	});

	it('treats whitespace as unknown bytes', () => {
		const stats = computeTokenStats('foo ;', TINY_LANGUAGE);

		expect(stats.recognizedBytes).toBe(4);
		expect(stats.unknownBytes).toBe(1);
	});

	it('uses custom weights when supplied', () => {
		const stats = computeTokenStats('foo;', TINY_LANGUAGE, { keyword: 2, punctuation: 0.5 });

		expect(stats.weightedScore).toBeCloseTo(3 * 2 + 1 * 0.5);
	});

	it('falls back to punctuation weight for unmapped token types', () => {
		const lang: LanguageDefinition = {
			name: 'mapped',
			aliases: [],
			patterns: [{ type: 'unmapped-custom', pattern: /foo\b/y }],
		};
		const stats = computeTokenStats('foo', lang, { punctuation: 0.42 });

		expect(stats.weightedScore).toBeCloseTo(3 * 0.42);
	});

	it('default max weight matches the largest default weight value', () => {
		const maxFromDefaults: number = Math.max(...Object.values(DEFAULT_RELEVANCE_WEIGHTS));

		expect(MAX_RELEVANCE_WEIGHT).toBeCloseTo(maxFromDefaults);
	});

	it('TypeScript lexer recognizes lowercase primitive types as keywords', () => {
		const stats = computeTokenStats(
			'interface User { name: string; id: number; }',
			TYPESCRIPT_LANGUAGE,
		);

		expect(stats.recognizedBytes).toBeGreaterThanOrEqual(27);
	});

	it('Java lexer leaves lowercase TS primitive types unrecognized', () => {
		const stats = computeTokenStats('interface User { name: string; id: number; }', JAVA_LANGUAGE);

		expect(stats.recognizedBytes).toBeLessThan(20);
	});
});
