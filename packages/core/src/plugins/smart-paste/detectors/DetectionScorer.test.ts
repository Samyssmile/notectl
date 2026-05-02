import { describe, expect, it } from 'vitest';
import { scoreFromStats } from './DetectionScorer.js';
import { MAX_RELEVANCE_WEIGHT, type TokenStats } from './TokenStats.js';

function stats(partial: Partial<TokenStats>): TokenStats {
	return {
		totalBytes: 0,
		nonWhitespaceBytes: 0,
		recognizedBytes: 0,
		unknownBytes: 0,
		tokenCount: 0,
		weightedScore: 0,
		...partial,
	};
}

describe('scoreFromStats', () => {
	it('returns 0 for empty stats', () => {
		expect(scoreFromStats(stats({}))).toBe(0);
	});

	it('returns 0 when nothing was recognized', () => {
		expect(scoreFromStats(stats({ totalBytes: 100, nonWhitespaceBytes: 100 }))).toBe(0);
	});

	it('returns 0 when input is pure whitespace (no non-whitespace bytes)', () => {
		expect(scoreFromStats(stats({ totalBytes: 5 }))).toBe(0);
	});

	it('returns 1 for full coverage with maximum density', () => {
		const score: number = scoreFromStats(
			stats({
				totalBytes: 10,
				nonWhitespaceBytes: 10,
				recognizedBytes: 10,
				weightedScore: 10 * MAX_RELEVANCE_WEIGHT,
				tokenCount: 5,
			}),
		);

		expect(score).toBeCloseTo(1);
	});

	it('coverage carries more weight than relevance', () => {
		const fullCoverageLowRelevance: number = scoreFromStats(
			stats({
				totalBytes: 10,
				nonWhitespaceBytes: 10,
				recognizedBytes: 10,
				weightedScore: 10 * 0.1,
				tokenCount: 5,
			}),
		);
		const partialCoverageMaxRelevance: number = scoreFromStats(
			stats({
				totalBytes: 10,
				nonWhitespaceBytes: 10,
				recognizedBytes: 5,
				weightedScore: 5 * MAX_RELEVANCE_WEIGHT,
				tokenCount: 3,
			}),
		);

		expect(fullCoverageLowRelevance).toBeGreaterThan(partialCoverageMaxRelevance);
	});

	it('clamps to [0, 1]', () => {
		const overflowing: number = scoreFromStats(
			stats({
				totalBytes: 10,
				nonWhitespaceBytes: 10,
				recognizedBytes: 10,
				weightedScore: 10 * MAX_RELEVANCE_WEIGHT * 5,
				tokenCount: 5,
			}),
		);

		expect(overflowing).toBeLessThanOrEqual(1);
		expect(overflowing).toBeGreaterThanOrEqual(0);
	});

	it('whitespace is excluded from the coverage denominator', () => {
		const indented: number = scoreFromStats(
			stats({
				totalBytes: 20,
				nonWhitespaceBytes: 10,
				recognizedBytes: 10,
				weightedScore: 10 * MAX_RELEVANCE_WEIGHT,
				tokenCount: 5,
			}),
		);

		expect(indented).toBeCloseTo(1);
	});

	it('penalizes lone high-weight tokens that dominate sparse recognition', () => {
		const sparse: number = scoreFromStats(
			stats({
				totalBytes: 100,
				nonWhitespaceBytes: 80,
				recognizedBytes: 4,
				weightedScore: 4 * MAX_RELEVANCE_WEIGHT,
				tokenCount: 1,
			}),
		);

		expect(sparse).toBeLessThan(0.4);
	});
});
