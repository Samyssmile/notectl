import { describe, expect, it } from 'vitest';
import {
	BORDER_THRESHOLD,
	type BorderInfo,
	findNearestBorder,
	measureColBorders,
} from './TableControlsLayout.js';

describe('TableControlsLayout', () => {
	describe('measureColBorders', () => {
		it('returns empty array for single column', () => {
			expect(measureColBorders(300, 1)).toEqual([]);
		});

		it('returns evenly-spaced borders for 2 columns', () => {
			const borders: BorderInfo[] = measureColBorders(300, 2);

			expect(borders).toHaveLength(1);
			expect(borders[0]?.position).toBe(150);
			expect(borders[0]?.index).toBe(1);
		});

		it('returns evenly-spaced borders for 3 columns', () => {
			const borders: BorderInfo[] = measureColBorders(300, 3);

			expect(borders).toHaveLength(2);
			expect(borders[0]?.position).toBe(100);
			expect(borders[0]?.index).toBe(1);
			expect(borders[1]?.position).toBe(200);
			expect(borders[1]?.index).toBe(2);
		});

		it('returns 0 borders for 0 columns', () => {
			expect(measureColBorders(300, 0)).toEqual([]);
		});

		it('rounds border positions', () => {
			const borders: BorderInfo[] = measureColBorders(100, 3);

			expect(borders[0]?.position).toBe(33);
			expect(borders[1]?.position).toBe(67);
		});
	});

	describe('findNearestBorder', () => {
		const rowBorders: BorderInfo[] = [
			{ position: 50, index: 1 },
			{ position: 100, index: 2 },
		];

		const colBorders: BorderInfo[] = [
			{ position: 80, index: 1 },
			{ position: 160, index: 2 },
		];

		it('returns "none" when no border is within threshold', () => {
			const result = findNearestBorder(40, 30, rowBorders, colBorders);

			expect(result.type).toBe('none');
			expect(result.border).toBeNull();
		});

		it('returns nearest row border when within threshold', () => {
			const result = findNearestBorder(40, 52, rowBorders, colBorders);

			expect(result.type).toBe('row');
			expect(result.border?.index).toBe(1);
		});

		it('returns nearest col border when within threshold', () => {
			const result = findNearestBorder(78, 30, rowBorders, colBorders);

			expect(result.type).toBe('col');
			expect(result.border?.index).toBe(1);
		});

		it('prefers row border when both are equidistant', () => {
			// Both 5px away
			const result = findNearestBorder(85, 55, rowBorders, colBorders);

			expect(result.type).toBe('row');
		});

		it('prefers closer border when both are within threshold', () => {
			// Row border at 50: dist from y=53 is 3
			// Col border at 80: dist from x=73 is 7
			const result = findNearestBorder(73, 53, rowBorders, colBorders);

			expect(result.type).toBe('row');
			expect(result.border?.index).toBe(1);
		});

		it('returns col border when row border is farther', () => {
			// Row border at 50: dist from y=42 is 8
			// Col border at 80: dist from x=78 is 2
			const result = findNearestBorder(78, 42, rowBorders, colBorders);

			expect(result.type).toBe('col');
			expect(result.border?.index).toBe(1);
		});

		it('handles empty border arrays', () => {
			const result = findNearestBorder(50, 50, [], []);

			expect(result.type).toBe('none');
			expect(result.border).toBeNull();
		});

		it('handles only row borders', () => {
			const result = findNearestBorder(50, 52, rowBorders, []);

			expect(result.type).toBe('row');
			expect(result.border?.index).toBe(1);
		});

		it('handles only col borders', () => {
			const result = findNearestBorder(78, 50, [], colBorders);

			expect(result.type).toBe('col');
			expect(result.border?.index).toBe(1);
		});
	});

	describe('BORDER_THRESHOLD', () => {
		it('is 10 pixels', () => {
			expect(BORDER_THRESHOLD).toBe(10);
		});
	});
});
