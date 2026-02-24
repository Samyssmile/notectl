import { describe, expect, it } from 'vitest';
import {
	type PaperDimensions,
	PaperSize,
	getPaperCSSSize,
	getPaperDimensions,
} from './PaperSize.js';

describe('PaperSize', () => {
	it('defines all four paper sizes', () => {
		expect(PaperSize.DINA4).toBe('din-a4');
		expect(PaperSize.DINA5).toBe('din-a5');
		expect(PaperSize.USLetter).toBe('us-letter');
		expect(PaperSize.USLegal).toBe('us-legal');
	});
});

describe('getPaperDimensions', () => {
	it('returns correct pixel width for DIN A4 (210mm at 96 DPI)', () => {
		const dims: PaperDimensions = getPaperDimensions(PaperSize.DINA4);
		expect(dims.widthMm).toBe(210);
		expect(dims.heightMm).toBe(297);
		expect(dims.widthPx).toBe(794);
		expect(dims.heightPx).toBe(1123);
	});

	it('returns correct dimensions for DIN A5', () => {
		const dims: PaperDimensions = getPaperDimensions(PaperSize.DINA5);
		expect(dims.widthMm).toBe(148);
		expect(dims.heightMm).toBe(210);
		expect(dims.widthPx).toBe(559);
		expect(dims.heightPx).toBe(794);
	});

	it('returns correct dimensions for US Letter', () => {
		const dims: PaperDimensions = getPaperDimensions(PaperSize.USLetter);
		expect(dims.widthMm).toBe(215.9);
		expect(dims.heightMm).toBe(279.4);
		expect(dims.widthPx).toBe(816);
		expect(dims.heightPx).toBe(1056);
	});

	it('returns correct dimensions for US Legal', () => {
		const dims: PaperDimensions = getPaperDimensions(PaperSize.USLegal);
		expect(dims.widthMm).toBe(215.9);
		expect(dims.heightMm).toBe(355.6);
		expect(dims.widthPx).toBe(816);
		expect(dims.heightPx).toBe(1344);
	});

	it('throws for unknown paper size', () => {
		expect(() => getPaperDimensions('unknown' as PaperSize)).toThrow('Unknown paper size');
	});
});

describe('getPaperCSSSize', () => {
	it('returns A4 for DIN A4', () => {
		expect(getPaperCSSSize(PaperSize.DINA4)).toBe('A4');
	});

	it('returns A5 for DIN A5', () => {
		expect(getPaperCSSSize(PaperSize.DINA5)).toBe('A5');
	});

	it('returns letter for US Letter', () => {
		expect(getPaperCSSSize(PaperSize.USLetter)).toBe('letter');
	});

	it('returns legal for US Legal', () => {
		expect(getPaperCSSSize(PaperSize.USLegal)).toBe('legal');
	});

	it('throws for unknown paper size', () => {
		expect(() => getPaperCSSSize('unknown' as PaperSize)).toThrow('Unknown paper size');
	});
});
